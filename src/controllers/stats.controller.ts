// Import Mongoose's default export for ObjectId typing in aggregation results.
import mongoose from "mongoose";

// Import the appointment, service, transaction, and user models.
import { AppointmentModel } from "../models/Appointment.js";
import { ServiceModel, type ServiceInput } from "../models/Service.js";
import { TransactionModel } from "../models/Transaction.js";
import { UserModel } from "../models/User.js";

// Import the shared appointment and service serializers.
import {
  serializeAppointment,
  type AppointmentRecord,
  type ServiceRecord,
} from "./appointments.controller.js";

// Import the shared dashboard response shapes.
import type {
  DashboardCounts,
  DashboardRevenue,
  DashboardStats,
  PopularServiceStat,
} from "../types/models.js";

// Import the shared async and response helpers.
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

// Describe one revenue row produced by the transaction aggregation.
interface RevenueAggregateRow {
  // Currency code grouped by the aggregation.
  _id: string;

  // Sum of paid amounts in that currency's smallest unit.
  amount: number;
}

// Describe one popular-service row produced by the appointment aggregation.
interface PopularAggregateRow {
  // Service identifier grouped by the aggregation.
  _id: mongoose.Types.ObjectId;

  // Service name copied from the current service document.
  serviceName: string;

  // Number of non-cancelled appointments for the service.
  bookings: number;
}

// Add the MongoDB identifier to a lean service document for local typing.
type StatsServiceRecord = ServiceInput & { _id: mongoose.Types.ObjectId };

// Count every server-owned record shown on the dashboard.
async function readCounts(): Promise<DashboardCounts> {
  // Run independent counts together so the dashboard needs only one round trip.
  const [
    users,
    customers,
    services,
    activeServices,
    appointments,
    pendingAppointments,
    confirmedAppointments,
    cancelledAppointments,
    paidAppointments,
    paidTransactions,
    failedTransactions,
  ] = await Promise.all([
    UserModel.countDocuments({}),
    UserModel.countDocuments({ role: "customer" }),
    ServiceModel.countDocuments({}),
    ServiceModel.countDocuments({ status: "active" }),
    AppointmentModel.countDocuments({}),
    AppointmentModel.countDocuments({ status: "pending" }),
    AppointmentModel.countDocuments({ status: "confirmed" }),
    AppointmentModel.countDocuments({ status: "cancelled" }),
    AppointmentModel.countDocuments({ paymentStatus: "paid" }),
    TransactionModel.countDocuments({ status: "paid" }),
    TransactionModel.countDocuments({ status: "failed" }),
  ]);

  // Return only values calculated from database records.
  return {
    users,
    customers,
    services,
    activeServices,
    appointments,
    pendingAppointments,
    confirmedAppointments,
    cancelledAppointments,
    paidAppointments,
    paidTransactions,
    failedTransactions,
  };
}

// Sum revenue from paid transactions recorded by the verified Stripe webhook.
async function readRevenue(): Promise<DashboardRevenue> {
  // Group paid transactions by the currency reported by Stripe.
  const rows = await TransactionModel.aggregate<RevenueAggregateRow>([
    { $match: { status: "paid" } },
    { $group: { _id: "$currency", amount: { $sum: "$amount" } } },
    { $sort: { _id: 1 } },
  ]);

  // Normalise currency codes before returning them to the client.
  const byCurrency = rows.map((row) => ({
    currency: String(row._id).toLowerCase(),
    amount: row.amount,
  }));

  // Return the combined amount plus the per-currency breakdown.
  return {
    total: byCurrency.reduce((sum, entry) => sum + entry.amount, 0),
    byCurrency,
  };
}

// Find the five most booked active or confirmed services.
async function readPopularServices(): Promise<PopularServiceStat[]> {
  // Count non-cancelled bookings and copy the current service name.
  const rows = await AppointmentModel.aggregate<PopularAggregateRow>([
    { $match: { status: { $in: ["pending", "confirmed"] } } },
    { $group: { _id: "$serviceId", bookings: { $sum: 1 } } },
    { $sort: { bookings: -1, _id: 1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "services",
        localField: "_id",
        foreignField: "_id",
        as: "service",
      },
    },
    { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        bookings: 1,
        serviceName: { $ifNull: ["$service.serviceName", "Unknown service"] },
      },
    },
  ]);

  // Convert aggregation documents into the shared response shape.
  return rows.map((row) => ({
    serviceId: row._id.toString(),
    serviceName: row.serviceName,
    bookings: row.bookings,
  }));
}

// Load the five newest appointment requests with their service details.
async function readRecentAppointments() {
  // Sort by request time because this is an activity feed, not a calendar list.
  const appointments = (await AppointmentModel.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .lean()) as AppointmentRecord[];

  // Load referenced services once for the response shapes.
  const services = (await ServiceModel.find({
    _id: { $in: appointments.map((appointment) => appointment.serviceId) },
  }).lean()) as StatsServiceRecord[];

  // Index services by identifier for deterministic pairing.
  const serviceById = new Map(services.map((service) => [service._id.toString(), service]));

  // Serialize through the shared appointment helper.
  return appointments.map((appointment) =>
    serializeAppointment(
      appointment,
      serviceById.get(appointment.serviceId.toString()) as ServiceRecord | undefined,
    ),
  );
}

// Return the complete admin dashboard payload.
export const getDashboardStats = asyncHandler(async (_request, response) => {
  // Read every section from server-owned records; the client supplies no values.
  const [counts, revenue, popularServices, recentAppointments] = await Promise.all([
    readCounts(),
    readRevenue(),
    readPopularServices(),
    readRecentAppointments(),
  ]);

  // Build the shared statistics payload.
  const stats: DashboardStats = {
    counts,
    revenue,
    recentAppointments,
    popularServices,
  };

  // Return the dashboard data inside the shared success envelope.
  sendSuccess(response, stats, "Dashboard statistics retrieved successfully");
});
