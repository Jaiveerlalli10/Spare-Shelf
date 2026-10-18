// POST /api/payments/connect
// A seller sets up payouts: creates their Stripe Express account (once) and returns the link to
// Stripe's own sign-up page, where they add their bank or debit card. We never see those details.
import { appUrl, db, endpoint, requireUser, stripe } from "../_lib.js";

export default endpoint(async (req) => {
  const user = await requireUser(req);
  const ref = db().collection("stripeAccounts").doc(user.uid);
  const snap = await ref.get();
  let accountId = snap.exists ? snap.data().accountId : "";

  if (!accountId) {
    const account = await stripe().accounts.create({
      type: "express",
      country: "US",
      email: user.email || undefined,
      business_type: "individual",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { uid: user.uid },
    });
    accountId = account.id;
    await ref.set({ accountId, ready: false, createdAt: Date.now() });
  }

  const back = appUrl(req);
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${back}/?stripe=refresh`, // the link expired; the app starts a fresh one
    return_url: `${back}/?stripe=return`, // they finished (or left); the app checks their status
  });
  return { url: link.url };
});
