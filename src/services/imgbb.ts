// Import the validated ImgBB credential and the shared API error class.
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

// Use the official ImgBB upload endpoint.
const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";

// Stop waiting after twenty seconds so a slow upstream cannot hold the request forever.
const IMGBB_TIMEOUT_MS = 20_000;

// Describe the fields that this server reads from an ImgBB response.
interface ImgbbUploadResponse {
  // ImgBB reports whether the upload succeeded.
  success?: boolean;

  // The uploaded image details, including the direct image URL.
  data?: {
    // Direct URL that can be stored in MongoDB and rendered by the client.
    url?: string;
  };
}

// Confirm that the returned value is a safe absolute HTTP(S) URL.
function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

// Upload one in-memory image buffer to ImgBB and return its direct URL.
export async function uploadImageToImgbb(buffer: Buffer): Promise<string> {
  // Build the endpoint without ever printing the key-bearing URL.
  const endpoint = new URL(IMGBB_UPLOAD_URL);

  // Add the server-only API key as ImgBB expects it.
  endpoint.searchParams.set("key", env.IMGBB_API_KEY);

  // ImgBB accepts the image field as a base64 string.
  const form = new FormData();
  form.append("image", buffer.toString("base64"));

  // Send the multipart request and convert network failures into a safe 502.
  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(endpoint, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(IMGBB_TIMEOUT_MS),
    });
  } catch (error) {
    // Log only the error name so the key-bearing URL and request details stay private.
    console.error(
      "ImgBB upload request failed:",
      error instanceof Error ? error.name : "unknown error",
    );

    throw new ApiError(502, "Image upload service is unavailable. Please try again later.");
  }

  // Treat every non-success HTTP status as an upstream failure.
  if (!uploadResponse.ok) {
    // Log the status only, never the response body or request URL.
    console.error(`ImgBB upload failed with HTTP ${uploadResponse.status}`);

    throw new ApiError(502, "Image upload service rejected the request. Please try again later.");
  }

  // Parse the JSON body without exposing parser details to the client.
  let payload: ImgbbUploadResponse;
  try {
    payload = (await uploadResponse.json()) as ImgbbUploadResponse;
  } catch {
    console.error("ImgBB upload returned a non-JSON response");

    throw new ApiError(
      502,
      "Image upload service returned an invalid response. Please try again later.",
    );
  }

  // Read the direct image URL and validate the upstream success flag.
  const imageUrl = payload.data?.url;

  if (payload.success !== true || typeof imageUrl !== "string" || !isHttpUrl(imageUrl)) {
    console.error("ImgBB upload returned an invalid payload");

    throw new ApiError(
      502,
      "Image upload service returned an invalid response. Please try again later.",
    );
  }

  // Return only the direct URL; the API key and raw upstream payload never leave the server.
  return imageUrl;
}
