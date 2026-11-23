// Import the Express response type used to read validated query values.
import type { Response } from "express";

// Import Mongoose's default export and the filter type used by the list query.
import mongoose, { type QueryFilter } from "mongoose";

// Import the native ObjectId and database handle used to read Better Auth users.
import { ObjectId } from "mongodb";
import { getDb } from "../config/db.js";

// Import the transaction, appointment, and service models.
import { TransactionModel, type TransactionInput } from "../models/Transaction.js";
import { AppointmentModel } from "../models/Appointment.js";
import { ServiceModel } from "../models/Service.js";

// Import the shared serializers used to enrich the admin transaction table.
import { serializeService, type ServiceRecord } from "./services.controller.js";
import { serializeUser, type UserDocument } from "./users.controller.js";

// Import the shared transaction response shape and status union.
import type { Transaction, TransactionStatus, User } from "../types/models.js";

// Import the shared async and response helpers.
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

// Describe the validated filters accepted by the admin transaction list.
export interface TransactionQuery {
  // Optional final transaction state.
  status?: TransactionStatus;

  // Optional exact customer filter.
  customerId?: string;

  // Optional exact appointment filter.
  appointmentId?: string;
}

// Add the MongoDB identifier to a lean transaction document.
type TransactionRecord = TransactionInput & { _id: mongoose.Types.ObjectId };

// Read the parsed query string stored by the validate middleware.
function readQuery(response: Response): TransactionQuery {
  return response.locals.query as TransactionQuery;
}

// Convert a stored transaction into the shared admin response shape.
function serializeTransaction(
  transaction: TransactionRecord,
  customer?: User,
  service?: ServiceRecord,
  appointmentDate?: string,
): Transaction {
  return {
    _id: transaction._id.toString(),
    appointmentId: transaction.appointmentId.toString(),
    customerId: transaction.customerId.toString(),
    amount: transaction.amount,
    currency: transaction.currency,
    stripeSessionId: transaction.stripeSessionId,
    status: transaction.status,
    createdAt: new Date(transaction.createdAt).toISOString(),
    ...(customer ? { customerInfo: customer } : {}),
    ...(service ? { serviceInfo: serializeService(service) } : {}),
    ...(appointmentDate ? { appointmentDate } : {}),
  };
}

// Build a safe MongoDB filter from the validated admin query.
function buildTransactionFilter(query: TransactionQuery): QueryFilter<TransactionInput> {
  // Start with an empty filter and add only validated values.
  const filter: QueryFilter<TransactionInput> = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.customerId) {
    filter.customerId = new mongoose.Types.ObjectId(query.customerId);
  }

  if (query.appointmentId) {
    filter.appointmentId = new mongoose.Types.ObjectId(query.appointmentId);
  }

  return filter;
}

// List payment transactions recorded by the verified Stripe webhook.
export const listTransactions = asyncHandler(async (_request, response) => {
  // Read only validated filter values.
  const query = readQuery(response);

  // Return newest transactions first so the admin sees recent activity immediately.
  const transactions = (await TransactionModel.find(buildTransactionFilter(query))
    .sort({ createdAt: -1 })
    .lean()) as TransactionRecord[];

  // Load the related appointments once for service and appointment-date details.
  const appointments = await AppointmentModel.find({
    _id: { $in: transactions.map((transaction) => transaction.appointmentId) },
  }).lean();
  const appointmentById = new Map(
    appointments.map((appointment) => [appointment._id.toString(), appointment]),
  );

  // Load the referenced services once for the related-service column.
  const services = await ServiceModel.find({
    _id: { $in: appointments.map((appointment) => appointment.serviceId) },
  }).lean();
  const serviceById = new Map(services.map((service) => [service._id.toString(), service]));

  // Load safe customer details from the Better Auth user collection.
  const users = await getDb()
    .collection<UserDocument>("user")
    .find({
      _id: {
        $in: transactions.map((transaction) => new ObjectId(transaction.customerId.toString())),
      },
    })
    .toArray();
  const customerById = new Map(
    users.map((user) => [user._id.toString(), serializeUser(user)]),
  );

  // Combine webhook-owned payment data with the related appointment, service, and customer.
  sendSuccess(
    response,
    transactions.map((transaction) => {
      const appointment = appointmentById.get(transaction.appointmentId.toString());
      const service = appointment
        ? serviceById.get(appointment.serviceId.toString())
        : undefined;

      return serializeTransaction(
        transaction,
        customerById.get(transaction.customerId.toString()),
        service as ServiceRecord | undefined,
        appointment?.appointmentDate,
      );
    }),
    "Transactions retrieved successfully",
  );
});
