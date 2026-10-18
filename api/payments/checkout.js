// POST /api/payments/checkout  { postId }
// A buyer taps "Pay & claim" on a priced offer. Returns a Stripe Checkout page URL.
// The card is only authorized (held), not charged: it's charged when both people confirm
// the hand-off (capture.js), and released if the hand-off is called off (release.js).
import { appUrl, db, endpoint, HttpError, requireUser, stripe, toCents } from "../_lib.js";

export default endpoint(async (req, body) => {
  const user = await requireUser(req);
  const postId = String(body.postId || "");
  const snap = await db().collection("posts").doc(postId).get();
  if (!snap.exists) throw new HttpError(404, "This post was deleted.");
  const post = snap.data();

  if (post.type !== "offer" || !(post.price > 0)) throw new HttpError(400, "This offer is free. No payment needed.");
  if (post.status !== "open") throw new HttpError(409, "Someone already claimed this.");
  if (post.ownerId === user.uid) throw new HttpError(400, "You can't buy your own offer.");
  if ((post.declinedBy || []).includes(user.uid)) throw new HttpError(403, "This hand-off was declined for good.");

  const seller = await db().collection("stripeAccounts").doc(post.ownerId).get();
  if (!seller.exists || !seller.data().ready) throw new HttpError(409, `${post.ownerName} can't accept card payments yet.`);

  const back = appUrl(req);
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: user.email || undefined,
    client_reference_id: user.uid,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: toCents(post.price),
        product_data: { name: `${post.item}${post.quantity ? ` · ${post.quantity}` : ""}`, description: `From ${post.ownerName} on Spare Shelf` },
      },
    }],
    payment_intent_data: {
      capture_method: "manual", // hold now, charge when the hand-off is confirmed
      transfer_data: { destination: seller.data().accountId }, // the money goes to the seller
      metadata: { postId, buyerId: user.uid, sellerId: post.ownerId },
    },
    metadata: { postId, buyerId: user.uid },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // the shortest Stripe allows
    success_url: `${back}/?paid=${encodeURIComponent(postId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${back}/?paycancel=${encodeURIComponent(postId)}`,
  });
  return { url: session.url };
});
