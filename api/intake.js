// /api/intake.js
// Forces Node runtime so firebase-admin can run on Vercel
export const config = { runtime: 'nodejs' };

import { auth } from './_lib/firebaseAdmin.js';

// Optional Firestore instance without changing your firebaseAdmin.js file
let db = null;
(async () => {
  try {
    const admin = (await import('firebase-admin')).default;
    if (admin.apps.length) {
      db = admin.firestore();
    }
  } catch (_) {
    // ignore: if firestore isn't available we still accept the submission
  }
})();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Make sure firebase-admin actually initialized (envs present)
  try {
    // This will throw if our shim is active (not initialized)
    await auth.getUser?.('nonexistent').catch(() => {});
  } catch (e) {
    return res
      .status(500)
      .json({ error: 'Firebase Admin not initialized on server' });
  }

  // Verify Firebase ID token from the browser
  const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!idToken) {
    return res.status(401).json({ error: 'Missing Firebase auth token' });
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ error: `Firebase auth error: ${e?.message || e}` });
  }

  const payload = req.body || {};

  // Best-effort Firestore write (optional)
  let docId = null;
  if (db) {
    try {
      const admin = (await import('firebase-admin')).default;
      const ref = await db.collection('intake_submissions').add({
        ...payload,
        uid: decoded.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      docId = ref.id;
    } catch (e) {
      // Don’t fail the request just because Firestore write failed
      console.error('Intake Firestore write failed:', e);
    }
  }

  return res.status(200).json({ ok: true, docId });
}
