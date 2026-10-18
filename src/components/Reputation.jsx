// The stars and quick notes neighbors have added to one person.
import { useEffect, useState } from "react";
import { getReviewsFor, subscribeReviews } from "../data";
import { summarizeReviews } from "../reviews";

export function useReputation(uid) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!uid) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      getReviewsFor(uid).then((list) => {
        if (!cancelled) setSummary(summarizeReviews(list));
      }).catch(() => {
        if (!cancelled) setSummary(null);
      });
    };
    load();
    const stop = subscribeReviews((changed) => { if (changed === uid) load(); });
    return () => { cancelled = true; stop(); };
  }, [uid]);

  return summary;
}

export default function Reputation({ uid, tagLimit = 2, showNote = false }) {
  const summary = useReputation(uid);
  if (!summary) return null;
  const score = summary.average.toFixed(1);
  const label = `${score} stars from ${summary.count} review${summary.count === 1 ? "" : "s"}`;
  return (
    <span className="rep" aria-label={label}>
      <span className="rep-score">★ {score}</span>
      {summary.tags.slice(0, tagLimit).map((tag) => (
        <span key={tag} className="rep-tag">{tag}</span>
      ))}
      {showNote && summary.note && <span className="rep-note">“{summary.note}”</span>}
    </span>
  );
}
