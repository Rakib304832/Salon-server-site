# SalonBook Server

REST API server for **SalonBook**, a salon appointment booking platform. The API will handle salon services, appointment requests, customer accounts, admin management, image uploads, and Stripe test payments for a separate Next.js client.

> **Status:** Part 1 of 15 complete — project setup, TypeScript configuration, environment template, and a minimal Express server. API features are added in later parts.

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

The server runs at `http://localhost:5000` by default. Open that address in a browser to confirm it responds.

Build and run the compiled server:

```bash
npm run build
npm start
```

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
| `npm run seed:admin` | Create or promote the admin account (added in Part 5) |
| `npm run seed:services` | Load the starting salon services (added in Part 6) |

## Project structure

```text
src/
  app.ts        Express application and routes
  index.ts      Server entry point
```

The full structure will grow as each part of the build is completed.

## Live site

Server live link: **TBD**

## Repositories

- Server: https://github.com/Rakib304832/Salon-server-site
- Client: **TBD**

## Author

Rakib
