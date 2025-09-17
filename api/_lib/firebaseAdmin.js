// /api/_lib/firebaseAdmin.js
import admin from 'firebase-admin';

function getCredential() {
  // Prefer a single JSON blob in FIREBASE_SERVICE_ACCOUNT
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svc) {
    try {
      const parsed = JSON.parse(svc);
      if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return admin.credential.cert(parsed);
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e);
    }
  }

  // Or the classic 3-part env vars
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    (svc ? (JSON.parse(svc).client_email) : undefined);
  let privateKey    = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) privateKey = privateKey.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return admin.credential.cert({ project_id: projectId, client_email: clientEmail, private_key: privateKey });
  }

  console.error('Firebase Admin credential not configured. Set FIREBASE_SERVICE_ACCOUNT or (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).');
  return null;
}

if (!admin.apps.length) {
  const cred = getCredential();
  if (cred) {
    // Initialize Admin SDK (Firestore uses default app)
    admin.initializeApp({ credential: cred, projectId: process.env.FIREBASE_PROJECT_ID });
  }
}

// Export verified auth + firestore instances, or shims that error clearly
export const auth = admin.apps.length
  ? admin.auth()
  : { verifyIdToken: async () => { throw new Error('Firebase Admin not initialized'); } };

export const db = admin.apps.length
  ? admin.firestore()
  : { collection: () => { throw new Error('Firebase Admin not initialized'); } };
