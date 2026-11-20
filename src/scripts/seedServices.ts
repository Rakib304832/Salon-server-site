// Import the file reader used to load the seed JSON from the project root.
import { readFile } from "node:fs/promises";

// Import Zod so malformed seed data fails before it reaches MongoDB.
import { z } from "zod";

// Import the shared MongoDB connection helpers.
import { connectDB, disconnectDB } from "../config/db.js";

// Import the service model used for the idempotent upserts.
import { ServiceModel } from "../models/Service.js";

// Import the allowed categories used by the seed validation schema.
import { SERVICE_CATEGORIES } from "../utils/constants.js";

// Describe one service entry expected in seed/services.json.
const seedServiceSchema = z.object({
  // Require the display name that acts as the upsert key.
  serviceName: z.string().trim().min(2).max(100),

  // Restrict the category to the seven supported values.
  category: z.enum(SERVICE_CATEGORIES),

  // Require a useful description.
  description: z.string().trim().min(10).max(2000),

  // Require a positive price.
  price: z.number().positive(),

  // Require a positive whole number of minutes.
  duration: z.number().int().positive(),

  // Require a valid image URL.
  image: z.url(),

  // Require an explicit status so inactive seed entries stay intentional.
  status: z.enum(["active", "inactive"]),
});

// Validate the complete seed file as a non-empty array.
const seedFileSchema = z.array(seedServiceSchema).min(1, "The seed file must contain at least one service");

// Infer the seed entry type from the schema.
type SeedService = z.infer<typeof seedServiceSchema>;

// Read and validate seed/services.json relative to this script in src or dist.
async function loadSeedServices(): Promise<SeedService[]> {
  // Resolve ../../seed/services.json from both src/scripts and dist/scripts.
  const seedFile = new URL("../../seed/services.json", import.meta.url);

  // Read the file as UTF-8 text.
  const raw = await readFile(seedFile, "utf8");

  // Parse the JSON with a clear error when the file is malformed.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("seed/services.json is not valid JSON");
  }

  // Validate every entry before writing anything to MongoDB.
  return seedFileSchema.parse(parsed);
}

// Upsert every service by name so the script can run repeatedly.
async function seedServices(): Promise<void> {
  // Load and validate the seed file before opening a database connection.
  const services = await loadSeedServices();

  // Connect to the same database used by the API.
  await connectDB();

  // Build one upsert operation per service, keyed by the unique display name.
  const result = await ServiceModel.bulkWrite(
    services.map((service) => ({
      updateOne: {
        filter: { serviceName: service.serviceName },
        update: {
          $set: {
            category: service.category,
            description: service.description,
            price: service.price,
            duration: service.duration,
            image: service.image,
            status: service.status,
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    })),
  );

  // Make sure the status, category, and price indexes exist after seeding.
  await ServiceModel.createIndexes();

  // Report the outcome without printing any environment secrets.
  console.log(
    `Service seed complete: ${result.upsertedCount} inserted, ${result.modifiedCount} updated, ${result.matchedCount} matched.`,
  );
}

// Run the seed and always close the database connection afterwards.
async function main(): Promise<void> {
  try {
    await seedServices();
  } finally {
    await disconnectDB();
  }
}

// Start the script and report a short failure message.
void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Failed to seed services:", message);
  process.exitCode = 1;
});
