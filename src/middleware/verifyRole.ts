// Import the Express middleware type.
import type { RequestHandler } from "express";

// Import the role union shared with the user model.
import type { UserRole } from "../types/models.js";

// Import the shared API error class.
import { ApiError } from "../utils/ApiError.js";

// Allow only the roles listed by the route definition.
export function verifyRole(...allowedRoles: UserRole[]): RequestHandler {
  // Return the middleware that performs the role check.
  return (request, _response, next) => {
    // Require verifyAuth to have run first.
    if (!request.user) {
      next(ApiError.unauthorized());
      return;
    }

    // Reject signed-in users whose role is not allowed on this route.
    if (!allowedRoles.includes(request.user.role)) {
      next(ApiError.forbidden());
      return;
    }

    // Continue when the current user has an allowed role.
    next();
  };
}
