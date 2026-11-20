// Import the Stripe SDK, which is published as an ESM-compatible default export.
import Stripe from "stripe";

// Import the validated test-mode Stripe key.
import { env } from "./env.js";

// Create one Stripe client for the lifetime of the server process.
// The API version is left at the SDK default so upgrades stay explicit in package.json.
export const stripe = new Stripe(env.STRIPE_SECRET_KEY);
