// Import the Express router factory.
import { Router } from "express";

// Import Zod for the service request schemas.
import { z } from "zod";

// Import the blocked-account guard and shared validation helpers.
import { checkBlocked } from "../middleware/checkBlocked.js";
import { objectIdSchema, validate } from "../middleware/validate.js";
import { verifyAuth } from "../middleware/verifyAuth.js";

// Import the public service handlers.
import {
  getServiceById,
  listPublicServices,
} from "../controllers/services.controller.js";

// Import the allowed categories used by the service schemas.
import { SERVICE_CATEGORIES } from "../utils/constants.js";

// Validate the service identifier used by the detail route.
const serviceIdParamsSchema = z.object({
  id: objectIdSchema,
});

// Validate the public list query string.
const serviceListQuerySchema = z.object({
  // An empty search is allowed and simply means no text filter.
  search: z.string().trim().max(100, "Search cannot exceed 100 characters").optional(),

  // Reject unknown categories before they reach MongoDB.
  category: z.enum(SERVICE_CATEGORIES).optional(),

  // Support only the two documented price orders.
  sort: z.enum(["price_asc", "price_desc"]).optional(),
});

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
  validate({ params: serviceIdParamsSchema }),
  getServiceById,
);

// Export the public services router.
export { servicesRouter };
