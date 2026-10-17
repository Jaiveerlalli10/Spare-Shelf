// One post on the board, plus the buttons that make sense for whoever is looking at it.
import { claimPost, completePost, deletePost } from "../data";
import { daysUntil, expiryLabel } from "../dates";

function timeAgo(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function PostCard({ post, user }) {
  const isOffer = post.type === "offer";
  const isMine = user && post.ownerId === user.uid;
  const claimedByMe = user && post.claimedById === user.uid;
  const days = daysUntil(post.expiresOn);

  let actions;
  if (post.status === "completed") {
    actions = <span className="status done">Shared ✓</span>;
  } else if (!user) {
    actions = <span className="muted">Sign in to respond</span>;
  } else if (isMine && post.status === "open") {
    actions = <button className="btn ghost" onClick={() => deletePost(post)}>Delete</button>;
  } else if (isMine && post.status === "claimed") {
    actions = (
      <>
        <span className="muted">{post.claimedByName} responded{post.claimedByEmail && ` · ${post.claimedByEmail}`}</span>
        <button className="btn primary" onClick={() => completePost(post)}>Mark completed</button>
      </>
    );
  } else if (post.status === "open") {
    actions = (
      <button className="btn primary" onClick={() => claimPost(user, post)}>
        {isOffer ? "I'll take it" : "I can help"}
      </button>
    );
  } else if (claimedByMe) {
    actions = <span className="status claimed">You're on it! Contact {post.ownerName}{post.ownerEmail && `: ${post.ownerEmail}`}</span>;
  } else {
    actions = <span className="status claimed">Someone's on it</span>;
  }

  return (
    <article className={`card post ${post.type}`}>
      <div className="post-top">
        <span className={`badge ${post.type}`}>{isOffer ? "Offering" : "Requesting"}</span>
        <span className="muted">{timeAgo(post.createdAt)}</span>
      </div>
      <h2>
        {post.item}
        {post.quantity && <span className="qty"> · {post.quantity}</span>}
      </h2>
      <p className="meta">
        📍 {post.location} · {post.ownerName}
        {days !== null && (
          <span className={days <= 1 ? "expiry soon" : "expiry"}>
            {" "}· {expiryLabel(days)}
          </span>
        )}
      </p>
      {post.notes && <p className="notes">{post.notes}</p>}
      <div className="actions">{actions}</div>
    </article>
  );
}
