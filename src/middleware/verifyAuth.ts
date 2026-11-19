// Import the Express request type used by the header conversion helper.
import type { Request, RequestHandler } from "express";

// Import jose helpers that verify Bearer tokens against the Better Auth JWKS.
import { createRemoteJWKSet, jwtVerify } from "jose";

// Import the MongoDB ObjectId class used to find the Better Auth user document.
import { ObjectId } from "mongodb";

// Import the initialised Better Auth instance.
import { getAuth } from "../config/auth.js";

// Import the active MongoDB database.
import { getDb } from "../config/db.js";

// Import the validated server URL used as the JWT issuer and audience.
import { env } from "../config/env.js";

// Import the shared user and role types.
import type { User, UserRole } from "../types/models.js";

// Import the error and async helpers used by the middleware.
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Cache the remote JWK set so signing keys are fetched once and reused.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

// Build the URL of the JWKS endpoint mounted by Better Auth.
function getJwksUrl(): URL {
  return new URL("/api/auth/jwks", env.BETTER_AUTH_URL);
}

// Create the JWKS fetcher lazily so importing this file performs no network work.
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  // Reuse the cached key set on later requests.
  jwks ??= createRemoteJWKSet(getJwksUrl());

  // Return the ready-to-use key set.
  return jwks;
}

// Convert Express request headers into the Web Headers object Better Auth expects.
function toWebHeaders(request: Request): Headers {
  // Create an empty Web Headers collection.
  const headers = new Headers();

  // Copy every incoming header, including repeated values.
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  // Return the converted headers.
  return headers;
}

// Read the Bearer token from the Authorization header when one is present.
function getBearerToken(request: Request): string | null {
  // Read the raw header because Express normalises its name to lowercase.
  const header = request.headers.authorization;

  // Stop when the request has no Authorization header.
  if (!header) {
    return null;
  }

  // Accept the standard case-insensitive Bearer scheme.
  const match = /^Bearer\s+(.+)$/i.exec(header);

  // Return the trimmed token or null when the scheme is different.
  return match?.[1]?.trim() || null;
}

// Resolve a Better Auth session cookie or Bearer JWT to a user identifier.
async function resolveUserId(request: Request): Promise<string> {
  // Try the cookie session first because the web client uses cookies.
  try {
    const session = await getAuth().api.getSession({
      headers: toWebHeaders(request),
    });

    // Return the session user id when Better Auth accepted the cookie.
    if (session?.user?.id) {
      return session.user.id;
    }
  } catch {
    // Fall through to Bearer verification when the cookie cannot be read.
  }

  // Read the Bearer token when no cookie session was found.
  const token = getBearerToken(request);

  // Reject the request when neither authentication method was provided.
  if (!token) {
    throw ApiError.unauthorized();
  }

  // Verify the token signature, issuer, audience, and expiry with the JWKS.
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: env.BETTER_AUTH_URL,
      audience: env.BETTER_AUTH_URL,
    });

    // Require a subject so the token can be mapped to a MongoDB user.
    if (!payload.sub) {
      throw new Error("JWT subject is missing");
    }

    // Return the subject from the verified token.
    return payload.sub;
  } catch {
    // Hide the exact verification failure from the client.
    throw ApiError.unauthorized("Invalid or expired access token");
  }
}

// Load the fresh user document so role and blocked changes apply immediately.
async function loadUser(userId: string): Promise<User> {
  // Reject identifiers that cannot belong to a Better Auth MongoDB user.
  if (!ObjectId.isValid(userId)) {
    throw ApiError.unauthorized();
  }

  // Read the current user document instead of trusting stale token claims.
  const document = await getDb()
    .collection("user")
    .findOne({ _id: new ObjectId(userId) });

  // Reject tokens that point at a deleted account.
  if (!document) {
    throw ApiError.unauthorized();
  }

  // Normalise the stored role and default unknown values to customer.
  const role: UserRole = document.role === "admin" ? "admin" : "customer";

  // Return only the safe fields exposed by the API.
  return {
    id: document._id.toString(),
    name: typeof document.name === "string" ? document.name : "",
    email: typeof document.email === "string" ? document.email : "",
    image: typeof document.image === "string" ? document.image : undefined,
    role,
    isBlocked: document.isBlocked === true,
    phone: typeof document.phone === "string" ? document.phone : undefined,
  };
}

// Authenticate every protected request and attach the current user.
export const verifyAuth = asyncHandler(async (request, _response, next) => {
  // Accept either the Better Auth cookie or a Bearer JWT.
  const userId = await resolveUserId(request);

  // Load the current user from MongoDB before the next middleware runs.
  request.user = await loadUser(userId);

  // Continue to the protected route.
  next();
});
