// /api/_lib/firebaseAdmin.js
import admin from 'firebase-admin';

function buildCredential() {
  // Highest priority: single JSON blob in FIREBASE_SERVICE_ACCOUNT
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svc) {
    try {
      const parsed = JSON.parse(svc);
      if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return admin.credential.cert(parsed);
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT parse error:', e);
    }
  }

  // Fallback: individual env vars
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey    = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) privateKey = privateKey.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return admin.credential.cert({ project_id: projectId, client_email: clientEmail, private_key: privateKey });
  }

  return null;
}

let app;
if (!admin.apps.length) {
  const cred = buildCredential();
  if (!cred) {
    console.error(
      'Firebase Admin credential not configured. Set FIREBASE_SERVICE_ACCOUNT or (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).'
    );
  } else {
    app = admin.initializeApp({
      credential: cred,
      projectId: process.env.FIREBASE_PROJECT_ID || undefined,
    });
  }
} else {
  app = admin.app();
}

// Export hard failures if not initialized so callers surface a clear message
export const adminApp = app || null;
export const auth = adminApp ? admin.auth() : {
  verifyIdToken: async () => { throw new Error('Firebase Admin not initialized'); }
};
export const db   = adminApp ? admin.firestore() : {
  collection: () => { throw new Error('Firebase Admin not initialized'); }
};
