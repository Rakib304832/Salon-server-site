// Import Mongoose's default export, the reliable ESM entry point.
import mongoose, { type HydratedDocument, type Model } from "mongoose";

// Describe the minimum Stripe event bookkeeping needed for deduplication.
export interface StripeEventInput {
  // Stripe's globally unique event identifier.
  eventId: string;

  // The Stripe event type, stored for debugging and replay analysis.
  type: string;

  // Whether this event has finished being applied to the local database.
  status: "processing" | "processed";

  // When the event was first seen by this server.
  createdAt: Date;

  // When the event was last updated by this server.
  updatedAt: Date;
}

// Create the schema that makes each Stripe event record unique.
const stripeEventSchema = new mongoose.Schema<StripeEventInput>(
  {
    // One Stripe event can only be claimed once.
    eventId: {
      type: String,
      required: [true, "Stripe event ID is required"],
      trim: true,
      unique: true,
    },

    // Keep the event type for support and replay tooling.
    type: {
      type: String,
      required: [true, "Stripe event type is required"],
      trim: true,
    },

    // Track whether the handler has completed successfully.
    status: {
      type: String,
      required: true,
      enum: {
        values: ["processing", "processed"],
        message: "Stripe event status must be processing or processed",
      },
      default: "processing",
    },

    // Record the first delivery time.
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // Record the latest state change.
    updatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    // Keep deduplication records separate from payment transactions.
    collection: "stripeEvents",

    // Do not store the internal __v version key.
    versionKey: false,
  },
);

// Expire old deduplication records so the collection stays bounded.
stripeEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

// Describe a hydrated Stripe event document.
export type StripeEventDocument = HydratedDocument<StripeEventInput>;

// Reuse the existing model during TSX hot reloads instead of registering it twice.
export const StripeEventModel: Model<StripeEventInput> =
  (mongoose.models.StripeEvent as Model<StripeEventInput> | undefined) ??
  mongoose.model<StripeEventInput>("StripeEvent", stripeEventSchema);
