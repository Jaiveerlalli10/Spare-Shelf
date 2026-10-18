// Card payments for priced offers (Stripe, test mode). The browser never touches card details or the
// secret Stripe key: it asks our server functions in /api/payments to do the Stripe work.
//
// How it works:
// 1. A seller sets up payouts once (Stripe's own sign-up page). Then their offers can have a price.
// 2. A buyer taps "Pay & claim" → Stripe Checkout holds the amount on their card → the post is claimed.
// 3. When both people confirm the hand-off, the card is charged and the money goes to the seller.
//    If the hand-off is declined for good, the hold is released and nobody pays.
//
// Payments are off unless VITE_PAYMENTS=on (and never in demo mode).
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { isDemoMode } from "./data";

export const paymentsOn = !isDemoMode && import.meta.env.VITE_PAYMENTS === "on";

/** Stripe's smallest charge is $0.50; we cap prices to keep this a neighborly thing. */
export const MIN_PRICE = 0.5;
export const MAX_PRICE = 100;

/** "$3.50" */
export const money = (dollars) => `$${Number(dollars).toFixed(2)}`;

/** True if this offer costs money (and payments are on). */
export const isPaid = (post) => paymentsOn && post.type === "offer" && Number(post.price) > 0;

/** The current payment for this hand-off, or null (ignores one left over from an earlier claim). */
export function paymentFor(post) {
  const p = post.payment;
  return p && p.buyerId === post.claimedById ? p : null;
}

async function callApi(path, body = {}) {
  const current = auth && auth.currentUser;
  if (!current) throw new Error("Please sign in first.");
  const res = await fetch(`/api/payments/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await current.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 && !data.error) {
    throw new Error("The payment server isn't running. Locally, start the app with `npx vercel dev` instead of `npm run dev`.");
  }
  if (!res.ok) throw new Error(data.error || `Payment server error (${res.status}).`);
  return data;
}

// ---------- Sellers ----------

/** Calls callback({ ready } or null) with this person's payout setup. */
export function watchSellerAccount(user, callback) {
  if (!paymentsOn || !user) {
    callback(null);
    return () => {};
  }
  return onSnapshot(doc(db, "stripeAccounts", user.uid),
    (snap) => callback(snap.exists() ? snap.data() : null),
    () => callback(null));
}

/** Sends the seller to Stripe's sign-up page. */
export async function startPayoutSetup() {
  const { url } = await callApi("connect");
  window.location.assign(url);
}

/** Asks Stripe if the seller finished sign-up. Resolves to { connected, ready }. */
export const refreshPayoutStatus = () => callApi("status");

// ---------- Buyers ----------

/** Sends the buyer to Stripe Checkout for this offer. */
export async function payAndClaim(post) {
  const { url } = await callApi("checkout", { postId: post.id });
  window.location.assign(url);
}

/** After Checkout: claims the post for the buyer. Resolves to the claimed post. */
export async function finishCheckout(sessionId) {
  const { post } = await callApi("confirm", { sessionId });
  return post;
}

/** Charges the held card once the hand-off is completed. Safe to call more than once. */
export const capturePayment = (postId) => callApi("capture", { postId });

/** Releases the card hold after a hand-off was declined for good. */
export const releasePayment = (postId) => callApi("release", { postId });
