// /api/health.js
export default async function handler(req, res) {
  res.status(200).json({
    ok: !!process.env.STRIPE_SECRET_KEY && !!process.env.FIREBASE_SERVICE_ACCOUNT,
    stripe: !!process.env.STRIPE_SECRET_KEY,
    firebaseAdmin: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    time: new Date().toISOString(),
  });
}
