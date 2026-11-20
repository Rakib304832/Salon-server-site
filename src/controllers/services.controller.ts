// Import the Express response type used by each handler.
import type { Response } from "express";

// Import Mongoose's default export plus the filter type used by the list queries.
import mongoose, { type QueryFilter } from "mongoose";

// Import the service model and its stored field type.
import { ServiceModel, type ServiceInput } from "../models/Service.js";

// Import the shared API service shape.
import type { Service } from "../types/models.js";

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
