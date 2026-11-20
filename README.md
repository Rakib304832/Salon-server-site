# SalonBook Server

REST API server for **SalonBook**, a salon appointment booking platform. The API will handle salon services, appointment requests, customer accounts, admin management, image uploads, and Stripe test payments for a separate Next.js client.

> **Status:** Part 8 of 15 complete — project setup, validated environment configuration, a cached MongoDB connection, Better Auth with email/password and Google login, roles and blocked flags, JWT support, shared auth/validation/error middleware, an idempotent admin seed script, the public service catalogue, admin service management, service seed data, and protected ImgBB image uploads. Appointment and payment APIs are added in later parts.

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

## Services API

The public catalogue is open to guests. Service details and every management route require authentication. All routes return the shared success or error envelope.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/services` | Public | List active services with search, category filter, and price sort |
| `GET` | `/api/services/:id` | Signed in | Read one service, including an inactive one |
| `GET` | `/api/admin/services` | Admin | List all services, including inactive ones |
| `POST` | `/api/services` | Admin | Create a service |
| `PUT` | `/api/services/:id` | Admin | Update one or more service fields |
| `PATCH` | `/api/services/:id/status` | Admin | Activate or deactivate a service |
| `DELETE` | `/api/services/:id` | Admin | Delete a service when no active appointment uses it |

Public list query parameters:

- `search` matches the service name and description. The input is escaped before it becomes a MongoDB regular expression.
- `category` accepts one of `Hair`, `Facial`, `Massage`, `Nails`, `Makeup`, `Waxing`, or `Bridal`.
- `sort` accepts `price_asc` or `price_desc`. The default order is newest first.

Example:

```text
GET /api/services?search=massage&category=Massage&sort=price_asc
```

Inactive services never appear in the public list, but a signed-in user can still open the details by ID so the client can show a **Service unavailable** message. The delete route returns `409 Conflict` while a pending or confirmed appointment still references the service. Service status is changed only through `PATCH /api/services/:id/status`; create and update bodies ignore any client-supplied `status` value.

## Image uploads API

Authenticated users can upload service images and profile images through the server. The ImgBB API key stays in the server environment and is never returned to the client. Protected routes use `verifyAuth → checkBlocked → verifyRole("customer", "admin")` so both customer and admin accounts can upload images.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/uploads` | Signed in, not blocked | Upload one image and return its ImgBB URL |

Request requirements:

- Send `multipart/form-data` with the file in the field named `image`.
- JPEG, PNG, and WebP only.
- Maximum file size: 5 MB.
- Each IP address can make ten upload attempts per fifteen minutes. The eleventh returns `429` with code `UPLOAD_RATE_LIMITED`.

Example:

```bash
curl -X POST http://localhost:5000/api/uploads \
  -H "Cookie: better-auth.session_token=<your-session-cookie>" \
  -F "image=@./photo.jpg"
```

Success response:

```json
{
  "success": true,
  "data": { "url": "https://i.ibb.co/..." },
  "message": "Image uploaded successfully"
}
```

Sign-up continues to accept an image URL. After login, upload the file first and then save the returned URL as the profile image or admin service image. Invalid files return `400`, a blocked account returns `403 ACCOUNT_BLOCKED`, and an ImgBB failure returns `502` without exposing the key or upstream response body. `IMGBB_API_KEY` must contain a real ImgBB key; an invalid or placeholder value produces the safe `502` response.

## Admin account

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, then run:

```bash
npm run seed:admin
```

The script creates the account through Better Auth when it is missing and promotes an existing account without resetting its password. Running it more than once is safe.

## Service catalogue seed

Load the 14 starting services across all seven categories:

```bash
npm run seed:services
```

The script reads `seed/services.json`, validates every entry, and upserts by `serviceName`, so running it more than once does not create duplicates. The sample data includes active services in every category and keeps **Hot Stone Massage** inactive so the public and admin filters can be tested.

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
| `npm run seed:services` | Load or refresh the starting salon services |

## Project structure

```text
src/
  app.ts              Express application, health route, 404 and error handlers
  index.ts            Server entry point and graceful shutdown
  config/
    env.ts            Environment validation
    db.ts             Cached MongoDB connection
    auth.ts           Better Auth, Google login, roles, blocked flag, JWT plugin
  models/
    Service.ts        Salon service schema, rules, and indexes
  controllers/
    services.controller.ts  Public catalogue and admin service handlers
    uploads.controller.ts   ImgBB upload handler
  routes/
    services.routes.ts      Public and admin service route definitions
    uploads.routes.ts       Protected image upload route
  middleware/
    verifyAuth.ts     Cookie or Bearer JWT authentication with a fresh user
    checkBlocked.ts   Blocked-account guard
    verifyRole.ts     Role-based route guard
    validate.ts       Zod body, params, and query validation
    upload.ts         Multer memory storage, MIME filter, and upload rate limit
    errorHandler.ts   Shared 404 and error envelope
  services/
    imgbb.ts          Server-side ImgBB upload client
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
    seedServices.ts   Idempotent service catalogue seed script
seed/
  services.json       Fourteen starting services across all seven categories
```

The full structure will grow as each part of the build is completed.

## Live site

Server live link: **TBD**

## Repositories

- Server: https://github.com/Rakib304832/Salon-server-site
- Client: **TBD**

## Author

Rakib
