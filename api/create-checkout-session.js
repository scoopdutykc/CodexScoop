// Creates a Stripe Checkout Session after verifying Firebase ID token
// Expects JSON body: { priceId, service, optionsKey, mode }

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = (authHeader.startsWith('Bearer ') && authHeader.split(' ')[1]) || null;
    if (!token) {
      return res.status(401).json({ error: 'Missing Firebase ID token' });
    }

    // ---- Firebase Admin verify ----
    const { getFirebaseAdmin } = require('./_lib/firebaseAdmin');
    const adminApp = getFirebaseAdmin();
    const admin = require('firebase-admin');
    const decoded = await admin.auth(adminApp).verifyIdToken(token);

    // ---- Stripe setup ----
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });
    }
    const stripe = require('stripe')(secretKey, { apiVersion: '2024-06-20' });

    // ---- Validate body ----
    const { priceId, service, optionsKey, mode } = req.body || {};
    if (!priceId || !mode) {
      return res.status(400).json({ error: 'Missing priceId or mode' });
    }

    // (Optional) Whitelist price IDs you actually sell to prevent tampering.
    // If you keep this, make sure it matches your client PRICE_IDS.
    const ALLOWED_PRICE_IDS = new Set([
      "price_1S4SQLRzSCSZiE1R6YBer4cZ","price_1S4SPURzSCSZiE1RrLUYru5Z","price_1S4SP8RzSCSZiE1RGHuQugOG",
      "price_1S4SMkRzSCSZiE1R7NfCh5SK","price_1S4SMkRzSCSZiE1RSsgGk0q0","price_1S4SMkRzSCSZiE1RTnjCXsc1",
      "price_1S4SMkRzSCSZiE1RDKVJEEhC","price_1S4SMkRzSCSZiE1RQvJhd8Qf","price_1S4SMkRzSCSZiE1RJfqUq3lG",
      "price_1S4SMkRzSCSZiE1RAdpBMbZo","price_1S4SMkRzSCSZiE1RzyBnrWuL","price_1S4SMkRzSCSZiE1Ra3vgD0at",
      "price_1S4SMkRzSCSZiE1Ry3Y3e4uj","price_1S4SMkRzSCSZiE1RNWAoEUNN","price_1S4SMjRzSCSZiE1RYjwR8hZA",
      "price_1S4S97RzSCSZiE1R4TlRQ9SJ","price_1S4S8uRzSCSZiE1Rjmo5rn1Q","price_1S4S8hRzSCSZiE1RA92U91Ga",
      "price_1S4S8HRzSCSZiE1RJH9QitJg","price_1S4S83RzSCSZiE1RhQkTV8lH","price_1S4S7oRzSCSZiE1Rfy3pd2fO",
      "price_1S4S6xRzSCSZiE1Ri8Juk6tL","price_1S4S6SRzSCSZiE1RHaGiU7oO","price_1S4S5xRzSCSZiE1RdpJPI75j",
      "price_1S4S4YRzSCSZiE1RuTO78vgQ","price_1S4S3hRzSCSZiE1Re5I1ytX6","price_1S4S2rRzSCSZiE1RAqBqGoBL",
      "price_1S4S2DRzSCSZiE1RAC39V5di","price_1S4S1tRzSCSZiE1RERtiU3Zw","price_1S4S1SRzSCSZiE1Rs3s26GTk",
      "price_1S4RxKRzSCSZiE1RjnD3PZbL","price_1S4RwxRzSCSZiE1R7jjcmcMS","price_1S4RKQRzSCSZiE1RmyKeMoYZ",
      "price_1S4RJrRzSCSZiE1RC0HItdl5","price_1S4RJTRzSCSZiE1RAbqPqxWk","price_1S4RJ7RzSCSZiE1R38EK1Prs",
      "price_1S4RIoRzSCSZiE1Rb3O6sGSb","price_1S4RI4RzSCSZiE1R7qofG6ZP","price_1S4RHcRzSCSZiE1RhAE1PWEK",
      "price_1S4RGURzSCSZiE1RTvSi6W2k","price_1S4RFvRzSCSZiE1RzTuZUfES","price_1S4RFZRzSCSZiE1Rm8ko1qkC",
      "price_1S4RFCRzSCSZiE1RHUYYE5Bt","price_1S4REVRzSCSZiE1RWRtDQEXV","price_1S4REARzSCSZiE1RQbt0iX0f",
      "price_1S4RBPRzSCSZiE1RWvMkUaNg","price_1S4RB7RzSCSZiE1Rnj8Orwaj","price_1S4RAQRzSCSZiE1Rln1WsHE1",
      "price_1S4RA8RzSCSZiE1RjYqqmT49","price_1S4R9fRzSCSZiE1R4sVC1peo","price_1S4R9LRzSCSZiE1RExy6g1TQ",
      "price_1S4R8uRzSCSZiE1R9UDz913w","price_1S4R7rRzSCSZiE1RGBu448IQ","price_1S4R72RzSCSZiE1RI2EfZcog",
      "price_1S4R6eRzSCSZiE1ReY37iOPp","price_1S4R6ARzSCSZiE1RhUbHCrYA","price_1S4R5bRzSCSZiE1REa5M4LIA",
      "price_1S4R4dRzSCSZiE1RwOjpcmiV","price_1S4R4KRzSCSZiE1RO2k16aCE","price_1S4R1CRzSCSZiE1RGBpPP7OO",
      "price_1S4R0aRzSCSZiE1RY5FYLhxr","price_1S4QzzRzSCSZiE1RVgSAPbCn","price_1S4Qz9RzSCSZiE1RyVU98RV1",
      "price_1S4QyuRzSCSZiE1RTR1e4Ndc","price_1S4QwLRzSCSZiE1RRbeRHoIL","price_1S4QsrRzSCSZiE1R5f6jtsrB",
      "price_1S4QrhRzSCSZiE1RGqGvgW6S","price_1S4QqsRzSCSZiE1RsVWQpe3C","price_1S4Qq9RzSCSZiE1RykiEaQaV",
      "price_1S4QkuRzSCSZiE1RkFC13VKH","price_1S4QdVRzSCSZiE1RKpYBWYke","price_1S4QdVRzSCSZiE1RiET0HGih",
      "price_1S4QdVRzSCSZiE1RGlbtpuaU","price_1S4QdVRzSCSZiE1RAeefk5Lc","price_1S4FGARzSCSZiE1RcXQ5NV2K",
    ]);
    if (!ALLOWED_PRICE_IDS.has(priceId)) {
      return res.status(400).json({ error: 'Invalid priceId' });
    }

    // ---- Create Checkout Session ----
    const session = await stripe.checkout.sessions.create({
      mode: mode, // 'payment' or 'subscription'
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      customer_email: decoded.email || undefined,
      metadata: {
        firebaseUid: decoded.uid,
        service: String(service || ''),
        optionsKey: String(optionsKey || ''),
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://' + req.headers.host}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://' + req.headers.host}/cancelled`,
    });

    return res.status(200).json({ id: session.id, mode: session.mode });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    const msg = (err && (err.message || err.toString())) || 'Unknown error';
    return res.status(500).json({ error: msg });
  }
};
