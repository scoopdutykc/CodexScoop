import Stripe from 'stripe';
import { auth } from './_lib/firebaseAdmin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing auth token' });
    const decoded = await auth.verifyIdToken(idToken);

    const { priceId, mode, service, optionsKey } = req.body || {};
    if (!priceId) return res.status(400).json({ error: 'Missing priceId' });

    const origin = (req.headers['x-forwarded-proto'] ? req.headers['x-forwarded-proto'] + '://' : 'https://') + req.headers.host;
    const success_url = origin + '/?success=1';
    const cancel_url = origin + '/?canceled=1';

    console.log('create-checkout-session: creating with', { priceId, mode, service, optionsKey });
    const session = await stripe.checkout.sessions.create({
      mode: (mode === 'payment') ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      allow_promotion_codes: true,
      metadata: {
        service: service || '',
        optionsKey: optionsKey || '',
        firebaseUid: decoded.uid
      }
    });

    console.log('create-checkout-session: created', session.id, 'mode', session.mode);
    return res.status(200).json({ id: session.id, mode: session.mode });
  } catch (err) {
    console.error('create-checkout-session error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
