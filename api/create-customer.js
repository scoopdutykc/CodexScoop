import Stripe from 'stripe';
import { auth } from './_lib/firebaseAdmin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing auth token' });
    const decoded = await auth.verifyIdToken(idToken);

    const { email, name = '', firebaseUid = decoded.uid } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Missing email' });

    let customer = null;
    try {
      const search = await stripe.customers.search({
        query: `email:'${email}' OR metadata['firebaseUid']:'${firebaseUid}'`,
      });
      customer = search.data[0] || null;
    } catch (e) {
      const list = await stripe.customers.list({ email, limit: 1 });
      customer = list.data[0] || null;
    }

    if (!customer) {
      customer = await stripe.customers.create({
        email,
        name,
        metadata: { firebaseUid },
      });
    } else if (!customer.metadata?.firebaseUid) {
      await stripe.customers.update(customer.id, { metadata: { firebaseUid } });
    }

    return res.status(200).json({ customerId: customer.id });
  } catch (err) {
    console.error('create-customer error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
