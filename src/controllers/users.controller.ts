// Import the Express request and response types used by the user handlers.
import type { Request, Response } from "express";

// Import the native MongoDB ObjectId and filter type used by Better Auth's user collection.
import { ObjectId, type Filter } from "mongodb";

// Import the active database used by Better Auth.
import { getDb } from "../config/db.js";

// Import the shared safe user shape and role union.
import type { User, UserRole } from "../types/models.js";

// Import the shared error, async, and response helpers.
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

// Describe the Better Auth user fields this API reads and writes.
export interface UserDocument {
  // Better Auth user identifier.
  _id: ObjectId;

  // Display name editable through the profile route.
  name: string;

  // Login email; read-only in this API.
  email: string;

  // Optional profile image URL editable through the profile route.
  image?: string;

  // Server-owned role.
  role: UserRole;

  // Server-owned blocked flag.
  isBlocked: boolean;

  // Optional phone number editable through the profile route.
  phone?: string;

  // Creation time used for the admin list ordering.
  createdAt?: Date;
}

// Describe the validated profile update body.
interface ProfileBody {
  // Optional new display name.
  name?: string;

  // Optional phone number; an empty string clears it.
  phone?: string;

  // Optional image URL; an empty string clears it.
  image?: string;
}

// Describe the validated admin user list query.
export interface UserListQuery {
  // Optional text matched against name and email.
  search?: string;

  // Optional role filter.
  role?: UserRole;

  // Optional blocked-state filter.
  isBlocked?: "true" | "false";
}

// Return the typed Better Auth user collection.
function userCollection() {
  return getDb().collection<UserDocument>("user");
}

// Escape user input before using it in a MongoDB regular expression.
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Convert a stored Better Auth document into the shared safe user shape.
export function serializeUser(user: UserDocument): User {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    ...(typeof user.image === "string" ? { image: user.image } : {}),
    role: user.role === "admin" ? "admin" : "customer",
    isBlocked: user.isBlocked === true,
    ...(typeof user.phone === "string" ? { phone: user.phone } : {}),
  };
}

// Build the filter used by the admin user list.
function buildUserFilter(query: UserListQuery): Filter<UserDocument> {
  // Start with an empty filter and add only validated values.
  const filter: Filter<UserDocument> = {};

  // Match role exactly when requested.
  if (query.role) {
    filter.role = query.role;
  }

  // Match the blocked flag when requested.
  if (query.isBlocked) {
    filter.isBlocked = query.isBlocked === "true";
  }

  // Search name and email with a safely escaped expression.
  if (query.search?.trim()) {
    const expression = new RegExp(escapeRegex(query.search.trim()), "i");
    filter.$or = [{ name: expression }, { email: expression }];
  }

  return filter;
}

// Read the validated query stored by the validate middleware.
function readUserQuery(response: Response): UserListQuery {
  return response.locals.query as UserListQuery;
}

// Return the signed-in user's safe profile.
export const getMyProfile = asyncHandler(async (request, response) => {
  // verifyAuth has already loaded the current user from MongoDB.
  if (!request.user) {
    throw ApiError.unauthorized();
  }

  // Return only safe profile fields inside the success envelope.
  sendSuccess(response, request.user, "Profile retrieved successfully");
});

// Update only the profile fields a user is allowed to change.
export const updateMyProfile = asyncHandler(async (request, response) => {
  // Guard against a route mounted without verifyAuth.
  if (!request.user) {
    throw ApiError.unauthorized();
  }

  // Read the body after Zod removed role, email, and blocked-state values.
  const body = request.body as ProfileBody;

  // Build an update containing only fields the client actually supplied.
  const update: Partial<Pick<UserDocument, "name" | "phone" | "image">> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.phone !== undefined) update.phone = body.phone;
  if (body.image !== undefined) update.image = body.image;

  // Update the auth user document and return the new version.
  const updated = await userCollection().findOneAndUpdate(
    { _id: new ObjectId(request.user.id) },
    { $set: update },
    { returnDocument: "after" },
  );

  // Reject a token whose account disappeared before the update.
  if (!updated) {
    throw ApiError.unauthorized();
  }

  // Return the sanitised profile inside the success envelope.
  sendSuccess(response, serializeUser(updated), "Profile updated successfully");
});

