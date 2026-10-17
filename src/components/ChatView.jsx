// One conversation about one post, with the hand-off confirmation at the top.
import { useEffect, useRef, useState } from "react";
import { watchMessages, sendMessage, markChatRead, isUnread, handoffRoles } from "../data";
import Handoff from "./Handoff";

export default function ChatView({ user, chat, post, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => watchMessages(chat.id, setMessages), [chat.id]);

  // Mark as read while the chat is open, and keep the newest message in view.
  useEffect(() => {
    if (isUnread(chat, user)) markChatRead(user, chat).catch(() => {});
    if (bottomRef.current) bottomRef.current.scrollIntoView({ block: "nearest" });
  }, [messages.length, chat.lastAt]);

  const other = chat.ownerId === user.uid ? chat.claimerName : chat.ownerName;

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setError("");
    try {
      await sendMessage(user, chat, text);
      setText("");
    } catch (err) {
      setError("Couldn't send: " + err.message);
    }
  }

  let handoffInfo = null;
  if (post) {
    const { giverName, receiverName } = handoffRoles(post);
    handoffInfo = (
      <div className={post.status === "completed" ? "card handoff done" : "card handoff"}>
        {post.status === "completed" ? (
          <p className="handoff-title">
            🎉 Hand-off complete! {post.item} was added to {receiverName}'s pantry. Thanks for keeping food out of the trash.
          </p>
        ) : (
          <p className="handoff-title">
            {giverName} → {receiverName}: <strong>{post.item}</strong>{post.quantity && ` · ${post.quantity}`}
            <span className="muted"> · 📍 {post.location}</span>
          </p>
        )}
        {post.status !== "completed" && (
          <>
            <p className="muted">Pick a time and place to meet. After the hand-off, both of you confirm here.</p>
            <div className="actions"><Handoff post={post} user={user} /></div>
          </>
        )}
      </div>
    );
  }

  return (
    <section className="chat">
      <button className="link back" onClick={onBack}>← All messages</button>
      <h2 className="chat-title">{other} <span className="muted">· about {chat.item}</span></h2>

      {handoffInfo || <p className="muted">This post was deleted.</p>}

      <div className="card messages">
        {messages.length === 0 && <p className="muted">No messages yet. Say hi and suggest a pickup time.</p>}
        {messages.map((m) => (
          <div key={m.id} className={m.senderId === user.uid ? "bubble mine" : "bubble theirs"}>
            {m.text}
            <span className="bubble-time">
              {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${other}…`} />
        <button className="btn primary" disabled={!text.trim()}>Send</button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
