// /api/submit-intake.js
//
// Stores the intake on Stripe (Session + Customer metadata).
// -> No Firestore, no Firebase Admin required.

import Stripe from 'stripe';

/** Minimal Base64URL JSON decode (for local ID token claims check) */
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

const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? new Stripe(stripeKey) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!stripe) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing Firebase auth token' });

    let claims;
    try {
      // Local verification only — we just need uid/email to tag metadata.
      claims = verifyLocally(idToken);
    } catch (e) {
      return res.status(401).json({ error: `Invalid auth token: ${e?.message || e}` });
    }

    const {
      sessionId,
      fullName, phone, address = {}, access, area,
      pets, notes, prefDay, prefTime, extra
    } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing required sessionId' });
    }

    // Retrieve the session (must exist)
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Build compact metadata (Stripe metadata is string->string, 500 chars max per value)
    const meta = {
      intake_uid: claims.uid,
      intake_email: claims.email || '',
      intake_full_name: (fullName || '').slice(0, 500),
      intake_phone: (phone || '').slice(0, 500),
      intake_addr1: (address.line1 || '').slice(0, 500),
      intake_addr2: (address.line2 || '').slice(0, 500),
      intake_city: (address.city || '').slice(0, 500),
      intake_state: (address.state || '').slice(0, 500),
      intake_zip: (address.zip || '').slice(0, 500),
      intake_access: (access || '').slice(0, 500),
      intake_area: (area || '').slice(0, 500),
      intake_pets: (pets || '').slice(0, 500),
      intake_notes: (notes || '').slice(0, 500),
      intake_pref_day: (prefDay || '').slice(0, 500),
      intake_pref_time: (prefTime || '').slice(0, 500),
      intake_extra: (extra || '').slice(0, 500),
      intake_source: 'website-intake'
    };

    // 1) Update the Checkout Session metadata
    await stripe.checkout.sessions.update(sessionId, { metadata: meta });

    // 2) Also attach to the Customer (so it’s visible on the customer record)
    if (session.customer) {
      // Merge with any existing metadata so nothing is lost
      const cust = await stripe.customers.retrieve(session.customer);
      const existing = (cust && cust.metadata) ? cust.metadata : {};
      await stripe.customers.update(session.customer, {
        metadata: { ...existing, ...meta }
      });
    }

    return res.status(200).json({ ok: true, stored: 'stripe', sessionId });
  } catch (err) {
    console.error('submit-intake error:', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
