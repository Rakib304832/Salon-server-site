// Import the Express response type used to read validated query values.
import type { Response } from "express";

// Import Mongoose's default export and the filter type used by the list query.
import mongoose, { type QueryFilter } from "mongoose";

// Import the transaction model and its stored field type.
import { TransactionModel, type TransactionInput } from "../models/Transaction.js";

// Import the shared transaction response shape and status union.
import type { Transaction, TransactionStatus } from "../types/models.js";

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

// Convert a stored transaction into the shared response shape.
function serializeTransaction(transaction: TransactionRecord): Transaction {
  return {
    _id: transaction._id.toString(),
    appointmentId: transaction.appointmentId.toString(),
    customerId: transaction.customerId.toString(),
    amount: transaction.amount,
    currency: transaction.currency,
    stripeSessionId: transaction.stripeSessionId,
    status: transaction.status,
    createdAt: new Date(transaction.createdAt).toISOString(),
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

  // Return the transactions inside the shared success envelope.
  sendSuccess(
    response,
    transactions.map(serializeTransaction),
    "Transactions retrieved successfully",
  );
});
