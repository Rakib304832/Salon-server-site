// Import Mongoose, which manages the MongoDB connection and application models.
import mongoose from "mongoose";

// Import only the Db type from the native driver for Better Auth compatibility later.
import type { Db } from "mongodb";

// Import the validated MongoDB connection string and connection settings.
import { env } from "./env.js";

// Keep one shared connection promise so repeated calls reuse the same MongoDB pool.
let connectionPromise: Promise<typeof mongoose> | null = null;

// Connect to MongoDB once and return the existing connection on later calls.
export async function connectDB(): Promise<typeof mongoose> {
  // Return the cached promise when a connection attempt already exists.
  if (connectionPromise) {
    return connectionPromise;
  }

  // Start the connection with a ten-second server-selection timeout.
  connectionPromise = mongoose.connect(env.MONGODB_URI, {
    // Fail within ten seconds instead of waiting forever when Atlas is unreachable.
    serverSelectionTimeoutMS: 10_000,
  });

  try {
    // Wait for the connection to become ready.
    const connection = await connectionPromise;

    // Log the database host and name without printing credentials from the URI.
    console.log(
      `MongoDB connected: ${connection.connection.host}/${connection.connection.name}`,
    );

    // Return the connected Mongoose instance.
    return connection;
  } catch (error) {
    // Clear the failed promise so a later retry can create a fresh connection attempt.
    connectionPromise = null;

    // Re-throw the original error so the startup function can log and exit.
    throw error;
  }
}

// Expose the native MongoDB database object needed by the Better Auth adapter.
export function getDb(): Db {
  // Read the database object from the active Mongoose connection.
  const db = mongoose.connection.db;

  // Stop immediately when code asks for the database before connecting.
  if (!db) {
    throw new Error("MongoDB is not connected. Call connectDB() before getDb().");
  }

  // Return the connected database object.
  return db;
}

// Report whether the connection is currently ready for queries.
export function isDbConnected(): boolean {
  // readyState 1 means the driver is connected and usable.
  return mongoose.connection.readyState === 1;
}

// Close the connection so the process can exit cleanly.
export async function disconnectDB(): Promise<void> {
  // Only disconnect when a connection or connection attempt exists.
  if (mongoose.connection.readyState !== 0) {
    // Close all sockets owned by Mongoose.
    await mongoose.disconnect();
  }

  // Clear the cached promise so a future start can connect again.
  connectionPromise = null;
}
