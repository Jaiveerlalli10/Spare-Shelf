// One conversation with one neighbor, Instagram-DM style: a header (back, photo, name, rating),
// a profile intro at the top of the thread, the grouped bubbles with "Seen", and the composer.
// Hand-off actions (confirming, pickup spots, reviews, directions) live on the post cards and the map.
//
// `chats` is every chat doc with this person: the shared pair chat plus any older per-post chats.
// Their messages are merged into one thread; new messages always go to the pair chat.
import { useEffect, useRef, useState } from "react";
import { watchMessages, sendMessage, markChatRead, isUnread, isFirestoreStuck, pairId, ensurePairChat } from "../data";
import { chatStamp } from "../dates";
import Avatar from "./Avatar";
import Reputation from "./Reputation";

const GAP = 15 * 60 * 1000; // messages more than 15 minutes apart get a timestamp and a new group
const EMOJI_ONLY = /^(\p{Extended_Pictographic}|️|‍|\s){1,12}$/u;

export default function ChatView({ user, other, chats, photoURL, onBack }) {
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
        </div>
      </header>

      <div className="dm-thread" ref={threadRef}>
        {/* Profile intro at the top of the thread, like Instagram */}
        <div className="dm-intro">
          <Avatar name={other.name} photoURL={photoURL} size={88} />
          <strong>{other.name}</strong>
          <Reputation uid={other.id} showNote />
          <span className="muted">Spare Shelf neighbor</span>
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
