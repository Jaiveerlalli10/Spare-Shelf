// POST /api/payments/release  { postId }
// Lets go of the card hold when a hand-off is called off ("Decline for good" reopens the post).
// Only works once the buyer is no longer the claimer, so a live hand-off can't be un-paid.
import { FieldValue } from "firebase-admin/firestore";
import { db, endpoint, HttpError, requireUser, stripe } from "../_lib.js";

export default endpoint(async (req, body) => {
  const user = await requireUser(req);
  const ref = db().collection("posts").doc(String(body.postId || ""));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "This post was deleted.");
  const post = snap.data();
  const payment = post.payment;
  if (!payment) return { status: "none" };
  if (![post.ownerId, payment.buyerId].includes(user.uid)) throw new HttpError(403, "This isn't your hand-off.");
  if (payment.status !== "authorized") return { status: payment.status };
  if (post.status !== "open" && post.claimedById === payment.buyerId) {
    throw new HttpError(409, "The hand-off is still going. Decline it first.");
  }

  const intent = await stripe().paymentIntents.retrieve(payment.intentId);
  if (intent.status === "requires_capture") await stripe().paymentIntents.cancel(payment.intentId);
  await ref.update({ payment: FieldValue.delete() });
  return { status: "released" };
});
