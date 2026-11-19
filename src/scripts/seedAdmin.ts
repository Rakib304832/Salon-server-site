// Import the validated environment values used by this seed script.
import { env } from "../config/env.js";

// Import the shared MongoDB connection helpers.
import { connectDB, disconnectDB, getDb } from "../config/db.js";

// Import the Better Auth helpers used to create the account when it is missing.
import { getAuth, initAuth } from "../config/auth.js";

// Escape special characters before using an email inside a MongoDB regex.
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Find the admin document without depending on the stored email casing.
async function findUserByEmail(email: string) {
  return getDb()
    .collection("user")
    .findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } });
}

// Create the admin account when needed and make sure it keeps the admin role.
async function seedAdmin(): Promise<void> {
  // Normalise the configured email and keep the password out of every log.
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;

  // Stop with a clear message when the optional seed values were not configured.
  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env before running the admin seed script.",
    );
  }

  // Connect before Better Auth reads the shared MongoDB database object.
  await connectDB();

  // Read the database and look for an existing account with this email.
  const db = getDb();
  const existingUser = await findUserByEmail(email);

  // Promote an existing account without resetting its password.
  if (existingUser) {
    await db.collection("user").updateOne(
      { _id: existingUser._id },
      {
        $set: {
          role: "admin",
          isBlocked: false,
          updatedAt: new Date(),
        },
      },
    );

    console.log(`Admin account promoted: ${email}`);
    return;
  }

  // Initialise Better Auth only when a new account must be created.
  initAuth();

  // Create a missing account through Better Auth so the password is hashed correctly.
  await getAuth().api.signUpEmail({
    body: {
      email,
      password,
      name: "SalonBook Admin",
    },
  });

  // Read the document Better Auth just created so its MongoDB _id can be updated.
  const createdUser = await findUserByEmail(email);

  // Stop when Better Auth reported success but the user document is missing.
  if (!createdUser) {
    throw new Error("Better Auth created the admin account but the user document was not found.");
  }

  // Grant the admin role and make sure the new account starts unblocked.
  const updateResult = await db.collection("user").updateOne(
    { _id: createdUser._id },
    {
      $set: {
        role: "admin",
        isBlocked: false,
        updatedAt: new Date(),
      },
    },
  );

  // Stop when the role update did not match the created user.
  if (updateResult.matchedCount !== 1) {
    throw new Error("The admin account was created but its role could not be updated.");
  }

  // Remove the session auto-created by the server-side sign-up; the admin has not logged in yet.
  await db.collection("session").deleteMany({ userId: createdUser._id });

  console.log(`Admin account created: ${email}`);
}

// Run the seed and always close the database connection afterwards.
async function main(): Promise<void> {
  try {
    await seedAdmin();
  } finally {
    await disconnectDB();
  }
}

// Start the script and report a short failure message without logging secrets.
void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Failed to seed admin:", message);
  process.exitCode = 1;
});
