// The main screen. Holds the shared state (who's signed in + all posts)
// and passes it down to the smaller components.
import { useEffect, useState } from "react";
import { watchUser, watchPosts, signIn, signOut, isDemoMode, resetDemoData } from "./data";
import ImpactBar from "./components/ImpactBar";
import PostForm from "./components/PostForm";
import PostCard from "./components/PostCard";
import Pantry from "./components/Pantry";
import Recipes from "./components/Recipes";

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
          {[["board", "Board"], ["mine", "My posts"], ["pantry", "Pantry"], ["recipes", "Recipes"]].map(([t, label]) => (
            <button key={t} className={activeTab === t ? "tab active" : "tab"} onClick={() => setTab(t)}
              disabled={t !== "board" && !user}>
              {label}
            </button>
          ))}
        </div>
        {user && onPostsTab && (
          <button className="btn primary" onClick={() => (showForm ? closeForm() : openForm(null))}>
            {showForm ? "Close" : "+ New post"}
          </button>
        )}
      </div>

      {showForm && user && onPostsTab && (
        <PostForm key={draft ? draft.key : "new"} user={user} posts={posts} initial={draft} onDone={closeForm} />
      )}

      {activeTab === "pantry" ? (
        <Pantry user={user} posts={posts} onShare={shareFromPantry} />
      ) : activeTab === "recipes" ? (
        <Recipes user={user} posts={posts} onRequest={requestIngredient} />
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