// List users for the admin management table.
export const listUsers = asyncHandler(async (_request, response) => {
  // Read only validated filter values.
  const query = readUserQuery(response);

  // Return newest accounts first so the admin sees recent sign-ups.
  const users = await userCollection()
    .find(buildUserFilter(query))
    .sort({ createdAt: -1 })
    .toArray();

  // Return only safe fields and never password or session records.
  sendSuccess(
    response,
    users.map(serializeUser),
    "Users retrieved successfully",
  );
});

// Block or unblock another user as an administrator.
export const updateUserBlock = asyncHandler(async (request, response) => {
  // Read the validated target identifier and the new blocked flag.
  const { id } = request.params;
  const userId = String(id);
  const { isBlocked } = request.body as { isBlocked: boolean };

  // Guard against a route mounted without verifyAuth.
  if (!request.user) {
    throw ApiError.unauthorized();
  }

  // Prevent an administrator from locking themselves out of the API.
  if (userId.toLowerCase() === request.user.id.toLowerCase()) {
    throw ApiError.badRequest("You cannot change your own blocked state", [
      { field: "id", message: "Ask another administrator to change this value" },
    ]);
  }

  // Apply the blocked flag and return the new document.
  const updated = await userCollection().findOneAndUpdate(
    { _id: new ObjectId(userId) },
    { $set: { isBlocked } },
    { returnDocument: "after" },
  );

  // Return 404 when the target user does not exist.
  if (!updated) {
    throw ApiError.notFound("User not found");
  }

  // Return the sanitised user inside the success envelope.
  sendSuccess(response, serializeUser(updated), "User block state updated successfully");
});

// Promote or demote another user as an administrator.
export const updateUserRole = asyncHandler(async (request, response) => {
  // Read the validated target identifier and the new role.
  const { id } = request.params;
  const userId = String(id);
  const { role } = request.body as { role: UserRole };

  // Guard against a route mounted without verifyAuth.
  if (!request.user) {
    throw ApiError.unauthorized();
  }

  // Prevent administrators from removing their own admin access.
  if (userId.toLowerCase() === request.user.id.toLowerCase()) {
    throw ApiError.badRequest("You cannot change your own role", [
      { field: "id", message: "Ask another administrator to change this value" },
    ]);
  }

  // Load the target so a demotion can protect the final admin account.
  const target = await userCollection().findOne({ _id: new ObjectId(userId) });

  if (!target) {
    throw ApiError.notFound("User not found");
  }

  // Keep at least one administrator available in the system.
  if (target.role === "admin" && role === "customer") {
    const adminCount = await userCollection().countDocuments({ role: "admin" });
    if (adminCount <= 1) {
      throw new ApiError(409, "At least one administrator must remain", {
        code: "LAST_ADMIN_PROTECTED",
      });
    }
  }

  // Apply the role change and return the new document.
  const updated = await userCollection().findOneAndUpdate(
    { _id: new ObjectId(userId) },
    { $set: { role } },
    { returnDocument: "after" },
  );

  if (!updated) {
    throw ApiError.notFound("User not found");
  }

  // Return the sanitised user inside the success envelope.
  sendSuccess(response, serializeUser(updated), "User role updated successfully");
});

// Return one registered customer's safe details for the admin user table.
export const getUserById = asyncHandler(async (request, response) => {
  // Read the validated identifier from the route parameter.
  const { id } = request.params;

  // Look up the Better Auth user document by identifier.
  const user = await userCollection().findOne({ _id: new ObjectId(String(id)) });

  // Return a clear 404 when the account does not exist.
  if (!user) {
    throw ApiError.notFound("User not found");
  }

  // Return only safe fields, never a password hash or session record.
  sendSuccess(response, serializeUser(user), "User retrieved successfully");
});
