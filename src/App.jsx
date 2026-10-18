// The main screen. Holds the shared state (who's signed in + all posts)
// and passes it down to the smaller components.
import { useEffect, useRef, useState } from "react";
import { watchUser, watchPosts, watchProfile, savePublicProfile, syncCommunity, claimPost, clearHistory, clearedFromHistory, HISTORY_KEEP_DAYS, addLocationToPost, addClaimerLocation, setPickupSpot, setPostPickup, acceptPickupSpot, declinePickupSpot, pickupsFor, handoffRoles, stopSharingLiveLocation, watchChats, ensureChat, isUnread, chatOther, signIn, signOut, isDemoMode, isProfileComplete, resetDemoData } from "./data";
import ImpactBar from "./components/ImpactBar";
import PostForm from "./components/PostForm";
import PostCard from "./components/PostCard";
import Pantry from "./components/Pantry";
import ProfileSetup from "./components/ProfileSetup";
import Avatar from "./components/Avatar";
import Recipes from "./components/Recipes";
import Messages from "./components/Messages";
import ReviewSheet from "./components/ReviewSheet";
import Community from "./components/Community";
import { communityId } from "./community";
import { milesToPost, publicPlaceLabel } from "./location";
import MapPanel from "./components/MapPanel";
import { useDeviceLocation } from "./useDeviceLocation";
import { useLiveSharing } from "./useLiveSharing";

