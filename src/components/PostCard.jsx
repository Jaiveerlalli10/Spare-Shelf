// One post on the board, plus the buttons that make sense for whoever is looking at it.
import { deletePost } from "../data";
import { daysUntil, expiryLabel } from "../dates";
import Handoff from "./Handoff";
import LiveNote from "./LiveNote";
import Reputation from "./Reputation";
import { milesToPost, milesBetween, awayLabel, tripFor } from "../location";
import { canSuggestPickup, handoffRoles, pickupProposer } from "../data";
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
export default function PostCard({ post, user, here, onMessage, onClaim, onReview, onDirections, pickup, declinedPickup, onChoosePickup, onAcceptPickup, onDeclinePickup, onDeclineForGood, liveShare, index = 0, focused = false }) {
  const isOffer = post.type === "offer";
  const isMine = user && post.ownerId === user.uid;
  const claimedByMe = user && post.claimedById === user.uid;
  const days = daysUntil(post.expiresOn);
  // Distance to the pickup spot if there is one, otherwise to the poster's (rounded) area.
  const away = isMine ? "" : awayLabel(pickup && here ? milesBetween(here, pickup) : milesToPost(here, post));
  const inChat = isMine || claimedByMe; // the two people in this hand-off
  const otherName = isMine ? post.claimedByName : post.ownerName;
  const gave = handoffRoles(post);
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
    actions = messageButton;
  } else if (post.status === "open") {
    actions = (
      <button className="btn primary" onClick={() => onClaim(post)}>
        {isOffer ? "I'll take it" : "I can help"}
      </button>
    );
  } else {
    actions = null;
  }

  return (
    <article id={`post-${post.id}`} className={`card post ${post.type}${focused ? " focused" : ""}`} style={{ "--i": Math.min(index, 8) }}>
      <div className="post-emoji" aria-hidden>{foodEmoji(post.item)}</div>
      <div className="post-body">
      {/* Reads as a sentence: "Lucas is requesting Sugar · 1 cup" */}
      <h2 className="post-headline">
        {post.status === "completed" && user && inChat ? (
          // Finished hand-off (History): past tense, so it doesn't read like a live post.
          <>
            <span className="who">{gave.giverId === user.uid ? "You" : gave.giverName}</span>{" "}
            <span className={`verb ${post.type}`}>gave</span>{" "}
            <span className="who">{gave.giverId === user.uid ? gave.receiverName : "you"}</span>{" "}
          </>
        ) : (
          <>
            <span className="who">{isMine ? "You're" : `${post.ownerName} is`}</span>{" "}
            <span className={`verb ${post.type}`}>{isOffer ? "offering" : "requesting"}</span>{" "}
          </>
        )}
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
        <PickupStatus post={post} user={user} pickup={pickup} declined={declinedPickup}
          onAcceptPickup={onAcceptPickup} onDeclinePickup={onDeclinePickup} onDeclineForGood={onDeclineForGood} liveShare={liveShare} />
      )}
      <div className="actions">
        {/* Pickup spots take turns: the giver suggests first, and after a decline the decliner suggests next. */}
        {user && onChoosePickup && (post.status === "claimed"
          ? canSuggestPickup(post, user, pickup, declinedPickup)
          : isMine && post.type === "offer" && post.status === "open") && (
          <button className="btn ghost" onClick={() => onChoosePickup(post)}>
            📍 {pickup ? `Pickup: ${pickup.label}` : declinedPickup ? "Suggest a spot" : "Choose pickup spot"}
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

/**
 * Pickup spot status for the two people in a hand-off. Whoever suggested the spot waits;
 * the other person can accept or decline it (and then suggest their own).
 */
function PickupStatus({ post, user, pickup, declined, onAcceptPickup, onDeclinePickup, onDeclineForGood, liveShare }) {
  const { giverId, giverName, receiverId, receiverName } = handoffRoles(post);
  const iGive = giverId === user.uid;
  const otherId = iGive ? receiverId : giverId;
  const otherName = iGive ? receiverName : giverName;
  const live = <LiveNote liveShare={liveShare} otherId={otherId} otherName={otherName} />;
  const forGood = onDeclineForGood && (
    <button className="btn ghost small danger" onClick={() => onDeclineForGood(post)}>Decline for good</button>
  );

  if (!pickup) {
    if (declined) {
      const mineWasDeclined = pickupProposer(post, declined) === user.uid;
      return (
        <div className="card-pickup declined">
          <span>
            {mineWasDeclined
              ? <>❌ {otherName} declined <strong>{declined.label}</strong>. Waiting for {otherName} to suggest another spot.</>
              : <>❌ You declined <strong>{declined.label}</strong>. Suggest a spot that works for you.</>}
          </span>
          {!mineWasDeclined && forGood}
        </div>
      );
    }
    return iGive
      ? <p className="card-pickup muted">Choose a pickup spot so {receiverName} knows where to meet you.</p>
      : <p className="card-pickup muted">Waiting for {giverName} to choose a pickup spot.</p>;
  }
  if (pickup.accepted) {
    return (
      <div className="card-pickup agreed">
        <span>✅ Pickup at <strong>{pickup.label}</strong></span>
        {live}
      </div>
    );
  }
  if (pickupProposer(post, pickup) === user.uid) {
    return (
      <div className="card-pickup">
        <span>⏳ Waiting for {otherName} to accept <strong>{pickup.label}</strong>.</span>
        {live}
      </div>
    );
  }
  return (
    <div className="card-pickup">
      <span>📍 {otherName} suggests <strong>{pickup.label}</strong></span>
      {onAcceptPickup && <button className="btn primary small" onClick={() => onAcceptPickup(post)}>Accept</button>}
      {onDeclinePickup && <button className="btn ghost small" onClick={() => onDeclinePickup(post)}>Decline</button>}
      {forGood}
      {live}
    </div>
  );
}
