// /api/create-checkout-session.js
import Stripe from 'stripe';
import { auth } from './_lib/firebaseAdmin.js';

const { STRIPE_SECRET_KEY, FIREBASE_WEB_API_KEY } = process.env;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

function keyMode(key) {
  return key?.startsWith('sk_live_') ? 'live'
       : key?.startsWith('sk_test_') ? 'test'
       : 'unknown';
}

// -------- Helpers: token verification paths --------

/** base64url -> JSON */
function b64urlJson(b64) {
  const pad = (s) => s + '==='.slice((s.length + 3) % 4);
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(pad(s), 'base64').toString('utf8'));
}

/** Local claims check (no RSA sig) — derives projectId from token */
function verifyLocally(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const payload = b64urlJson(parts[1]);

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('Token expired');

  const aud = payload.aud;
  const iss = payload.iss || '';
  const issProject = iss.startsWith('https://securetoken.google.com/')
    ? iss.substring('https://securetoken.google.com/'.length)
    : '';
  if (aud && issProject && aud !== issProject) throw new Error('Invalid audience/issuer');

  if (!payload.sub) throw new Error('Missing UID in token');
  return { uid: payload.sub, email: payload.email || '' };
}

/** Verify via Firebase REST when FIREBASE_WEB_API_KEY is available */
async function verifyWithGoogle(idToken) {
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

/** Try Admin -> REST (if key) -> Local (no env) */
async function verifyFirebaseUser(idToken) {
  try {
    return await auth.verifyIdToken(idToken); // Admin path
  } catch {
    if (FIREBASE_WEB_API_KEY) return await verifyWithGoogle(idToken);
    return verifyLocally(idToken);
  }
}

// -------- API handler --------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!stripe) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

    // Auth
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing Firebase auth token' });

    let decoded;
    try {
      decoded = await verifyFirebaseUser(idToken);
    } catch (e) {
      return res.status(401).json({ error: `Firebase auth error: ${e?.message || e}` });
    }

    // Inputs
    const { priceId, service, optionsKey } = req.body || {};
    if (!priceId) return res.status(400).json({ error: 'Missing priceId in request body' });

    // Fetch price and validate mode
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

    // Decide Checkout mode from the Price itself
    const resolvedMode = price.recurring ? 'subscription' : 'payment';

    // Build origin for URLs
    const proto = req.headers['x-forwarded-proto'] || 'https';
    the host  = req.headers['x-forwarded-host'] || req.headers.host;
    const origin = `${proto}://${host}`;

    // ✅ Redirect straight to /intake after success (keep session_id)
    const session = await stripe.checkout.sessions.create({
      mode: resolvedMode,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      customer_email: decoded?.email || undefined,
      success_url: `${origin}/intake.html?session_id={CHECKOUT_SESSION_ID}`,
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
