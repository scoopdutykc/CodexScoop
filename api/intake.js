// /api/intake.js
export const config = { runtime: 'nodejs' };

import { auth, db } from './_lib/firebaseAdmin.js';
import admin from 'firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Missing Authorization: Bearer <idToken>' });

    let decoded;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch (e) {
      const message = e?.message || 'Unknown Firebase Admin error';
      const isConfigError = /Firebase Admin (credentials not configured|not initialized|initializeApp failed)/i.test(message);
      const status = isConfigError ? 500 : 401;
      return res.status(status).json({ error: `Firebase auth error: ${message}` });
    }

    const payload = req.body || {};

    try {
      await db.collection('intake_submissions').add({
        ...payload,
        uid: decoded.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('[intake] Firestore write failed:', e.message);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[intake] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
