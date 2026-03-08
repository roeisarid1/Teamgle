// Firebase Web SDK configuration.
// These values are NOT secrets — they are safe to commit to source control.
// They only allow access to Firebase services gated by Firebase Security Rules.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAvyTB636tDSYNK3sUYlWTnMrqsRjGhf_0",
  authDomain: "teamgle-9b1c5.firebaseapp.com",
  databaseURL: "https://teamgle-9b1c5-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "teamgle-9b1c5",
  storageBucket: "teamgle-9b1c5.firebasestorage.app",
  messagingSenderId: "640402208616",
  appId: "1:640402208616:web:82592df2ff39c36b3408dd",
  measurementId: "G-3FEYQQ7GD6"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
