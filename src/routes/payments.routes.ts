// Import the Express router factory.
import { Router } from "express";

// Import Zod for the checkout body schema.
import { z } from "zod";

// Import the auth, blocked-account, and role guards.
import { checkBlocked } from "../middleware/checkBlocked.js";
import { objectIdSchema, validate } from "../middleware/validate.js";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { verifyRole } from "../middleware/verifyRole.js";

// Import the checkout handler.
import { createCheckoutSession } from "../controllers/payments.controller.js";

// Accept only the appointment identifier from the client.
const checkoutSchema = z.object({
  appointmentId: objectIdSchema,
});

// Create the router mounted at /api/payments.
const paymentsRouter = Router();

// Start a Stripe Checkout Session for the customer's own pending appointment.
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
