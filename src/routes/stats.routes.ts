// Import the Express router factory.
import { Router } from "express";

// Import the auth, blocked-account, and role guards.
import { checkBlocked } from "../middleware/checkBlocked.js";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { verifyRole } from "../middleware/verifyRole.js";

// Import the dashboard handler.
import { getDashboardStats } from "../controllers/stats.controller.js";

// Create the router mounted at /api/admin/stats.
const statsRouter = Router();

// Return dashboard statistics only to an unblocked administrator.
statsRouter.get(
  "/",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  getDashboardStats,
);

// Export the admin statistics router.
export { statsRouter };
