// /api/_lib/firebaseAdmin.js
import admin from 'firebase-admin';

function getCredential() {
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svcJson) {
    try {
      const parsed = JSON.parse(svcJson);
      if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return admin.credential.cert(parsed);
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e);
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    (svcJson ? (JSON.parse(svcJson).client_email) : undefined);
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) privateKey = privateKey.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return admin.credential.cert({
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey,
    });
  }

  console.error(
    'Firebase Admin credential not configured. Set FIREBASE_SERVICE_ACCOUNT or (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).'
  );
  return null;
}

// Eager attempt (your original behavior)
if (!admin.apps.length) {
  const cred = getCredential();
  if (cred) {
    admin.initializeApp({ credential: cred });
  }
}

// Export the original `auth` (kept for compatibility)
export const auth = admin.apps.length
  ? admin.auth()
  : {
      verifyIdToken: async () => {
        throw new Error('Firebase Admin not initialized');
      },
    };

// NEW: Lazy getter — retries initialization at call time to avoid cold-start/env timing issues
export function getAuth() {
  if (admin.apps.length) return admin.auth();

  const cred = getCredential();
  if (!cred) {
    throw new Error('Firebase Admin not initialized');
  }
  admin.initializeApp({ credential: cred });
  return admin.auth();
}
