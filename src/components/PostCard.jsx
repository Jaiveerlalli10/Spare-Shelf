// One post on the board, plus the buttons that make sense for whoever is looking at it.
import { claimPost, deletePost } from "../data";
import { daysUntil, expiryLabel } from "../dates";
import Handoff from "./Handoff";
import LiveNote from "./LiveNote";
import Reputation from "./Reputation";
import { milesToPost, milesBetween, awayLabel, tripFor } from "../location";
import { handoffRoles } from "../data";
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
// `onDirections(post)` shows walking directions to this post on the map.
// `onReview(post)` opens the hand-off review sheet.
// `pickup`: the pickup spot for this hand-off (if chosen); `onChoosePickup(post)` lets the giver choose it.
// `onAcceptPickup(post)` lets the receiver accept it; `liveShare` controls the giver's live location (Pause).
export default function PostCard({ post, user, here, onMessage, onReview, onDirections, pickup, onChoosePickup, onAcceptPickup, liveShare, index = 0 }) {
  const isOffer = post.type === "offer";
  const isMine = user && post.ownerId === user.uid;
  const claimedByMe = user && post.claimedById === user.uid;
  const days = daysUntil(post.expiresOn);
  // Distance to the pickup spot if there is one, otherwise to the poster's (rounded) area.
  const away = isMine ? "" : awayLabel(pickup && here ? milesBetween(here, pickup) : milesToPost(here, post));
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
      <button className="btn primary" onClick={() => claimPost(user, post, here)}>
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
        📍 {pickup ? pickup.label : post.location}{away && <> · <span className="away">{away}</span></>} · {timeAgo(post.createdAt)}
        {days !== null && (
          <span className={days <= 1 ? "expiry soon" : "expiry"}>
            {" "}· {expiryLabel(days)}
          </span>
        )}
      </p>
      {post.notes && <p className="notes">{post.notes}</p>}
      {user && inChat && post.status === "claimed" && (
        <PickupStatus post={post} user={user} pickup={pickup} onAcceptPickup={onAcceptPickup} liveShare={liveShare} />
      )}
      <div className="actions">
        {/* The giver of an active hand-off chooses where to meet. */}
        {user && onChoosePickup && (post.status === "claimed"
          ? handoffRoles(post).giverId === user.uid
          : isMine && post.type === "offer" && post.status === "open") && (
          <button className="btn ghost" onClick={() => onChoosePickup(post)}>
            📍 {pickup ? `Pickup: ${pickup.label}` : "Choose pickup spot"}
          </button>
        )}
        {/* Only the person receiving the food walks, so only they get directions. */}
        {here && onDirections && tripFor(post, user, pickup) && (
          <button className="btn ghost" onClick={() => onDirections(post)}>🧭 Directions</button>
        )}
        {actions}
        {user && inChat && post.status !== "open" && <Handoff post={post} user={user} onReview={onReview} />}
      </div>
      </div>
    </article>
  );
}

/** Pickup spot status for the two people in a hand-off (this used to live in the chat). */
function PickupStatus({ post, user, pickup, onAcceptPickup, liveShare }) {
  const { giverId, giverName, receiverId, receiverName } = handoffRoles(post);
  const iGive = giverId === user.uid;
  if (iGive) {
    if (!pickup) return <p className="card-pickup muted">Choose a pickup spot so {receiverName} knows where to meet you.</p>;
    return (
      <div className={pickup.accepted ? "card-pickup agreed" : "card-pickup"}>
        <span>{pickup.accepted ? `✅ ${receiverName} accepted the pickup spot.` : `⏳ Waiting for ${receiverName} to accept the pickup spot.`}</span>
        <LiveNote liveShare={liveShare} otherId={receiverId} otherName={receiverName} />
      </div>
    );
  }
  if (!pickup) return <p className="card-pickup muted">Waiting for {giverName} to choose a pickup spot.</p>;
  if (pickup.accepted) return <p className="card-pickup agreed">✅ Pickup at <strong>{pickup.label}</strong></p>;
  return (
    <div className="card-pickup">
      <span>📍 {giverName} suggests <strong>{pickup.label}</strong></span>
      {onAcceptPickup && <button className="btn primary small" onClick={() => onAcceptPickup(post)}>Accept</button>}
    </div>
  );
}
