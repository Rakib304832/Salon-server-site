// Import the Express router factory and request-handler type.
import { Router, type RequestHandler } from "express";

// Import Zod for the service request schemas.
import { z } from "zod";

// Import the admin and blocked-account guards.
import { checkBlocked } from "../middleware/checkBlocked.js";
import { objectIdSchema, validate } from "../middleware/validate.js";
import { uploadRateLimit, uploadSingleImage } from "../middleware/upload.js";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { verifyRole } from "../middleware/verifyRole.js";

// Import the middleware that turns an uploaded file into an ImgBB URL.
import { resolveServiceImage } from "../middleware/resolveServiceImage.js";

// Import the service handlers shared by the public and admin routes.
import {
  createService,
  deleteService,
  getServiceById,
  listAllServices,
  listPublicServices,
  updateService,
  updateServiceStatus,
} from "../controllers/services.controller.js";

// Import the allowed categories used by the service schemas.
import { SERVICE_CATEGORIES } from "../utils/constants.js";

// Validate the service identifier used by the detail and admin routes.
const serviceIdParamsSchema = z.object({
  id: objectIdSchema,
});

// Validate the public and admin list query string.
const serviceListQuerySchema = z.object({
  // An empty search is allowed and simply means no text filter.
  search: z.string().trim().max(100, "Search cannot exceed 100 characters").optional(),

  // Reject unknown categories before they reach MongoDB.
  category: z.enum(SERVICE_CATEGORIES).optional(),

  // Support only the two documented price orders.
  sort: z.enum(["price_asc", "price_desc"]).optional(),
});

// Describe every field accepted when an admin creates a service.
const createServiceSchema = z.object({
  // Require a meaningful display name.
  serviceName: z
    .string()
    .trim()
    .min(2, "Service name must be at least 2 characters")
    .max(100, "Service name cannot exceed 100 characters"),

  // Accept only one of the supported salon categories.
  category: z.enum(SERVICE_CATEGORIES),

  // Require a description long enough to be useful on the details page.
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(2000, "Description cannot exceed 2000 characters"),

  // Convert numeric form values and require a positive price.
  price: z.coerce
    .number()
    .positive("Price must be greater than 0")
    .max(100000, "Price cannot exceed 100000"),

  // Require a positive whole number of minutes.
  duration: z.coerce
    .number()
    .int("Duration must be a whole number")
    .positive("Duration must be greater than 0")
    .max(600, "Duration cannot exceed 600 minutes"),

  // Require a valid image URL, normally returned by the ImgBB upload endpoint.
  image: z.url("Image must be a valid URL"),
});

// Allow partial updates while still rejecting an empty body.
const updateServiceSchema = createServiceSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

// Accept only the two status values on the status toggle route.
const serviceStatusSchema = z.object({
  status: z.enum(["active", "inactive"]),
});

// Apply the upload rate limit only when the admin actually sends a file.
const conditionalUploadRateLimit: RequestHandler = (request, response, next) => {
  // JSON-only service edits do not consume the image-upload quota.
  if (request.is("multipart/form-data")) {
    uploadRateLimit(request, response, next);
    return;
  }

  next();
};

// Create the router mounted at /api/services.
const servicesRouter = Router();

// Public catalogue: active services only.
servicesRouter.get(
  "/",
  validate({ query: serviceListQuerySchema }),
  listPublicServices,
);

// Signed-in service details: inactive services stay visible for the unavailable message.
servicesRouter.get(
  "/:id",
  verifyAuth,
  checkBlocked,
  verifyRole("customer", "admin"),
  validate({ params: serviceIdParamsSchema }),
  getServiceById,
);

// Admin create route. Accepts JSON with an image URL or multipart/form-data with an image file.
servicesRouter.post(
  "/",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  conditionalUploadRateLimit,
  uploadSingleImage,
  resolveServiceImage,
  validate({ body: createServiceSchema }),
  createService,
);

// Admin full update route. Accepts JSON with an image URL or multipart/form-data with an image file.
servicesRouter.put(
  "/:id",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  conditionalUploadRateLimit,
  uploadSingleImage,
  resolveServiceImage,
  validate({ params: serviceIdParamsSchema, body: updateServiceSchema }),
  updateService,
);

// Admin activate/deactivate route.
servicesRouter.patch(
  "/:id/status",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  validate({ params: serviceIdParamsSchema, body: serviceStatusSchema }),
  updateServiceStatus,
);

// Admin delete route with the active-appointment guard in the controller.
servicesRouter.delete(
  "/:id",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  validate({ params: serviceIdParamsSchema }),
  deleteService,
);

// Create the separate admin listing router mounted at /api/admin/services.
const adminServicesRouter = Router();

// Admin catalogue: every service, including inactive ones.
adminServicesRouter.get(
  "/",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  validate({ query: serviceListQuerySchema }),
  listAllServices,
);

// Export both routers so app.ts can mount their distinct base paths.
export { adminServicesRouter, servicesRouter };
