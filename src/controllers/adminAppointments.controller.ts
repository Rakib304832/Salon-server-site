// Import the Express response type used to read validated query values.
import type { Response } from "express";

// Import Mongoose's default export and the filter type used by the admin list.
import mongoose, { type QueryFilter } from "mongoose";

// Import the native ObjectId and database handle used to read Better Auth users.
import { ObjectId } from "mongodb";
import { getDb } from "../config/db.js";

// Import the appointment and service models.
import { AppointmentModel, type AppointmentInput } from "../models/Appointment.js";
import { ServiceModel, type ServiceInput } from "../models/Service.js";

// Import the shared appointment and service serializers.
import {
  serializeAppointment,
  type AppointmentRecord,
  type ServiceRecord,
} from "./appointments.controller.js";

// Import the shared safe user serializer used to display customer information.
import { serializeUser, type UserDocument } from "./users.controller.js";

// Import the shared appointment status and safe user unions.
import type { AppointmentStatus, PaymentStatus, User } from "../types/models.js";

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

// Load safe customer details indexed by identifier for admin appointment views.
async function loadCustomers(
  customerIds: mongoose.Types.ObjectId[],
): Promise<Map<string, User>> {
  // Skip the database round trip when there are no appointments to display.
  if (customerIds.length === 0) {
    return new Map();
  }

  // Read only the Better Auth user documents referenced by these appointments.
  const documents = await getDb()
    .collection<UserDocument>("user")
    .find({
      _id: { $in: customerIds.map((id) => new ObjectId(id.toString())) },
    })
    .toArray();

  // Strip password hashes and sessions before returning customer information.
  return new Map(
    documents.map((document) => [document._id.toString(), serializeUser(document)]),
  );
}

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

  // Load the customers referenced by these appointments for the admin table.
  const customerById = await loadCustomers(appointments.map((appointment) => appointment.customerId));

  // Return all matching appointments inside the shared success envelope.
  sendSuccess(
    response,
    appointments.map((appointment) =>
      serializeAppointment(
        appointment,
        serviceById.get(appointment.serviceId.toString()) as ServiceRecord | undefined,
        customerById.get(appointment.customerId.toString()),
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

  // A cancelled appointment is final and cannot be reopened through this route.
  if (appointment.status === "cancelled") {
    throw new ApiError(409, "Cancelled appointments cannot be changed", {
      code: "APPOINTMENT_CANCELLED",
    });
  }

  // Only a pending request can be confirmed; admins cannot re-confirm a decision.
  if (status === "confirmed" && appointment.status !== "pending") {
    throw new ApiError(409, "Only pending appointments can be confirmed", {
      code: "APPOINTMENT_NOT_PENDING",
    });
  }

  // Both pending and confirmed appointments may be cancelled by an administrator.
  // Paid appointments can also be cancelled; refunds are handled outside this API.
  appointment.status = status;
  await appointment.save();

  // Reload the service so the response shape matches the other appointment routes.
  const service = (await ServiceModel.findById(appointment.serviceId).lean()) as
    | AdminServiceRecord
    | null;

  // Load the customer so the admin response includes customer information.
  const customerById = await loadCustomers([appointment.customerId]);

  // Return the updated appointment inside the shared success envelope.
  sendSuccess(
    response,
    serializeAppointment(
      appointment.toObject() as AppointmentRecord,
      (service ?? undefined) as ServiceRecord | undefined,
      customerById.get(appointment.customerId.toString()),
    ),
    "Appointment status updated successfully",
  );
});

// Return one appointment with service and customer details for the admin table.
export const getAdminAppointmentById = asyncHandler(async (request, response) => {
  // Read the validated identifier from the route parameter.
  const { id } = request.params;

  // Look up the appointment across all customers.
  const appointment = await AppointmentModel.findById(id).lean();

  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  // Load the referenced service and customer for a complete detail response.
  const service = (await ServiceModel.findById(appointment.serviceId).lean()) as
    | AdminServiceRecord
    | null;
  const customerById = await loadCustomers([appointment.customerId]);

  sendSuccess(
    response,
    serializeAppointment(
      appointment as AppointmentRecord,
      (service ?? undefined) as ServiceRecord | undefined,
      customerById.get(appointment.customerId.toString()),
    ),
    "Appointment retrieved successfully",
  );
});
