// /api/intake.js
// Force Node runtime (Admin SDK is not compatible with Edge)
export const config = { runtime: 'nodejs' };

import { auth, db } from './_lib/firebaseAdmin.js';
import admin from 'firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1) Extract and verify Firebase ID token
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Missing Authorization: Bearer <idToken>' });

    let decoded;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch (e) {
      return res.status(401).json({ error: `Firebase auth error: ${e.message}` });
    }

    // 2) Persist the exact fields from the client payload (no question changes)
    const payload = req.body || {};

    // 3) Write to Firestore
    try {
      await db.collection('intake_submissions').add({
        ...payload,
        uid: decoded.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      // Log but still succeed (don't block UX if Firestore hiccups)
      console.error('[intake] Firestore write failed:', e.message);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[intake] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
