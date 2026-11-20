// Import the Express router factory.
import { Router } from "express";

// Import the authentication, role, blocked-account, and upload middleware.
import { checkBlocked } from "../middleware/checkBlocked.js";
import { uploadRateLimit, uploadSingleImage } from "../middleware/upload.js";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { verifyRole } from "../middleware/verifyRole.js";

// Import the upload handler.
import { uploadImage } from "../controllers/uploads.controller.js";

// Create the router mounted at /api/uploads.
const uploadsRouter = Router();

// Require a signed-in, unblocked user before accepting the multipart body.
uploadsRouter.post(
  "/",
  verifyAuth,
  checkBlocked,
  verifyRole("customer", "admin"),
  uploadRateLimit,
  uploadSingleImage,
  uploadImage,
);

// Export the uploads router.
export { uploadsRouter };
