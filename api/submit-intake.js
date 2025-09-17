// /api/submit-intake.js
import { auth, db } from './_lib/firebaseAdmin.js';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1) Auth (Firebase ID token from the client)
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing Firebase auth token' });

    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken); // <- Admin verify (requires Admin initialized)
    } catch (e) {
      return res.status(401).json({ error: `Firebase auth error: ${e?.message || e}` });
    }

    // 2) Parse body
    const {
      sessionId, fullName, phone, address, access, area,
      pets, notes, prefDay, prefTime, extra
    } = req.body || {};

    // 3) (Optional) verify checkout session
    let stripeVerified = true;
    if (stripe && sessionId) {
      try {
        const sess = await stripe.checkout.sessions.retrieve(sessionId);
        stripeVerified = !!sess && (sess.status === 'complete' || sess.payment_status === 'paid');
      } catch {
        stripeVerified = false;
      }
    }

    // 4) Write to Firestore with Admin (bypasses client security rules entirely)
    const doc = {
      uid: decoded.uid,
      email: decoded.email || '',
      createdAt: new Date(), // Admin server time is fine; you can switch to FieldValue if preferred
      sessionId: sessionId || '',
      stripeVerified,
      contact: { fullName, phone },
      address: address || {},
      access: access || '',
      area: area || '',
      pets: pets || '',
      notes: notes || '',
      scheduling: { prefDay: prefDay || '', prefTime: prefTime || '' },
      extra: extra || ''
    };

    const ref = await db.collection('intakes').add(doc);
    return res.status(200).json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('submit-intake error:', err);
    const msg = err?.message || 'Internal error';
    return res.status(500).json({ error: msg });
  }
}
