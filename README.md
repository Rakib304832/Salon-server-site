# SalonBook Server

REST API server for **SalonBook**, a salon appointment booking platform. The API will handle salon services, appointment requests, customer accounts, admin management, image uploads, and Stripe test payments for a separate Next.js client.

> **Status:** Part 5 of 15 complete — project setup, validated environment configuration, a cached MongoDB connection, Better Auth with email/password and Google login, roles and blocked flags, JWT support, shared auth/validation/error middleware, and an idempotent admin seed script. Business API features are added in later parts.

## Planned features

- Sign-up, sign-in, Google login, sessions, and logout through Better Auth
- Role-based access for customers and admins
- Public salon service browsing with search, category filter, and price sort
- Customer appointment booking, cancellation, and payment status
- Admin service, appointment, user, and transaction management
- Server-side ImgBB image uploads
- Stripe Checkout with a verified webhook
- Dashboard statistics and profile management
- Central error handling and request validation

## Technology stack

- Node.js 20 or newer
- TypeScript
- Express 5
- MongoDB with Mongoose
- Better Auth
- Stripe
- ImgBB
- Zod validation
- Multer image uploads
- TSX for local development

## Installation

1. Clone the repository.
2. Open the project folder.
3. Install dependencies:

```bash
npm install
```

4. Copy the example environment file and fill in your own local values:

```bash
copy .env.example .env
```

On macOS or Linux, use `cp .env.example .env`.

## Run locally

Start the development server with automatic restarts:

```bash
npm run dev
```

The server runs at `http://localhost:5000` by default. Open that address in a browser to confirm it responds, or check the health endpoint at `http://localhost:5000/api/health`.

The server validates every environment variable before connecting to MongoDB. If a required variable is missing or invalid, startup stops with a list of the exact problems.

Build and run the compiled server:

```bash
npm run build
npm start
```

## Authentication

Better Auth is mounted at `/api/auth` and handles sign-up, sign-in, Google login, sessions, JWT access, and logout.

- Email and password sign-up is enabled with a six-character minimum password length.
- New accounts always receive the `customer` role and `isBlocked: false`.
- `role` and `isBlocked` are marked as server-only fields, so a sign-up or profile request cannot set or change them.
- The JWT plugin provides `/api/auth/token` and `/api/auth/jwks` for Bearer-token verification.
- Google OAuth callback URL: `BETTER_AUTH_URL/api/auth/callback/google`.

Protected routes use `verifyAuth`, `checkBlocked`, and `verifyRole` in that order. `verifyAuth` accepts the Better Auth session cookie or a Bearer JWT, then reloads the user from MongoDB so role and blocked changes apply immediately. Blocked customers receive a `403` response with the code `ACCOUNT_BLOCKED`.

All request validation errors, malformed IDs, duplicate keys, missing routes, and unexpected failures use one JSON envelope:

```json
{ "success": false, "message": "...", "errors": [] }
```

## Admin account

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, then run:

```bash
npm run seed:admin
```

The script creates the account through Better Auth when it is missing and promotes an existing account without resetting its password. Running it more than once is safe.

## Required environment variables

Only the variable names are listed here. Real values must stay in the local `.env` file or the hosting provider settings.

```text
PORT
MONGODB_URI
BETTER_AUTH_SECRET
BETTER_AUTH_URL
CLIENT_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
IMGBB_API_KEY
ADMIN_EMAIL
ADMIN_PASSWORD
```

Never commit the real `.env` file. The repository only includes `.env.example` with empty values.

## Available scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the server with TSX watch mode |
| `npm run build` | Compile TypeScript into the `dist` folder |
| `npm start` | Run the compiled server |
| `npm run typecheck` | Check types without writing build output |
| `npm run seed:admin` | Create the admin account or promote an existing account |
| `npm run seed:services` | Load the starting salon services (added in Part 6) |

## Project structure

```text
src/
  app.ts              Express application, health route, 404 and error handlers
  index.ts            Server entry point and graceful shutdown
  config/
    env.ts            Environment validation
    db.ts             Cached MongoDB connection
    auth.ts           Better Auth, Google login, roles, blocked flag, JWT plugin
  middleware/
    verifyAuth.ts     Cookie or Bearer JWT authentication with a fresh user
    checkBlocked.ts   Blocked-account guard
    verifyRole.ts     Role-based route guard
    validate.ts       Zod body, params, and query validation
    errorHandler.ts   Shared 404 and error envelope
  utils/
    ApiError.ts       Typed expected request errors
    asyncHandler.ts   Async route error forwarding
    response.ts       Shared success and error envelopes
    constants.ts      Service categories and booking time slots
  types/
    models.ts         Shared User, Service, Appointment, and Transaction types
    express.d.ts      Express req.user type augmentation
  scripts/
    seedAdmin.ts      Idempotent admin creation and promotion script
```

The full structure will grow as each part of the build is completed.

## Live site

Server live link: **TBD**

## Repositories

- Server: https://github.com/Rakib304832/Salon-server-site
- Client: **TBD**

## Author

Rakib
