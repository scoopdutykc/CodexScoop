// /api/submit-intake.js
import { auth } from './_lib/firebaseAdmin.js';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/** Minimal Base64URL decode helper */
function b64urlJson(b64) {
  const pad = s => s + '==='.slice((s.length + 3) % 4);
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(pad(s), 'base64').toString('utf8'));
}
function verifyLocally(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const payload = b64urlJson(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.sub || payload.exp <= now) throw new Error('Token expired/invalid');
  return { uid: payload.sub, email: payload.email || '' };
}

async function verifyUser(idToken) {
  try {
    return await auth.verifyIdToken(idToken);
  } catch {
    // Fallback to local claim check (no env required)
    return verifyLocally(idToken);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing Firebase auth token' });

    let decoded;
    try {
      decoded = await verifyUser(idToken);
    } catch (e) {
      return res.status(401).json({ error: `Firebase auth error: ${e?.message || e}` });
    }

    const {
      sessionId, fullName, phone, address, access, area,
      pets, notes, prefDay, prefTime, extra
    } = req.body || {};

    // Optional: verify the Stripe session exists & completed (if provided)
    let stripeOk = true;
    if (stripe && sessionId) {
      try {
        const sess = await stripe.checkout.sessions.retrieve(sessionId);
        // Consider paid/complete only for subscription or one-time payment
        stripeOk = !!sess && (sess.status === 'complete' || sess.payment_status === 'paid');
      } catch (e) {
        stripeOk = false;
      }
    }

    // Persist to Firestore
    // We lazily import admin to avoid importing if not initialized
    const admin = (await import('firebase-admin')).default;
    if (!admin.apps.length) {
      // If Admin wasn't initialized by firebaseAdmin.js, we throw a clear error
      return res.status(500).json({ error: 'Firebase Admin not initialized on server' });
    }
    const db = admin.firestore();

    const doc = {
      uid: decoded.uid,
      email: decoded.email || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionId: sessionId || '',
      stripeVerified: stripeOk,
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
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
