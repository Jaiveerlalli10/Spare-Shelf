// Connects to Firebase using the keys in .env.local.
// If no keys are set, `firebaseReady` is false and the app uses demo mode instead.
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(config.apiKey && config.projectId);

export const app = firebaseReady ? initializeApp(config) : null;

// App Check: proves requests come from this app, so others can't use our Gemini quota.
// On localhost a debug token is printed in the browser console the first time; add it in
// Firebase console > App Check > Apps > Manage debug tokens (once per browser).
const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (app && recaptchaKey) {
  if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaKey),
    isTokenAutoRefreshEnabled: true,
  });
}
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
