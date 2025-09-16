# Scoop Duty KC — Vercel Deploy

This repo deploys your static site + serverless API on Vercel.

## API routes
- `POST /api/create-customer` — verifies Firebase ID token and creates/finds a Stripe customer.
- `POST /api/create-checkout-session` — creates a Stripe Checkout session (subscription or one‑time).
- `GET  /api/public-env` — returns `{ publishableKey }` for Stripe (client-safe).

## Required environment variables (set in Vercel)
- STRIPE_SECRET_KEY
- STRIPE_PUBLISHABLE_KEY
- FIREBASE_SERVICE_ACCOUNT  (paste full Service Account JSON)

Optional (for client bootstrap if you want to override the hardcoded firebase config):
- FIREBASE_WEB_API_KEY
- FIREBASE_AUTH_DOMAIN
- FIREBASE_PROJECT_ID
- FIREBASE_STORAGE_BUCKET
- FIREBASE_MESSAGING_SENDER_ID
- FIREBASE_APP_ID
