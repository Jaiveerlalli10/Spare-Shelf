// The Recipes tab: browse mock recipes, filter by tags, and open one to see
// what you already have in your pantry vs. what you still need.
import { useEffect, useState } from "react";
import { watchPantry } from "../data";
import { RECIPES, ALL_TAGS } from "../recipes";
import { findInPantry, activeOffersByPantryItem } from "../matching";
import RecipeDetail from "./RecipeDetail";
import { aiReady, suggestRecipes } from "../ai";

export default function Recipes({ user, posts, here, onRequest, onMessage, onClaim }) {
  const [pantry, setPantry] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  // Recipe ideas from Gemini, based on your pantry. Kept until you ask again.
  const [ideas, setIdeas] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [ideasError, setIdeasError] = useState("");

  useEffect(() => watchPantry(user, setPantry), [user.uid]);

  // Items you're giving away on the board don't count as "you have".
  const onBoard = activeOffersByPantryItem(posts, user);
  const available = pantry.filter((i) => !onBoard.has(i.id));

  const opened = RECIPES.find((r) => r.id === openId) || ideas.find((r) => r.id === openId);
  if (opened) {
    return (
      <RecipeDetail onClaim={onClaim} recipe={opened} pantry={available} posts={posts} user={user}
        here={here} onBack={() => setOpenId(null)} onRequest={onRequest} onMessage={onMessage} />
    );
  }

  function toggleTag(tag) {
    setSelectedTags(selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag]);
  }

  async function getIdeas() {
    setThinking(true);
    setIdeasError("");
    try {
      setIdeas(await suggestRecipes(available));
    } catch (err) {
      setIdeasError("Couldn't get ideas: " + err.message);
    } finally {
      setThinking(false);
    }
  }

  const withHave = (r) => ({ ...r, have: r.ingredients.filter((i) => findInPantry(i.name, available)).length });
  const card = (r) => (
    <button key={r.id} className="card recipe-card" onClick={() => { setOpenId(r.id); window.scrollTo({ top: 0 }); }}>
      <span className="recipe-emoji" aria-hidden>{r.emoji}</span>
      <strong>{r.name}</strong>
      <span className="muted">{r.minutes} min · serves {r.servings}</span>
      <span className="recipe-tags">{r.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span>
      <span className={r.have === r.ingredients.length ? "have-count all" : "have-count"}>
        {r.have === r.ingredients.length
          ? "✓ You have everything"
          : `You have ${r.have} of ${r.ingredients.length} ingredients`}
      </span>
    </button>
  );

  // A recipe shows up only if it has ALL selected tags (e.g. Indian + Spicy).
  const term = search.trim().toLowerCase();
  const list = RECIPES
    .filter((r) => selectedTags.every((t) => r.tags.includes(t)))
    .filter((r) => !term || `${r.name} ${r.ingredients.map((i) => i.name).join(" ")}`.toLowerCase().includes(term))
    .map(withHave)
    // Recipes you're closest to making come first.
    .sort((a, b) => (a.ingredients.length - a.have) - (b.ingredients.length - b.have));

  return (
    <section>
      {aiReady && (
        <div className="ai-ideas">
          <div className="ai-ideas-head">
            <h3>✨ Ideas from your pantry</h3>
            <button className="btn primary small" onClick={getIdeas} disabled={thinking || available.length === 0}>
              {thinking ? "Thinking…" : ideas.length ? "New ideas" : "Suggest recipes"}
            </button>
          </div>
          {ideasError && <p className="error">{ideasError}</p>}
          {available.length === 0 && <p className="muted">Add a few things to your Pantry tab first.</p>}
          {ideas.length > 0 && <div className="recipe-grid">{ideas.map((r) => card(withHave(r)))}</div>}
        </div>
      )}
      <div className="filters">
        {ALL_TAGS.map((tag) => (
          <button key={tag} className={selectedTags.includes(tag) ? "chip active" : "chip"} onClick={() => toggleTag(tag)}>
            {tag}
          </button>
        ))}
        {selectedTags.length > 0 && (
          <button className="link" onClick={() => setSelectedTags([])}>Clear</button>
        )}
      </div>
      <div className="filters">
        <input className="search" placeholder="Search recipes or ingredients…" value={search}
          onChange={(e) => setSearch(e.target.value)} />
      </div>

      {list.length === 0 ? (
        <p className="empty">No recipes match those tags. Try removing one.</p>
      ) : (
        <div className="recipe-grid">
          {list.map(card)}
        </div>
      )}
      <p className="muted pantry-note">Ingredient matches come from your Pantry tab (not counting items you're offering).</p>
    </section>
  );
}
