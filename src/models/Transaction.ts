// Import Mongoose's default export, which is the only reliable ESM entry point.
import mongoose, { type HydratedDocument, type Model } from "mongoose";

// Import the shared transaction status union.
import type { TransactionStatus } from "../types/models.js";

// Register the referenced models so their collections and refs are available.
import "./Appointment.js";

// Describe every field stored in a payment transaction document.
export interface TransactionInput {
  // Appointment that the payment belongs to.
  appointmentId: mongoose.Types.ObjectId;

  // Customer who made the payment.
  customerId: mongoose.Types.ObjectId;

  // Amount charged in the smallest currency unit, such as cents.
  amount: number;

  // Three-letter currency code reported by Stripe.
  currency: string;

  // Stripe Checkout Session identifier used for idempotency.
  stripeSessionId: string;

  // Final state reported by the verified webhook.
  status: TransactionStatus;

  // Date the transaction was recorded.
  createdAt: Date;
}

// Create the schema that enforces transaction document rules.
const transactionSchema = new mongoose.Schema<TransactionInput>(
  {
    // Link each transaction to the appointment that was paid for.
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: [true, "Appointment is required"],
    },

    // Store the paying customer for admin filtering and receipts.
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Customer is required"],
    },

    // Store the exact amount reported by Stripe, never a client value.
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },

    // Keep Stripe's lowercase currency code for display.
    currency: {
      type: String,
      required: [true, "Currency is required"],
      trim: true,
      lowercase: true,
      minlength: [3, "Currency must be a three-letter code"],
      maxlength: [3, "Currency must be a three-letter code"],
    },

    // One Stripe Checkout Session can create only one transaction record.
    stripeSessionId: {
      type: String,
      required: [true, "Stripe session ID is required"],
      trim: true,
      unique: true,
    },

    // Record only the two final states produced by the webhook.
    status: {
      type: String,
      required: true,
      enum: {
        values: ["paid", "failed"],
        message: "Transaction status must be paid or failed",
      },
    },

    // Record when the webhook created the transaction.
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    // Match the collection name used by the admin transaction API.
    collection: "transactions",

    // Do not store the internal __v version key in API responses.
    versionKey: false,
  },
);

// Support the admin transaction list ordered by newest first.
transactionSchema.index({ createdAt: -1 });

// Support admin filtering by transaction status.
transactionSchema.index({ status: 1 });

// Support customer-level transaction lookups in later views.
transactionSchema.index({ customerId: 1, createdAt: -1 });

// Describe a hydrated transaction document returned by Mongoose.
export type TransactionDocument = HydratedDocument<TransactionInput>;

// Reuse an existing model during TSX hot reloads instead of registering it twice.
export const TransactionModel: Model<TransactionInput> =
  (mongoose.models.Transaction as Model<TransactionInput> | undefined) ??
  mongoose.model<TransactionInput>("Transaction", transactionSchema);
