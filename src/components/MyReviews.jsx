// "Your reviews": every review neighbors have left you, newest first, with your average on top.
import { useEffect, useState } from "react";
import { getReviewsFor, subscribeReviews } from "../data";
import { summarizeReviews } from "../reviews";
import { shortAgo } from "../dates";
import Avatar from "./Avatar";

const agoText = (ms) => { const a = shortAgo(ms); return a === "now" ? "just now" : `${a} ago`; };
const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

export default function MyReviews({ user }) {
  const [reviews, setReviews] = useState(null); // null while loading

  useEffect(() => {
    let cancelled = false;
    const load = () => getReviewsFor(user.uid)
      .then((list) => { if (!cancelled) setReviews(list); })
      .catch(() => { if (!cancelled) setReviews([]); });
    load();
    const stop = subscribeReviews((changed) => { if (changed === user.uid) load(); });
    return () => { cancelled = true; stop(); };
  }, [user.uid]);

  const summary = summarizeReviews(reviews);
  const newestFirst = (reviews || []).slice().sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  return (
    <section className="card my-reviews">
      {reviews === null ? (
        <p className="muted">Loading your reviews…</p>
      ) : !summary ? (
        <p className="muted">No reviews yet. After you finish a hand-off, your neighbor can leave you one.</p>
      ) : (
        <>
          <div className="my-reviews-summary">
            <span className="my-reviews-score">★ {summary.average.toFixed(1)}</span>
            <span className="muted">from {summary.count} review{summary.count === 1 ? "" : "s"}</span>
            {summary.tags.map((tag) => <span key={tag} className="rep-tag">{tag}</span>)}
          </div>
          <ul className="my-reviews-list">
            {newestFirst.map((r) => (
              <li key={r.id} className="my-review">
                <Avatar name={r.fromName || "?"} size="sm" />
                <div className="my-review-body">
                  <div className="my-review-top">
                    <strong>{r.fromName || "A neighbor"}</strong>
                    <span className="my-review-stars" aria-label={`${r.stars} out of 5 stars`}>{stars(Number(r.stars) || 0)}</span>
                  </div>
                  <span className="muted">
                    {r.item ? `For ${r.item}` : "Hand-off"}{(r.updatedAt || r.createdAt) ? ` · ${agoText(r.updatedAt || r.createdAt)}` : ""}
                  </span>
                  {r.tags?.length > 0 && (
                    <span className="rep">{r.tags.map((tag) => <span key={tag} className="rep-tag">{tag}</span>)}</span>
                  )}
                  {r.comment?.trim() && <p className="my-review-note">“{r.comment.trim()}”</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
