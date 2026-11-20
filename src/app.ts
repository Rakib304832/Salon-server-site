// Import the Express framework, which provides the HTTP server and routing tools.
import express from "express";

// Import CORS so the separately hosted Next.js client can call this API with cookies.
import cors from "cors";

// Import the official Better Auth adapter that converts Node requests into Better Auth requests.
import { toNodeHandler } from "better-auth/node";

// Import the validated client URL used by the CORS policy.
import { env } from "./config/env.js";

// Import the database-state helper used by the health route.
import { isDbConnected } from "./config/db.js";

// Import the initialised Better Auth instance accessor.
import { getAuth } from "./config/auth.js";

// Import the shared 404 and error handlers placed after every route.
import { errorHandler, notFound } from "./middleware/errorHandler.js";

// Import the public service routes and the separate admin service listing router.
import { adminServicesRouter, servicesRouter } from "./routes/services.routes.js";

// Create the Express application instance that will receive every request.
const app = express();

// Trust one reverse proxy so secure cookies and client IPs work behind a hosting provider.
app.set("trust proxy", 1);

// Allow the Next.js client origin to call the API and include session cookies.
app.use(
  cors({
    // Allow only the configured client origin, never a wildcard with credentials.
    origin: env.CLIENT_URL,

    // Permit the browser to send and receive Better Auth session cookies.
    credentials: true,

    // List the HTTP methods used by the API.
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    // Allow JSON bodies and Bearer tokens from API clients.
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Cache the Better Auth handler after the first request so it is created only once.
let authHandler: ReturnType<typeof toNodeHandler> | null = null;

// Mount every Better Auth endpoint before the JSON parser so Better Auth receives the raw request body.
app.all("/api/auth/*splat", (request, response) => {
  // Create the handler lazily because Better Auth is initialised after the database connects.
  authHandler ??= toNodeHandler(getAuth());

  // Forward the request to Better Auth and return its response.
  return authHandler(request, response);
});

// Parse JSON request bodies for the application API after Better Auth has handled its own routes.
app.use(express.json({ limit: "1mb" }));

// Register a simple GET route at the root URL so the setup can still be tested.
app.get("/", (_request, response) => {
  // Send HTTP status 200 and a small JSON payload confirming that the server is alive.
  response.status(200).json({
    // The success flag keeps the response consistent with the API response format.
    success: true,
    // The message is the only information needed for this setup check.
    message: "SalonBook server is running",
  });
});

// Register the health endpoint used by developers and the deployment host.
app.get("/api/health", (_request, response) => {
  // Read the live Mongoose connection state for this request.
  const databaseConnected = isDbConnected();

  // Return 200 when healthy and 503 when the database cannot serve requests.
  response.status(databaseConnected ? 200 : 503).json({
    // Report success only when every dependency is available.
    success: databaseConnected,
    // Expose only safe operational information, never credentials or connection strings.
    data: {
      // Identify the running API.
      service: "SalonBook API",
      // Describe the database state in a human-readable form.
      database: databaseConnected ? "connected" : "disconnected",
      // Report how long the Node.js process has been running.
      uptimeSeconds: Math.floor(process.uptime()),
    },
    // Give the caller a short explanation of the result.
    message: databaseConnected
      ? "SalonBook API is healthy"
      : "SalonBook API is running but the database is unavailable",
  });
});

// Register the public and admin service routes before the fallback handlers.
app.use("/api/services", servicesRouter);
app.use("/api/admin/services", adminServicesRouter);

// Return a consistent JSON error for requests that matched no route.
app.use(notFound);

// Convert every thrown error into the shared error envelope.
app.use(errorHandler);

// Export the app without starting a network listener so later tests can import it.
export default app;
