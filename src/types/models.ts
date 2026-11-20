// Define the two roles that the server recognises.
export type UserRole = "admin" | "customer";

// Define the two states a salon service can have.
export type ServiceStatus = "active" | "inactive";

// Define every valid appointment lifecycle state.
export type AppointmentStatus = "pending" | "confirmed" | "cancelled";

// Define the two payment states managed only by the Stripe webhook.
export type PaymentStatus = "unpaid" | "paid";

// Define the two states saved for a payment transaction.
export type TransactionStatus = "paid" | "failed";

// Describe the user object returned by Better Auth and the user API.
export interface User {
  // Unique Better Auth user identifier.
  id: string;

  // Customer or admin display name.
  name: string;

  // Email address, read-only in the profile page.
  email: string;

  // Optional profile image URL.
  image?: string;

  // Authorisation role assigned by the server only.
  role: UserRole;

  // Whether an admin has blocked this user.
  isBlocked: boolean;

  // Optional contact phone number.
  phone?: string;
}

// Describe a salon service document returned by the services API.
export interface Service {
  // MongoDB document identifier.
  _id: string;

  // Display name of the service.
  serviceName: string;

  // One of the seven salon categories.
  category: string;

  // Full customer-facing description.
  description: string;

  // Positive price stored in USD.
  price: number;

  // Estimated duration in minutes.
  duration: number;

  // ImgBB-hosted service image URL.
  image: string;

  // Whether customers can currently see and book the service.
  status: ServiceStatus;

  // ISO timestamp of when the service was created.
  createdAt: string;
}

// Describe an appointment document returned by the appointments API.
export interface Appointment {
  // MongoDB document identifier.
  _id: string;

  // Referenced service, either populated or returned as an identifier.
  serviceId: string | Service;

  // Referenced customer, either populated or returned as an identifier.
  customerId: string | User;

  // Appointment date in YYYY-MM-DD format.
  appointmentDate: string;

  // Hourly time slot chosen from the fixed list.
  timeSlot: string;

  // Optional message from the customer.
  message?: string;

  // Service price saved at booking time.
  servicePrice: number;

  // Payment state changed only by the verified Stripe webhook.
  paymentStatus: PaymentStatus;

  // Appointment lifecycle state.
  status: AppointmentStatus;

  // ISO timestamp used as the request date.
  createdAt: string;
}

// Describe a payment transaction returned by the admin transactions API.
export interface Transaction {
  // MongoDB document identifier.
  _id: string;

  // Related appointment, either populated or returned as an identifier.
  appointmentId: string | Appointment;

  // Related customer, either populated or returned as an identifier.
  customerId: string | User;

  // Paid amount in the smallest currency unit rules of the Stripe session.
  amount: number;

  // Three-letter currency code such as usd.
  currency: string;

  // Stripe Checkout Session identifier.
  stripeSessionId: string;

  // Final transaction state reported by the webhook.
  status: TransactionStatus;

  // ISO timestamp used as the transaction date.
  createdAt: string;
}

// Describe the popular-service summary shown on the admin dashboard.
export interface PopularServiceStat {
  // Service identifier from the bookings that were counted.
  serviceId: string;

  // Name copied from the current service document.
  serviceName: string;

  // Number of non-cancelled appointments for this service.
  bookings: number;
}

// Describe the counts shown on the admin dashboard.
export interface DashboardCounts {
  // Every registered account, including administrators.
  users: number;

  // Accounts with the customer role.
  customers: number;

  // Every salon service, active or inactive.
  services: number;

  // Services currently visible to customers.
  activeServices: number;

  // Every appointment request ever created.
  appointments: number;

  // Appointment requests waiting for admin confirmation.
  pendingAppointments: number;

  // Appointment requests that have been confirmed.
  confirmedAppointments: number;

  // Appointment requests that were cancelled.
  cancelledAppointments: number;

  // Appointments whose Stripe payment has completed.
  paidAppointments: number;

  // Paid transactions recorded from verified Stripe events.
  paidTransactions: number;

  // Failed transactions recorded from verified Stripe events.
  failedTransactions: number;
}

// Describe the revenue summary returned by the admin dashboard.
export interface DashboardRevenue {
  // Total collected amount across all currencies in the smallest currency unit.
  total: number;

  // Per-currency totals in the smallest currency unit.
  byCurrency: Array<{ currency: string; amount: number }>;
}

// Describe the complete admin dashboard payload.
export interface DashboardStats {
  // Counts calculated from server-owned database records.
  counts: DashboardCounts;

  // Revenue calculated only from paid transactions created by the Stripe webhook.
  revenue: DashboardRevenue;

  // Five newest appointments with their service details.
  recentAppointments: Appointment[];

  // Five most booked services, excluding cancelled appointments.
  popularServices: PopularServiceStat[];
}
