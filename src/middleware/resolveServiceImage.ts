// Import the service that uploads an in-memory image buffer to ImgBB.
import { uploadImageToImgbb } from "../services/imgbb.js";

// Import the async wrapper so upload failures reach the central error handler.
import { asyncHandler } from "../utils/asyncHandler.js";

// Convert an uploaded image file into the image URL expected by the service schema.
export const resolveServiceImage = asyncHandler(async (request, _response, next) => {
  // JSON clients already send an image URL, so there is nothing to upload.
  if (!request.file) {
    next();
    return;
  }

  // Upload the multipart file to ImgBB with the server-only API key.
  const imageUrl = await uploadImageToImgbb(request.file.buffer);

  // Place the returned URL into the body so the Zod schema sees a normal service payload.
  request.body = {
    ...(typeof request.body === "object" && request.body !== null ? request.body : {}),
    image: imageUrl,
  };

  // Continue to validation and the service controller.
  next();
});