export default function App() {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [tab, setTab] = useState("board"); // "board", "community", "mine", "history", "pantry", "recipes" or "messages"
  const [filter, setFilter] = useState("all"); // "all", "offer", "request"
  const [sort, setSort] = useState("newest"); // "newest" or "nearest"
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(null); // pre-filled post when sharing from the pantry
  const [profile, setProfile] = useState(null);
  const [profileState, setProfileState] = useState("idle"); // "idle" | "loading" | "ready"
  const [editing, setEditing] = useState(false);
  const [chats, setChats] = useState([]);
  const [openChatWith, setOpenChatWith] = useState(null); // uid of the person whose chat is open
  const [mapTargetId, setMapTargetId] = useState(null); // post shown with directions on the map
  const [reviewPost, setReviewPost] = useState(null);
  const uid = user ? user.uid : null;

  // Start listening to sign-in state and posts when the page loads.
  useEffect(() => watchUser(setUser), []);
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileState("idle");
      setEditing(false);
      setReviewPost(null);
      return;
    }
    setProfileState("loading");
    return watchProfile(user, (next) => {
      setProfile(next);
      setProfileState("ready");
    });
  }, [uid]);
  // The live database only lets signed-in users read, so (re)start listening whenever the user changes.
  useEffect(() => {
    if (!uid && !isDemoMode) {
      setPosts([]);
      return;
    }
    return watchPosts(setPosts);
  }, [uid]);

  // Chats belong to a user, so only listen while someone is signed in.
  useEffect(() => {
    if (!user) {
      setChats([]);
      setOpenChatWith(null);
      return;
    }
    return watchChats(user, setChats);
  }, [uid]);
  // Number of PEOPLE with unread messages (older per-post chats with the same person count once).
  const unreadCount = user ? new Set(chats.filter((c) => isUnread(c, user)).map((c) => chatOther(c, user).id)).size : 0;

  // "Message" buttons: make sure the chat exists, then open it on the Messages tab.
  async function openChat(post) {
    try {
      await ensureChat(post);
      setOpenChatWith(post.ownerId === user.uid ? post.claimedById : post.ownerId);
      setTab("messages");
      window.scrollTo({ top: 0 });
    } catch (err) {
      alert("Couldn't open the chat: " + err.message + " (were the latest Firestore rules published?)");
    }
  }

  // Every tab except the board needs a signed-in user; fall back to the board otherwise.
  const activeTab = user ? tab : "board";

  function openForm(prefill) {
    setDraft(prefill ? { ...prefill, key: Date.now() } : null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setDraft(null);
  }

  // Switch to the board with the post form already filled in.
  function startPost(prefill) {
    setTab("board");
    openForm(prefill);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const complete = profileState === "ready" && isProfileComplete(profile);
  const needsProfile = profileState === "ready" && !complete;
  const showApp = !user || complete;
  // Share my name + photo so neighbors see my picture in Messages.
  const myPhoto = complete ? (profile.photoURL || user.photoURL || "") : null;
  useEffect(() => {
    if (myPhoto === null) return;
    savePublicProfile(user, myPhoto).catch((err) => console.error("Couldn't share profile picture:", err));
  }, [uid, myPhoto]);

  // Join my dorm or apartment as soon as I sign in, so neighbors see me
  // even if I never open the Community tab or I'm offline right now.
  const myCommunity = complete ? communityId(profile.universityName, profile.housingLabel) : "";
  useEffect(() => {
    if (!myCommunity) return;
    syncCommunity(user, profile).catch((err) => console.error("Couldn't join your dorm or apartment:", err));
  }, [uid, myCommunity, user && user.name, myPhoto]);

  // Where the viewer lives (from their profile), used for "0.3 mi away".
  const here = complete ? { lat: profile.housingLat, lng: profile.housingLng } : null;

  // Posts made before distances existed have no location, so they can't go on the map.
  // When their owner opens the app, fill it in from the owner's profile (rounded to ~200 m).
  const locationFixesTried = useRef(new Set());
  useEffect(() => {
    if (!here) return;
    for (const p of posts) {
      const needsSpot = p.ownerId === uid && p.status !== "completed" && !Number.isFinite(p.approxLat);
      if (needsSpot && !locationFixesTried.current.has(p.id)) {
        locationFixesTried.current.add(p.id);
        addLocationToPost(p, here).catch((err) => console.error("Couldn't add a location to an old post:", err));
      }
      // Same for requests I agreed to help with before claims saved a location (so the requester can find me).
      const needsClaimerSpot = p.claimedById === uid && p.status === "claimed" && !Number.isFinite(p.claimerApproxLat);
      const key = "claim:" + p.id;
      if (needsClaimerSpot && !locationFixesTried.current.has(key)) {
        locationFixesTried.current.add(key);
        addClaimerLocation(p, here).catch((err) => console.error("Couldn't add a claimer location:", err));
      }
    }
  }, [uid, here?.lat, here?.lng, posts]);

  // Pantry "Share" button -> Offer post.
  function shareFromPantry(item) {
    startPost({ type: "offer", pantryItemId: item.id, item: item.name, quantity: item.quantity, expiresOn: item.expiresOn });
  }

  // Recipe "Request it" button -> Request post for a missing ingredient.
  function requestIngredient(ing) {
    const item = ing.name.charAt(0).toUpperCase() + ing.name.slice(1);
    startPost({ type: "request", item, quantity: ing.amount });
  }

  const onPostsTab = activeTab === "board" || activeTab === "mine";

  const term = search.trim().toLowerCase();
  const visible = posts.filter((p) => {
    // The board only shows what you can still respond to: open posts from other people.
    // Your own posts and ones you claimed live under "My posts".
    if (activeTab === "board" && (p.status !== "open" || (user && p.ownerId === user.uid))) return false;
    const involved = user && (p.ownerId === user.uid || p.claimedById === user.uid);
    // My posts: still in progress. History: hand-offs that are done.
    if (activeTab === "mine" && !(involved && p.status !== "completed")) return false;
    if (activeTab === "history" && !(involved && p.status === "completed" && !clearedFromHistory(p, user))) return false;
    if (filter !== "all" && p.type !== filter) return false;
    if (term && !`${p.item} ${p.location} ${p.notes} ${p.ownerName}`.toLowerCase().includes(term)) return false;
    return true;
  });
  // "Nearest": closest first; posts with no location go last. (Posts already arrive newest first.)
  if (sort === "nearest" && here) {
    const away = (p) => milesToPost(here, p) ?? Infinity;
    visible.sort((a, b) => away(a) - away(b));
  }

  // From the Community tab: open a post on the board (or "My posts" if it's yours) and
  // scroll to it, or show everything one person has on the board.
  const [focusPostId, setFocusPostId] = useState(null);
  function openPost(post) {
    const mine = user && (post.ownerId === user.uid || post.claimedById === user.uid);
    setTab(!mine ? "board" : post.status === "completed" ? "history" : "mine");
    setFilter("all");
    setSearch("");
    setFocusPostId(post.id);
  }
  function openPerson(person) {
    setTab(user && person.uid === user.uid ? "mine" : "board");
    setFilter("all");
    setSearch(user && person.uid === user.uid ? "" : person.name || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  // "I'll take it" / "I can help" anywhere: claim it, then show it under "My posts".
  async function claim(post) {
    try {
      await claimPost(user, post, here);
    } catch (err) {
      alert("Couldn't respond: " + err.message);
      return;
    }
    setTab("mine");
    setFilter("all");
    setSearch("");
    setFocusPostId(post.id);
  }
  // Scroll to the focused post once its card is on the page (a fresh claim can take a moment to show up).
  const focusScrolled = useRef(null);
  useEffect(() => {
    if (!focusPostId) return;
    const el = document.getElementById(`post-${focusPostId}`);
    if (el && focusScrolled.current !== focusPostId) {
      focusScrolled.current = focusPostId;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusPostId, activeTab, posts]);
  useEffect(() => {
    if (!focusPostId) return;
    const done = setTimeout(() => { setFocusPostId(null); focusScrolled.current = null; }, 2500);
    return () => clearTimeout(done);
  }, [focusPostId]);

  const [clearing, setClearing] = useState(false);
  async function onClearHistory() {
    const ok = window.confirm(
      `Clear your history? These hand-offs disappear from your History now. ` +
      `The other person still sees them until they clear theirs too, ` +
      `and ${HISTORY_KEEP_DAYS} days after that they're permanently deleted.`
    );
    if (!ok) return;
    setClearing(true);
    try {
      await clearHistory(user, posts);
    } catch (err) {
      alert("Couldn't clear your history: " + err.message);
    } finally {
      setClearing(false);
    }
  }

  const mapTarget = posts.find((p) => p.id === mapTargetId) || null;

  // ---------- Live location + pickup spots ----------
  // Your device location (the browser asks once the app is ready), used as the start of directions.
  const device = useDeviceLocation(Boolean(complete));

  // Pickup spot in effect for each post: { [postId]: { lat, lng, label, accepted, ... } }.
  // Set in your chat after a claim (private), or listed on the offer when it was posted.
  // A spot the receiver declined doesn't count: no directions or live location to it,
  // and the giver is asked to choose another one.
  const pickups = {};
  const declinedPickups = {};
  for (const [postId, spot] of Object.entries(pickupsFor(posts, chats))) {
    if (spot.declined) declinedPickups[postId] = spot;
    else pickups[postId] = spot;
  }

  // Picking mode on the map: { key, title, subtitle, initial, save(spot) }.
  const [pickRequest, setPickRequest] = useState(null);
  function startPicking(request) {
    setMapTargetId(null);
    setPickRequest(request);
    if (window.innerWidth <= 1200) {
      const el = document.getElementById("map-panel");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  // "📍 Choose pickup spot" on a post: on an unclaimed offer it's saved on the post (public);
  // once claimed it's saved in your chat, and the other person accepts or declines it.
  function choosePickup(post) {
    const claimed = post.status === "claimed";
    const other = post.ownerId === uid ? post.claimedByName : post.ownerName;
    startPicking({
      key: post.id,
      subtitle: claimed ? `for ${post.item} with ${other}` : `for your ${post.item} offer`,
      initial: pickups[post.id] || declinedPickups[post.id] || null,
      save: async (spot) => {
        if (claimed) await setPickupSpot(user, post, spot);
        else await setPostPickup(post, spot);
        setMapTargetId(post.id); // show the spot you just chose
      },
    });
  }
  // From the new-post form, before the offer exists.
  function pickForDraft(current, item, onPicked) {
    startPicking({ key: "draft", subtitle: `for ${item || "your offer"}`, initial: current, save: async (spot) => onPicked(spot) });
  }
  async function savePick(request, spot) {
    await request.save(spot);
    setPickRequest(null);
  }
  // ---------- Live location during a hand-off ----------
  // Once a hand-off has a pickup spot, BOTH people see each other's live location (and ETA to the
  // spot). You can pause yours per person; it stops by itself once the hand-off is done.
  const pauseKey = uid ? `spareShelf.pausedSharing.${uid}` : "";
  const [paused, setPaused] = useState([]); // receivers I paused sharing with
  useEffect(() => {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(pauseKey) || "[]"); } catch { /* ignore */ }
    setPaused(Array.isArray(saved) ? saved : []);
  }, [pauseKey]);
  function togglePauseSharing(otherId) {
    const next = paused.includes(otherId) ? paused.filter((id) => id !== otherId) : [...paused, otherId];
    setPaused(next);
    try { localStorage.setItem(pauseKey, JSON.stringify(next)); } catch { /* ignore */ }
  }
  const partnersWithSpot = [...new Set(
    posts.filter((p) => user && p.status === "claimed" && pickups[p.id] && (p.ownerId === uid || p.claimedById === uid))
      .map((p) => (p.ownerId === uid ? p.claimedById : p.ownerId))
  )].sort();
  const sharingWith = partnersWithSpot.filter((id) => !paused.includes(id));
  // When sharing stops for someone (paused, or the hand-off finished), delete my live location for them.
  const sharedBefore = useRef([]);
  useEffect(() => {
    for (const id of sharedBefore.current) {
      if (!sharingWith.includes(id)) stopSharingLiveLocation(user, id).catch(() => {});
    }
    sharedBefore.current = sharingWith;
  }, [sharingWith.join(",")]);
  useLiveSharing(user, device.pos, sharingWith);
  const liveShare = { sharingWith, paused, onTogglePause: togglePauseSharing, liveOn: device.status === "on" };

  async function acceptPickup(post) {
    try {
      await acceptPickupSpot(user, post, pickups[post.id]);
    } catch (err) {
      alert("Couldn't accept the pickup spot: " + err.message);
    }
  }
  // Decline, then open the map right away so you can suggest a spot that works for you.
  async function declinePickup(post) {
    try {
      await declinePickupSpot(user, post, pickups[post.id]);
    } catch (err) {
      alert("Couldn't decline the pickup spot: " + err.message);
      return;
    }
    choosePickup(post);
  }

  // "🧭 Directions" buttons: select the post on the map. On narrow screens the map sits
  // above the page content, so scroll up to it.
  function showDirections(post) {
    setMapTargetId(post.id);
    if (window.innerWidth <= 1200) {
      const el = document.getElementById("map-panel");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const TABS = [
    // `tone` gives each section its own color (see the .tone-* classes in styles.css).
    { id: "board", label: "Board", icon: "🏠", tone: "basil", title: "Board", sub: "What your neighbors are offering and asking for." },
    { id: "community", label: "Community", icon: "🏘️", tone: "berry", title: complete ? profile.housingLabel : "Community", sub: complete ? `Neighbors in ${profile.housingLabel}. Offer extras, or grab something without a trip to the store.` : "What your dorm or apartment is offering and looking for." },
    { id: "mine", label: "My posts", icon: "📝", tone: "sky", title: "My posts", sub: "Posts you made or claimed that aren't shared yet." },
    { id: "history", label: "History", icon: "🕘", tone: "basil", title: "History", sub: "Everything you've shared or received." },
    { id: "pantry", label: "Pantry", icon: "🥫", tone: "saffron", title: "Pantry", sub: "What you have at home. Only you can see this." },
    { id: "recipes", label: "Recipes", icon: "🍳", tone: "tomato", title: "Recipes", sub: "Cook with what you have. Borrow the rest." },
    { id: "messages", label: "Messages", icon: "💬", tone: "plum", title: "Messages", sub: "Plan pickups with your neighbors." },
  ];
  const page = TABS.find((t) => t.id === activeTab);

  // Sidebar "+ New post": works from any tab by jumping to the board.
  function toggleNewPost() {
    if (showForm && onPostsTab) closeForm();
    else startPost(null);
  }

  return (
    <div className={showApp && activeTab !== "community" ? "layout with-map" : "layout"}>
      {/* ---------- Left column: brand, you, navigation, impact ---------- */}
      <aside className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden>🥫</span>
          <div>
            <h1>Spare Shelf</h1>
            <p className="tagline">Borrow a cup of sugar from your neighbors.</p>
          </div>
        </div>

        {user ? (
          <div className="card user-card">
            <div className="user-card-top">
              <Avatar name={user.name} photoURL={(complete && profile.photoURL) || user.photoURL} size="md" />
              <div className="user-card-text">
                <strong>{user.name}</strong>
                {complete && <span className="muted" title={profile.universityName}>{profile.housingLabel}</span>}
              </div>
            </div>
            <div className="user-card-actions">
              {complete && (
                <button className="btn ghost small" onClick={() => setEditing((open) => !open)}>
                  {editing ? "Close profile" : "Profile"}
                </button>
              )}
              <button className="btn ghost small" onClick={signOut}>Sign out</button>
            </div>
          </div>
        ) : (
          <div className="card user-card">
            <p className="muted">Sign in to share, request, and message neighbors.</p>
            <button className="btn primary block" onClick={signIn}>Sign in</button>
          </div>
        )}

        {showApp && (
          <nav className="nav" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} className={`nav-item tone-${t.tone}${activeTab === t.id ? " active" : ""}`}
                aria-current={activeTab === t.id ? "page" : undefined}
                onClick={() => { setTab(t.id); if (t.id === "messages") setOpenChatWith(null); }}
                disabled={t.id !== "board" && !user}>
                <span className="nav-icon" aria-hidden>{t.icon}</span>
                <span className="nav-label">{t.label}</span>
                {t.id === "messages" && unreadCount > 0 && <span className="tab-count">{unreadCount}</span>}
              </button>
            ))}
          </nav>
        )}

        {showApp && user && (
          <button className="btn primary block new-post" onClick={toggleNewPost}>
            {showForm && onPostsTab ? "Close form" : "+ New post"}
          </button>
        )}

        {showApp && (
          <section className="sidebar-section">
            <h2 className="sidebar-heading">Community impact</h2>
            <ImpactBar posts={posts} />
          </section>
        )}

        <p className="sidebar-note">
          Only share sealed or fresh food, list allergens in the notes, and meet in public spots.
        </p>
      </aside>

      {/* ---------- Right column: the current page ---------- */}
      <div className="main-col">
        {isDemoMode && (
          <div className="demo-banner">
            Demo mode: data is fake and saved only in this browser. Add Firebase keys to <code>.env.local</code> to go live.{" "}
            <button className="link" onClick={resetDemoData}>Reset sample data</button>
          </div>
        )}

        {user && profileState !== "ready" && <p className="empty">Loading your profile…</p>}
        {needsProfile && <ProfileSetup user={user} profile={profile} required onSaved={() => setEditing(false)} />}

        {showApp && <>
        {editing && <ProfileSetup user={user} profile={profile} onSaved={() => setEditing(false)} />}

        <header className={`page-head tone-${page.tone}`}>
          <span className="page-icon" aria-hidden>{page.icon}</span>
          <div>
            <h2>{page.title}</h2>
            <p className="muted">{page.sub}</p>
          </div>
        </header>

        {showForm && user && onPostsTab && (
          <PostForm key={draft ? draft.key : "new"} user={user} posts={posts} origin={here}
            homeLabel={complete ? publicPlaceLabel(profile) : ""} initial={draft} onDone={closeForm} onPickDraft={pickForDraft} />
        )}

        {activeTab === "community" ? (
          <Community user={user} profile={profile} posts={posts} here={here} onOpenPost={openPost} onOpenPerson={openPerson} onClaim={claim} />
        ) : activeTab === "pantry" ? (
          <Pantry user={user} posts={posts} onShare={shareFromPantry} onMessage={openChat} />
        ) : activeTab === "recipes" ? (
          <Recipes user={user} posts={posts} here={here} onRequest={requestIngredient} onMessage={openChat} onClaim={claim} />
        ) : activeTab === "messages" ? (
          <Messages user={user} chats={chats} openWith={openChatWith}
            onOpen={setOpenChatWith} onBack={() => setOpenChatWith(null)} />
        ) : (
        <>
          <div className="filters">
            {["all", "offer", "request"].map((f) => (
              <button key={f} className={filter === f ? "chip active" : "chip"} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "offer" ? "Offers" : "Requests"}
              </button>
            ))}
            {here && (
              <button className="chip" onClick={() => setSort(sort === "newest" ? "nearest" : "newest")}
                title="Change the order of posts">
                {sort === "newest" ? "↕ Newest" : "↕ Nearest"}
              </button>
            )}
            <input
              className="search"
              placeholder="Search eggs, rice, Alder Hall…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {activeTab === "history" && visible.length > 0 && (
            <div className="history-actions">
              <button className="btn ghost" onClick={onClearHistory} disabled={clearing}>
                {clearing ? "Clearing…" : "🗑️ Clear history"}
              </button>
            </div>
          )}

          <main className="feed">
            {!user && !isDemoMode ? (
              <p className="empty">Sign in to see what your neighbors are sharing.</p>
            ) : visible.length === 0 ? (
              <p className="empty">
                {activeTab === "history"
                  ? "Nothing shared yet. Finished hand-offs show up here."
                  : activeTab === "mine"
                    ? "Nothing in progress. Post something or claim a neighbor's offer."
                    : "Nothing here yet. Be the first to post!"}
              </p>
            ) : (
              visible.map((p, i) => (
                <PostCard key={p.id} post={p} user={user} here={here} onMessage={openChat} onClaim={claim} onReview={setReviewPost} onDirections={showDirections}
                  pickup={pickups[p.id]} declinedPickup={declinedPickups[p.id]} onChoosePickup={choosePickup} onAcceptPickup={acceptPickup} onDeclinePickup={declinePickup} liveShare={liveShare} index={i} focused={p.id === focusPostId} />
              ))
            )}
          </main>
        </>
        )}
      </>}
      </div>

      {/* ---------- Right column: map + directions ---------- */}
      {showApp && activeTab !== "community" && (
        <MapPanel here={here} homeLabel={complete ? profile.housingLabel : ""} device={device} posts={posts} user={user} target={mapTarget}
          pickups={pickups} picking={pickRequest} onChoosePickup={choosePickup} onAcceptPickup={acceptPickup} onDeclinePickup={declinePickup}
          declinedPickups={declinedPickups} liveShare={liveShare}
          onPickSave={savePick} onPickCancel={() => setPickRequest(null)}
          onSelect={(post) => setMapTargetId(post.id)} onClear={() => setMapTargetId(null)} />
      )}

      {user && reviewPost && (
        <ReviewSheet key={reviewPost.id} user={user} post={reviewPost} onClose={() => setReviewPost(null)} onSaved={() => setReviewPost(null)} />
      )}
    </div>
  );
}
