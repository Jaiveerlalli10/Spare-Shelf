// The Messages tab, Instagram-DM style: one conversation per person, or one open conversation.
import { isUnread, chatOther } from "../data";
import { shortAgo } from "../dates";
import { foodEmoji } from "../foodEmoji";
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

/** Claimed posts between you and one neighbor (either of you can be the poster), newest first. */
export function postsBetween(posts, user, otherId) {
  return posts
    .filter((p) => p.claimedById && (
      (p.ownerId === user.uid && p.claimedById === otherId) || (p.ownerId === otherId && p.claimedById === user.uid)
    ))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** "Eggs, Rice": items you're still trading with this person (or the last thing you talked about). */
function topicLabel(between, latest) {
  const active = between.filter((p) => p.status === "claimed").map((p) => p.item);
  if (active.length) return active.join(", ");
  return (between[0] && between[0].item) || latest.item || "";
}

// `openWith` is the uid of the person whose conversation is open (or null for the inbox).
export default function Messages({ user, chats, posts, openWith, onOpen, onBack, onDirections, onReview }) {
  const groups = groupByPerson(chats, user);
  const people = usePeople(groups.map((g) => g.other.id));

  if (openWith) {
    const group = groups.find((g) => g.other.id === openWith);
    if (!group) return <p className="empty">Opening chat…</p>;
    return (
      <ErrorBoundary key={openWith} label="This chat">
        <ChatView user={user} other={group.other} chats={group.chats} posts={postsBetween(posts, user, openWith)}
          photoURL={people[openWith]?.photoURL} onBack={onBack} onDirections={onDirections} onReview={onReview} />
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
        const between = postsBetween(posts, user, other.id);
        const topic = topicLabel(between, latest);
        const allDone = between.length > 0 && between.every((p) => p.status === "completed");
        const preview = latest.lastMessage
          ? `${latest.lastSenderId === user.uid ? "You: " : ""}${latest.lastMessage}`
          : "Say hi 👋";
        return (
          <button key={other.id} className={unread ? "dm-row unread" : "dm-row"} onClick={() => onOpen(other.id)}>
            <span className={unread ? "dm-avatar ring" : "dm-avatar"}>
              <Avatar name={other.name} photoURL={people[other.id]?.photoURL} size={56} />
              {topic && <span className="dm-badge" aria-hidden>{foodEmoji(topic.split(", ")[0])}</span>}
            </span>
            <span className="dm-text">
              <span className="dm-name">{other.name} <Reputation uid={other.id} tagLimit={1} /></span>
              <span className="dm-preview">
                <span className="dm-snippet">{preview}</span>
                {latest.lastAt > 0 && <span className="dm-time"> · {shortAgo(latest.lastAt)}</span>}
              </span>
              {topic && (
                <span className="dm-about">about {topic}{allDone && <span className="dm-done"> · ✓ Done</span>}</span>
              )}
            </span>
            {unread && <span className="dm-dot" aria-label="Unread" />}
          </button>
        );
      })}
    </div>
  );
}
