// POST /api/payments/capture  { postId }
// Charges the held card once BOTH people confirmed the hand-off (the post is "completed").
// Either person's app calls this; calling it again does nothing.
import { db, endpoint, HttpError, requireUser, stripe } from "../_lib.js";

export default endpoint(async (req, body) => {
  const user = await requireUser(req);
  const ref = db().collection("posts").doc(String(body.postId || ""));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "This post was deleted.");
  const post = snap.data();
  if (![post.ownerId, post.claimedById].includes(user.uid)) throw new HttpError(403, "This isn't your hand-off.");

  const payment = post.payment;
  if (!payment) return { status: "none" };
  if (payment.status === "paid") return { status: "paid" };
  if (post.status !== "completed") throw new HttpError(409, "Waiting for both of you to confirm the hand-off.");
  if (payment.buyerId !== post.claimedById) throw new HttpError(409, "This payment is from an earlier claim.");

  const intent = await stripe().paymentIntents.retrieve(payment.intentId);
  if (intent.status === "requires_capture") await stripe().paymentIntents.capture(payment.intentId);
  else if (intent.status !== "succeeded") throw new HttpError(409, "The card hold expired, so the payment couldn't be completed.");

  await ref.update({ "payment.status": "paid", "payment.updatedAt": Date.now() });
  return { status: "paid" };
});
