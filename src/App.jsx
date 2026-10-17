// The main screen. Holds the shared state (who's signed in + all posts)
// and passes it down to the smaller components.
import { useEffect, useState } from "react";
import { watchUser, watchPosts, signIn, signOut, isDemoMode, resetDemoData } from "./data";
import ImpactBar from "./components/ImpactBar";
import PostForm from "./components/PostForm";
import PostCard from "./components/PostCard";
import Pantry from "./components/Pantry";

export default function App() {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [tab, setTab] = useState("board"); // "board", "mine" or "pantry"
  const [filter, setFilter] = useState("all"); // "all", "offer", "request"
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(null); // pre-filled post when sharing from the pantry

  // Start listening to sign-in state and posts when the page loads.
  useEffect(() => watchUser(setUser), []);
  // The live database only lets signed-in users read, so (re)start listening whenever the user changes.
  const uid = user ? user.uid : null;
  useEffect(() => {
    if (!uid && !isDemoMode) {
      setPosts([]);
      return;
    }
    return watchPosts(setPosts);
  }, [uid]);

  // "My posts" and "Pantry" need a signed-in user; fall back to the board otherwise.
  const activeTab = user ? tab : "board";

  function openForm(prefill) {
    setDraft(prefill ? { ...prefill, key: Date.now() } : null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setDraft(null);
  }

  // Pantry "Share" button: switch to the board with an Offer already filled in.
  function shareFromPantry(item) {
    setTab("board");
    openForm({ type: "offer", item: item.name, quantity: item.quantity, expiresOn: item.expiresOn });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const term = search.trim().toLowerCase();
  const visible = posts.filter((p) => {
    if (activeTab === "board" && p.status === "completed") return false;
    if (activeTab === "mine" && !(p.ownerId === user.uid || p.claimedById === user.uid)) return false;
    if (filter !== "all" && p.type !== filter) return false;
    if (term && !`${p.item} ${p.location} ${p.notes}`.toLowerCase().includes(term)) return false;
    return true;
  });

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo" aria-hidden>🥫</span>
          <div>
            <h1>Spare Shelf</h1>
            <p className="tagline">Borrow a cup of sugar from your neighbors.</p>
          </div>
        </div>
        {user ? (
          <div className="user">
            <span>Hi, {user.name.split(" ")[0]}</span>
            <button className="btn ghost" onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <button className="btn primary" onClick={signIn}>Sign in</button>
        )}
      </header>

      {isDemoMode && (
        <div className="demo-banner">
          Demo mode: data is fake and saved only in this browser. Add Firebase keys to <code>.env.local</code> to go live.{" "}
          <button className="link" onClick={resetDemoData}>Reset sample data</button>
        </div>
      )}

      <ImpactBar posts={posts} />

      <div className="toolbar">
        <div className="tabs" role="tablist">
          {["board", "mine", "pantry"].map((t) => (
            <button key={t} className={activeTab === t ? "tab active" : "tab"} onClick={() => setTab(t)}
              disabled={t !== "board" && !user}>
              {t === "board" ? "Board" : t === "mine" ? "My posts" : "Pantry"}
            </button>
          ))}
        </div>
        {user && activeTab !== "pantry" && (
          <button className="btn primary" onClick={() => (showForm ? closeForm() : openForm(null))}>
            {showForm ? "Close" : "+ New post"}
          </button>
        )}
      </div>

      {showForm && user && activeTab !== "pantry" && (
        <PostForm key={draft ? draft.key : "new"} user={user} initial={draft} onDone={closeForm} />
      )}

      {activeTab === "pantry" ? (
        <Pantry user={user} onShare={shareFromPantry} />
      ) : (
      <>
        <div className="filters">
          {["all", "offer", "request"].map((f) => (
            <button key={f} className={filter === f ? "chip active" : "chip"} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "offer" ? "Offers" : "Requests"}
            </button>
          ))}
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
            visible.map((p) => <PostCard key={p.id} post={p} user={user} />)
          )}
        </main>
      </>
      )}

      <footer className="footer">
        Only share sealed or fresh food, list allergens in the notes, and meet in public spots.
      </footer>
    </div>
  );
}
