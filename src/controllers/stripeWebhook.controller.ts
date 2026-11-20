// Import the Express request type used by the raw webhook handler.
import type { Request } from "express";

// Import Mongoose for ObjectId handling.
import mongoose from "mongoose";

// Import Stripe so webhook event types can be narrowed safely.
import type Stripe from "stripe";

// Import the validated webhook secret and the shared Stripe client.
import { env } from "../config/env.js";
import { stripe } from "../config/stripe.js";

// Import the appointment and transaction models.
import { AppointmentModel } from "../models/Appointment.js";
import { TransactionModel, type TransactionInput } from "../models/Transaction.js";

// Import the shared API error class used for signature failures.
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";
import { objectIdSchema } from "../middleware/validate.js";

// Read the trusted identifiers that the checkout route stored in Stripe metadata.
function readCheckoutMetadata(session: Stripe.Checkout.Session): {
  appointmentId: string | null;
  customerId: string | null;
} {
  // Read the appointment identifier and confirm it is a MongoDB ObjectId.
  const appointmentId = session.metadata?.appointmentId;
  const validAppointmentId =
    appointmentId && objectIdSchema.safeParse(appointmentId).success ? appointmentId : null;

  // Read the customer identifier and confirm it is a MongoDB ObjectId.
  const customerId = session.metadata?.customerId;
  const validCustomerId =
    customerId && objectIdSchema.safeParse(customerId).success ? customerId : null;

  // Return only identifiers safe to use in database queries.
  return { appointmentId: validAppointmentId, customerId: validCustomerId };
}

// Record or update the transaction for a Checkout Session idempotently.
async function recordTransaction(
  session: Stripe.Checkout.Session,
  appointmentId: string,
  customerId: string,
  status: TransactionInput["status"],
): Promise<void> {
  // Build the transaction values from the signed Stripe payload only.
  const values = {
    appointmentId: new mongoose.Types.ObjectId(appointmentId),
    customerId: new mongoose.Types.ObjectId(customerId),
    amount: session.amount_total ?? 0,
    currency: (session.currency ?? "usd").toLowerCase(),
    stripeSessionId: session.id,
    status,
  };

  // Insert once per Stripe session and update mutable fields on retries.
  await TransactionModel.updateOne(
    { stripeSessionId: session.id },
    {
      $set: { amount: values.amount, currency: values.currency, status },
      $setOnInsert: {
        appointmentId: values.appointmentId,
        customerId: values.customerId,
        stripeSessionId: values.stripeSessionId,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
}

// Mark an appointment paid and confirmed after Stripe reports a completed checkout.
async function handleCompletedCheckout(session: Stripe.Checkout.Session): Promise<void> {
  // Ignore signed events that do not carry the identifiers created by this server.
  const { appointmentId, customerId } = readCheckoutMetadata(session);
  if (!appointmentId || !customerId) {
    console.error("Stripe checkout completed without valid appointment metadata");
    return;
  }

  // Confirm that the appointment still exists before changing payment state.
  const appointment = await AppointmentModel.findById(appointmentId);
  if (!appointment) {
    console.error("Stripe checkout referenced a missing appointment");
    return;
  }

  // Ensure the metadata customer still owns the appointment.
  if (appointment.customerId.toString() !== customerId) {
    console.error("Stripe checkout metadata customer mismatch");
    return;
  }

  // Stripe is the only source of truth for payment and confirmation state.
  appointment.paymentStatus = "paid";
  appointment.status = "confirmed";
  await appointment.save();

  // Save the paid transaction once, even if Stripe retries the event.
  await recordTransaction(session, appointmentId, customerId, "paid");
}

// Record a failed checkout without changing the appointment's payment state.
async function handleFailedCheckout(session: Stripe.Checkout.Session): Promise<void> {
  // Ignore signed events that do not carry the identifiers created by this server.
  const { appointmentId, customerId } = readCheckoutMetadata(session);
  if (!appointmentId || !customerId) {
    console.error("Stripe checkout failed without valid appointment metadata");
    return;
  }

  // Keep a failed transaction record for the admin table and retry analysis.
  await recordTransaction(session, appointmentId, customerId, "failed");
}

// Verify the Stripe signature and apply trusted payment events.
export const stripeWebhook = asyncHandler(async (request: Request, response) => {
  // Read the Stripe signature header before touching the body.
  const signature = request.headers["stripe-signature"];

  // Reject requests that cannot prove they came from Stripe.
  if (typeof signature !== "string") {
    throw ApiError.badRequest("Missing Stripe signature");
  }

  // Require the raw body bytes that express.raw stored for this route.
  if (!Buffer.isBuffer(request.body)) {
    throw ApiError.badRequest("Webhook body must be raw JSON");
  }

  // Verify the signature and parse the event using Stripe's secret.
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      request.body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    throw ApiError.badRequest("Invalid Stripe signature");
  }

  // Apply only the payment events this server understands.
  if (event.type === "checkout.session.completed") {
    await handleCompletedCheckout(event.data.object as Stripe.Checkout.Session);
  } else if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    await handleFailedCheckout(event.data.object as Stripe.Checkout.Session);
  }

  // Acknowledge every verified event so Stripe stops retrying it.
  sendSuccess(
    response,
    { received: true, eventType: event.type },
    "Webhook processed successfully",
  );
});
