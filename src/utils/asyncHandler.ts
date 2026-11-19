// Import the Express types used by the wrapper signature.
import type { NextFunction, Request, RequestHandler, Response } from "express";

// Wrap an async handler so a rejected promise reaches the central error handler.
export function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  // Return a normal Express handler that catches the async failure.
  return (request, response, next) => {
    // Resolve the promise and forward any rejection to Express.
    void Promise.resolve(handler(request, response, next)).catch(next);
  };
}
