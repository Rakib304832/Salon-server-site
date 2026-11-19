// Import the Express middleware type.
import type { RequestHandler } from "express";

// Import the Zod base type used by each validation schema.
import type { ZodType } from "zod";

// Describe which request parts a route wants to validate.
export interface ValidationSchemas {
  // Optional schema for the JSON body.
  body?: ZodType;

  // Optional schema for the route parameters.
  params?: ZodType;

  // Optional schema for the query string.
  query?: ZodType;
}

// Validate and replace request values before the route handler runs.
export function validate(schemas: ValidationSchemas): RequestHandler {
  // Return the middleware configured by the route.
  return (request, response, next) => {
    try {
      // Replace the body with the parsed and sanitised value.
      if (schemas.body) {
        request.body = schemas.body.parse(request.body);
      }

      // Replace route parameters with the parsed values.
      if (schemas.params) {
        request.params = schemas.params.parse(request.params) as typeof request.params;
      }

      // Express 5 exposes req.query through a getter, so store it in res.locals.
      if (schemas.query) {
        response.locals.query = schemas.query.parse(request.query);
      }

      // Continue once every configured schema has passed.
      next();
    } catch (error) {
      // Send Zod failures to the central error handler as a 400 response.
      next(error);
    }
  };
}
