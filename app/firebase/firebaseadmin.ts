import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import serviceAccountJson from "./xlnt-feedback-submission-b61b0-firebase-adminsdk-fbsvc-4bb22f81d0.json";

const serviceAccount = serviceAccountJson as Record<string, any>;

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);

export { db };

