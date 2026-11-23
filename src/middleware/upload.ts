// Import Multer, which parses multipart form data into memory.
import multer from "multer";

// Import the rate-limit factory used to protect the upload endpoint.
import { rateLimit } from "express-rate-limit";

// Import the shared API error class for safe validation failures.
import { ApiError } from "../utils/ApiError.js";

// Limit uploads to five megabytes, matching the assignment requirement.
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

// List the only image formats accepted by the endpoint.
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

// Use a set for constant-time membership checks in the file filter.
const allowedMimeTypes = new Set<string>(ALLOWED_IMAGE_MIME_TYPES);

// Keep files in memory so they can be streamed to ImgBB without touching disk.
const memoryStorage = multer.memoryStorage();

// Configure Multer with the size limit, one-file limit, and MIME-type filter.
const imageUploader = multer({
  // Store the uploaded file in a Buffer on request.file.
  storage: memoryStorage,

  // Reject oversized files and unexpected extra parts before they reach ImgBB.
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: 1,
  },

  // Accept only JPEG, PNG, and WebP images.
  fileFilter: (_request, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(
        ApiError.badRequest(
          "Only JPEG, PNG, and WebP images are allowed. Please choose a different file.",
        ),
      );
      return;
    }

    // Accept the file when its declared MIME type is allowed.
    callback(null, true);
  },
});

// Parse exactly one image from the multipart field named "image".
export const uploadSingleImage = imageUploader.single("image");

// Limit each IP address to ten upload attempts in a fifteen-minute window.
export const uploadRateLimit = rateLimit({
  // Count attempts over a rolling fifteen-minute window.
  windowMs: 15 * 60 * 1000,

  // Allow ten uploads per window, whether they succeed or fail validation.
  limit: 10,

  // Send standard rate-limit headers so clients can see their remaining quota.
  standardHeaders: true,

  // Omit the older X-RateLimit-* headers.
  legacyHeaders: false,

  // Return the project's normal error envelope instead of the library default.
  handler: (_request, _response, next) => {
    next(
      new ApiError(429, "Too many upload attempts. Please try again in a few minutes.", {
        code: "UPLOAD_RATE_LIMITED",
      }),
    );
  },
});
