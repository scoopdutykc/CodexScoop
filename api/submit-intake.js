// /api/submit-intake.js
// Save the intake answers onto the Stripe Checkout Session + Customer metadata.
// -> No Firestore. No Firebase Admin. No extra envs beyond STRIPE_SECRET_KEY.

import Stripe from 'stripe';

/** Minimal Base64URL decode to read Firebase ID token claims locally */
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

    // Verify the Firebase ID token locally (no Admin dependency)
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing Firebase auth token' });

    let user;
    try {
      user = verifyLocally(idToken);
    } catch (e) {
      return res.status(401).json({ error: `Auth error: ${e?.message || e}` });
    }

    const {
      sessionId, fullName, phone, address, access, area,
      pets, notes, prefDay, prefTime, extra
    } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing Stripe sessionId' });
    }

    // Fetch the Checkout Session to get the Customer
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer'] });
    if (!session) return res.status(404).json({ error: 'Stripe session not found' });

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (!customerId) return res.status(400).json({ error: 'No Stripe customer on session' });

    // Compose a compact intake payload for metadata (JSON-stringified)
    const intake = {
      uid: user.uid,
      email: user.email || '',
      fullName: fullName || '',
      phone: phone || '',
      address: {
        line1: address?.line1 || '',
        line2: address?.line2 || '',
        city: address?.city || '',
        state: address?.state || '',
        zip: address?.zip || '',
      },
      access: access || '',
      area: area || '',
      pets: pets || '',
      notes: notes || '',
      prefDay: prefDay || '',
      prefTime: prefTime || '',
      extra: extra || '',
      submittedAt: new Date().toISOString(),
    };

    // Save on the session (for immediate visibility)…
    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...(session.metadata || {}),
        intake_json: JSON.stringify(intake).slice(0, 5000) // metadata value limit
      }
    });

    // …and also on the Customer for long-term access in the dashboard
    const currentCustomerMeta = (typeof session.customer === 'object' && session.customer?.metadata) || {};
    await stripe.customers.update(customerId, {
      metadata: {
        ...currentCustomerMeta,
        last_intake_json: JSON.stringify(intake).slice(0, 5000)
      }
    });

    return res.status(200).json({ ok: true, customerId, savedOn: ['session', 'customer'] });
  } catch (err) {
    console.error('submit-intake error:', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
