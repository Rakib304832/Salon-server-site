// Import Better Auth, which creates the authentication API and session manager.
import { APIError, betterAuth } from "better-auth";

// Import the MongoDB adapter so Better Auth stores its collections in the same database.
import { mongodbAdapter } from "better-auth/adapters/mongodb";

// Import the JWT plugin so signed-in users can also receive a Bearer token.
import { jwt } from "better-auth/plugins";

// Import the validated environment values and the full client-origin allowlist.
import { env, getClientOrigins } from "./env.js";

// Import the active native MongoDB database object.
import { getDb } from "./db.js";

// Build a new Better Auth instance with every approved provider and user field.
function createAuth() {
  // Return the configured authentication instance with its exact inferred type.
  return betterAuth({
    // Show the product name in generated auth pages and messages.
    appName: "SalonBook",

    // Use the public server URL that the browser and Google redirects will call.
    baseURL: env.BETTER_AUTH_URL,

    // Sign sessions and JWTs with the validated server-only secret.
    secret: env.BETTER_AUTH_SECRET,

    // Store Better Auth users, sessions, accounts, verification records, and keys in MongoDB.
    database: mongodbAdapter(getDb(), {
      // Disable driver transactions so both Atlas and a standalone local MongoDB work.
      transaction: false,
    }),

    // Trust every configured client origin when Better Auth checks cross-origin requests.
    trustedOrigins: getClientOrigins(),

    // Enable the email and password provider required by the assignment.
    emailAndPassword: {
      // Allow customers and seeded admins to sign in with email and password.
      enabled: true,

      // Do not require an email service for this project, so sign-up can complete immediately.
      requireEmailVerification: false,

      // Match the client rule: at least six characters (Better Auth defaults to eight).
      minPasswordLength: 6,

      // Keep a reasonable upper bound to reject oversized password payloads.
      maxPasswordLength: 128,
    },

    // Configure Google as the second sign-in provider.
    socialProviders: {
      // Google uses the client ID publicly and the client secret only on this server.
      google: {
        // Send the Google OAuth client identifier during the authorization redirect.
        clientId: env.GOOGLE_CLIENT_ID,

        // Send the Google OAuth client secret during the token exchange.
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },

    // Extend the Better Auth user document with the assignment's custom fields.
    user: {
      // Describe each custom field so Better Auth creates and returns it correctly.
      additionalFields: {
        // Store the user's role and default every new registration to customer.
        role: {
          // Save the role as a string value.
          type: "string",

          // Do not require the client to send the field during registration.
          required: false,

          // Assign the customer role when the field is absent.
          defaultValue: "customer",

          // Block clients from setting this field, keeping admin assignment server-only.
          input: false,
        },

        // Store whether an admin has blocked the account.
        isBlocked: {
          // Save the blocked flag as a boolean value.
          type: "boolean",

          // Do not require the client to send the field during registration.
          required: false,

          // Every new account starts unblocked.
          defaultValue: false,

          // Block clients from changing this field through sign-up or profile input.
          input: false,
        },

        // Store an optional contact phone number for the profile page.
        phone: {
          // Save the phone number as text.
          type: "string",

          // Allow users to omit a phone number.
          required: false,

          // Allow profile updates to provide a phone number.
          input: true,
        },
      },
    },

    // Enforce the assignment password rules before Better Auth creates an account.
    hooks: {
      before: async (context) => {
        // Better Auth supplies the endpoint path at runtime; cast to read it safely.
        const hookContext = context as unknown as { path?: string; body?: unknown };

        // Only the email sign-up route carries a plain-text password.
        if (hookContext.path !== "/sign-up/email") {
          return;
        }

        // Read the submitted password without trusting its type.
        const password = (hookContext.body as { password?: unknown } | undefined)?.password;

        // Reject passwords that do not contain both letter cases.
        if (
          typeof password !== "string" ||
          !/[A-Z]/.test(password) ||
          !/[a-z]/.test(password)
        ) {
          throw new APIError("BAD_REQUEST", {
            message: "Password must contain at least one uppercase and one lowercase letter",
            code: "PASSWORD_RULE_VIOLATION",
          });
        }
      },
    },

    // Configure cookies so sessions work from the separate client origin in production.
    advanced: {
      // Apply these defaults to every Better Auth session cookie.
      defaultCookieAttributes: {
        // Prevent browser JavaScript from reading the session cookie.
        httpOnly: true,

        // Production uses cross-site cookies; localhost uses a normal same-site cookie.
        sameSite: env.NODE_ENV === "production" ? "none" : "lax",

        // Cross-site cookies must be secure, and local HTTP development must not be forced to HTTPS.
        secure: env.NODE_ENV === "production",

        // Send the cookie to every API path handled by this server.
        path: "/",
      },
    },

    // Enable the JWT endpoints and signing support required by the server auth middleware.
    plugins: [jwt()],
  });
}

// Reuse the exact return type produced by createAuth for the singleton.
type AuthInstance = ReturnType<typeof createAuth>;

// Keep one Better Auth instance for the lifetime of the server process.
let authInstance: AuthInstance | null = null;

// Create Better Auth after MongoDB is connected and return the existing instance on later calls.
export function initAuth(): AuthInstance {
  // Return the existing instance when startup code or a test calls this more than once.
  if (authInstance) {
    return authInstance;
  }

  // Create the singleton after the database object is available.
  authInstance = createAuth();

  // Return the ready-to-use authentication instance.
  return authInstance;
}

// Read the initialised instance from routes and middleware without creating a second one.
export function getAuth(): AuthInstance {
  // Stop with a clear message when startup order is wrong.
  if (!authInstance) {
    throw new Error("Better Auth is not initialised. Call initAuth() after connectDB().");
  }

  // Return the ready-to-use authentication instance.
  return authInstance;
}
