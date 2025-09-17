import Stripe from 'stripe';
import { auth } from './_lib/firebaseAdmin.js';

let stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);

export const __setStripeClientForTest = (client) => {
  stripeClient = client;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing auth token' });
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (e) {
      const message = e?.message || 'Unknown Firebase Admin error';
      const isConfigError = /Firebase Admin (credentials not configured|not initialized|initializeApp failed)/i.test(message);
      const status = isConfigError ? 500 : 401;
      return res.status(status).json({ error: `Firebase auth error: ${message}` });
    }

    const { email, name = '', firebaseUid = decoded.uid } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Missing email' });

    let customer = null;
    try {
      const search = await stripeClient.customers.search({
        query: `email:'${email}' OR metadata['firebaseUid']:'${firebaseUid}'`,
      });
      customer = search.data[0] || null;
    } catch (e) {
      const list = await stripeClient.customers.list({ email, limit: 1 });
      customer = list.data[0] || null;
    }

    if (!customer) {
      customer = await stripeClient.customers.create({
        email,
        name,
        metadata: { firebaseUid },
      });
    } else if (!customer.metadata?.firebaseUid) {
      await stripeClient.customers.update(customer.id, { metadata: { firebaseUid } });
    }

    return res.status(200).json({ customerId: customer.id });
  } catch (err) {
    console.error('create-customer error', err);
    const message = err?.message || 'Internal error';
    return res.status(500).json({ error: message });
  }
}
