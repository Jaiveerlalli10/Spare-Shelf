// Shared helpers for the payment server functions in /api (Vercel runs each file as an endpoint;
// files starting with "_" are not endpoints). This code runs on Vercel's servers, never in the
// browser, so it can hold the secret Stripe key and the Firebase admin key.
//
// Environment variables (set in Vercel, or in .env.local for `npx vercel dev`):
//   STRIPE_SECRET_KEY         sk_test_... from the Stripe dashboard (test mode)
//   FIREBASE_SERVICE_ACCOUNT  the Firebase service account key: the JSON file's contents, or base64 of it
//   APP_URL                   optional, like https://spare-shelf.vercel.app (where Stripe sends people back)
import Stripe from "stripe";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// ---------- Stripe ----------

let stripeClient = null;
export function stripe() {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new HttpError(500, "Payments aren't set up: STRIPE_SECRET_KEY is missing.");
  // Safety net while this is a demo: refuse real-money keys unless someone turns that on on purpose.
  if (key.startsWith("sk_live_") && process.env.ALLOW_LIVE_PAYMENTS !== "yes") {
    throw new HttpError(500, "Refusing to use a live Stripe key. Use a test key (sk_test_...).");
  }
  stripeClient = new Stripe(key);
  return stripeClient;
}

// ---------- Firebase (admin) ----------
// The admin SDK skips Firestore security rules, so only this server can write payment fields.

function serviceAccount() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) throw new HttpError(500, "Payments aren't set up: FIREBASE_SERVICE_ACCOUNT is missing.");
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json);
}

function adminApp() {
  return getApps()[0] || initializeApp({ credential: cert(serviceAccount()) });
}

export const db = () => getFirestore(adminApp());

/** The signed-in person making this request: { uid, name, email }. Throws 401 if not signed in. */
export async function requireUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Please sign in first.");
  const firebaseAuth = getAuth(adminApp()); // outside the try, so a missing admin key isn't reported as a sign-in problem
  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    return { uid: decoded.uid, name: decoded.name || "Neighbor", email: decoded.email || "" };
  } catch {
    throw new HttpError(401, "Your sign-in expired. Refresh the page and try again.");
  }
}

// ---------- Requests ----------

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Where Stripe should send people back to: APP_URL, or this site's own address. */
export function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || (String(host).startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Wraps an endpoint: only POST, JSON in and out, and errors become { error } with a status code.
 * `fn(req)` returns the JSON to send back.
 */
export function endpoint(fn) {
  return async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Use POST." });
      return;
    }
    try {
      res.status(200).json(await fn(req, typeof req.body === "object" && req.body ? req.body : {}));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      res.status(status).json({ error: err.message || "Something went wrong." });
    }
  };
}

/** Dollars (like 3.5) to cents (350). */
export const toCents = (dollars) => Math.round(Number(dollars) * 100);
