// Load variables from the local .env file into process.env.
import "dotenv/config";

// Import the Express application configured in app.ts.
// The .js extension is required because this project compiles to native ES modules.
import app from "./app.js";

// Read PORT from the environment and fall back to 5000 when it is not provided.
const port = Number(process.env.PORT) || 5000;

// Start the HTTP server and keep the returned server object for graceful shutdown later.
const server = app.listen(port, () => {
  // Print the local address so the developer knows where the API is running.
  console.log(`SalonBook server is listening on http://localhost:${port}`);
});

// Export the server object so future integration tests can close it cleanly.
export default server;
