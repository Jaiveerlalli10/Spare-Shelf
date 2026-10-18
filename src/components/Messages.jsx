// The Messages tab, Instagram-DM style: one conversation per person, or one open conversation.
import { isUnread, chatOther } from "../data";
import { shortAgo } from "../dates";
import { usePeople } from "../usePeople";
import Avatar from "./Avatar";
import Reputation from "./Reputation";
import ChatView from "./ChatView";
import ErrorBoundary from "./ErrorBoundary";

/**
 * Groups chats by the other person, so all chats with the same neighbor (the shared pair chat,
 * plus any older one-chat-per-post chats) show up as ONE conversation.
 */
function groupByPerson(chats, user) {
  const byPerson = new Map();
  for (const chat of chats) {
    const other = chatOther(chat, user);
    if (!other.id) continue;
    const group = byPerson.get(other.id) || { other, chats: [] };
    group.chats.push(chat);
    if (chat.names && chat.names[other.id]) group.other = other; // prefer the name stored on the pair chat
    byPerson.set(other.id, group);
  }
  return [...byPerson.values()]
    .map((g) => ({
      ...g,
      latest: g.chats.reduce((a, b) => ((b.lastAt || 0) > (a.lastAt || 0) ? b : a)),
      unread: g.chats.some((c) => isUnread(c, user)),
    }))
    .sort((a, b) => (b.latest.lastAt || 0) - (a.latest.lastAt || 0));
}

// `openWith` is the uid of the person whose conversation is open (or null for the inbox).
// Like Instagram, it's just conversations: a photo, name (with their rating), last message and time per person.
export default function Messages({ user, chats, openWith, onOpen, onBack }) {
  const groups = groupByPerson(chats, user);
  const people = usePeople(groups.map((g) => g.other.id));

  if (openWith) {
    const group = groups.find((g) => g.other.id === openWith);
    if (!group) return <p className="empty">Opening chat…</p>;
    return (
      <ErrorBoundary key={openWith} label="This chat">
        <ChatView user={user} other={group.other} chats={group.chats} photoURL={people[openWith]?.photoURL} onBack={onBack} />
      </ErrorBoundary>
    );
  }

  if (groups.length === 0) {
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
      {groups.map(({ other, latest, unread }) => {
        const preview = latest.lastMessage
          ? `${latest.lastSenderId === user.uid ? "You: " : ""}${latest.lastMessage}`
          : "Say hi 👋";
        return (
          <button key={other.id} className={unread ? "dm-row unread" : "dm-row"} onClick={() => onOpen(other.id)}>
            <span className={unread ? "dm-avatar ring" : "dm-avatar"}>
              <Avatar name={other.name} photoURL={people[other.id]?.photoURL} size={56} />
            </span>
            <span className="dm-text">
              <span className="dm-name">{other.name} <Reputation uid={other.id} tagLimit={1} /></span>
              <span className="dm-preview">
                <span className="dm-snippet">{preview}</span>
                {latest.lastAt > 0 && <span className="dm-time"> · {shortAgo(latest.lastAt)}</span>}
              </span>
            </span>
            {unread && <span className="dm-dot" aria-label="Unread" />}
          </button>
        );
      })}
    </div>
  );
}
