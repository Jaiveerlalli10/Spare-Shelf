// Profile section: set up payouts with Stripe so your offers can have a price.
// Stripe's own page collects bank or debit card details; this app never sees them.
import { useEffect, useState } from "react";
import { paymentsOn, refreshPayoutStatus, startPayoutSetup, watchSellerAccount } from "../payments";

export default function PayoutSetup({ user }) {
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => watchSellerAccount(user, setAccount), [user.uid]);
  if (!paymentsOn) return null;

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="payout-setup">
      <p className="section-label">Get paid for offers, optional</p>
      {account?.ready ? (
        <p className="status done">✓ Payouts are set up. You can add a price when you post an offer.</p>
      ) : (
        <>
          <p className="hint">
            {account
              ? "You started setting up payouts. Finish on Stripe to add prices to your offers."
              : "Sell extras instead of giving them away. Stripe handles cards and sends the money to you after each hand-off."}
            {" "}Test mode: no real money moves.
          </p>
          <div className="payout-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => run(startPayoutSetup)}>
              {busy ? "Opening Stripe…" : account ? "Finish setup on Stripe" : "💳 Set up payouts"}
            </button>
            {account && (
              <button type="button" className="link" disabled={busy} onClick={() => run(refreshPayoutStatus)}>Check again</button>
            )}
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
