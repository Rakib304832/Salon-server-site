// Import the validated environment values so startup fails before using bad configuration.
import { env } from "./config/env.js";

// Import the MongoDB connection and shutdown helpers.
import { connectDB, disconnectDB } from "./config/db.js";

// Import the Express application configured in app.ts.
// The .js extension is required because this project compiles to native ES modules.
import app from "./app.js";

// Define one startup function so connection errors are handled in a single place.
async function startServer(): Promise<void> {
  // Catch connection and listener failures instead of leaving an unhandled rejection.
  try {
    // Connect to MongoDB before accepting any HTTP traffic.
    await connectDB();

    // Start the HTTP server only after the database connection succeeds.
    const server = app.listen(env.PORT, () => {
      // Print the local address so the developer knows where the API is running.
      console.log(`SalonBook server is listening on http://localhost:${env.PORT}`);
    });

    // Define a shutdown routine that can be reused for each termination signal.
    const shutdown = (signal: string): void => {
      // State which signal caused the shutdown.
      console.log(`${signal} received. Closing the HTTP server...`);

      // Stop accepting new requests and wait for the listener to close.
      server.close(() => {
        // Disconnect from MongoDB, then exit even if disconnection throws.
        void disconnectDB().finally(() => {
          // Confirm that both resources were released.
          console.log("HTTP server and MongoDB connection closed.");

          // Exit with a successful status code.
          process.exit(0);
        });
      });
    };

    // Handle Ctrl+C in local development.
    process.once("SIGINT", () => shutdown("SIGINT"));

    // Handle the termination signal sent by hosting platforms.
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    // Print the startup error for the developer or hosting logs.
    console.error("Failed to start SalonBook server:", error);

    // Exit with a failure status so the platform can restart or report the problem.
    process.exit(1);
  }
}

// Start the server and explicitly ignore the returned promise.
void startServer();
