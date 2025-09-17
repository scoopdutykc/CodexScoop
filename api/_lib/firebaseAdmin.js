 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/api/_lib/firebaseAdmin.js b/api/_lib/firebaseAdmin.js
index 51de0d4b47c8808a94e766e86e67875b880872c8..8df9c89c49bd46fec180ae835904e0c31c91da4c 100644
--- a/api/_lib/firebaseAdmin.js
+++ b/api/_lib/firebaseAdmin.js
@@ -1,53 +1,117 @@
 // /api/_lib/firebaseAdmin.js
 // Minimal, production-safe Admin init that ONLY reads FIREBASE_SERVICE_ACCOUNT.
 // No FIREBASE_PRIVATE_KEY or other vars are required.
 // Set FIREBASE_SERVICE_ACCOUNT to the FULL JSON from Firebase Console → Service accounts → "Generate new private key".
 import admin from 'firebase-admin';
 
+let initError = null;
+
 function initAdmin() {
-  if (admin.apps.length) return;
+  if (admin.apps.length || initError) return;
 
+  const errors = [];
   const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
-  if (!raw) {
-    console.error('[AdminInit] Missing FIREBASE_SERVICE_ACCOUNT env var.');
-    return;
-  }
+  let credentialConfig = null;
 
-  let parsed;
-  try {
-    parsed = JSON.parse(raw);
-  } catch (e) {
-    console.error('[AdminInit] FIREBASE_SERVICE_ACCOUNT is not valid JSON:', e.message);
-    return;
+  if (raw) {
+    try {
+      credentialConfig = JSON.parse(raw);
+    } catch (e) {
+      errors.push(`FIREBASE_SERVICE_ACCOUNT is not valid JSON: ${e.message}`);
+    }
+
+    if (credentialConfig) {
+      if (credentialConfig.private_key) {
+        // Convert literal \n sequences to real newlines (required on most hosts)
+        credentialConfig.private_key = credentialConfig.private_key.replace(/\\n/g, '\n');
+      }
+
+      if (!credentialConfig.client_email || !credentialConfig.private_key) {
+        errors.push('FIREBASE_SERVICE_ACCOUNT JSON is missing client_email or private_key.');
+        credentialConfig = null;
+      }
+    }
+  } else {
+    errors.push('Missing FIREBASE_SERVICE_ACCOUNT env var.');
   }
 
-  if (parsed.private_key) {
-    // Convert literal \n sequences to real newlines (required on most hosts)
-    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
+  if (!credentialConfig) {
+    const projectId = process.env.FIREBASE_PROJECT_ID;
+    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
+    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
+
+    const missing = [];
+    if (!projectId) missing.push('FIREBASE_PROJECT_ID');
+    if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
+    if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
+
+    if (!missing.length) {
+      privateKey = privateKey.replace(/\\n/g, '\n');
+      credentialConfig = {
+        projectId,
+        clientEmail,
+        privateKey,
+      };
+    } else {
+      errors.push(`Missing fallback env vars: ${missing.join(', ')}`);
+    }
   }
 
-  if (!parsed.client_email || !parsed.private_key) {
-    console.error('[AdminInit] FIREBASE_SERVICE_ACCOUNT JSON is missing client_email or private_key.');
-    return;
+  if (!credentialConfig) {
+    const message = 'Firebase Admin credentials not configured. Provide FIREBASE_SERVICE_ACCOUNT or set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.';
+    const details = errors.length ? ` Details: ${errors.join(' ')}` : '';
+    throw new Error(`${message}${details}`);
   }
 
+  const projectId =
+    credentialConfig.projectId ||
+    credentialConfig.project_id ||
+    process.env.FIREBASE_PROJECT_ID;
+
   try {
     admin.initializeApp({
-      credential: admin.credential.cert(parsed),
-      projectId: parsed.project_id || process.env.FIREBASE_PROJECT_ID
+      credential: admin.credential.cert({
+        projectId,
+        privateKey: credentialConfig.privateKey || credentialConfig.private_key,
+        clientEmail: credentialConfig.clientEmail || credentialConfig.client_email,
+      }),
+      projectId,
     });
     console.log('[AdminInit] Firebase Admin initialized.');
   } catch (e) {
-    console.error('[AdminInit] initializeApp failed:', e.message);
+    throw new Error(`Firebase Admin initializeApp failed: ${e.message}`);
   }
 }
 
-initAdmin();
+try {
+  initAdmin();
+} catch (err) {
+  initError = err;
+  console.error('[AdminInit]', err.message);
+}
+
+function getInitError() {
+  if (initError) return initError;
+  if (!admin.apps.length) return new Error('Firebase Admin not initialized');
+  return null;
+}
 
 export const auth = admin.apps.length
   ? admin.auth()
-  : { verifyIdToken: async () => { throw new Error('Firebase Admin not initialized'); } };
+  : {
+      verifyIdToken: async () => {
+        const err = getInitError();
+        throw err;
+      },
+    };
 
 export const db = admin.apps.length
   ? admin.firestore()
-  : { collection: () => { throw new Error('Firebase Admin not initialized'); } };
+  : {
+      collection: () => {
+        const err = getInitError();
+        throw err;
+      },
+    };
+
+export const getFirebaseAdminInitError = getInitError;
 
EOF
)
