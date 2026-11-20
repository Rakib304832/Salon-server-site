// Import the Express router factory.
import { Router } from "express";

// Import Zod for the admin transaction query schema.
import { z } from "zod";

// Import the auth, blocked-account, and role guards.
import { checkBlocked } from "../middleware/checkBlocked.js";
import { objectIdSchema, validate } from "../middleware/validate.js";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { verifyRole } from "../middleware/verifyRole.js";

// Import the transaction list handler.
import { listTransactions } from "../controllers/transactions.controller.js";

// Describe every filter accepted by the admin transaction list.
const transactionQuerySchema = z.object({
  status: z.enum(["paid", "failed"]).optional(),
  customerId: objectIdSchema.optional(),
  appointmentId: objectIdSchema.optional(),
});

// Create the router mounted at /api/admin/transactions.
const adminTransactionsRouter = Router();

// List all recorded Stripe transactions for the admin dashboard.
adminTransactionsRouter.get(
  "/",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  validate({ query: transactionQuerySchema }),
  listTransactions,
);

// Export the admin transaction router.
export { adminTransactionsRouter };
