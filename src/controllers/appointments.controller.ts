// Import the Express request type used by the customer identifier helper.
import type { Request } from "express";

// Import Mongoose's default export for ObjectId handling.
import mongoose from "mongoose";

// Import the appointment and service models used by the booking rules.
import { AppointmentModel, type AppointmentInput } from "../models/Appointment.js";
import { ServiceModel, type ServiceInput } from "../models/Service.js";

// Import the shared date and slot rule checks.
import {
  assertBookableAppointmentDate,
  assertBookableTimeSlot,
} from "../services/bookingRules.js";

// Import the shared appointment and service response shapes.
import type { Appointment, Service } from "../types/models.js";

// Import the shared error, async, and response helpers.
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

// Describe the validated booking body; all other client fields are stripped by Zod.
interface CreateAppointmentBody {
  // Service chosen from the active catalogue.
  serviceId: string;

  // Future date in YYYY-MM-DD format.
  appointmentDate: string;

  // One of the fixed hourly slots.
  timeSlot: string;

  // Optional note from the customer.
  message?: string;
}

// Add the MongoDB identifier to a lean appointment document.
type AppointmentRecord = AppointmentInput & { _id: mongoose.Types.ObjectId };

// Add the MongoDB identifier to a lean service document.
type ServiceRecord = ServiceInput & { _id: mongoose.Types.ObjectId };

// Build the conflict error used when an active slot is already taken.
function slotConflictError(): ApiError {
  return new ApiError(409, "This service already has a booking for that date and time", {
    code: "SLOT_ALREADY_BOOKED",
    errors: [{ field: "timeSlot", message: "Choose another date or time slot" }],
  });
}

// Detect concurrent duplicate-key failures from the partial unique index.
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

// Read the customer identifier from the authenticated request, never from the body.
function getCustomerId(request: Request): mongoose.Types.ObjectId {
  // Guard against a route accidentally mounted without verifyAuth.
  if (!request.user) {
    throw ApiError.unauthorized();
  }

  // verifyAuth already checked that this identifier is a valid ObjectId.
  return new mongoose.Types.ObjectId(request.user.id);
}

// Convert a stored service document into the shared service response shape.
function serializeService(service: ServiceRecord): Service {
  return {
    _id: service._id.toString(),
    serviceName: service.serviceName,
    category: service.category,
    description: service.description,
    price: service.price,
    duration: service.duration,
    image: service.image,
    status: service.status,
    createdAt: new Date(service.createdAt).toISOString(),
  };
}

// Convert a stored appointment into the shared response shape.
function serializeAppointment(
  appointment: AppointmentRecord,
  service?: ServiceRecord,
): Appointment {
  // Copy only public fields into the response.
  const result: Appointment = {
    _id: appointment._id.toString(),
    serviceId: service ? serializeService(service) : appointment.serviceId.toString(),
    customerId: appointment.customerId.toString(),
    appointmentDate: appointment.appointmentDate,
    timeSlot: appointment.timeSlot,
    servicePrice: appointment.servicePrice,
    paymentStatus: appointment.paymentStatus,
    status: appointment.status,
    createdAt: new Date(appointment.createdAt).toISOString(),
  };

  // Include the optional customer note only when one was saved.
  if (typeof appointment.message === "string" && appointment.message.length > 0) {
    result.message = appointment.message;
  }

  // Return the complete appointment response.
  return result;
}

