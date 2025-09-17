// /api/submit-intake.js
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sessionId } = req.body || {};
    let stripeVerified = false;

    if (stripe && sessionId) {
      try {
        const s = await stripe.checkout.sessions.retrieve(sessionId);
        stripeVerified = !!s && (s.status === 'complete' || s.payment_status === 'paid');
      } catch (_) {
        // leave stripeVerified = false
      }
    }

    // no Firebase Admin needed here
    return res.status(200).json({ ok: true, stripeVerified });
  } catch (err) {
    console.error('submit-intake (stripe check) error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
