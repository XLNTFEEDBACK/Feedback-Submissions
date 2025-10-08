import { initializeApp, cert, getApps, AppOptions } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIREBASE_PRIVATE_KEY) {
  throw new Error("Missing FIREBASE_PRIVATE_KEY environment variable");
}

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
};

const appOptions: AppOptions = {
  credential: cert(serviceAccount),
};

const app =
  getApps().length === 0 ? initializeApp(appOptions) : getApps()[0];

const db = getFirestore(app);

export { db };

