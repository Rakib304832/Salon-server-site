// Import the shared API error class used for rule violations.
import { ApiError } from "../utils/ApiError.js";

// Import the fixed booking slots used by the appointment API.
import { TIME_SLOTS } from "../utils/constants.js";

// Match only the agreed calendar-date format.
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Convert a validated YYYY-MM-DD string into a UTC date at midnight.
export function parseAppointmentDate(value: string): Date | null {
  // Reject strings that do not have exactly four, two, and two digits.
  const match = DATE_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  // Read each component separately so impossible dates can be detected.
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  // Reject dates such as 2026-02-30 that JavaScript would otherwise roll over.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  // Return the exact calendar date represented by the input.
  return parsed;
}

// Confirm that the date is a real calendar day later than today.
export function isFutureAppointmentDate(value: string): boolean {
  // Reject malformed or impossible dates first.
  const appointmentDate = parseAppointmentDate(value);

  if (!appointmentDate) {
    return false;
  }

  // Compare date-only values in UTC so the rule does not depend on server hours.
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // Accept only dates starting tomorrow, matching the plan's future-date rule.
  return appointmentDate.getTime() > today.getTime();
}

// Validate both the shape and the future-date rule for booking requests.
export function assertBookableAppointmentDate(value: string): void {
  // Reject anything that is not a real YYYY-MM-DD calendar date.
  if (!parseAppointmentDate(value)) {
    throw ApiError.badRequest("Appointment date must be a valid date in YYYY-MM-DD format", [
      {
        field: "appointmentDate",
        message: "Use a real calendar date in YYYY-MM-DD format",
      },
    ]);
  }

  // Reject today and past dates before any database work.
  if (!isFutureAppointmentDate(value)) {
    throw ApiError.badRequest("Appointment date must be in the future", [
      { field: "appointmentDate", message: "Choose a date after today" },
    ]);
  }
}

// Confirm that a value is one of the advertised hourly slots.
export function isTimeSlot(value: string): boolean {
  return (TIME_SLOTS as readonly string[]).includes(value);
}

// Enforce the fixed slot list as a second line of defence after Zod validation.
export function assertBookableTimeSlot(value: string): void {
  if (!isTimeSlot(value)) {
    throw ApiError.badRequest("Time slot must be one of the available salon slots", [
      {
        field: "timeSlot",
        message: "Choose one of the available hourly booking slots",
      },
    ]);
  }
}
