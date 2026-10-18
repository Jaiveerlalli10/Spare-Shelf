// One conversation with one neighbor, Instagram-DM style: header, a hand-off strip per item
// you're trading, grouped bubbles, "Seen", composer.
//
// `chats` is every chat doc with this person: the shared pair chat plus any older per-post chats.
// Their messages are merged into one thread; new messages always go to the pair chat.
// `posts` is the claimed posts between you two (from postsBetween in Messages.jsx).
import { useEffect, useRef, useState } from "react";
import {
  watchMessages, sendMessage, markChatRead, isUnread, handoffRoles, isFirestoreStuck, pairId, ensurePairChat,
} from "../data";
import { chatStamp } from "../dates";
import { foodEmoji } from "../foodEmoji";
import Avatar from "./Avatar";
import Handoff from "./Handoff";
import Reputation from "./Reputation";
import { tripFor } from "../location";

const GAP = 15 * 60 * 1000; // messages more than 15 minutes apart get a timestamp and a new group
const EMOJI_ONLY = /^(\p{Extended_Pictographic}|️|‍|\s){1,12}$/u;

// `onChoosePickup(post)`: giver picks/changes the pickup spot; `onAcceptPickup(post)`: receiver accepts it.
// `onReview(post)`: opens the review sheet after a hand-off.
export default function ChatView({ user, other, chats, posts, photoURL, onBack, onDirections, onChoosePickup, onAcceptPickup, onReview, liveShare }) {
  const [byChat, setByChat] = useState({}); // chat id -> its messages
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const threadRef = useRef(null);

  // The shared chat with this person. Make sure it exists so new messages have somewhere to go.
  const primaryId = pairId(user.uid, other.id);
  const primary = chats.find((c) => c.id === primaryId) || { id: primaryId, members: [user.uid, other.id].sort() };
  const hasPrimary = chats.some((c) => c.id === primaryId);
  useEffect(() => {
    if (!hasPrimary) {
      ensurePairChat({ id: user.uid, name: user.name }, other).catch((err) => console.error("Couldn't create the chat:", err));
    }
  }, [primaryId, hasPrimary]);

  // Listen to every chat with this person and merge the messages into one thread.
  const chatIds = chats.map((c) => c.id).sort().join(",");
  useEffect(() => {
    setByChat({});
    setLoadError("");
    const stops = chatIds.split(",").filter(Boolean).map((id) =>
      watchMessages(id, (msgs) => setByChat((prev) => ({ ...prev, [id]: msgs })), (err) => setLoadError(
        err.code === "permission-denied"
          ? "Firebase blocked reading these messages (permission denied). Publish the latest firestore.rules in the Firebase console."
          : isFirestoreStuck(err)
            ? "The connection to the database got stuck. Reload the page to fix it."
            : err.message
      ))
    );
    return () => stops.forEach((stop) => stop());
  }, [chatIds]);
  const loading = chatIds.split(",").filter(Boolean).some((id) => !byChat[id]);
  const list = Object.values(byChat).flat().sort((a, b) => a.createdAt - b.createdAt);
  const newestAt = Math.max(0, ...chats.map((c) => c.lastAt || 0));

  // Mark as read while open, and keep the newest message in view.
  useEffect(() => {
    for (const c of chats) if (isUnread(c, user)) markChatRead(user, c).catch(() => {});
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length, newestAt]);

  async function send(content) {
    if (!content.trim()) return;
    setError("");
    try {
      await sendMessage(user, primary, content);
      setText("");
    } catch (err) {
      setError("Couldn't send: " + err.message);
    }
  }

  // "Seen" goes under my last message once the other person has read up to it.
  let lastMine = -1;
  list.forEach((m, i) => { if (m.senderId === user.uid) lastMine = i; });
  const theirRead = Math.max(0, ...chats.map((c) => (c.lastRead || {})[other.id] || 0));
  const seen = lastMine >= 0 && lastMine === list.length - 1 && theirRead >= list[lastMine].createdAt;

  // A hand-off strip for each item you're still trading. If none are active, celebrate the latest one.
  const active = posts.filter((p) => p.status === "claimed");
  const done = posts.find((p) => p.status === "completed");
  const stripPosts = active.length ? active : done ? [done] : [];
  const pickups = primary.pickups || {};
  const strips = stripPosts.map((post) => {
    const { giverId, giverName, receiverName } = handoffRoles(post);
    if (post.status === "completed") {
      return (
        <div key={post.id} className="dm-strip done">
          <div className="dm-strip-row">
            <span>🎉 Hand-off complete! {post.item} was added to {receiverName}'s pantry.</span>
            <span className="dm-strip-actions"><Handoff post={post} user={user} onReview={onReview} /></span>
          </div>
        </div>
      );
    }
    const pickup = pickups[post.id];
    const iGive = giverId === user.uid;
    return (
      <div key={post.id} className="dm-strip">
        <div className="dm-strip-row">
          <span>
            {foodEmoji(post.item)} <strong>{giverName}</strong> → <strong>{receiverName}</strong> · {post.item}
            {post.quantity && ` (${post.quantity})`}
          </span>
          <span className="dm-strip-actions">
            {/* Directions are for the person receiving the food. */}
            {onDirections && tripFor(post, user, pickup) && (
              <button className="dm-directions" onClick={() => onDirections(post)} title="Walking directions" aria-label={`Walking directions for ${post.item}`}>🧭</button>
            )}
            <Handoff post={post} user={user} onReview={onReview} />
          </span>
        </div>

        {/* Pickup spot: the giver chooses (and can change) it, the receiver accepts it. */}
        <div className={pickup && pickup.accepted ? "dm-pickup agreed" : "dm-pickup"}>
          {iGive ? (
            pickup ? (
              <>
                <span>📍 <strong>{pickup.label}</strong>{pickup.accepted ? ` · ✅ ${receiverName} accepted` : ` · waiting for ${receiverName} to accept`}</span>
                {onChoosePickup && <button className="btn ghost small" onClick={() => onChoosePickup(post)}>Change</button>}
                <LiveNote liveShare={liveShare} otherId={other.id} otherName={receiverName} />
              </>
            ) : (
              <>
                <span>Where should {receiverName} pick it up?</span>
                {onChoosePickup && <button className="btn primary small" onClick={() => onChoosePickup(post)}>📍 Choose pickup spot</button>}
              </>
            )
          ) : pickup ? (
            pickup.accepted ? (
              <span>✅ Pickup at <strong>{pickup.label}</strong></span>
            ) : (
              <>
                <span>📍 {giverName} suggests <strong>{pickup.label}</strong></span>
                <span className="dm-strip-actions">
                  {onDirections && <button className="btn ghost small" onClick={() => onDirections(post)}>View</button>}
                  {onAcceptPickup && <button className="btn primary small" onClick={() => onAcceptPickup(post)}>Accept</button>}
                </span>
              </>
            )
          ) : (
            <span className="muted">Waiting for {giverName} to choose a pickup spot.</span>
          )}
        </div>
      </div>
    );
  });
  const topic = active.length ? active.map((p) => p.item).join(", ") : (posts[0] && posts[0].item) || primary.item || "";

  return (
    <section className="card dm-chat">
      <header className="dm-header">
        <button className="dm-back" onClick={onBack} aria-label="Back to all messages">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <Avatar name={other.name} photoURL={photoURL} size={40} />
        <div className="dm-header-text">
          <strong>{other.name}</strong>
          <Reputation uid={other.id} />
          {topic && <span className="muted">{foodEmoji(topic.split(", ")[0])} about {topic}</span>}
        </div>
      </header>

      {strips.length > 0 && <div className="dm-strips">{strips}</div>}

      <div className="dm-thread" ref={threadRef}>
        {/* Profile intro at the top of the thread, like Instagram */}
        <div className="dm-intro">
          <Avatar name={other.name} photoURL={photoURL} size={88} />
          <strong>{other.name}</strong>
          <Reputation uid={other.id} showNote />
          <span className="muted">Spare Shelf neighbor{topic && ` · about ${topic}`}</span>
          <span className="muted">Say hi and pick a time and place to meet.</span>
        </div>

        {loadError && <p className="error dm-load">{loadError}</p>}
        {!loadError && loading && <p className="muted dm-load">Loading messages…</p>}

        {list.map((m, i) => {
          const prev = list[i - 1];
          const next = list[i + 1];
          const mine = m.senderId === user.uid;
          const newTime = !prev || m.createdAt - prev.createdAt > GAP;
          const first = newTime || prev.senderId !== m.senderId;
          const last = !next || next.senderId !== m.senderId || next.createdAt - m.createdAt > GAP;
          const emojiOnly = EMOJI_ONLY.test(m.text);
          const cls = ["dm-msg", mine ? "mine" : "theirs", first && "first", last && "last"].filter(Boolean).join(" ");
          return (
            <div key={m.id}>
              {newTime && <div className="dm-stamp">{chatStamp(m.createdAt)}</div>}
              <div className={cls}>
                {!mine && (last
                  ? <Avatar name={other.name} photoURL={photoURL} size={28} />
                  : <span className="dm-avatar-space" />)}
                <div className={emojiOnly ? "dm-bubble emoji" : "dm-bubble"} title={chatStamp(m.createdAt)}>{m.text}</div>
              </div>
              {seen && i === lastMine && <div className="dm-seen">Seen</div>}
            </div>
          );
        })}
      </div>

      <form className="dm-composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" aria-label={`Message ${other.name}`} />
        {text.trim() ? (
          <button className="dm-send" type="submit">Send</button>
        ) : (
          <button className="dm-heart" type="button" onClick={() => send("❤️")} aria-label="Send a heart">❤️</button>
        )}
      </form>
      {error && <p className="error dm-error">{error}</p>}
    </section>
  );
}

/** Giver's note: the receiver can see your live location while you head to the pickup spot (with Pause). */
export function LiveNote({ liveShare, otherId, otherName }) {
  if (!liveShare) return null;
  const isPaused = liveShare.paused.includes(otherId);
  return (
    <span className="live-note">
      <span>
        {isPaused
          ? <>⏸ Live location paused for {otherName}.</>
          : liveShare.liveOn
            ? <>📡 {otherName} can see your live location until the hand-off is done.</>
            : <>📡 Turn on location (see the map) so {otherName} can see you coming.</>}
      </span>
      <button className="btn ghost small" onClick={() => liveShare.onTogglePause(otherId)}>{isPaused ? "Resume" : "Pause"}</button>
    </span>
  );
}
