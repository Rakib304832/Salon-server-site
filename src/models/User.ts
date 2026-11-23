// Import Mongoose's default export, which is the only reliable ESM entry point.
import mongoose, { type Model } from "mongoose";

// Import the shared role union stored by Better Auth.
import type { UserRole } from "../types/models.js";

// Describe the Better Auth user fields this server reads when referencing a customer.
export interface UserInput {
  // Display name from the auth profile.
  name: string;

  // Login email from the auth profile.
  email: string;

  // Optional profile image URL.
  image?: string;

  // Server-assigned role; clients can never set this value.
  role: UserRole;

  // Server-controlled flag used by the blocked-account middleware.
  isBlocked: boolean;

  // Optional contact phone number.
  phone?: string;

  // Stripe Customer ID linked to this account for receipts and payment history.
  stripeCustomerId?: string;

  // Creation time stored by Better Auth.
  createdAt: Date;
}

// Map a minimal Mongoose model onto the collection Better Auth owns.
const userSchema = new mongoose.Schema<UserInput>(
  {
    // Better Auth stores the display name here.
    name: { type: String, required: true },

    // Better Auth stores the unique login email here.
    email: { type: String, required: true },

    // Keep the optional image URL available for future profile responses.
    image: { type: String },

    // Restrict the stored value to the two known roles.
    role: {
      type: String,
      enum: ["admin", "customer"],
      default: "customer",
      required: true,
    },

    // Default every new account to unblocked.
    isBlocked: { type: Boolean, default: false, required: true },

    // Keep the optional phone number available for future profile responses.
    phone: { type: String },

    // Link one Stripe Customer to this account instead of creating one per checkout.
    stripeCustomerId: { type: String, trim: true },

    // Better Auth records when the account was created.
    createdAt: { type: Date, default: Date.now },
  },
  {
    // Better Auth owns this collection, so use its exact singular name.
    collection: "user",

    // Preserve Better Auth fields this minimal schema does not declare.
    strict: false,

    // Do not expose the internal version key if this model is queried directly.
    versionKey: false,
  },
);

// Reuse the existing model during TSX hot reloads instead of registering it twice.
export const UserModel: Model<UserInput> =
  (mongoose.models.User as Model<UserInput> | undefined) ??
  mongoose.model<UserInput>("User", userSchema, "user");
