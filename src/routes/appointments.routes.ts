// Import the Express router factory.
import { Router } from "express";

// Import Zod for the appointment request schemas.
import { z } from "zod";

// Import the auth, blocked-account, and role guards.
import { checkBlocked } from "../middleware/checkBlocked.js";
import { objectIdSchema, validate } from "../middleware/validate.js";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { verifyRole } from "../middleware/verifyRole.js";

// Import the appointment handlers.
import {
  cancelAppointment,
  createAppointment,
  getAppointmentById,
  getMyAppointmentStats,
  listMyAppointments,
} from "../controllers/appointments.controller.js";

// Import the fixed booking slots shown to customers.
import { TIME_SLOTS } from "../utils/constants.js";

// Validate the identifier used by the cancellation route.
const appointmentIdParamsSchema = z.object({
  id: objectIdSchema,
});

// Describe the only fields a customer may send when requesting an appointment.
const createAppointmentSchema = z.object({
  // Require a valid service identifier.
  serviceId: objectIdSchema,

  // Require the agreed date-only format; calendar and future rules run in the service layer.
  appointmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Appointment date must use YYYY-MM-DD format"),

  // Accept only one of the ten advertised hourly slots.
  timeSlot: z.enum(TIME_SLOTS),

  // Allow an optional short note and remove surrounding whitespace.
  message: z.string().trim().max(500, "Message cannot exceed 500 characters").optional(),
});

// Create the router mounted at /api/appointments.
const appointmentsRouter = Router();

// Request a new appointment. Only customers can book their own appointments.
appointmentsRouter.post(
  "/",
  verifyAuth,
  checkBlocked,
  verifyRole("customer"),
  validate({ body: createAppointmentSchema }),
  createAppointment,
);

// Return dashboard counts for the signed-in customer.
appointmentsRouter.get(
  "/stats",
  verifyAuth,
  checkBlocked,
  verifyRole("customer"),
  getMyAppointmentStats,
);

// List the signed-in customer's own appointments.
appointmentsRouter.get(
  "/mine",
  verifyAuth,
  checkBlocked,
  verifyRole("customer"),
  listMyAppointments,
);

// Read one of the signed-in customer's own appointments.
appointmentsRouter.get(
  "/:id",
  verifyAuth,
  checkBlocked,
  verifyRole("customer"),
  validate({ params: appointmentIdParamsSchema }),
  getAppointmentById,
);

// Cancel one of the signed-in customer's own pending appointments.
appointmentsRouter.patch(
  "/:id/cancel",
  verifyAuth,
  checkBlocked,
  verifyRole("customer"),
  validate({ params: appointmentIdParamsSchema }),
  cancelAppointment,
);

// Export the appointment router for app.ts to mount.
export { appointmentsRouter };
