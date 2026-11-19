// List the seven salon categories accepted by the service API.
export const SERVICE_CATEGORIES = [
  "Hair",
  "Facial",
  "Massage",
  "Nails",
  "Makeup",
  "Waxing",
  "Bridal",
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
