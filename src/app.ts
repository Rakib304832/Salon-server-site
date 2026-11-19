// Import the Express framework, which provides the HTTP server and routing tools.
import express from "express";

// Import the database-state helper used by the health route.
import { isDbConnected } from "./config/db.js";

// Create the Express application instance that will receive every request.
const app = express();

// Register a simple GET route at the root URL so the Part 1 setup can still be tested.
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

// Export the app without starting a network listener so later tests can import it.
export default app;
