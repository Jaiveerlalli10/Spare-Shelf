// Neighbors who live in the same dorm or apartment, and what they are sharing.
import { useEffect, useState } from "react";
import { deletePost, syncCommunity, watchCommunityMembers } from "../data";
import { communityId, communityPeople } from "../community";
import { foodEmoji } from "../foodEmoji";
import Avatar from "./Avatar";
import { useReputation } from "./Reputation";

function ItemRow({ post, mine, onClaim, onOpen }) {
  const open = post.status === "open";
  // Claimed posts from other people are hidden on the board, so there's nowhere to jump to.
  const canOpen = mine || open;
  const label = (
    <>
      <span className="community-emoji" aria-hidden>{foodEmoji(post.item)}</span>
      <span className="what">
        <strong>{post.item}</strong>
        {post.quantity && <span className="muted"> {post.quantity}</span>}
      </span>
    </>
  );
  return (
    <li className="community-item">
      {canOpen ? (
        <button type="button" className="community-open" onClick={() => onOpen(post)}
          title={mine ? "Show in My posts" : "Show on the board"}>
          {label}
        </button>
      ) : (
        <span className="community-open">{label}</span>
      )}
      {mine && open && (
        <button className="btn ghost small" onClick={() => deletePost(post)}>Delete</button>
      )}
      {mine && !open && <span className="status claimed">Claimed</span>}
      {!mine && open && (
        <button className="btn primary small" onClick={() => onClaim(post)}>
          {post.type === "offer" ? "I'll take it" : "I can help"}
        </button>
      )}
      {!mine && !open && <span className="status claimed">Claimed</span>}
    </li>
  );
}

function Column({ title, tone, posts, empty, mine, onClaim, onOpen }) {
  return (
    <div className={tone}>
      <h3>{title}</h3>
      {posts.length === 0 ? (
        <p className="muted community-empty-col">{empty}</p>
      ) : (
        <ul className="community-items">
          {posts.map((post) => (
            <ItemRow key={post.id} post={post} mine={mine} onClaim={onClaim} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonSquare({ person, mine, onClaim, onOpenPost, onOpenPerson }) {
  const summary = useReputation(person.uid);
  const score = summary ? summary.average.toFixed(1) : "";
  const reviewLabel = summary
    ? `${score} stars from ${summary.count} review${summary.count === 1 ? "" : "s"}`
    : "No ratings yet";
  return (
    <div className={`card community-card${mine ? " mine" : ""}`}>
      <button type="button" className="community-card-top" onClick={() => onOpenPerson(person)}
        title={mine ? "Show My posts" : `Show ${person.name}'s posts on the board`}>
        <Avatar name={person.name} photoURL={person.photoURL} size="md" />
        <div className="community-card-id">
          <strong>{mine ? `${person.name} (you)` : person.name}</strong>
          <span className="rep" aria-label={reviewLabel}>
            {summary ? (
              <>
                <span className="rep-score">★ {score}</span>
                <span className="muted community-count">{summary.count}</span>
              </>
            ) : (
              <span className="muted community-count">No ratings yet</span>
            )}
          </span>
          {summary && summary.tags.length > 0 && (
            <span className="community-tags">
              {summary.tags.slice(0, 2).map((tag) => <span key={tag} className="rep-tag">{tag}</span>)}
            </span>
          )}
        </div>
      </button>
      <div className="community-card-body">
        <Column title="Offering" tone="offers" posts={person.offers} empty="Nothing offered right now" mine={mine} onClaim={onClaim} onOpen={onOpenPost} />
        <Column title="Looking to buy" tone="requests" posts={person.requests} empty="Not looking for anything right now" mine={mine} onClaim={onClaim} onOpen={onOpenPost} />
      </div>
    </div>
  );
}

function CommunityGrid({ people, user, onClaim, onOpenPost, onOpenPerson }) {
  const mine = people.find((person) => person.uid === user.uid);
  const others = people.filter((person) => person.uid !== user.uid);
  const squares = (list, isMine) => list.map((person) => (
    <PersonSquare key={person.uid} person={person} mine={isMine} onClaim={onClaim}
      onOpenPost={onOpenPost} onOpenPerson={onOpenPerson} />
  ));
  if (!mine) return <div className="community-grid">{squares(people, false)}</div>;
  return (
    <div className="community-layout">
      <div className="community-pin">{squares([mine], true)}</div>
      {others.length > 0 && <div className="community-grid">{squares(others, false)}</div>}
    </div>
  );
}

export default function Community({ user, profile, posts, onOpenPost, onOpenPerson, onClaim }) {
  const id = communityId(profile.universityName, profile.housingLabel);
  const place = profile.housingLabel;
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    setError("");
    setReady(false);
    setMembers([]);
    syncCommunity(user, profile)
      .then(() => {
        if (cancelled) return;
        stop = watchCommunityMembers(id, (list) => {
          if (cancelled) return;
          setMembers(list);
          setReady(true);
        }, () => {
          if (cancelled) return;
          setReady(true);
          setError(`The rest of ${place} could not be loaded. Publish the latest Firestore rules, then refresh.`);
        });
      })
      .catch(() => {
        if (cancelled) return;
        setReady(true);
        setError(`Could not add you to ${place}. Publish the latest Firestore rules, then refresh.`);
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [user.uid, id, user.name, profile.photoURL, place]);

  const people = communityPeople({
    me: { uid: user.uid, name: user.name, photoURL: profile.photoURL || "" },
    members,
    posts,
    search,
  });
  const others = people.filter((person) => person.uid !== user.uid);
  const anyNeighbors = members.some((member) => member.uid !== user.uid);
  const term = search.trim();

  return (
    <section className="community">
      <input
        className="search community-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search names or items in ${place}`}
        aria-label={`Search names or items in ${place}`}
      />
      {error && <p className="error community-note">{error}</p>}
      {!error && ready && !term && others.length === 0 && (
        <p className="muted community-note">
          {anyNeighbors
            ? `No one else in ${place} has anything open right now. New offers and requests show up here.`
            : `You're the first from ${place} on Spare Shelf. When a neighbor joins with this same dorm or apartment, their offers and requests show up here.`}
        </p>
      )}

      {!ready ? (
        <p className="empty">Loading {place}…</p>
      ) : term && people.length === 0 ? (
        <p className="empty">No one in {place} matches “{term}”.</p>
      ) : (
        <CommunityGrid people={people} user={user} onClaim={onClaim} onOpenPost={onOpenPost} onOpenPerson={onOpenPerson} />
      )}
    </section>
  );
}
