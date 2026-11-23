// Vercel entry point for the SalonBook Express API.
//
// The local `src/index.ts` starts a long-lived HTTP listener, which is the
// right shape for `npm start` but not for a serverless function. This adapter
// shares the same Express app, prepares MongoDB/auth once per function
// instance, and exports the app as the default request handler.

import type { IncomingMessage, ServerResponse } from "node:http";

import { connectDB } from "../src/config/db.js";
import { initAuth } from "../src/config/auth.js";
import { AppointmentModel } from "../src/models/Appointment.js";
import { TransactionModel } from "../src/models/Transaction.js";
import app from "../src/app.js";

// Keep Vercel from pre-parsing JSON so the Stripe webhook can verify raw bytes.
export const config = {
  api: {
    bodyParser: false,
  },
};

// One setup promise per warm function instance. Later requests reuse it.
let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await connectDB();
      await Promise.all([
        AppointmentModel.createIndexes(),
        TransactionModel.createIndexes(),
      ]);
      initAuth();
    })().catch((error) => {
      // Allow a later invocation to retry after a transient database failure.
      ready = null;
      throw error;
    });
  }

  return ready;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  try {
    await ensureReady();
    return app(request as never, response as never);
  } catch (error) {
    console.error("Vercel cold-start preparation failed:", error);
    response.statusCode = 503;
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        success: false,
        message: "Server is temporarily unavailable",
        code: "SERVER_UNAVAILABLE",
      }),
    );
  }
}
