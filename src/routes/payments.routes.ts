// Import the Express router factory.
import { Router } from "express";

// Import Zod for the checkout body schema.
import { z } from "zod";

// Import the auth, blocked-account, and role guards.
import { checkBlocked } from "../middleware/checkBlocked.js";
import { objectIdSchema, validate } from "../middleware/validate.js";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { verifyRole } from "../middleware/verifyRole.js";

// Import the checkout handlers.
import {
  createCheckoutSession,
  getCheckoutStatus,
} from "../controllers/payments.controller.js";

// Accept only the appointment identifier from the client.
const checkoutSchema = z.object({
  appointmentId: objectIdSchema,
});

// Validate the Stripe Checkout Session identifier used by the success page.
const sessionIdParamsSchema = z.object({
  sessionId: z
    .string()
    .regex(/^cs_(test|live)_[A-Za-z0-9_]+$/, "Invalid Stripe session ID"),
});

// Create the router mounted at /api/payments.
const paymentsRouter = Router();

// Verify a checkout result after the Stripe success redirect.
paymentsRouter.get(
  "/session/:sessionId",
  verifyAuth,
  checkBlocked,
  verifyRole("customer"),
  validate({ params: sessionIdParamsSchema }),
  getCheckoutStatus,
);

// Start a Stripe Checkout Session for the customer's own confirmed appointment.
paymentsRouter.post(
  "/create-checkout-session",
  verifyAuth,
  checkBlocked,
  verifyRole("customer"),
  validate({ body: checkoutSchema }),
  createCheckoutSession,
);

// Export the payment router for app.ts to mount.
export { paymentsRouter };
