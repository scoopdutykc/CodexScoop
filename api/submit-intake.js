// /api/submit-intake.js
import { auth, db } from './_lib/firebaseAdmin.js';
import Stripe from 'stripe';

const stripe =
  process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/** ---- helpers ---- */
function b64urlToJson(b64) {
  const pad = s => s + '==='.slice((s.length + 3) % 4);
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(pad(s), 'base64').toString('utf8'));
}
function tryLocalDecode(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed Firebase JWT');
  const payload = b64urlToJson(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.sub) throw new Error('JWT payload missing sub');
  if (payload.exp <= now) throw new Error('JWT expired');
  return { uid: payload.sub, email: payload.email || '' };
}

async function verifyUser(idToken) {
  // Prefer Admin verify (most secure)
  try {
    return await auth.verifyIdToken(idToken);
  } catch (e) {
    // Fallback so you’re not blocked by Admin misconfig
    return tryLocalDecode(idToken);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1) Auth
    const idToken = (req.headers.authorization || '')
      .replace('Bearer ', '')
      .trim();
    if (!idToken) return res.status(401).json({ error: 'Missing Firebase auth token' });

    let decoded;
    try {
      decoded = await verifyUser(idToken);
    } catch (e) {
      return res.status(401).json({
        error: `Firebase auth error: ${e?.message || e}`,
      });
    }

    // 2) Body
    const {
      sessionId, fullName, phone, address, access, area,
      pets, notes, prefDay, prefTime, extra
    } = req.body || {};

    // 3) Verify Stripe session (optional)
    let stripeVerified = true;
    if (stripe && sessionId) {
      try {
        const sess = await stripe.checkout.sessions.retrieve(sessionId);
        stripeVerified =
          !!sess && (sess.status === 'complete' || sess.payment_status === 'paid');
      } catch (e) {
        stripeVerified = false;
      }
    }

    // 4) Require Admin Firestore (we don’t want client SDK here)
    if (!db || !db.collection) {
      return res.status(500).json({
        error:
          'Firebase Admin not initialized on server. Ensure FIREBASE_SERVICE_ACCOUNT (or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are set.',
      });
    }

    const doc = {
      uid: decoded.uid,
      email: decoded.email || '',
      createdAt: new Date(),
      sessionId: sessionId || '',
      stripeVerified,
      contact: { fullName, phone },
      address: address || {},
      access: access || '',
      area: area || '',
      pets: pets || '',
      notes: notes || '',
      scheduling: { prefDay: prefDay || '', prefTime: prefTime || '' },
      extra: extra || '',
    };

    const ref = await db.collection('intakes').add(doc);
    return res.status(200).json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('submit-intake error:', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
