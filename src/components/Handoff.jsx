// The two-sided hand-off confirmation: "I handed it off" (giver) / "I got it" (receiver).
// Shown on post cards and inside the chat.
import { useState } from "react";
import { confirmHandoff, handoffRoles } from "../data";

export default function Handoff({ post, user }) {
  const [busy, setBusy] = useState(false);

  if (post.status === "completed") return <span className="status done">✓ Hand-off complete</span>;
  if (post.status !== "claimed") return null;

  const isOwner = user.uid === post.ownerId;
  const iConfirmed = isOwner ? post.ownerConfirmed : post.claimerConfirmed;
  const theyConfirmed = isOwner ? post.claimerConfirmed : post.ownerConfirmed;
  const otherName = isOwner ? post.claimedByName : post.ownerName;
  const label = user.uid === handoffRoles(post).giverId ? "I handed it off" : "I got it";

  if (iConfirmed) return <span className="muted">✓ You confirmed · waiting for {otherName}</span>;

  async function confirm() {
    setBusy(true);
    try {
      await confirmHandoff(user, post);
    } catch (err) {
      alert("Couldn't confirm: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {theyConfirmed && <span className="muted">{otherName} confirmed ✓</span>}
      <button className="btn primary" onClick={confirm} disabled={busy}>{busy ? "Saving…" : label}</button>
    </>
  );
}
