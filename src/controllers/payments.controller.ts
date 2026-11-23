// Import the Express request type used by the payment handler.
import type { Request } from "express";

// Import Mongoose's default export for ObjectId handling.
import mongoose from "mongoose";

// Import the shared Stripe client.
import { stripe } from "../config/stripe.js";

// Import the appointment, service, transaction, and user models used by the payment flow.
import { AppointmentModel } from "../models/Appointment.js";
import { ServiceModel } from "../models/Service.js";
import { TransactionModel } from "../models/Transaction.js";
import { UserModel } from "../models/User.js";

// Import the validated client URL used for Stripe return links.
import { env } from "../config/env.js";

// Import the shared API error class used for payment failures.
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

// Describe the validated checkout request body.
interface CheckoutBody {
  // Appointment that the customer wants to pay for.
  appointmentId: string;
}

// Read the customer identifier from the authenticated request.
function getCustomerId(request: Request): mongoose.Types.ObjectId {
  // Guard against this route being mounted without verifyAuth.
  if (!request.user) {
    throw ApiError.unauthorized();
  }

  // verifyAuth has already confirmed that the identifier is a valid ObjectId.
  return new mongoose.Types.ObjectId(request.user.id);
}

// Reuse one Stripe Customer per account instead of creating one per checkout.
async function getOrCreateStripeCustomer(
  customerId: mongoose.Types.ObjectId,
  email: string,
): Promise<string> {
  // Look for a customer that was linked to this account by an earlier checkout.
  const user = await UserModel.findById(customerId).lean();
  if (user?.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Create the Stripe Customer with a stable idempotency key for concurrent clicks.
  const customer = await stripe.customers.create(
    {
      email,
      metadata: { appUserId: customerId.toString() },
    },
    { idempotencyKey: `customer_${customerId.toString()}` },
  );

  // Link the new Stripe Customer to the local account for future checkouts.
  await UserModel.updateOne(
    { _id: customerId },
    { $set: { stripeCustomerId: customer.id } },
  );

  // Return the Stripe Customer identifier for the Checkout Session.
  return customer.id;
}

// Create a Stripe Checkout Session for one unpaid confirmed appointment.
export const createCheckoutSession = asyncHandler(async (request, response) => {
  // Read the validated appointment identifier and the authenticated customer.
  const { appointmentId } = request.body as CheckoutBody;
  const customerId = getCustomerId(request);

  // Scope the lookup to this customer so another user's appointment cannot be paid.
  const appointment = await AppointmentModel.findOne({ _id: appointmentId, customerId });

  // Hide missing and other customers' appointments behind the same 404 response.
  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  // Only confirmed requests can start a checkout session.
  if (appointment.status !== "confirmed") {
    throw new ApiError(409, "Only confirmed appointments can be paid", {
      code: "APPOINTMENT_NOT_PAYABLE",
    });
  }

  // Prevent duplicate payment attempts after the webhook has already marked it paid.
  if (appointment.paymentStatus === "paid") {
    throw new ApiError(409, "This appointment is already paid", {
      code: "APPOINTMENT_ALREADY_PAID",
    });
  }

  // Load the service so the Stripe line item has a readable product name.
  const service = await ServiceModel.findById(appointment.serviceId).lean();

  // Convert the copied service price to Stripe's smallest currency unit.
  const unitAmount = Math.round(appointment.servicePrice * 100);

  // Build the session with metadata that the verified webhook can trust.
  let session;
  try {
    // Reuse a still-open Checkout Session so repeated clicks cannot create duplicates.
    const now = new Date();
    if (
      appointment.checkoutSessionId &&
      appointment.checkoutSessionExpiresAt &&
      appointment.checkoutSessionExpiresAt > now
    ) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(
          appointment.checkoutSessionId,
        );
        if (existing.status === "open" && existing.url) {
          sendSuccess(
            response,
            { url: existing.url, sessionId: existing.id },
            "Existing checkout session reused",
          );
          return;
        }
      } catch {
        // A stale or deleted session should not block a fresh payment attempt.
      }
    }

    // Attach the payment to one persistent Stripe Customer for receipts and history.
    const stripeCustomerId = await getOrCreateStripeCustomer(
      customerId,
      request.user?.email ?? "",
    );

    // Advance the attempt so a retry after expiry gets a new idempotency key.
    const attempt = appointment.checkoutAttempt ?? 0;

    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: appointment._id.toString(),
        customer: stripeCustomerId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: unitAmount,
              product_data: {
                name: service?.serviceName ?? "Salon appointment",
                description: `Appointment on ${appointment.appointmentDate} at ${appointment.timeSlot}`,
              },
            },
          },
        ],
        success_url: `${env.CLIENT_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.CLIENT_URL}/booking/cancel?appointment_id=${encodeURIComponent(appointment._id.toString())}`,
        metadata: {
          appointmentId: appointment._id.toString(),
          customerId: customerId.toString(),
          serviceId: appointment.serviceId.toString(),
          // Store the server-owned base amount so the webhook can validate it even
          // when Adaptive Pricing presents the charge in another currency.
          expectedAmount: unitAmount.toString(),
          expectedCurrency: "usd",
        },
        payment_intent_data: {
          metadata: {
            appointmentId: appointment._id.toString(),
            customerId: customerId.toString(),
          },
        },
      },
      // Make retries of the same attempt return the same Stripe Checkout Session.
      { idempotencyKey: `checkout_${appointmentId}_${attempt}` },
    );

    // Persist the session and the attempt used to create it before returning the URL.
    const expiresAt = session.expires_at
      ? new Date(session.expires_at * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    await AppointmentModel.updateOne(
      { _id: appointment._id },
      {
        $set: {
          checkoutSessionId: session.id,
          checkoutSessionExpiresAt: expiresAt,
          checkoutAttempt: attempt + 1,
        },
      },
    );
  } catch (error) {
    // Log only the error name so no request or credential detail reaches the logs.
    console.error(
      "Stripe checkout creation failed:",
      error instanceof Error ? error.name : "unknown error",
    );

    throw new ApiError(502, "Unable to start payment. Please try again later.", {
      code: "STRIPE_CHECKOUT_FAILED",
    });
  }

  // Stripe normally returns a hosted URL, but fail safely if it does not.
  if (!session.url) {
    throw new ApiError(502, "Stripe did not return a checkout URL. Please try again later.", {
      code: "STRIPE_CHECKOUT_UNAVAILABLE",
    });
  }

  // Return only the URL and session identifier needed by the client redirect.
  sendSuccess(
    response,
    { url: session.url, sessionId: session.id },
    "Checkout session created successfully",
  );
});

