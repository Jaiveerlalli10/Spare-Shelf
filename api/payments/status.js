// POST /api/payments/status
// Checks whether the seller finished Stripe's sign-up and can receive money, and saves the answer
// to stripeAccounts/{uid}.ready (which the app reads to show the Price field on offers).
import { db, endpoint, requireUser, stripe } from "../_lib.js";

export default endpoint(async (req) => {
  const user = await requireUser(req);
  const ref = db().collection("stripeAccounts").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) return { connected: false, ready: false };

  const account = await stripe().accounts.retrieve(snap.data().accountId);
  const ready = Boolean(account.details_submitted && account.charges_enabled && account.capabilities?.transfers === "active");
  await ref.update({ ready, checkedAt: Date.now() });
  return { connected: true, ready };
});
