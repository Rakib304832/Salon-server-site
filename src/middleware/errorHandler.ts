// Import the Express error and middleware types.
import type { ErrorRequestHandler, RequestHandler } from "express";

// Import Zod's error class so validation failures can be formatted consistently.
import { ZodError } from "zod";

// Import the API error type used for expected failures.
import type { ApiErrorDetail } from "../utils/ApiError.js";
import { ApiError } from "../utils/ApiError.js";

// Import the shared error response helper.
import { sendError } from "../utils/response.js";

// Convert every Zod issue into the public field-level error shape.
function describeZodError(error: ZodError): ApiErrorDetail[] {
  // Map the issues to a safe array without exposing internal schema details.
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.map(String).join(".") : undefined,
    message: issue.message,
  }));
}

// Detect MongoDB duplicate-key failures from the driver or Mongoose.
function isDuplicateKeyError(error: unknown): boolean {
  // Check the numeric code MongoDB uses for unique-index conflicts.
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

// Detect the invalid ObjectId errors produced by Mongoose and the BSON driver.
function isInvalidObjectIdError(error: unknown): boolean {
  // Only Error instances expose the names inspected below.
  if (!(error instanceof Error)) {
    return false;
  }

  // Mongoose reports an invalid ObjectId as a CastError with kind ObjectId.
  if (error.name === "CastError" && "kind" in error) {
    return (error as { kind?: unknown }).kind === "ObjectId";
  }

  // The MongoDB driver reports invalid ObjectId input as a BSONError.
  return error.name === "BSONError" && /ObjectId|24 character hex/i.test(error.message);
}

// Return the shared 404 envelope for routes that do not exist.
export const notFound: RequestHandler = (_request, _response, next) => {
  // Forward a 404 so the error handler writes the same envelope as other errors.
  next(ApiError.notFound("Route not found"));
};

// Convert every thrown error into the shared JSON error envelope.
export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  // Delegate when a response has already started so Express can close it safely.
  if (response.headersSent) {
    next(error);
    return;
  }

  // Handle expected errors that already know their status code.
  if (error instanceof ApiError) {
    sendError(response, error.statusCode, error.message, error.errors, error.code);
    return;
  }

  // Handle request validation failures.
  if (error instanceof ZodError) {
    sendError(response, 400, "Validation failed", describeZodError(error));
    return;
  }

  // Handle malformed identifiers before generic database errors.
  if (isInvalidObjectIdError(error)) {
    sendError(response, 400, "Invalid ID format");
    return;
  }

  // Handle unique-index conflicts such as duplicate bookings.
  if (isDuplicateKeyError(error)) {
    sendError(response, 409, "A record with these values already exists");
    return;
  }

  // Read the body-parser error type without assuming the error shape.
  const bodyParserType =
    typeof error === "object" && error !== null && "type" in error
      ? (error as { type?: unknown }).type
      : undefined;

  // Handle malformed JSON sent by a client.
  if (bodyParserType === "entity.parse.failed") {
    sendError(response, 400, "Invalid JSON body");
    return;
  }

  // Handle request bodies that exceed the configured JSON limit.
  if (bodyParserType === "entity.too.large") {
    sendError(response, 413, "Request body is too large");
    return;
  }

  // Log unexpected failures for the developer while keeping the response generic.
  console.error("Unhandled request error:", error);

  // Never expose a stack trace or implementation detail to the client.
  sendError(response, 500, "Internal server error");
};
