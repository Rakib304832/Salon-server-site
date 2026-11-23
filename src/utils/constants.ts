// List the salon categories accepted by the service API.
// The first seven match the assignment examples; Waxing and Bridal keep the seed catalogue usable.
// The short names below are accepted for compatibility with catalogues that
// were entered with those values. Without them /api/services?category=Hair is
// rejected by validation even though such services exist in the database.
export const SERVICE_CATEGORIES = [
  "Haircut & Styling",
  "Hair Coloring",
  "Hair Treatment",
  "Facial & Skincare",
  "Makeup",
  "Manicure & Pedicure",
  "Spa & Massage",
  "Waxing",
  "Bridal",
  "Hair",
  "Facial",
  "Massage",
  "Nails",
] as const;

// Export the union type inferred from the category list.
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

// List the ten hourly booking slots offered by the salon.
export const TIME_SLOTS = [
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "01:00 PM",
  "02:00 PM",
  "03:00 PM",
  "04:00 PM",
  "05:00 PM",
  "06:00 PM",
] as const;

// Export the union type inferred from the time-slot list.
export type TimeSlot = (typeof TIME_SLOTS)[number];
