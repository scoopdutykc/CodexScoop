// Minimal, safe Firebase Admin singleton for Vercel serverless
let adminApp = null;

function getFirebaseAdmin() {
  if (adminApp) return adminApp;

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
  } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error(
      'Firebase Admin not initialized: missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY'
    );
  }

  // Lazy-require to avoid bundling unless needed
  const admin = require('firebase-admin');

  if (admin.apps && admin.apps.length) {
    adminApp = admin.app();
    return adminApp;
  }

  adminApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      // Vercel env often stores private keys with literal '\n'
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });

  return adminApp;
}

module.exports = { getFirebaseAdmin };
