// /api/_lib/firebaseAdmin.js
// Minimal, production-safe Admin init that ONLY reads FIREBASE_SERVICE_ACCOUNT.
// No FIREBASE_PRIVATE_KEY or other vars are required.
// Set FIREBASE_SERVICE_ACCOUNT to the FULL JSON from Firebase Console → Service accounts → "Generate new private key".
import admin from 'firebase-admin';

function initAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.error('[AdminInit] Missing FIREBASE_SERVICE_ACCOUNT env var.');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('[AdminInit] FIREBASE_SERVICE_ACCOUNT is not valid JSON:', e.message);
    return;
  }

  if (parsed.private_key) {
    // Convert literal \n sequences to real newlines (required on most hosts)
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  if (!parsed.client_email || !parsed.private_key) {
    console.error('[AdminInit] FIREBASE_SERVICE_ACCOUNT JSON is missing client_email or private_key.');
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
      projectId: parsed.project_id || process.env.FIREBASE_PROJECT_ID
    });
    console.log('[AdminInit] Firebase Admin initialized.');
  } catch (e) {
    console.error('[AdminInit] initializeApp failed:', e.message);
  }
}

initAdmin();

export const auth = admin.apps.length
  ? admin.auth()
  : { verifyIdToken: async () => { throw new Error('Firebase Admin not initialized'); } };

export const db = admin.apps.length
  ? admin.firestore()
  : { collection: () => { throw new Error('Firebase Admin not initialized'); } };
