// /api/_lib/firebaseAdmin.js
// Minimal, production-safe Admin init that ONLY reads FIREBASE_SERVICE_ACCOUNT.
// No FIREBASE_PRIVATE_KEY or other vars are required.
// Set FIREBASE_SERVICE_ACCOUNT to the FULL JSON from Firebase Console → Service accounts → "Generate new private key".
import admin from 'firebase-admin';

let initError = null;

function initAdmin() {
  if (admin.apps.length || initError) return;

  const errors = [];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  let credentialConfig = null;

  if (raw) {
    try {
      credentialConfig = JSON.parse(raw);
    } catch (e) {
      errors.push(`FIREBASE_SERVICE_ACCOUNT is not valid JSON: ${e.message}`);
    }

    if (credentialConfig) {
      if (credentialConfig.private_key) {
        // Convert literal \n sequences to real newlines (required on most hosts)
        credentialConfig.private_key = credentialConfig.private_key.replace(/\\n/g, '\n');
      }

      if (!credentialConfig.client_email || !credentialConfig.private_key) {
        errors.push('FIREBASE_SERVICE_ACCOUNT JSON is missing client_email or private_key.');
        credentialConfig = null;
      }
    }
  } else {
    errors.push('Missing FIREBASE_SERVICE_ACCOUNT env var.');
  }

  if (!credentialConfig) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    const missing = [];
    if (!projectId) missing.push('FIREBASE_PROJECT_ID');
    if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
    if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');

    if (!missing.length) {
      privateKey = privateKey.replace(/\\n/g, '\n');
      credentialConfig = {
        projectId,
        clientEmail,
        privateKey,
      };
    } else {
      errors.push(`Missing fallback env vars: ${missing.join(', ')}`);
    }
  }

  if (!credentialConfig) {
    const message = 'Firebase Admin credentials not configured. Provide FIREBASE_SERVICE_ACCOUNT or set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.';
    const details = errors.length ? ` Details: ${errors.join(' ')}` : '';
    throw new Error(`${message}${details}`);
  }

  const projectId =
    credentialConfig.projectId ||
    credentialConfig.project_id ||
    process.env.FIREBASE_PROJECT_ID;

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        privateKey: credentialConfig.privateKey || credentialConfig.private_key,
        clientEmail: credentialConfig.clientEmail || credentialConfig.client_email,
      }),
      projectId,
    });
    console.log('[AdminInit] Firebase Admin initialized.');
  } catch (e) {
    throw new Error(`Firebase Admin initializeApp failed: ${e.message}`);
  }
}

try {
  initAdmin();
} catch (err) {
  initError = err;
  console.error('[AdminInit]', err.message);
}

function getInitError() {
  if (initError) return initError;
  if (!admin.apps.length) return new Error('Firebase Admin not initialized');
  return null;
}

export const auth = admin.apps.length
  ? admin.auth()
  : {
      verifyIdToken: async () => {
        const err = getInitError();
        throw err;
      },
    };

export const db = admin.apps.length
  ? admin.firestore()
  : {
      collection: () => {
        const err = getInitError();
        throw err;
      },
    };

export const getFirebaseAdminInitError = getInitError;
api/create-customer.js
+20
-7

import Stripe from 'stripe';
import Stripe from 'stripe';
import { auth } from './_lib/firebaseAdmin.js';
import { auth } from './_lib/firebaseAdmin.js';


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
let stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);

export const __setStripeClientForTest = (client) => {
  stripeClient = client;
};


export default async function handler(req, res) {
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });


  try {
  try {
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing auth token' });
    if (!idToken) return res.status(401).json({ error: 'Missing auth token' });
    const decoded = await auth.verifyIdToken(idToken);
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
    const { email, name = '', firebaseUid = decoded.uid } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Missing email' });
    if (!email) return res.status(400).json({ error: 'Missing email' });


    let customer = null;
    let customer = null;
    try {
    try {
      const search = await stripe.customers.search({
      const search = await stripeClient.customers.search({
        query: `email:'${email}' OR metadata['firebaseUid']:'${firebaseUid}'`,
        query: `email:'${email}' OR metadata['firebaseUid']:'${firebaseUid}'`,
      });
      });
      customer = search.data[0] || null;
      customer = search.data[0] || null;
    } catch (e) {
    } catch (e) {
      const list = await stripe.customers.list({ email, limit: 1 });
      const list = await stripeClient.customers.list({ email, limit: 1 });
      customer = list.data[0] || null;
      customer = list.data[0] || null;
    }
    }


    if (!customer) {
    if (!customer) {
      customer = await stripe.customers.create({
      customer = await stripeClient.customers.create({
        email,
        email,
        name,
        name,
        metadata: { firebaseUid },
        metadata: { firebaseUid },
      });
      });
    } else if (!customer.metadata?.firebaseUid) {
    } else if (!customer.metadata?.firebaseUid) {
      await stripe.customers.update(customer.id, { metadata: { firebaseUid } });
      await stripeClient.customers.update(customer.id, { metadata: { firebaseUid } });
    }
    }


    return res.status(200).json({ customerId: customer.id });
    return res.status(200).json({ customerId: customer.id });
  } catch (err) {
  } catch (err) {
    console.error('create-customer error', err);
    console.error('create-customer error', err);
    return res.status(500).json({ error: 'Internal error' });
    const message = err?.message || 'Internal error';
    return res.status(500).json({ error: message });
  }
  }
}
}
