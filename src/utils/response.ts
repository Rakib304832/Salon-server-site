// Import the response type used by both helpers.
import type { Response } from "express";

// Import the shared field-level error detail type.
import type { ApiErrorDetail } from "./ApiError.js";

// Describe the response contract used for successful requests.
export interface SuccessResponse<T> {
  success: true;
  data: T;
  message: string;
}

// Describe the response contract used for failed requests.
export interface ErrorResponse {
  success: false;
  message: string;
  errors: ApiErrorDetail[];
  code?: string;
}

// Send a successful response using the shared envelope.
export function sendSuccess<T>(
  response: Response,
  data: T,
  message = "Request successful",
  statusCode = 200,
): Response {
  // Build the object explicitly so the success flag keeps its literal type.
  const body: SuccessResponse<T> = {
    success: true,
    data,
    message,
  };

  // Send the envelope with the requested status code.
  return response.status(statusCode).json(body);
}

// Send a failed response using the shared error envelope.
export function sendError(
  response: Response,
  statusCode: number,
  message: string,
  errors: ApiErrorDetail[] = [],
  code?: string,
): Response {
  // Include the code only when the caller provided one.
  const body: ErrorResponse = {
    success: false,
    message,
    errors,
    ...(code ? { code } : {}),
  };

  // Send the envelope with the failure status code.
  return response.status(statusCode).json(body);
}
