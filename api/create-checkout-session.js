// /api/create-checkout-session.js
import Stripe from 'stripe';
import { getAuth } from './_lib/firebaseAdmin.js'; // uses your existing file

const { STRIPE_SECRET_KEY, FIREBASE_WEB_API_KEY } = process.env;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

function keyMode(key) {
  return key?.startsWith('sk_live_') ? 'live'
       : key?.startsWith('sk_test_') ? 'test'
       : 'unknown';
}

// Fallback verify via Firebase REST (no Admin needed)
async function verifyWithGoogle(idToken) {
  if (!FIREBASE_WEB_API_KEY) {
    throw new Error('Firebase Admin not initialized and FIREBASE_WEB_API_KEY missing');
  }
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    const msg = body?.error?.message || `${resp.status} ${resp.statusText}`;
    throw new Error(`Firebase REST verify failed: ${msg}`);
  }
  const data = await resp.json();
  const user = Array.isArray(data.users) && data.users[0];
  if (!user?.localId) throw new Error('Firebase REST verify returned no user');
  return { uid: user.localId, email: user.email || '' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!stripe) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

    // ---- Verify Firebase user (Admin first, REST fallback) ----
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing Firebase auth token' });

    let decoded;
    try {
      const adminAuth = getAuth();                 // lazy init Admin if possible
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch (e) {
      // fallback path when Admin isn't initialized
      decoded = await verifyWithGoogle(idToken);
    }

    const { priceId, mode, service, optionsKey } = req.body || {};
    if (!priceId) return res.status(400).json({ error: 'Missing priceId in request body' });

    // ---- Validate price and mode alignment ----
    let price;
    try {
      price = await stripe.prices.retrieve(priceId);
    } catch (e) {
      const acctMode = keyMode(STRIPE_SECRET_KEY);
      const hint = `Verify that Price "${priceId}" exists in your Stripe ${acctMode.toUpperCase()} account.`;
      return res.status(400).json({ error: `${e?.message || e?.code || 'Stripe error'} — ${hint}` });
    }

    const acctMode = keyMode(STRIPE_SECRET_KEY);
    const priceMode = price.livemode ? 'live' : 'test';
    if ((acctMode === 'live' && priceMode !== 'live') || (acctMode === 'test' && priceMode !== 'test')) {
      return res.status(400).json({
        error: `Stripe mode mismatch: your secret key is "${acctMode.toUpperCase()}" but price "${priceId}" is "${priceMode.toUpperCase()}".`
      });
    }

    // ---- Build origin for success/cancel ----
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const origin = `${proto}://${host}`;

    // ---- Create Checkout Session ----
    const session = await stripe.checkout.sessions.create({
      mode: mode === 'payment' ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      customer_email: decoded?.email || undefined,
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel`,
      metadata: {
        service: service || '',
        optionsKey: optionsKey || '',
        firebaseUid: decoded?.uid || '',
      }
    });

    return res.status(200).json({ id: session.id, mode: session.mode });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: err?.message || err?.code || 'Internal error' });
  }
}
