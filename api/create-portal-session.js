import Stripe from 'stripe';
import { auth } from './_lib/firebaseAdmin.js';

const { STRIPE_SECRET_KEY } = process.env;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

async function findOrCreateCustomer({ email, firebaseUid, name = '' }) {
  let customer = null;

  try {
    const parts = [`metadata['firebaseUid']:'${firebaseUid}'`];
    if (email) parts.push(`email:'${email}'`);
    const query = parts.join(' OR ');
    const search = await stripe.customers.search({ query });
    customer = search.data[0] || null;
  } catch (err) {
    if (email) {
      const list = await stripe.customers.list({ email, limit: 1 });
      customer = list.data[0] || null;
    }
  }

  if (!customer) {
    customer = await stripe.customers.create({
      email,
      name,
      metadata: { firebaseUid },
    });
  } else if (!customer.metadata?.firebaseUid) {
    await stripe.customers.update(customer.id, {
      metadata: { firebaseUid },
    });
  }

  return customer;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!stripe) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

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

    const firebaseUid = decoded.uid;
    const email = decoded.email || req.body?.email;
    const name = decoded.name || decoded.displayName || req.body?.name || '';
    if (!email) return res.status(400).json({ error: 'No email address found for the authenticated user.' });

    const customer = await findOrCreateCustomer({ email, firebaseUid, name });

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (!host) return res.status(400).json({ error: 'Unable to derive request host for return URL.' });
    const origin = `${proto}://${host}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${origin}/billing`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-portal-session error', err);
    const status = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || 'Internal error' });
  }
}
