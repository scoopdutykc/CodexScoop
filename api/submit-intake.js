// /api/submit-intake.js
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/** Minimal Base64URL decode helper for local JWT claim read (no Admin SDK) */
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
  // We just return identity hints for the client; NO server-side trust assumed
  return { uid: payload.sub, email: payload.email || '' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // We require a Firebase ID token to make sure the caller is signed in,
    // but we only *locally* inspect it (no Admin SDK required on Vercel).
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing Firebase auth token' });

    try {
      verifyLocally(idToken); // throws if malformed/expired
    } catch (e) {
      return res.status(401).json({ error: `Firebase auth error: ${e?.message || e}` });
    }

    const { sessionId } = req.body || {};
    let stripeVerified = false;

    if (stripe && sessionId) {
      try {
        const sess = await stripe.checkout.sessions.retrieve(sessionId);
        stripeVerified = !!sess && (sess.status === 'complete' || sess.payment_status === 'paid');
      } catch {
        stripeVerified = false;
      }
    }

    // No DB writes here — front-end will write to Firestore.
    return res.status(200).json({ ok: true, stripeVerified });
  } catch (err) {
    console.error('submit-intake error:', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
