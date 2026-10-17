// The Messages tab: a list of your chats, or one open chat.
import { isUnread } from "../data";
import ChatView from "./ChatView";

function otherName(chat, user) {
  return chat.ownerId === user.uid ? chat.claimerName : chat.ownerName;
}

export default function Messages({ user, chats, posts, openChatId, onOpen, onBack }) {
  const open = chats.find((c) => c.id === openChatId);
  if (openChatId) {
    if (!open) return <p className="empty">Opening chat…</p>;
    return <ChatView user={user} chat={open} post={posts.find((p) => p.id === open.postId)} onBack={onBack} />;
  }

  if (chats.length === 0) {
    return <p className="empty">No messages yet. Claim a post on the board to start a chat.</p>;
  }

  return (
    <ul className="chat-list">
      {chats.map((chat) => {
        const post = posts.find((p) => p.id === chat.postId);
        const unread = isUnread(chat, user);
        return (
          <li key={chat.id}>
            <button className={unread ? "card chat-row unread" : "card chat-row"} onClick={() => onOpen(chat.id)}>
              <div className="chat-row-top">
                <strong>{otherName(chat, user)}</strong>
                <span className="muted">about {chat.item}</span>
                {post && post.status === "completed" && <span className="status done">✓ Done</span>}
                {unread && <span className="dot" aria-label="unread" />}
              </div>
              <span className="chat-preview">
                {chat.lastMessage
                  ? `${chat.lastSenderId === user.uid ? "You: " : ""}${chat.lastMessage}`
                  : "No messages yet. Say hi!"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
