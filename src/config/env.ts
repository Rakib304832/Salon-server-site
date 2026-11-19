// Load key/value pairs from the local .env file before any variable is read.
import "dotenv/config";

// Import Zod, which validates and converts environment strings at startup.
import { z } from "zod";

// Allow the admin email to be omitted in production while still validating it when present.
const optionalEmail = z.preprocess(
  // Convert an empty string or whitespace-only value into undefined.
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  // Accept a correctly formatted email address when a value exists.
  z.email("ADMIN_EMAIL must be a valid email address").optional(),
);

// Allow the admin password to be omitted in production while still validating it when present.
const optionalPassword = z.preprocess(
  // Convert an empty string or whitespace-only value into undefined.
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  // Enforce the minimum password length required by the assignment.
  z.string().min(6, "ADMIN_PASSWORD must be at least 6 characters").optional(),
);

// Validate a public URL and remove any trailing slashes so URL joins stay predictable.
const urlWithoutTrailingSlash = z
  // Require a valid absolute URL.
  .url("Must be a valid URL including http:// or https://")
  // Remove one or more trailing slashes from the validated value.
  .transform((value) => value.replace(/\/+$/, ""));

// Describe every environment variable, its type, and its validation rules.
const envSchema = z.object({
  // Select the runtime mode; development is used when the host does not provide one.
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Convert PORT from text into an integer between 1 and 65535, defaulting to 5000.
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),

  // Require a MongoDB connection string and check its scheme before connecting.
  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required")
    .regex(/^mongodb(\+srv)?:\/\//, "MONGODB_URI must start with mongodb:// or mongodb+srv://"),

  // Require a long random secret used by Better Auth to sign sessions and tokens.
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),

  // Require the public server URL used by Better Auth.
  BETTER_AUTH_URL: urlWithoutTrailingSlash,

  // Require the public client URL used for CORS, trusted origins, and Stripe return URLs.
  CLIENT_URL: urlWithoutTrailingSlash,

  // Require the Google OAuth client identifier.
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),

  // Require the Google OAuth client secret, which must stay on the server.
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),

  // Require a Stripe test-mode secret key and refuse accidental live keys.
  STRIPE_SECRET_KEY: z
    .string()
    .startsWith("sk_test_", "STRIPE_SECRET_KEY must be a Stripe test-mode key starting with sk_test_"),

  // Require the Stripe webhook signing secret.
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .startsWith("whsec_", "STRIPE_WEBHOOK_SECRET must start with whsec_"),

  // Require the ImgBB key that the server uses for image uploads.
  IMGBB_API_KEY: z.string().min(1, "IMGBB_API_KEY is required"),

  // Read the optional admin email used only by the seed script.
  ADMIN_EMAIL: optionalEmail,

  // Read the optional admin password used only by the seed script.
  ADMIN_PASSWORD: optionalPassword,
});

// Validate the real process environment once when the module is imported.
const parsedEnv = envSchema.safeParse(process.env);

// Stop startup immediately when any required variable is missing or invalid.
if (!parsedEnv.success) {
  // Build a readable list that names every invalid variable and its problem.
  const details = parsedEnv.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("\n");

  // Throw one clear error instead of failing later inside a database or auth call.
  throw new Error(
    `Invalid environment variables:\n${details}\n\nCopy .env.example to .env and fill every required value.`,
  );
}

// Export the validated and converted values for the rest of the server.
export const env = parsedEnv.data;

// Export the inferred environment type so other modules can reuse it.
export type Env = typeof env;
