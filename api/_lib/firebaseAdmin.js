// /api/_lib/firebaseAdmin.js
// Robust Firebase Admin bootstrap for Node runtime (Vercel pages/api or app/api with runtime='nodejs')
import admin from 'firebase-admin';

function resolveCredential() {
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svc) {
    try {
      const parsed = JSON.parse(svc);
      if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return admin.credential.cert(parsed);
    } catch (e) {
      console.error('[AdminInit] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
    }
  }

  const pid = process.env.FIREBASE_PROJECT_ID;
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  let key = process.env.FIREBASE_PRIVATE_KEY;

  if (pid && email && key) {
    try {
      key = key.replace(/\\n/g, '\n');
      return admin.credential.cert({ project_id: pid, client_email: email, private_key: key });
    } catch (e) {
      console.error('[AdminInit] Failed to load 3-part Admin credential:', e.message);
    }
  }

  console.error('[AdminInit] Credential not configured. hasSvc:', !!svc, 'hasProj:', !!pid, 'hasEmail:', !!email, 'hasKey:', !!key);
  return null;
}

if (!admin.apps.length) {
  const cred = resolveCredential();
  if (cred) {
    try {
      // Use explicit projectId when available to avoid emulator/project mismatch
      const pid = process.env.FIREBASE_PROJECT_ID;
      admin.initializeApp(pid ? { credential: cred, projectId: pid } : { credential: cred });
      console.log('[AdminInit] Firebase Admin initialized (apps:', admin.apps.length, ')');
    } catch (e) {
      console.error('[AdminInit] initializeApp failed:', e.message);
    }
  }
}

// Expose real SDKs when initialized; otherwise, throw cleanly on use.
export const auth = admin.apps.length
  ? admin.auth()
  : { verifyIdToken: async () => { throw new Error('Firebase Admin not initialized'); } };

export const db = admin.apps.length
  ? admin.firestore()
  : { collection: () => { throw new Error('Firebase Admin not initialized'); } };
