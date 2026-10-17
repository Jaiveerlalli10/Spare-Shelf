// One recipe: which ingredients you have (from your pantry), which you need,
// and who on the board is offering the ones you need.
import { claimPost } from "../data";
import { findInPantry, findOffers } from "../matching";

export default function RecipeDetail({ recipe, pantry, posts, user, onBack, onRequest }) {
  const rows = recipe.ingredients.map((ing) => {
    const owned = findInPantry(ing.name, pantry);
    return { ...ing, owned, offers: owned ? [] : findOffers(ing.name, posts, user) };
  });
  const have = rows.filter((r) => r.owned);
  const need = rows.filter((r) => !r.owned);

  return (
    <section className="recipe-detail">
      <button className="link back" onClick={onBack}>← All recipes</button>

      <div className="card recipe-hero">
        <span className="recipe-emoji big" aria-hidden>{recipe.emoji}</span>
        <div>
          <h2>{recipe.name}</h2>
          <p className="muted">{recipe.minutes} min · serves {recipe.servings}</p>
          <span className="recipe-tags">{recipe.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span>
        </div>
      </div>

      <div className="progress" aria-label={`You have ${have.length} of ${rows.length} ingredients`}>
        <div className="progress-fill" style={{ width: `${(have.length / rows.length) * 100}%` }} />
      </div>
      <p className="progress-label">
        {need.length === 0 ? "You have everything. Time to cook!" : `You have ${have.length} of ${rows.length}. ${need.length} to go.`}
      </p>

      {need.length > 0 && (
        <div className="card">
          <h3>You need</h3>
          <ul className="ing-list">
            {need.map((r) => (
              <li key={r.name} className="ing need">
                <div className="ing-head">
                  <span><span className="ing-mark">✗</span> {r.name} <span className="muted">· {r.amount}</span></span>
                </div>
                {r.offers.length > 0 ? (
                  <ul className="offer-list">
                    {r.offers.map((p) => (
                      <li key={p.id} className="offer">
                        <span>
                          <strong>{p.ownerName}</strong> has {p.quantity || "some"} {p.item.toLowerCase()}
                          <span className="muted"> · 📍 {p.location}</span>
                        </span>
                        {p.claimedById === user.uid ? (
                          <span className="status claimed">You're on it{p.ownerEmail && ` · ${p.ownerEmail}`}</span>
                        ) : (
                          <button className="btn primary small" onClick={() => claimPost(user, p)}>I'll take it</button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="offer none">
                    <span className="muted">No one nearby is offering this yet.</span>
                    <button className="btn ghost small" onClick={() => onRequest(r)}>Request it</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {have.length > 0 && (
        <div className="card">
          <h3>You have</h3>
          <ul className="ing-list">
            {have.map((r) => (
              <li key={r.name} className="ing have">
                <span><span className="ing-mark">✓</span> {r.name} <span className="muted">· {r.amount}</span></span>
                <span className="muted">in pantry: {r.owned.name}{r.owned.quantity && ` (${r.owned.quantity})`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recipe.staples.length > 0 && (
        <p className="muted">Also uses pantry basics: {recipe.staples.join(", ")}.</p>
      )}

      <div className="card">
        <h3>Steps</h3>
        <ol className="steps">{recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      </div>
    </section>
  );
}
