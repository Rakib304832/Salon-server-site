// Import the Express framework, which provides the HTTP server and routing tools.
import express from "express";

// Create the Express application instance that will receive every request.
const app = express();

// Register a simple GET route at the root URL so the Part 1 setup can be tested.
app.get("/", (_request, response) => {
  // Send HTTP status 200 and a small JSON payload confirming that the server is alive.
  response.status(200).json({
    // The success flag keeps the response consistent with the API response format.
    success: true,
    // The message is the only information needed for this setup check.
    message: "SalonBook server is running",
  });
});

// Export the app without starting a network listener so later tests can import it.
export default app;
