// Pops up after you confirm a hand-off, so you can rate the other person.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getMyReview, saveReview } from "../data";
import { hasProfanity, PROFANITY_MESSAGE } from "../profanity";
import { NOTE_MAX, otherParty, tagsFor } from "../reviews";
import Reputation from "./Reputation";

const firstName = (name) => (name || "them").split(" ")[0];

export default function ReviewSheet({ user, post, onClose, onSaved }) {
  const other = otherParty(post, user.uid);
  const options = other ? tagsFor(post, other.id) : [];
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [picked, setPicked] = useState(() => new Set());
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const shown = hover || stars;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMyReview(post.id, user.uid).then((review) => {
      if (cancelled || !review) return;
      setEditing(true);
      setStars(review.stars);
      setPicked(new Set((review.tags || []).filter((tag) => options.includes(tag))));
      setComment(review.comment || "");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [post.id, user.uid]);

  if (!other?.id) return null;

  function toggle(tag) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!stars) {
      setError("Choose a star rating.");
      return;
    }
    if (hasProfanity(comment)) {
      setError(PROFANITY_MESSAGE);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const review = await saveReview(user, post, { stars, tags: [...picked], comment });
      onSaved(review);
    } catch (err) {
      setError(err.code === "permission-denied"
        ? "Firebase blocked this review. Publish the latest firestore.rules, then try again."
        : (err.message || "Couldn't save your review."));
      setBusy(false);
    }
  }

  const name = firstName(other.name);

  return createPortal(
    <div className="review-backdrop" onMouseDown={onClose}>
      <form
        className="card review-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        ref={dialogRef}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="review-title">How was {name}?</h2>
        <p className="hint">Stars, quick notes, or a few words of your own get added to {name}'s profile. No swearing in the note.</p>
        <Reputation uid={other.id} tagLimit={3} showNote />

        <div className="star-row" role="radiogroup" aria-label={`Star rating for ${name}`} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={n <= shown ? "star on" : "star"}
              role="radio"
              aria-checked={stars === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => { setStars(n); setError(""); }}
            >
              ★
            </button>
          ))}
        </div>

        <p className="section-label">Add a quick note</p>
        <div className="review-tags">
          {options.map((tag, i) => (
            <button
              key={tag}
              type="button"
              className={picked.has(tag) ? "review-tag on" : "review-tag"}
              style={{ "--i": i }}
              aria-pressed={picked.has(tag)}
              onClick={() => toggle(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        <label className="review-note-label" htmlFor="review-note">
          Write a note <span className="muted">(optional)</span>
          <textarea
            id="review-note"
            value={comment}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder={`How did the hand-off with ${name} go?`}
            onChange={(e) => {
              const next = e.target.value;
              setComment(next);
              if (hasProfanity(next)) setError(PROFANITY_MESSAGE);
              else if (error === PROFANITY_MESSAGE) setError("");
            }}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="review-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Not now</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : editing ? "Update review" : `Add to ${name}`}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
