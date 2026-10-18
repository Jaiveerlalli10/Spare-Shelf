// One recipe: which ingredients you have (from your pantry), which you need,
// and who on the board is offering the ones you need.
import { findInPantry, findOffers } from "../matching";
import { milesToPost, awayLabel } from "../location";
import { isPaid, money } from "../payments";

export default function RecipeDetail({ recipe, pantry, posts, user, here, onBack, onRequest, onMessage, onClaim }) {
  // Closest offers first; offers with no location go last.
  const away = (p) => milesToPost(here, p) ?? Infinity;
  const rows = recipe.ingredients.map((ing) => {
    const owned = findInPantry(ing.name, pantry);
    const offers = owned ? [] : findOffers(ing.name, posts, user).sort((a, b) => away(a) - away(b));
    return { ...ing, owned, offers };
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
                          {awayLabel(milesToPost(here, p)) && (
                            <span className="away"> · {awayLabel(milesToPost(here, p))}</span>
                          )}
                        </span>
                        {p.claimedById === user.uid ? (
                          <span className="offer-claimed">
                            <button className="btn ghost small" onClick={() => onMessage(p)}>💬 Message</button>
                          </span>
                        ) : (
                          <button className="btn primary small" onClick={() => onClaim(p)}>{isPaid(p) ? `💳 Pay ${money(p.price)}` : "I'll take it"}</button>
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
