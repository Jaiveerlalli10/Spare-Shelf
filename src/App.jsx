// The main screen. Holds the shared state (who's signed in + all posts)
// and passes it down to the smaller components.
import { useEffect, useState } from "react";
import { watchUser, watchPosts, watchProfile, savePublicProfile, watchChats, ensureChat, isUnread, signIn, signOut, isDemoMode, isProfileComplete, resetDemoData } from "./data";
import ImpactBar from "./components/ImpactBar";
import PostForm from "./components/PostForm";
import PostCard from "./components/PostCard";
import Pantry from "./components/Pantry";
import ProfileSetup from "./components/ProfileSetup";
import Avatar from "./components/Avatar";
import Recipes from "./components/Recipes";
import Messages from "./components/Messages";
import { milesToPost } from "./location";
import MapPanel from "./components/MapPanel";

export default function App() {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [tab, setTab] = useState("board"); // "board", "mine", "pantry", "recipes" or "messages"
  const [filter, setFilter] = useState("all"); // "all", "offer", "request"
  const [sort, setSort] = useState("newest"); // "newest" or "nearest"
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(null); // pre-filled post when sharing from the pantry
  const [profile, setProfile] = useState(null);
  const [profileState, setProfileState] = useState("idle"); // "idle" | "loading" | "ready"
  const [editing, setEditing] = useState(false);
  const [chats, setChats] = useState([]);
  const [openChatId, setOpenChatId] = useState(null);
  const [mapTargetId, setMapTargetId] = useState(null); // post shown with directions on the map
  const uid = user ? user.uid : null;

  // Start listening to sign-in state and posts when the page loads.
  useEffect(() => watchUser(setUser), []);
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileState("idle");
      setEditing(false);
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
      setOpenChatId(null);
      return;
    }
    return watchChats(user, setChats);
  }, [uid]);
  const unreadCount = user ? chats.filter((c) => isUnread(c, user)).length : 0;

  // "Message" buttons: make sure the chat exists, then open it on the Messages tab.
  async function openChat(post) {
    try {
      await ensureChat(post);
      setOpenChatId(post.id);
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

  // Where the viewer lives (from their profile), used for "0.3 mi away".
  const here = complete ? { lat: profile.housingLat, lng: profile.housingLng } : null;

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
    if (activeTab === "board" && p.status === "completed") return false;
    if (activeTab === "mine" && !(p.ownerId === user.uid || p.claimedById === user.uid)) return false;
    if (filter !== "all" && p.type !== filter) return false;
    if (term && !`${p.item} ${p.location} ${p.notes}`.toLowerCase().includes(term)) return false;
    return true;
  });
  // "Nearest": closest first; posts with no location go last. (Posts already arrive newest first.)
  if (sort === "nearest" && here) {
    const away = (p) => milesToPost(here, p) ?? Infinity;
    visible.sort((a, b) => away(a) - away(b));
  }

  const mapTarget = posts.find((p) => p.id === mapTargetId) || null;

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
    { id: "mine", label: "My posts", icon: "📝", tone: "sky", title: "My posts", sub: "Posts you made or claimed." },
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
    <div className={showApp ? "layout with-map" : "layout"}>
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
                onClick={() => { setTab(t.id); if (t.id === "messages") setOpenChatId(null); }}
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
          <PostForm key={draft ? draft.key : "new"} user={user} posts={posts} origin={here} initial={draft} onDone={closeForm} />
        )}

        {activeTab === "pantry" ? (
          <Pantry user={user} posts={posts} onShare={shareFromPantry} onMessage={openChat} />
        ) : activeTab === "recipes" ? (
          <Recipes user={user} posts={posts} here={here} onRequest={requestIngredient} onMessage={openChat} />
        ) : activeTab === "messages" ? (
          <Messages user={user} chats={chats} posts={posts} openChatId={openChatId}
            onOpen={setOpenChatId} onBack={() => setOpenChatId(null)} onDirections={showDirections} />
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

          <main className="feed">
            {!user && !isDemoMode ? (
              <p className="empty">Sign in to see what your neighbors are sharing.</p>
            ) : visible.length === 0 ? (
              <p className="empty">Nothing here yet. Be the first to post!</p>
            ) : (
              visible.map((p, i) => (
                <PostCard key={p.id} post={p} user={user} here={here} onMessage={openChat} onDirections={showDirections} index={i} />
              ))
            )}
          </main>
        </>
        )}
      </>}
      </div>

      {/* ---------- Right column: map + directions ---------- */}
      {showApp && (
        <MapPanel here={here} posts={posts} user={user} target={mapTarget}
          onSelect={(post) => setMapTargetId(post.id)} onClear={() => setMapTargetId(null)} />
      )}
    </div>
  );
}
