// Import Mongoose's default export, which is the only reliable ESM entry point.
import mongoose, { type HydratedDocument, type Model } from "mongoose";

// Import the seven allowed categories and their union type.
import { SERVICE_CATEGORIES, type ServiceCategory } from "../utils/constants.js";

// Import the shared service status union.
import type { ServiceStatus } from "../types/models.js";

// Describe every field stored in a salon service document.
export interface ServiceInput {
  // Display name shown on the public service cards.
  serviceName: string;

  // One of the seven salon categories.
  category: ServiceCategory;

  // Customer-facing description of what the service includes.
  description: string;

  // Positive price stored in USD.
  price: number;

  // Estimated duration in minutes.
  duration: number;

  // ImgBB-hosted image URL shown by the client.
  image: string;

  // Whether customers can currently see and book the service.
  status: ServiceStatus;

  // Date the service was first added to the catalogue.
  createdAt: Date;
}

// Create the schema that enforces the service document rules.
const serviceSchema = new mongoose.Schema<ServiceInput>(
  {
    // Require a short display name and remove accidental surrounding spaces.
    serviceName: {
      type: String,
      required: [true, "Service name is required"],
      trim: true,
      maxlength: [100, "Service name cannot exceed 100 characters"],
    },

    // Restrict the category to the seven values used by the client filters.
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: {
        values: SERVICE_CATEGORIES,
        message: "Category must be one of the seven salon categories",
      },
    },

    // Require a useful description for the service details page.
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },

    // Reject zero and negative prices at the database layer as well as in Zod.
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0.01, "Price must be greater than 0"],
    },

    // Store the duration as a whole number of minutes.
    duration: {
      type: Number,
      required: [true, "Duration is required"],
      min: [1, "Duration must be at least 1 minute"],
    },

    // Store the image URL returned by the ImgBB upload endpoint.
    image: {
      type: String,
      required: [true, "Image is required"],
      trim: true,
    },

    // New services are bookable unless an admin deactivates them.
    status: {
      type: String,
      required: true,
      enum: {
        values: ["active", "inactive"],
        message: "Status must be active or inactive",
      },
      default: "active",
    },

    // Record the creation time once so the public list can sort newest first.
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    // Do not store the internal __v version key in API responses.
    versionKey: false,
  },
);

// Support the public active-only filter and the admin status views.
serviceSchema.index({ status: 1 });

// Support the category filter used by the public service page.
serviceSchema.index({ category: 1 });

// Support the two price sort orders used by the service list.
serviceSchema.index({ price: 1 });

// Describe a hydrated service document returned by Mongoose queries.
export type ServiceDocument = HydratedDocument<ServiceInput>;

// Reuse an existing model during TSX hot reloads instead of registering it twice.
export const ServiceModel: Model<ServiceInput> =
  (mongoose.models.Service as Model<ServiceInput> | undefined) ??
  mongoose.model<ServiceInput>("Service", serviceSchema);
