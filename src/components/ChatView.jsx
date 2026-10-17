// One conversation, Instagram-DM style: header, hand-off strip, grouped bubbles, "Seen", composer.
import { useEffect, useRef, useState } from "react";
import { watchMessages, sendMessage, markChatRead, isUnread, handoffRoles, isFirestoreStuck } from "../data";
import { chatStamp } from "../dates";
import { foodEmoji } from "../foodEmoji";
import Avatar from "./Avatar";
import Handoff from "./Handoff";

const GAP = 15 * 60 * 1000; // messages more than 15 minutes apart get a timestamp and a new group
const EMOJI_ONLY = /^(\p{Extended_Pictographic}|️|‍|\s){1,12}$/u;

export default function ChatView({ user, chat, post, other, photoURL, onBack }) {
  const [messages, setMessages] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const threadRef = useRef(null);

  useEffect(() => {
    setMessages(null);
    setLoadError("");
    return watchMessages(chat.id, setMessages, (err) => setLoadError(
      err.code === "permission-denied"
        ? "Firebase blocked reading these messages (permission denied). Publish the latest firestore.rules in the Firebase console."
        : isFirestoreStuck(err)
          ? "The connection to the database got stuck. Reload the page to fix it."
          : err.message
    ));
  }, [chat.id]);
  const list = messages || [];

  // Mark as read while open, and keep the newest message in view.
  useEffect(() => {
    if (isUnread(chat, user)) markChatRead(user, chat).catch(() => {});
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length, chat.lastAt]);

  async function send(content) {
    if (!content.trim()) return;
    setError("");
    try {
      await sendMessage(user, chat, content);
      setText("");
    } catch (err) {
      setError("Couldn't send: " + err.message);
    }
  }

  // "Seen" goes under my last message once the other person has read up to it.
  let lastMine = -1;
  list.forEach((m, i) => { if (m.senderId === user.uid) lastMine = i; });
  const theirRead = (chat.lastRead || {})[other.id] || 0;
  const seen = lastMine >= 0 && lastMine === list.length - 1 && theirRead >= list[lastMine].createdAt;

  let strip = <div className="dm-strip">This post was deleted.</div>;
  if (post && post.status === "open") {
    strip = null; // not claimed (yet), so there's no hand-off to show
  } else if (post) {
    const { giverName, receiverName } = handoffRoles(post);
    strip = post.status === "completed" ? (
      <div className="dm-strip done">🎉 Hand-off complete! {post.item} was added to {receiverName}'s pantry.</div>
    ) : (
      <div className="dm-strip">
        <span>
          <strong>{giverName}</strong> → <strong>{receiverName}</strong> · {post.item}{post.quantity && ` (${post.quantity})`}
        </span>
        <span className="dm-strip-actions"><Handoff post={post} user={user} /></span>
      </div>
    );
  }

  return (
    <section className="card dm-chat">
      <header className="dm-header">
        <button className="dm-back" onClick={onBack} aria-label="Back to all messages">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <Avatar name={other.name} photoURL={photoURL} size={40} />
        <div className="dm-header-text">
          <strong>{other.name}</strong>
          <span className="muted">{foodEmoji(chat.item)} about {chat.item}{post && ` · 📍 ${post.location}`}</span>
        </div>
      </header>

      {strip}

      <div className="dm-thread" ref={threadRef}>
        {/* Profile intro at the top of the thread, like Instagram */}
        <div className="dm-intro">
          <Avatar name={other.name} photoURL={photoURL} size={88} />
          <strong>{other.name}</strong>
          <span className="muted">Spare Shelf neighbor · about {chat.item}</span>
          <span className="muted">Say hi and pick a time and place to meet.</span>
        </div>

        {loadError && <p className="error dm-load">{loadError}</p>}
        {!loadError && messages === null && <p className="muted dm-load">Loading messages…</p>}

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
