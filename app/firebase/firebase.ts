import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC2iBn1AU0DprQezc_w1b6IalPiLUsJjtc",
  authDomain: "xlnt-feedback-submission-b61b0.firebaseapp.com",
  projectId: "xlnt-feedback-submission-b61b0",
  storageBucket: "xlnt-feedback-submission-b61b0.firebasestorage.app",
  messagingSenderId: "197514562557",
  appId: "1:197514562557:web:8085dfadee66920515a794"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
