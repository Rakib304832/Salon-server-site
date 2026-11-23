// Import the Express router factory.
import { Router } from "express";

// Import Zod for the admin appointment query and body schemas.
import { z } from "zod";

// Import the auth, blocked-account, and role guards.
import { checkBlocked } from "../middleware/checkBlocked.js";
import { objectIdSchema, validate } from "../middleware/validate.js";
import { verifyAuth } from "../middleware/verifyAuth.js";
import { verifyRole } from "../middleware/verifyRole.js";

// Import the admin appointment handlers.
import {
  getAdminAppointmentById,
  listAllAppointments,
  updateAppointmentStatus,
} from "../controllers/adminAppointments.controller.js";

// Import the shared status unions used by the query and body schemas.
import type { AppointmentStatus, PaymentStatus } from "../types/models.js";

// Validate the appointment identifier used by the status route.
const appointmentIdParamsSchema = z.object({
  id: objectIdSchema,
});

// Describe every filter accepted by the admin appointment list.
const adminAppointmentQuerySchema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled"] as const satisfies readonly AppointmentStatus[]).optional(),
  paymentStatus: z.enum(["unpaid", "paid"] as const satisfies readonly PaymentStatus[]).optional(),
  appointmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Appointment date must use YYYY-MM-DD format")
    .optional(),
  serviceId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
});

// Admins may confirm a pending request or cancel a pending or confirmed one.
const appointmentStatusSchema = z.object({
  status: z.enum(["confirmed", "cancelled"]),
});

// Create the router mounted at /api/admin/appointments.
const adminAppointmentsRouter = Router();

// List all appointments with optional filters.
adminAppointmentsRouter.get(
  "/",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  validate({ query: adminAppointmentQuerySchema }),
  listAllAppointments,
);

// Return one appointment with service and customer details.
adminAppointmentsRouter.get(
  "/:id",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  validate({ params: appointmentIdParamsSchema }),
  getAdminAppointmentById,
);

// Change the lifecycle state of one appointment.
adminAppointmentsRouter.patch(
  "/:id/status",
  verifyAuth,
  checkBlocked,
  verifyRole("admin"),
  validate({ params: appointmentIdParamsSchema, body: appointmentStatusSchema }),
  updateAppointmentStatus,
);

// Export the admin appointment router.
export { adminAppointmentsRouter };