// Verify a Stripe Checkout Session result from webhook-created records.
export const getCheckoutStatus = asyncHandler(async (request, response) => {
  // Read the Stripe session identifier from the validated route parameter.
  const { sessionId } = request.params as { sessionId: string };
  const customerId = getCustomerId(request);

  // Read only a transaction created by the verified webhook for this customer.
  const transaction = await TransactionModel.findOne({
    stripeSessionId: sessionId,
    customerId,
  }).lean();

  // Allow the success page to retry while Stripe delivers the webhook.
  if (!transaction) {
    throw new ApiError(404, "Payment has not been confirmed yet", {
      code: "PAYMENT_NOT_CONFIRMED",
    });
  }

  // Load the related appointment with the same customer scope.
  const appointment = await AppointmentModel.findOne({
    _id: transaction.appointmentId,
    customerId,
  }).lean();

  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  // Load the service name for a readable confirmation page.
  const service = await ServiceModel.findById(appointment.serviceId).lean();

  // Return webhook-owned state so no client can claim a successful payment.
  sendSuccess(
    response,
    {
      sessionId,
      transaction: {
        _id: transaction._id.toString(),
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        createdAt: new Date(transaction.createdAt).toISOString(),
      },
      appointment: {
        _id: appointment._id.toString(),
        status: appointment.status,
        paymentStatus: appointment.paymentStatus,
        appointmentDate: appointment.appointmentDate,
        timeSlot: appointment.timeSlot,
        servicePrice: appointment.servicePrice,
        serviceName: service?.serviceName ?? "Salon appointment",
      },
      confirmed: transaction.status === "paid" && appointment.paymentStatus === "paid",
    },
    "Checkout status retrieved successfully",
  );
});
