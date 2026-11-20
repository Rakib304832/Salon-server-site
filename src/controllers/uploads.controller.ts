// Import the service that performs the server-side ImgBB upload.
import { uploadImageToImgbb } from "../services/imgbb.js";

// Import the shared error, async, and response helpers.
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

// Upload one validated image and return only its public URL.
export const uploadImage = asyncHandler(async (request, response) => {
  // Read the file populated by the Multer memory-storage middleware.
  const file = request.file;

  // Return a clear 400 when the multipart field named "image" is missing.
  if (!file) {
    throw ApiError.badRequest(
      "Image file is required. Send multipart/form-data with an 'image' field.",
    );
  }

  // Send the buffer to ImgBB and receive the direct image URL.
  const url = await uploadImageToImgbb(file.buffer);

  // Return the URL in the shared success envelope.
  sendSuccess(response, { url }, "Image uploaded successfully");
});
