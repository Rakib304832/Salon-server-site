// Import the Express router factory.
import { Router } from "express";

// Import Zod for the profile update schema.
import { z } from "zod";

// Import the auth, blocked-account, and role guards.
import { checkBlocked } from "../middleware/checkBlocked.js";
import { validate } from "../middleware/validate.js";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { verifyRole } from "../middleware/verifyRole.js";

// Import the profile handlers.
import { getMyProfile, updateMyProfile } from "../controllers/users.controller.js";

// Accept only safe profile fields; role, email, and blocked state are ignored.
const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name cannot exceed 100 characters")
      .optional(),

    // An empty string clears an optional phone number.
    phone: z.string().trim().max(20, "Phone cannot exceed 20 characters").optional(),

    // Accept an image URL or an empty string to clear the image.
    image: z.union([z.url("Image must be a valid URL"), z.literal("")]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field must be provided",
  });

// Create the router mounted at /api/users.
const usersRouter = Router();

// Read the signed-in user's safe profile.
usersRouter.get(
  "/me",
  verifyAuth,
  checkBlocked,
  verifyRole("customer", "admin"),
  getMyProfile,
);

// Update only the signed-in user's editable profile fields.
usersRouter.patch(
  "/me",
  verifyAuth,
  checkBlocked,
  verifyRole("customer", "admin"),
  validate({ body: updateProfileSchema }),
  updateMyProfile,
);

// Export the profile router.
export { usersRouter };
