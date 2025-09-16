import * as admin from 'firebase-admin';

let app;
if (!admin.apps.length) {
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svc) {
    throw new Error('Missing Firebase service account JSON in env: FIREBASE_SERVICE_ACCOUNT');
  }
  const creds = JSON.parse(svc);
  app = admin.initializeApp({
    credential: admin.credential.cert(creds)
  });
} else {
  app = admin.app();
}

export const firebaseAdmin = app;
export const auth = admin.auth();
