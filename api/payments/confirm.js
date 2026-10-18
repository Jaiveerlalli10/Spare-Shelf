// POST /api/payments/confirm  { sessionId }
// Called when the buyer comes back from Stripe Checkout. Checks with Stripe that the card was
// authorized, then claims the post for them. Safe to call twice. If someone else claimed the
// post in the meantime, the hold is released so the buyer isn't charged.
import { db, endpoint, HttpError, requireUser, stripe } from "../_lib.js";

export default endpoint(async (req, body) => {
  const user = await requireUser(req);
  const session = await stripe().checkout.sessions.retrieve(String(body.sessionId || ""), { expand: ["payment_intent"] });
  if (session.metadata?.buyerId !== user.uid) throw new HttpError(403, "This payment belongs to someone else.");
  const intent = session.payment_intent;
  if (session.status !== "complete" || !intent) throw new HttpError(402, "The payment didn't go through.");

  const postId = session.metadata.postId;
  const ref = db().collection("posts").doc(postId);
  const result = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, reason: "This post was deleted." };
    const post = snap.data();
    // Already claimed with this payment (e.g. the page was refreshed): nothing to do.
    if (post.payment?.intentId === intent.id && post.claimedById === user.uid) return { ok: true, post };
    if (post.status !== "open" || intent.status !== "requires_capture") {
      return { ok: false, reason: "Someone else claimed it first." };
    }
    const changes = {
      status: "claimed",
      claimedById: user.uid,
      claimedByName: user.name,
      claimedByEmail: user.email,
      claimerApproxLat: null,
      claimerApproxLng: null,
      payment: {
        intentId: intent.id,
        amount: intent.amount, // cents
        status: "authorized", // "authorized" (held) → "paid", or released and removed
        buyerId: user.uid,
        sellerId: post.ownerId,
        updatedAt: Date.now(),
      },
    };
    tx.update(ref, changes);
    return { ok: true, post: { ...post, ...changes } };
  });

  if (!result.ok) {
    if (intent.status === "requires_capture") await stripe().paymentIntents.cancel(intent.id);
    throw new HttpError(409, `${result.reason} Your card wasn't charged.`);
  }
  return { post: { id: postId, ...result.post } };
});
