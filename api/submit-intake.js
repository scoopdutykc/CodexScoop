// /api/submit-intake.js
import Stripe from 'stripe';
import { auth as adminAuthMaybe } from './_lib/firebaseAdmin.js'; // may or may not be initialized

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/* ----------------------------- helpers ----------------------------- */
function b64urlToJson(b64) {
  const pad = s => s + '==='.slice((s.length + 3) % 4);
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(pad(s), 'base64').toString('utf8'));
}
function tryLocalDecode(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed Firebase JWT');
  const payload = b64urlToJson(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.sub) throw new Error('JWT payload missing sub');
  if (payload.exp <= now) throw new Error('JWT expired');
  return { uid: payload.sub, email: payload.email || '' };
}

async function ensureAdmin() {
  // Lazy import so we don’t pull admin into the client bundle
  const admin = (await import('firebase-admin')).default;

  if (!admin.apps.length) {
    // Try to init from FIREBASE_SERVICE_ACCOUNT (JSON string) first
    const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
    let credential = null;

    if (svc) {
      try {
        const parsed = JSON.parse(svc);
        if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
        credential = admin.credential.cert(parsed);
      } catch (e) {
        console.error('submit-intake: failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e);
      }
    }

    if (!credential) {
      // Fallback to discrete vars
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail =
        process.env.FIREBASE_CLIENT_EMAIL ||
        (svc ? (JSON.parse(svc).client_email) : undefined);
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (privateKey) privateKey = privateKey.replace(/\\n/g, '\n');

      if (projectId && clientEmail && privateKey) {
        credential = admin.credential.cert({
          project_id: projectId,
          client_email: clientEmail,
          private_key: privateKey,
        });
      }
    }

    if (!credential) {
      // Don’t throw — we’ll return null and surface a nice 500 later.
      console.error('submit-intake: Firebase Admin credential not configured.');
      return { admin, db: null, auth: null };
    }

    admin.initializeApp({ credential });
  }

  // Return handles
  return { admin, db: admin.firestore(), auth: adminAuthMaybe || (await import('firebase-admin')).default.auth() };
}

async function verifyUser(idToken) {
  const { auth } = await ensureAdmin();
  try {
    if (auth) return await auth.verifyIdToken(idToken);
  } catch (e) {
    // fall through to local decode
  }
  return tryLocalDecode(idToken);
}

/* ------------------------------- API ------------------------------- */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1) Auth
    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'Missing Firebase auth token' });

    let decoded;
    try {
      decoded = await verifyUser(idToken);
    } catch (e) {
      return res.status(401).json({ error: `Firebase auth error: ${e?.message || e}` });
    }

    // 2) Body
    const {
      sessionId, fullName, phone, address, access, area,
      pets, notes, prefDay, prefTime, extra
    } = req.body || {};

    // 3) Optional: verify Stripe session
    let stripeVerified = true;
    if (stripe && sessionId) {
      try {
        const sess = await stripe.checkout.sessions.retrieve(sessionId);
        stripeVerified = !!sess && (sess.status === 'complete' || sess.payment_status === 'paid');
      } catch {
        stripeVerified = false;
      }
    }

    // 4) Firestore (Admin only — never the client SDK)
    const { admin, db } = await ensureAdmin();
    if (!db) {
      return res.status(500).json({
        error: 'Firebase Admin not initialized on server. Ensure FIREBASE_SERVICE_ACCOUNT or (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are set.',
      });
    }

    const doc = {
      uid: decoded.uid,
      email: decoded.email || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionId: sessionId || '',
      stripeVerified,
      contact: { fullName: fullName || '', phone: phone || '' },
      address: address || {},
      access: access || '',
      area: area || '',
      pets: pets || '',
      notes: notes || '',
      scheduling: { prefDay: prefDay || '', prefTime: prefTime || '' },
      extra: extra || '',
    };

    const ref = await db.collection('intakes').add(doc);
    return res.status(200).json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('submit-intake error:', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
