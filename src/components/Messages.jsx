// The Messages tab, Instagram-DM style: an inbox of chats, or one open chat.
import { isUnread } from "../data";
import { shortAgo } from "../dates";
import { foodEmoji } from "../foodEmoji";
import { usePeople } from "../usePeople";
import Avatar from "./Avatar";
import Reputation from "./Reputation";
import ChatView from "./ChatView";
import ErrorBoundary from "./ErrorBoundary";

/** The person on the other side of this chat. */
export function otherPerson(chat, user) {
  return chat.ownerId === user.uid
    ? { id: chat.claimerId, name: chat.claimerName }
    : { id: chat.ownerId, name: chat.ownerName };
}

export default function Messages({ user, chats, posts, openChatId, onOpen, onBack, onReview }) {
  const people = usePeople(chats.map((c) => otherPerson(c, user).id));

  if (openChatId) {
    const chat = chats.find((c) => c.id === openChatId);
    if (!chat) return <p className="empty">Opening chat…</p>;
    const other = otherPerson(chat, user);
    return (
      <ErrorBoundary key={chat.id} label="This chat">
        <ChatView user={user} chat={chat} post={posts.find((p) => p.id === chat.postId)}
          other={other} photoURL={people[other.id]?.photoURL} onBack={onBack} onReview={onReview} />
      </ErrorBoundary>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="card dm-empty">
        <span className="dm-empty-icon" aria-hidden>💬</span>
        <h3>Your messages</h3>
        <p className="muted">Claim a post on the board to start chatting with a neighbor.</p>
      </div>
    );
  }

  return (
    <div className="card dm-inbox">
      {chats.map((chat) => {
        const other = otherPerson(chat, user);
        const unread = isUnread(chat, user);
        const post = posts.find((p) => p.id === chat.postId);
        const preview = chat.lastMessage
          ? `${chat.lastSenderId === user.uid ? "You: " : ""}${chat.lastMessage}`
          : "Say hi 👋";
        return (
          <button key={chat.id} className={unread ? "dm-row unread" : "dm-row"} onClick={() => onOpen(chat.id)}>
            <span className={unread ? "dm-avatar ring" : "dm-avatar"}>
              <Avatar name={other.name} photoURL={people[other.id]?.photoURL} size={56} />
              <span className="dm-badge" aria-hidden>{foodEmoji(chat.item)}</span>
            </span>
            <span className="dm-text">
              <span className="dm-name">{other.name} <Reputation uid={other.id} tagLimit={1} /></span>
              <span className="dm-preview">
                <span className="dm-snippet">{preview}</span>
                {chat.lastAt > 0 && <span className="dm-time"> · {shortAgo(chat.lastAt)}</span>}
              </span>
              <span className="dm-about">
                about {chat.item}{post && post.status === "completed" && <span className="dm-done"> · ✓ Done</span>}
              </span>
            </span>
            {unread && <span className="dm-dot" aria-label="Unread" />}
          </button>
        );
      })}
    </div>
  );
}
