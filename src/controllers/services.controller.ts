// Import the Express response type used by each handler.
import type { Response } from "express";

// Import Mongoose's default export plus the filter type used by the list queries.
import mongoose, { type QueryFilter } from "mongoose";

// Import the active native database used to check appointments before deletion.
import { getDb } from "../config/db.js";

// Import the service model and its stored field type.
import { ServiceModel, type ServiceInput } from "../models/Service.js";

// Import the shared API service shape and narrowed status type.
import type { Service, ServiceStatus } from "../types/models.js";

// Import the category union used by the validated query string.
import type { ServiceCategory } from "../utils/constants.js";

// Import the shared error, async, and response helpers.
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

// Describe the parsed query string produced by the service list schema.
export interface ServiceListQuery {
  // Optional text matched against the service name and description.
  search?: string;

  // Optional category filter.
  category?: ServiceCategory;

  // Optional price ordering; the default is newest first.
  sort?: "price_asc" | "price_desc";
}

// Describe the validated body accepted by the create and update routes.
export interface ServiceBody {
  // Display name of the service.
  serviceName: string;

  // One of the seven salon categories.
  category: ServiceCategory;

  // Customer-facing description.
  description: string;

  // Positive price in USD.
  price: number;

  // Positive whole number of minutes.
  duration: number;

  // Valid image URL returned by ImgBB.
  image: string;

  // Optional status; new services default to active.
  status?: ServiceStatus;
}

// Add the MongoDB identifier to a lean service document.
type ServiceRecord = ServiceInput & { _id: mongoose.Types.ObjectId };

// Escape user search input so regex metacharacters are matched literally.
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Convert a database document into the public service response shape.
function serializeService(service: ServiceRecord): Service {
  return {
    _id: service._id.toString(),
    serviceName: service.serviceName,
    category: service.category,
    description: service.description,
    price: service.price,
    duration: service.duration,
    image: service.image,
    status: service.status,
    createdAt: new Date(service.createdAt).toISOString(),
  };
}

// Build the filter shared by the public and admin service lists.
function buildServiceFilter(
  query: ServiceListQuery,
  includeInactive: boolean,
): QueryFilter<ServiceInput> {
  // Start with an empty filter so each condition can be added independently.
  const filter: QueryFilter<ServiceInput> = {};

  // Hide inactive services from the public list while keeping them visible to admins.
  if (!includeInactive) {
    filter.status = "active";
  }

  // Filter by the exact category when the client selected one.
  if (query.category) {
    filter.category = query.category;
  }

  // Search both the name and description using a safely escaped expression.
  if (query.search?.trim()) {
    const expression = new RegExp(escapeRegex(query.search.trim()), "i");

    filter.$or = [{ serviceName: expression }, { description: expression }];
  }

  // Return the completed filter.
  return filter;
}

// Translate the public sort option into a deterministic MongoDB sort order.
function buildServiceSort(sort?: ServiceListQuery["sort"]): Record<string, 1 | -1> {
  // Cheapest first, with newest first as the tie-breaker.
  if (sort === "price_asc") {
    return { price: 1, createdAt: -1 };
  }

  // Most expensive first, with newest first as the tie-breaker.
  if (sort === "price_desc") {
    return { price: -1, createdAt: -1 };
  }

  // Default to the newest services at the top of the list.
  return { createdAt: -1 };
}

// Read the parsed query stored by the validate middleware.
function readListQuery(response: Response): ServiceListQuery {
  return response.locals.query as ServiceListQuery;
}

// List only active services for the public catalogue.
export const listPublicServices = asyncHandler(async (_request, response) => {
  // Read the validated search, category, and sort values.
  const query = readListQuery(response);

  // Query active services with the requested filters and ordering.
  const services = await ServiceModel.find(buildServiceFilter(query, false))
    .sort(buildServiceSort(query.sort))
    .lean();

  // Return the services array inside the shared success envelope.
  sendSuccess(
    response,
    services.map((service) => serializeService(service as ServiceRecord)),
    "Services retrieved successfully",
  );
});

