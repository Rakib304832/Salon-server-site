// Describe one field-level problem returned inside the shared errors array.
export interface ApiErrorDetail {
  // Name of the invalid field when the error belongs to one input.
  field?: string;

  // Human-readable explanation that is safe to return to the client.
  message: string;

  // Optional machine-readable code for the specific problem.
  code?: string;
}

// Describe the optional metadata accepted by the ApiError constructor.
export interface ApiErrorOptions {
  // Machine-readable code for errors the client must handle specially.
  code?: string;

  // Field-level details returned to the client.
  errors?: ApiErrorDetail[];
}

// Represent an expected request failure that the error handler can send directly.
export class ApiError extends Error {
  // HTTP status code used for the response.
  readonly statusCode: number;

  // Alias used by some Express error utilities.
  readonly status: number;

  // Optional machine-readable code such as ACCOUNT_BLOCKED.
  readonly code?: string;

  // Field-level details returned to the client.
  readonly errors: ApiErrorDetail[];

  // Mark expected failures so they can be separated from unexpected bugs.
  readonly isOperational = true;

  constructor(statusCode: number, message: string, options: ApiErrorOptions = {}) {
    // Pass the public message to the built-in Error class.
    super(message);

    // Give the error a recognisable name in logs and tests.
    this.name = "ApiError";

    // Store the HTTP status under both common property names.
    this.statusCode = statusCode;
    this.status = statusCode;

    // Store the optional code and the field-level details.
    this.code = options.code;
    this.errors = options.errors ?? [];

    // Trim the stack so it starts at the caller instead of this constructor.
    Error.captureStackTrace?.(this, ApiError);
  }

  // Create a 400 response for a malformed request.
  static badRequest(message = "Invalid request", errors: ApiErrorDetail[] = []): ApiError {
    return new ApiError(400, message, { errors });
  }

  // Create a 401 response when no valid session or token exists.
  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError(401, message);
  }

  // Create a 403 response for a signed-in user without permission.
  static forbidden(message = "You do not have permission to perform this action"): ApiError {
    return new ApiError(403, message);
  }

  // Create a 404 response for a missing resource or route.
  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, message);
  }

  // Create a 409 response when the request conflicts with current data.
  static conflict(message = "Request conflicts with the current state"): ApiError {
    return new ApiError(409, message);
  }
}
