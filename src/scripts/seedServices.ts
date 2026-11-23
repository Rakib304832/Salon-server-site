// Import the file reader used to load the seed JSON from the project root.
import { readFile } from "node:fs/promises";

// Import Zod so malformed seed data fails before it reaches MongoDB.
import { z } from "zod";

// Import the shared MongoDB connection helpers.
import { connectDB, disconnectDB } from "../config/db.js";

// Import the shared ImgBB uploader and upload limits.
import { uploadImageToImgbb } from "../services/imgbb.js";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
} from "../middleware/upload.js";

// Import the service model used for the idempotent upserts.
import { ServiceModel } from "../models/Service.js";

// Import the allowed categories used by the seed validation schema.
import { SERVICE_CATEGORIES } from "../utils/constants.js";

// Describe one service entry expected in seed/services.json.
const seedServiceSchema = z.object({
  // Require the display name that acts as the upsert key.
  serviceName: z.string().trim().min(2).max(100),

  // Restrict the category to the values accepted by the service API.
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

// Recognise image URLs already hosted by ImgBB so repeat seeds do not re-upload files.
function isImgbbImageUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "ibb.co" || hostname.endsWith(".ibb.co");
  } catch {
    return false;
  }
}

// Download one seed image and upload its bytes to ImgBB through the server-only key.
async function uploadSeedImage(imageUrl: string): Promise<string> {
  // Let the request fail clearly instead of hanging on a slow seed source.
  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "SalonBook seed script" },
  });

  // Reject missing or non-image seed sources before calling ImgBB.
  if (!response.ok) {
    throw new Error(`Could not download seed image (HTTP ${response.status})`);
  }

  // Only upload formats the rest of the server accepts.
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(contentType)) {
    throw new Error(`Seed image has unsupported content type: ${contentType || "unknown"}`);
  }

  // Read the image into memory so the shared ImgBB uploader can handle it.
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("Seed image is empty or larger than the 5 MB upload limit");
  }

  // Store the ImgBB URL returned by the same uploader used by the API.
  return uploadImageToImgbb(buffer);
}

// Upsert every service by name so the script can run repeatedly.
async function seedServices(): Promise<void> {
  // Load and validate the seed file before opening a database connection.
  const services = await loadSeedServices();

  // Connect to the same database used by the API.
  await connectDB();

  // Read current seed services so a repeat run keeps the images already hosted by ImgBB.
  const existingServices = (await ServiceModel.find({
    serviceName: { $in: services.map((service) => service.serviceName) },
  })
    .select("serviceName image")
    .lean()) as Array<{ serviceName: string; image?: string }>;
  const existingImageByName = new Map(
    existingServices.map((service) => [service.serviceName, service.image]),
  );

  // Convert every seed image into an ImgBB URL before writing anything to MongoDB.
  const preparedServices: SeedService[] = [];
  for (const service of services) {
    const storedImage = existingImageByName.get(service.serviceName);
    let image = service.image;

    // Reuse an existing ImgBB image so the seed stays idempotent.
    if (storedImage && isImgbbImageUrl(storedImage)) {
      image = storedImage;
    } else if (!isImgbbImageUrl(service.image)) {
      // The JSON holds source URLs; the database should hold ImgBB-hosted images.
      console.log(`Uploading seed image for ${service.serviceName}...`);
      image = await uploadSeedImage(service.image);
    }

    preparedServices.push({ ...service, image });
  }

  // Build one upsert operation per service, keyed by the unique display name.
  const result = await ServiceModel.bulkWrite(
    preparedServices.map((service) => ({
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