// List every service, including inactive ones, for the admin table.
export const listAllServices = asyncHandler(async (_request, response) => {
  // Read the same validated query values used by the public list.
  const query = readListQuery(response);

  // Include inactive services because admins must be able to reactivate them.
  const services = await ServiceModel.find(buildServiceFilter(query, true))
    .sort(buildServiceSort(query.sort))
    .lean();

  // Return the complete service array inside the shared success envelope.
  sendSuccess(
    response,
    services.map((service) => serializeService(service as ServiceRecord)),
    "Services retrieved successfully",
  );
});

// Return one service to a signed-in user, even when it is inactive.
export const getServiceById = asyncHandler(async (request, response) => {
  // Read the validated ObjectId from the route parameters.
  const { id } = request.params;

  // Look the service up without filtering by status so the client can show availability.
  const service = await ServiceModel.findById(id).lean();

  // Return a clear 404 when the service no longer exists.
  if (!service) {
    throw ApiError.notFound("Service not found");
  }

  // Return the requested service inside the shared success envelope.
  sendSuccess(
    response,
    serializeService(service as ServiceRecord),
    "Service retrieved successfully",
  );
});

// Create a service as an admin.
export const createService = asyncHandler(async (request, response) => {
  // Read the body already validated and stripped by the route schema.
  const body = request.body as ServiceBody;

  // Create the service with active as the default status.
  const created = await ServiceModel.create({
    ...body,
    status: body.status ?? "active",
  });

  // Return the created service with 201 Created.
  sendSuccess(
    response,
    serializeService(created.toObject() as ServiceRecord),
    "Service created successfully",
    201,
  );
});

// Replace the editable fields of an existing service.
export const updateService = asyncHandler(async (request, response) => {
  // Read the validated ObjectId and the partial validated body.
  const { id } = request.params;
  const body = request.body as Partial<ServiceBody>;

  // Apply the provided fields and run the schema validators on the result.
  const updated = await ServiceModel.findByIdAndUpdate(
    id,
    { $set: body },
    { new: true, runValidators: true },
  ).lean();

  // Return a clear 404 when the service does not exist.
  if (!updated) {
    throw ApiError.notFound("Service not found");
  }

  // Return the updated service inside the shared success envelope.
  sendSuccess(
    response,
    serializeService(updated as ServiceRecord),
    "Service updated successfully",
  );
});

// Activate or deactivate a service without changing its other fields.
export const updateServiceStatus = asyncHandler(async (request, response) => {
  // Read the validated ObjectId and status body.
  const { id } = request.params;
  const { status } = request.body as { status: ServiceStatus };

  // Update only the status field so a status toggle cannot overwrite service details.
  const updated = await ServiceModel.findByIdAndUpdate(
    id,
    { $set: { status } },
    { new: true, runValidators: true },
  ).lean();

  // Return a clear 404 when the service does not exist.
  if (!updated) {
    throw ApiError.notFound("Service not found");
  }

  // Return the updated service inside the shared success envelope.
  sendSuccess(
    response,
    serializeService(updated as ServiceRecord),
    "Service status updated successfully",
  );
});

// Delete a service only when no pending or confirmed appointment depends on it.
export const deleteService = asyncHandler(async (request, response) => {
  // Read the validated ObjectId from the route parameters.
  const { id } = request.params;

  // Normalise the identifier once for the model and native-driver queries.
  const serviceId = new mongoose.Types.ObjectId(String(id));

  // Confirm the service exists before checking its appointment history.
  const service = await ServiceModel.findById(serviceId).lean();

  // Return a clear 404 when the service does not exist.
  if (!service) {
    throw ApiError.notFound("Service not found");
  }

  // Count appointments that would become orphaned by this deletion.
  // The appointments collection is created by the booking model in Part 9.
  const activeAppointments = await getDb().collection("appointments").countDocuments({
    serviceId,
    status: { $in: ["pending", "confirmed"] },
  });

  // Refuse the deletion while active bookings still reference the service.
  if (activeAppointments > 0) {
    throw ApiError.conflict(
      "This service has pending or confirmed appointments and cannot be deleted",
    );
  }

  // Remove the service now that no active appointment depends on it.
  await ServiceModel.deleteOne({ _id: serviceId });

  // Return the deleted identifier inside the shared success envelope.
  sendSuccess(response, { _id: id }, "Service deleted successfully");
});
