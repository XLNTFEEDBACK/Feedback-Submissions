import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";

if (!admin.apps.length) {
  const serviceAccount = require(path.resolve("./firebase/serviceAccountKey.json"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

export { db };
