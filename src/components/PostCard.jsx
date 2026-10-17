// One post on the board, plus the buttons that make sense for whoever is looking at it.
import { claimPost, deletePost } from "../data";
import { daysUntil, expiryLabel } from "../dates";
import Handoff from "./Handoff";
import Reputation from "./Reputation";
import { milesToPost, awayLabel } from "../location";
import { foodEmoji } from "../foodEmoji";

function timeAgo(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const firstName = (name) => (name || "").split(" ")[0];

// `onMessage(post)` opens the chat for a claimed post.
// `here` is the viewer's housing location, used to show "0.3 mi away".
// `index` staggers the entrance animation.
export default function PostCard({ post, user, here, onMessage, onReview, index = 0 }) {
  const isOffer = post.type === "offer";
  const isMine = user && post.ownerId === user.uid;
  const claimedByMe = user && post.claimedById === user.uid;
  const days = daysUntil(post.expiresOn);
  const away = isMine ? "" : awayLabel(milesToPost(here, post));
  const inChat = isMine || claimedByMe; // the two people in this hand-off
  const otherName = isMine ? post.claimedByName : post.ownerName;
  const messageButton = (
    <button className="btn ghost" onClick={() => onMessage(post)}>💬 Message {firstName(otherName)}</button>
  );

  let actions;
  if (post.status === "completed") {
    actions = (
      <>
        <span className="status done">Shared ✓</span>
        {user && inChat && messageButton}
      </>
    );
  } else if (!user) {
    actions = <span className="muted">Sign in to respond</span>;
  } else if (isMine && post.status === "open") {
    actions = <button className="btn ghost" onClick={() => deletePost(post)}>Delete</button>;
  } else if (inChat && post.status === "claimed") {
    actions = (
      <>
        <span className="status claimed">{isMine ? `${post.claimedByName} is on it` : "You're on it!"}</span>
        {messageButton}
      </>
    );
  } else if (post.status === "open") {
    actions = (
      <button className="btn primary" onClick={() => claimPost(user, post)}>
        {isOffer ? "I'll take it" : "I can help"}
      </button>
    );
  } else {
    actions = <span className="status claimed">Someone's on it</span>;
  }

  return (
    <article className={`card post ${post.type}`} style={{ "--i": Math.min(index, 8) }}>
      <div className="post-emoji" aria-hidden>{foodEmoji(post.item)}</div>
      <div className="post-body">
      {/* Reads as a sentence: "Lucas is requesting Sugar · 1 cup" */}
      <h2 className="post-headline">
        <span className="who">{isMine ? "You're" : `${post.ownerName} is`}</span>{" "}
        <span className={`verb ${post.type}`}>{isOffer ? "offering" : "requesting"}</span>{" "}
        <span className="what">{post.item}</span>
        {post.quantity && <span className="qty"> · {post.quantity}</span>}
      </h2>
      {!isMine && <Reputation uid={post.ownerId} />}
      <p className="meta">
        📍 {post.location}{away && <> · <span className="away">{away}</span></>} · {timeAgo(post.createdAt)}
        {days !== null && (
          <span className={days <= 1 ? "expiry soon" : "expiry"}>
            {" "}· {expiryLabel(days)}
          </span>
        )}
      </p>
      {post.notes && <p className="notes">{post.notes}</p>}
      <div className="actions">
        {actions}
        {user && inChat && post.status !== "open" && <Handoff post={post} user={user} onReview={onReview} />}
      </div>
      </div>
    </article>
  );
}
