// The two-sided hand-off confirmation: "I handed it off" (giver) / "I got it" (receiver).
// Confirming opens a review of the other person. Shown on post cards and inside the chat.
import { useEffect, useState } from "react";
import { confirmHandoff, getMyReview, handoffRoles, subscribeSavedReviews } from "../data";
import { otherParty } from "../reviews";

const firstName = (name) => (name || "them").split(" ")[0];

export default function Handoff({ post, user, onReview }) {
  const [busy, setBusy] = useState(false);
  const [didConfirm, setDidConfirm] = useState(false);
  const [mine, setMine] = useState(null);

  const other = user ? otherParty(post, user.uid) : null;
  const isOwner = user && user.uid === post.ownerId;
  const iConfirmed = didConfirm || (isOwner ? post.ownerConfirmed === true : post.claimerConfirmed === true);
  const theyConfirmed = isOwner ? post.claimerConfirmed === true : post.ownerConfirmed === true;
  const canReview = Boolean(other?.id) && (iConfirmed || post.status === "completed");

  useEffect(() => {
    if (!canReview) return;
    let cancelled = false;
    getMyReview(post.id, user.uid).then((review) => { if (!cancelled) setMine(review); }).catch(() => {});
    return () => { cancelled = true; };
  }, [canReview, post.id, user.uid]);

  useEffect(() => subscribeSavedReviews((review) => {
    if (review.postId === post.id && review.fromId === user.uid) setMine(review);
  }), [post.id, user.uid]);

  if (!user || !other?.id) return null;
  if (post.status !== "claimed" && post.status !== "completed") return null;

  const label = user.uid === handoffRoles(post).giverId ? "I handed it off" : "I got it";

  async function confirm() {
    setBusy(true);
    try {
      await confirmHandoff(user, post);
      setDidConfirm(true);
      if (onReview) onReview(post);
    } catch (err) {
      alert("Couldn't confirm: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {post.status === "claimed" && !iConfirmed && (
        <>
          {theyConfirmed && <span className="muted">{other.name} confirmed ✓</span>}
          <button className="btn primary" onClick={confirm} disabled={busy}>{busy ? "Saving…" : label}</button>
        </>
      )}
      {post.status === "claimed" && iConfirmed && (
        <span className="muted">✓ You confirmed · waiting for {firstName(other.name)}</span>
      )}
      {canReview && (
        <button className={mine ? "btn ghost" : "btn primary"} onClick={() => onReview && onReview(post)}>
          {mine ? `★ ${mine.stars} · Your review` : `Review ${firstName(other.name)}`}
        </button>
      )}
    </>
  );
}
