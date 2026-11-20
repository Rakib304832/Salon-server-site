// Import the Express response type used to read validated query values.
import type { Response } from "express";

// Import Mongoose's default export and the filter type used by the admin list.
import mongoose, { type QueryFilter } from "mongoose";

// Import the appointment and service models.
import { AppointmentModel, type AppointmentInput } from "../models/Appointment.js";
import { ServiceModel, type ServiceInput } from "../models/Service.js";

// Import the shared appointment and service serializers.
import {
  serializeAppointment,
  type AppointmentRecord,
  type ServiceRecord,
} from "./appointments.controller.js";

// Import the shared appointment status union.
import type { AppointmentStatus, PaymentStatus } from "../types/models.js";

// Import the shared error, async, and response helpers.
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

// Describe the validated filters accepted by the admin appointment list.
export interface AdminAppointmentQuery {
  // Optional lifecycle filter.
  status?: AppointmentStatus;

  // Optional payment filter.
  paymentStatus?: PaymentStatus;

  // Optional exact appointment-date filter.
  appointmentDate?: string;

  // Optional service filter.
  serviceId?: string;

  // Optional customer filter.
  customerId?: string;
}

// Add the MongoDB identifier to a lean service document for local typing.
type AdminServiceRecord = ServiceInput & { _id: mongoose.Types.ObjectId };

// Read the parsed query string stored by the validate middleware.
function readQuery(response: Response): AdminAppointmentQuery {
  return response.locals.query as AdminAppointmentQuery;
}

// Build a safe MongoDB filter from the validated admin query.
function buildAppointmentFilter(query: AdminAppointmentQuery): QueryFilter<AppointmentInput> {
  // Start with an empty filter and add only validated values.
  const filter: QueryFilter<AppointmentInput> = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.paymentStatus) {
    filter.paymentStatus = query.paymentStatus;
  }

  if (query.appointmentDate) {
    filter.appointmentDate = query.appointmentDate;
  }

  if (query.serviceId) {
    filter.serviceId = new mongoose.Types.ObjectId(query.serviceId);
  }

  if (query.customerId) {
    filter.customerId = new mongoose.Types.ObjectId(query.customerId);
  }

  return filter;
}

// List every appointment with optional admin filters.
export const listAllAppointments = asyncHandler(async (_request, response) => {
  // Read only the values accepted by the admin query schema.
  const query = readQuery(response);

  // Sort by appointment time first, then newest request time as a tie-breaker.
  const appointments = (await AppointmentModel.find(buildAppointmentFilter(query))
    .sort({ appointmentDate: 1, timeSlot: 1, createdAt: -1 })
    .lean()) as AppointmentRecord[];

  // Load referenced services once so the response includes useful display data.
  const services = (await ServiceModel.find({
    _id: { $in: appointments.map((appointment) => appointment.serviceId) },
  }).lean()) as AdminServiceRecord[];

  // Index services by identifier for deterministic pairing.
  const serviceById = new Map(services.map((service) => [service._id.toString(), service]));

  // Return all matching appointments inside the shared success envelope.
  sendSuccess(
    response,
    appointments.map((appointment) =>
      serializeAppointment(
        appointment,
        serviceById.get(appointment.serviceId.toString()) as ServiceRecord | undefined,
      ),
    ),
    "Appointments retrieved successfully",
  );
});

// Confirm or cancel an appointment as an administrator.
export const updateAppointmentStatus = asyncHandler(async (request, response) => {
  // Read the validated identifier and the only status values an admin may set.
  const { id } = request.params;
  const { status } = request.body as { status: Extract<AppointmentStatus, "confirmed" | "cancelled"> };

  // Load the appointment so current payment and lifecycle state can be checked.
  const appointment = await AppointmentModel.findById(id);

  // Return 404 when the appointment no longer exists.
  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  // A cancelled appointment is final and cannot reopened through this route.
  if (appointment.status === "cancelled") {
    throw new ApiError(409, "Cancelled appointments cannot be changed", {
      code: "APPOINTMENT_CANCELLED",
    });
  }

  // Paid appointments need a refund flow, so the admin route cannot cancel them.
  if (status === "cancelled" && appointment.paymentStatus === "paid") {
    throw new ApiError(409, "Paid appointments cannot be cancelled", {
      code: "APPOINTMENT_ALREADY_PAID",
    });
  }

  // Apply the admin-owned status change and save validators.
  appointment.status = status;
  await appointment.save();

  // Reload the service so the response shape matches the other appointment routes.
  const service = (await ServiceModel.findById(appointment.serviceId).lean()) as
    | AdminServiceRecord
    | null;

  // Return the updated appointment inside the shared success envelope.
  sendSuccess(
    response,
    serializeAppointment(
      appointment.toObject() as AppointmentRecord,
      (service ?? undefined) as ServiceRecord | undefined,
    ),
    "Appointment status updated successfully",
  );
});