// Create a pending appointment request for the signed-in customer.
export const createAppointment = asyncHandler(async (request, response) => {
  // Read the body after Zod removed untrusted fields such as customerId and status.
  const body = request.body as CreateAppointmentBody;

  // Use the session identity as the only source of the customer identifier.
  const customerId = getCustomerId(request);

  // Enforce the calendar and future-date rules before touching the database.
  assertBookableAppointmentDate(body.appointmentDate);

  // Enforce the fixed slot list as a second line of defence after Zod validation.
  assertBookableTimeSlot(body.timeSlot);

  // Look up the selected service so its price and availability come from MongoDB.
  const service = (await ServiceModel.findById(body.serviceId).lean()) as ServiceRecord | null;

  // Return a clear 404 when the selected service does not exist.
  if (!service) {
    throw ApiError.notFound("Service not found");
  }

  // Refuse inactive services even though their details remain readable by ID.
  if (service.status !== "active") {
    throw ApiError.badRequest("Service is currently unavailable for booking", [
      { field: "serviceId", message: "Choose an active service" },
    ]);
  }

  // Check the active-slot rule early so a normal duplicate is a controlled 409.
  const activeStatuses: AppointmentInput["status"][] = ["pending", "confirmed"];
  const existingBooking = await AppointmentModel.exists({
    serviceId: service._id,
    appointmentDate: body.appointmentDate,
    timeSlot: body.timeSlot as AppointmentInput["timeSlot"],
    status: { $in: activeStatuses },
  });

  if (existingBooking) {
    throw slotConflictError();
  }

  // Build the document with server-owned values only.
  const appointmentData: AppointmentInput = {
    serviceId: service._id,
    customerId,
    appointmentDate: body.appointmentDate,
    timeSlot: body.timeSlot as AppointmentInput["timeSlot"],
    ...(typeof body.message === "string" && body.message.length > 0
      ? { message: body.message }
      : {}),
    servicePrice: service.price,
    paymentStatus: "unpaid",
    status: "pending",
    createdAt: new Date(),
  };

  // Insert the appointment, converting a concurrent index conflict into a 409.
  let created;
  try {
    created = await AppointmentModel.create(appointmentData);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw slotConflictError();
    }

    throw error;
  }

  // Return the new appointment with its service details in the success envelope.
  sendSuccess(
    response,
    serializeAppointment(created.toObject() as AppointmentRecord, service),
    "Appointment requested successfully",
    201,
  );
});

// List only the signed-in customer's appointments, newest first.
export const listMyAppointments = asyncHandler(async (request, response) => {
  // Scope every query to the authenticated customer identifier.
  const customerId = getCustomerId(request);

  // Read only this customer's records in a deterministic order.
  const appointments = (await AppointmentModel.find({ customerId })
    .sort({ createdAt: -1 })
    .lean()) as AppointmentRecord[];

  // Load the referenced services in one query for the client display.
  const services = (await ServiceModel.find({
    _id: { $in: appointments.map((appointment) => appointment.serviceId) },
  }).lean()) as ServiceRecord[];

  // Index the services by string identifier for fast lookup.
  const serviceById = new Map(
    services.map((service) => [service._id.toString(), service]),
  );

  // Return the customer's appointments inside the shared success envelope.
  sendSuccess(
    response,
    appointments.map((appointment) =>
      serializeAppointment(
        appointment,
        serviceById.get(appointment.serviceId.toString()),
      ),
    ),
    "Appointments retrieved successfully",
  );
});

// Cancel the signed-in customer's own pending appointment.
export const cancelAppointment = asyncHandler(async (request, response) => {
  // Read the validated appointment identifier and the authenticated customer.
  const { id } = request.params;
  const customerId = getCustomerId(request);

  // Search with both the identifier and owner so another customer's record stays hidden.
  const appointment = await AppointmentModel.findOne({ _id: id, customerId });

  // Return 404 for missing records and for appointments owned by someone else.
  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  // A paid appointment must be handled by the payment flow instead of a local cancellation.
  if (appointment.paymentStatus === "paid") {
    throw new ApiError(409, "Paid appointments cannot be cancelled", {
      code: "APPOINTMENT_ALREADY_PAID",
    });
  }

  // Only the original pending request can be cancelled by the customer.
  if (appointment.status !== "pending") {
    throw new ApiError(409, "Only pending appointments can be cancelled", {
      code: "APPOINTMENT_NOT_CANCELLABLE",
    });
  }

  // Mark the record cancelled; the partial unique index frees the slot immediately.
  appointment.status = "cancelled";
  await appointment.save();

  // Load the service again so the response keeps the same shape as the list route.
  const service = (await ServiceModel.findById(appointment.serviceId).lean()) as
    | ServiceRecord
    | null;

  // Return the cancelled appointment inside the shared success envelope.
  sendSuccess(
    response,
    serializeAppointment(
      appointment.toObject() as AppointmentRecord,
      service ?? undefined,
    ),
    "Appointment cancelled successfully",
  );
});
