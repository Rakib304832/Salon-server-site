// Import the Express request type used by the raw webhook handler.
import type { Request } from "express";

// Import Mongoose for ObjectId handling.
import mongoose from "mongoose";

// Import Stripe so webhook event types can be narrowed safely.
import type Stripe from "stripe";

// Import the validated webhook secret and the shared Stripe client.
import { env } from "../config/env.js";
import { stripe } from "../config/stripe.js";

// Import the appointment, transaction, and Stripe event models.
import { AppointmentModel } from "../models/Appointment.js";
import { TransactionModel, type TransactionInput } from "../models/Transaction.js";
import { StripeEventModel } from "../models/StripeEvent.js";

// Import the shared API error class used for signature failures.
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";
import { objectIdSchema } from "../middleware/validate.js";

// Read the trusted identifiers that the checkout route stored in Stripe metadata.
function readCheckoutMetadata(session: Stripe.Checkout.Session): {
  appointmentId: string | null;
  customerId: string | null;
  expectedAmount: number | null;
  expectedCurrency: string | null;
} {
  // Read the appointment identifier and confirm it is a MongoDB ObjectId.
  const appointmentId = session.metadata?.appointmentId;
  const validAppointmentId =
    appointmentId && objectIdSchema.safeParse(appointmentId).success ? appointmentId : null;

  // Read the customer identifier and confirm it is a MongoDB ObjectId.
  const customerId = session.metadata?.customerId;
  const validCustomerId =
    customerId && objectIdSchema.safeParse(customerId).success ? customerId : null;

  // Read the server-owned base amount and currency from signed metadata.
  const rawAmount = session.metadata?.expectedAmount;
  const expectedAmount =
    rawAmount && /^\d+$/.test(rawAmount) ? Number.parseInt(rawAmount, 10) : null;
  const expectedCurrency = session.metadata?.expectedCurrency?.toLowerCase() ?? null;

  // Return only identifiers safe to use in database queries.
  return {
    appointmentId: validAppointmentId,
    customerId: validCustomerId,
    expectedAmount,
    expectedCurrency,
  };
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

// Load an appointment and confirm the signed metadata still matches its owner.
async function findOwnedCheckoutAppointment(appointmentId: string, customerId: string) {
  // Confirm that the appointment still exists before changing payment state.
  const appointment = await AppointmentModel.findById(appointmentId);
  if (!appointment) {
    console.error("Stripe checkout referenced a missing appointment");
    return null;
  }

  // Ensure the metadata customer still owns the appointment, ignoring hex case.
  if (appointment.customerId.toString().toLowerCase() !== customerId.toLowerCase()) {
    console.error("Stripe checkout metadata customer mismatch");
    return null;
  }

  // Return the verified appointment document.
  return appointment;
}

// Record a completed checkout without reviving an appointment the customer cancelled.
async function handleCompletedCheckout(session: Stripe.Checkout.Session): Promise<void> {
  // Ignore signed events that do not carry the identifiers created by this server.
  const { appointmentId, customerId, expectedAmount, expectedCurrency } =
    readCheckoutMetadata(session);
  if (!appointmentId || !customerId) {
    console.error("Stripe checkout completed without valid appointment metadata");
    return;
  }

  // Reject signed events that do not belong to the referenced appointment.
  const appointment = await findOwnedCheckoutAppointment(appointmentId, customerId);
  if (!appointment) {
    return;
  }

  // A late payment must never mark a cancelled or reverted appointment as paid.
  if (appointment.status !== "confirmed") {
    console.error("Stripe checkout completed for an appointment that is no longer confirmed");

    // Keep an earlier successful payment record intact on duplicate webhook retries.
    const existingTransaction = await TransactionModel.findOne({
      stripeSessionId: session.id,
    }).lean();
    if (existingTransaction?.status !== "paid") {
      await recordTransaction(session, appointmentId, customerId, "failed");
    }

    return;
  }

  // Ignore asynchronous payment methods that have not actually completed yet.
  if (session.payment_status !== "paid") {
    console.error("Stripe checkout completed without a paid payment status");
    return;
  }

  // Reject a signed session whose server-owned base amount no longer matches the price.
  const baseAmount = Math.round(appointment.servicePrice * 100);
  const presentmentCurrency = session.currency?.toLowerCase();

  if (expectedAmount === null || expectedCurrency === null) {
    // Older sessions without the base-amount metadata must still be exactly USD.
    if (session.amount_total !== baseAmount || presentmentCurrency !== "usd") {
      console.error("Stripe checkout amount or currency does not match the appointment price");
      return;
    }
  } else {
    // The session was created by this server from the same stored price.
    if (expectedAmount !== baseAmount || expectedCurrency !== "usd") {
      console.error("Stripe checkout metadata does not match the appointment price");
      return;
    }

    // Adaptive Pricing may convert the presented amount; require a positive total
    // and a valid three-letter currency, and enforce equality when still in USD.
    if (
      session.amount_total === null ||
      session.amount_total <= 0 ||
      !presentmentCurrency ||
      !/^[a-z]{3}$/.test(presentmentCurrency) ||
      (presentmentCurrency === "usd" && session.amount_total !== baseAmount)
    ) {
      console.error("Stripe checkout returned an invalid presented amount or currency");
      return;
    }
  }

  // Stripe is the only source of truth for payment state.
  // The appointment stays in whatever state the admin set; payment never auto-confirms it.
  appointment.paymentStatus = "paid";
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

  // Do not record transactions for appointments or owners that no longer match.
  const appointment = await findOwnedCheckoutAppointment(appointmentId, customerId);
  if (!appointment) {
    return;
  }

  // Keep a failed transaction record for the admin table and retry analysis.
  await recordTransaction(session, appointmentId, customerId, "failed");
}

// Claim a Stripe event so duplicate webhook deliveries are only applied once.
async function claimStripeEvent(event: Stripe.Event): Promise<boolean> {
  try {
    // Insert once, leaving existing records untouched on Stripe retries.
    const result = await StripeEventModel.updateOne(
      { eventId: event.id },
      {
        $setOnInsert: {
          eventId: event.id,
          type: event.type,
          status: "processing",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    // Only the request that inserted the record is allowed to process the event.
    return (result.upsertedCount ?? 0) > 0;
  } catch (error) {
    // A concurrent retry can win the unique-index race; treat that as a duplicate.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      return false;
    }

    // Unexpected database errors must reach the central error handler.
    throw error;
  }
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

  // Ignore events that have already been claimed by an earlier delivery.
  const claimed = await claimStripeEvent(event);
  if (!claimed) {
    sendSuccess(
      response,
      { received: true, duplicate: true, eventType: event.type },
      "Webhook already processed",
    );
    return;
  }

  try {
    // Apply only the payment events this server understands.
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await handleCompletedCheckout(event.data.object as Stripe.Checkout.Session);
    } else if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      await handleFailedCheckout(event.data.object as Stripe.Checkout.Session);
    }

    // Mark the event complete only after every local write has succeeded.
    await StripeEventModel.updateOne(
      { eventId: event.id },
      { $set: { status: "processed", updatedAt: new Date() } },
    );
  } catch (error) {
    // Release the claim so Stripe's retry can process the event again.
    await StripeEventModel.deleteOne({ eventId: event.id });
    throw error;
  }

  // Acknowledge every verified event so Stripe stops retrying it.
  sendSuccess(
    response,
    { received: true, eventType: event.type },
    "Webhook processed successfully",
  );
});
