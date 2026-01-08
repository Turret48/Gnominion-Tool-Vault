import 'server-only';

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

let adminApp: App | null = null;

const getAdminApp = (): App | null => {
  if (adminApp) return adminApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  adminApp = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });

  return adminApp;
};

export const getAdminAuth = () => {
  const app = getAdminApp();
  return app ? getAuth(app) : null;
};

export const getAdminDb = () => {
  const app = getAdminApp();
  return app ? getFirestore(app) : null;
};

export const adminFieldValue = FieldValue;
