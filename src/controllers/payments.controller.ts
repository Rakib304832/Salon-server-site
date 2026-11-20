// Import the Express request type used by the payment handler.
import type { Request } from "express";

// Import Mongoose's default export for ObjectId handling.
import mongoose from "mongoose";

// Import the shared Stripe client.
import { stripe } from "../config/stripe.js";

// Import the appointment and service models used to price a checkout session.
import { AppointmentModel } from "../models/Appointment.js";
import { ServiceModel } from "../models/Service.js";

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

// Create a Stripe Checkout Session for one unpaid pending appointment.
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

  // Only pending requests can start a checkout session.
  if (appointment.status !== "pending") {
    throw new ApiError(409, "Only pending appointments can be paid", {
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
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: appointment._id.toString(),
      customer_email: request.user?.email,
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
      },
      payment_intent_data: {
        metadata: {
          appointmentId: appointment._id.toString(),
          customerId: customerId.toString(),
        },
      },
    });
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
