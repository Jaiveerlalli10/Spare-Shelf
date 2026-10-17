// The main screen. Holds the shared state (who's signed in + all posts)
// and passes it down to the smaller components.
import { useEffect, useState } from "react";
import { watchUser, watchPosts, signIn, signOut, isDemoMode, resetDemoData } from "./data";
import ImpactBar from "./components/ImpactBar";
import PostForm from "./components/PostForm";
import PostCard from "./components/PostCard";

export default function App() {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [tab, setTab] = useState("board"); // "board" or "mine"
  const [filter, setFilter] = useState("all"); // "all", "offer", "request"
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

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

  const term = search.trim().toLowerCase();
  const visible = posts.filter((p) => {
    if (tab === "board" && p.status === "completed") return false;
    if (tab === "mine" && !(user && (p.ownerId === user.uid || p.claimedById === user.uid))) return false;
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
          <button className={tab === "board" ? "tab active" : "tab"} onClick={() => setTab("board")}>Board</button>
          <button className={tab === "mine" ? "tab active" : "tab"} onClick={() => setTab("mine")} disabled={!user}>My posts</button>
        </div>
        {user && (
          <button className="btn primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Close" : "+ New post"}
          </button>
        )}
      </div>

      {showForm && user && <PostForm user={user} onDone={() => setShowForm(false)} />}

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

      <footer className="footer">
        Only share sealed or fresh food, list allergens in the notes, and meet in public spots.
      </footer>
    </div>
  );
}
