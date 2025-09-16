// /api/public-env.js
// Returns only safe, client-side config. No secrets exposed.
export default function handler(req, res) {
  // Stripe publishable
  const publishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    "";

  // Firebase (support both naming styles; fallback to your attached values)
  const FIREBASE_WEB_API_KEY =
    process.env.FIREBASE_WEB_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyBiCaBDOOql_0MO1KRWaATh-ATc60TutMw";

  const FIREBASE_AUTH_DOMAIN =
    process.env.FIREBASE_AUTH_DOMAIN ||
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "scoop-duty.firebaseapp.com";

  const FIREBASE_PROJECT_ID =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "scoop-duty";

  const FIREBASE_STORAGE_BUCKET =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "scoop-duty.firebasestorage.app";

  const FIREBASE_MESSAGING_SENDER_ID =
    process.env.FIREBASE_MESSAGING_SENDER_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    "888851571683";

  const FIREBASE_APP_ID =
    process.env.FIREBASE_APP_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:888851571683:web:d48f67ba25c6bd780bb6d6";

  res.status(200).json({
    publishableKey,
    FIREBASE_WEB_API_KEY,
    FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID,
  });
}
