// Import the Express middleware type used by the security header handler.
import type { RequestHandler } from "express";

// Apply conservative response headers to every API request.
export const securityHeaders: RequestHandler = (_request, response, next) => {
  // Prevent browsers from guessing a different content type.
  response.setHeader("X-Content-Type-Options", "nosniff");

  // Keep the API out of frames used for clickjacking.
  response.setHeader("X-Frame-Options", "DENY");

  // Do not send the full API URL as a referrer to third parties.
  response.setHeader("Referrer-Policy", "no-referrer");

  // Isolate this origin from cross-origin document openings.
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  // Do not allow other origins to embed API responses as resources.
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  // Deny browser features the API never uses.
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );

  // Tell browsers to use HTTPS only once this server is served over HTTPS.
  response.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );

  // Restrict JSON responses so no browser default sources can execute.
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );

  // Avoid caching authenticated or payment-related API responses.
  response.setHeader("Cache-Control", "no-store");

  // Continue to the next route or middleware.
  next();
};
