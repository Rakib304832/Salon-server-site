// Import the Express middleware type.
import type { RequestHandler } from "express";

// Import the shared API error class.
import { ApiError } from "../utils/ApiError.js";

// Reject blocked accounts after verifyAuth has loaded the fresh user.
export const checkBlocked: RequestHandler = (request, _response, next) => {
  // Require verifyAuth to have run first.
  if (!request.user) {
    next(ApiError.unauthorized());
    return;
  }

  // Stop blocked customers before any protected feature runs.
  if (request.user.isBlocked) {
    next(
      new ApiError(403, "Your account has been blocked. Please contact support.", {
        code: "ACCOUNT_BLOCKED",
      }),
    );
    return;
  }

  // Allow unblocked users to continue.
  next();
};
