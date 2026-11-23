// Import the Express router factory.
import { Router } from "express";

// Import Zod for the admin user query and body schemas.
import { z } from "zod";

// Import the auth, blocked-account, and role guards.
import { checkBlocked } from "../middleware/checkBlocked.js";
import { objectIdSchema, validate } from "../middleware/validate.js";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { verifyRole } from "../middleware/verifyRole.js";

// Import the admin user handlers.
import {
  getUserById,
  listUsers,
  updateUserBlock,
  updateUserRole,
} from "../controllers/users.controller.js";

// Validate the user identifier used by the block and role routes.
const userIdParamsSchema = z.object({
  id: objectIdSchema,
});

// Describe every filter accepted by the admin user list.
const userListQuerySchema = z.object({
  search: z.string().trim().max(100, "Search cannot exceed 100 characters").optional(),
  role: z.enum(["customer", "admin"]).optional(),
  isBlocked: z.enum(["true", "false"]).optional(),
});

// Accept only a boolean blocked state from the administrator.
const blockSchema = z.object({
  isBlocked: z.boolean(),
});

// Accept only the two supported roles from the administrator.
const roleSchema = z.object({
  role: z.enum(["customer", "admin"]),
});

// Create the router mounted at /api/admin/users.
const adminUsersRouter = Router();

// List all Better Auth users with optional filters.
adminUsersRouter.get(
  "/",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  validate({ query: userListQuerySchema }),
  listUsers,
);

// Return one user's safe details.
adminUsersRouter.get(
  "/:id",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  validate({ params: userIdParamsSchema }),
  getUserById,
);

// Block or unblock another user.
adminUsersRouter.patch(
  "/:id/block",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  validate({ params: userIdParamsSchema, body: blockSchema }),
  updateUserBlock,
);

// Promote or demote another user.
adminUsersRouter.patch(
  "/:id/role",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  validate({ params: userIdParamsSchema, body: roleSchema }),
  updateUserRole,
);

// Export the admin user router.
export { adminUsersRouter };
