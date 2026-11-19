// Import the public user shape stored on authenticated requests.
import type { User } from "./models.js";

// Teach TypeScript about the user property added by the verifyAuth middleware.
declare global {
  namespace Express {
    interface Request {
      // The fresh MongoDB user loaded for the current request.
      user?: User;
    }
  }
}

// Mark the file as a module so the global augmentation is applied.
export {};
