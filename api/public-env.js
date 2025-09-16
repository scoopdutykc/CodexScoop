export default function handler(req, res) {
  res.status(200).json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY || undefined,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || undefined,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || undefined,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || undefined,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || undefined,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || undefined
  });
}
