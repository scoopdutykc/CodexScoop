 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/api/create-customer.js b/api/create-customer.js
index 7c0f8534c6ec6035191aed6f73fc18c70ef4019d..6456cbe97f7d28a1c6c93c9a44eb0805e433c047 100644
--- a/api/create-customer.js
+++ b/api/create-customer.js
@@ -1,43 +1,56 @@
 import Stripe from 'stripe';
 import { auth } from './_lib/firebaseAdmin.js';
 
-const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
+let stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
+
+export const __setStripeClientForTest = (client) => {
+  stripeClient = client;
+};
 
 export default async function handler(req, res) {
   if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
   try {
     const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
     if (!idToken) return res.status(401).json({ error: 'Missing auth token' });
-    const decoded = await auth.verifyIdToken(idToken);
+    let decoded;
+    try {
+      decoded = await auth.verifyIdToken(idToken);
+    } catch (e) {
+      const message = e?.message || 'Unknown Firebase Admin error';
+      const isConfigError = /Firebase Admin (credentials not configured|not initialized|initializeApp failed)/i.test(message);
+      const status = isConfigError ? 500 : 401;
+      return res.status(status).json({ error: `Firebase auth error: ${message}` });
+    }
 
     const { email, name = '', firebaseUid = decoded.uid } = req.body || {};
     if (!email) return res.status(400).json({ error: 'Missing email' });
 
     let customer = null;
     try {
-      const search = await stripe.customers.search({
+      const search = await stripeClient.customers.search({
         query: `email:'${email}' OR metadata['firebaseUid']:'${firebaseUid}'`,
       });
       customer = search.data[0] || null;
     } catch (e) {
-      const list = await stripe.customers.list({ email, limit: 1 });
+      const list = await stripeClient.customers.list({ email, limit: 1 });
       customer = list.data[0] || null;
     }
 
     if (!customer) {
-      customer = await stripe.customers.create({
+      customer = await stripeClient.customers.create({
         email,
         name,
         metadata: { firebaseUid },
       });
     } else if (!customer.metadata?.firebaseUid) {
-      await stripe.customers.update(customer.id, { metadata: { firebaseUid } });
+      await stripeClient.customers.update(customer.id, { metadata: { firebaseUid } });
     }
 
     return res.status(200).json({ customerId: customer.id });
   } catch (err) {
     console.error('create-customer error', err);
-    return res.status(500).json({ error: 'Internal error' });
+    const message = err?.message || 'Internal error';
+    return res.status(500).json({ error: message });
   }
 }
 
EOF
)
