// /api/create-checkout-session.js
import Stripe from 'stripe';
import { auth } from './_lib/firebaseAdmin.js';

const { STRIPE_SECRET_KEY } = process.env;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!stripe) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing auth token' });

    const decoded = await auth.verifyIdToken(idToken);

    const { priceId, mode, service, optionsKey } = req.body || {};
    if (!priceId) return res.status(400).json({ error: 'Missing priceId' });

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const origin = `${proto}://${host}`;

    const session = await stripe.checkout.sessions.create({
      mode: mode === 'payment' ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel`,
      metadata: {
        service: service || '',
        optionsKey: optionsKey || '',
        firebaseUid: decoded.uid || ''
      }
    });

    return res.status(200).json({ id: session.id, mode: session.mode });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: err?.message || err?.code || 'Internal error' });
  }
}
