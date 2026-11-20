// Import Mongoose's default export, which is the only reliable ESM entry point.
import mongoose, { type HydratedDocument, type Model } from "mongoose";

// Import the shared appointment state unions.
import type { AppointmentStatus, PaymentStatus } from "../types/models.js";

// Import the fixed booking slots and their union type.
import { TIME_SLOTS, type TimeSlot } from "../utils/constants.js";

// Register the referenced models so populate and index creation see them.
import "./Service.js";
import "./User.js";

// Describe every field stored in an appointment document.
export interface AppointmentInput {
  // Service selected by the customer.
  serviceId: mongoose.Types.ObjectId;

  // Customer derived from the authenticated session, never from the request body.
  customerId: mongoose.Types.ObjectId;

  // Appointment date in YYYY-MM-DD format.
  appointmentDate: string;

  // One of the fixed hourly booking slots.
  timeSlot: TimeSlot;

  // Optional note from the customer.
  message?: string;

  // Service price copied at booking time so later price edits cannot change history.
  servicePrice: number;

  // Payment state changed only by the verified Stripe webhook.
  paymentStatus: PaymentStatus;

  // Appointment lifecycle state.
  status: AppointmentStatus;

  // Date the appointment request was created.
  createdAt: Date;
}

// Create the schema that enforces appointment document rules.
const appointmentSchema = new mongoose.Schema<AppointmentInput>(
  {
    // Require an existing service identifier and support service-based queries.
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: [true, "Service is required"],
    },

    // Require the authenticated customer identifier and support "my appointments" queries.
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Customer is required"],
    },

    // Store only the agreed date-only format.
    appointmentDate: {
      type: String,
      required: [true, "Appointment date is required"],
      trim: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Appointment date must use YYYY-MM-DD format"],
    },

    // Accept only the ten slots advertised by the salon.
    timeSlot: {
      type: String,
      required: [true, "Time slot is required"],
      enum: {
        values: TIME_SLOTS,
        message: "Time slot must be one of the available salon slots",
      },
    },

    // Keep an optional short note from the customer.
    message: {
      type: String,
      trim: true,
      maxlength: [500, "Message cannot exceed 500 characters"],
      default: undefined,
    },

    // Copy the service price from the database at booking time.
    servicePrice: {
      type: Number,
      required: [true, "Service price is required"],
      min: [0.01, "Service price must be greater than 0"],
    },

    // New booking requests always start unpaid.
    paymentStatus: {
      type: String,
      required: true,
      enum: {
        values: ["unpaid", "paid"],
        message: "Payment status must be unpaid or paid",
      },
      default: "unpaid",
    },

    // New booking requests always start pending.
    status: {
      type: String,
      required: true,
      enum: {
        values: ["pending", "confirmed", "cancelled"],
        message: "Appointment status must be pending, confirmed, or cancelled",
      },
      default: "pending",
    },

    // Record the request time once for deterministic sorting.
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    // Use the collection name already checked by the service delete guard.
    collection: "appointments",

    // Do not store the internal __v version key in API responses.
    versionKey: false,
  },
);

// Support the customer's own appointment list, newest first.
appointmentSchema.index({ customerId: 1, createdAt: -1 });

// Support admin lookups by service and appointment date in later parts.
appointmentSchema.index({ serviceId: 1, appointmentDate: 1 });

// Prevent two active bookings for the same service, date, and slot.
// Cancelled records leave the partial index, so their slot becomes reusable.
appointmentSchema.index(
  { serviceId: 1, appointmentDate: 1, timeSlot: 1 },
  {
    unique: true,
    name: "unique_active_service_slot",
    partialFilterExpression: { status: { $in: ["pending", "confirmed"] } },
  },
);

// Describe a hydrated appointment document returned by Mongoose.
export type AppointmentDocument = HydratedDocument<AppointmentInput>;

// Reuse an existing model during TSX hot reloads instead of registering it twice.
export const AppointmentModel: Model<AppointmentInput> =
  (mongoose.models.Appointment as Model<AppointmentInput> | undefined) ??
  mongoose.model<AppointmentInput>("Appointment", appointmentSchema);
