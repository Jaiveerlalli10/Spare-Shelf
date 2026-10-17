// The Pantry tab: a private list of what you have at home.
// Items you're offering on the board get their own highlighted section.
// Everything else is sorted so items about to go bad come first, with a "Share" button to offer them.
import { useEffect, useState } from "react";
import { watchPantry, addPantryItem, removePantryItem, deletePost } from "../data";
import { daysUntil, expiryLabel } from "../dates";
import { activeOffersByPantryItem } from "../matching";

const EMPTY = { name: "", quantity: "", expiresOn: "" };
const SOON_DAYS = 2; // "expiring soon" = within this many days

export default function Pantry({ user, posts, onShare }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  useEffect(() => watchPantry(user, setItems), [user.uid]);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function add(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("What's the item?");
      return;
    }
    setError("");
    try {
      await addPantryItem(user, form);
      setForm(EMPTY);
    } catch (err) {
      setError("Couldn't save: " + err.message);
    }
  }

  // "Used up" on an item that's on the board also takes the post down.
  async function useUp(item, offer) {
    if (offer) {
      if (!window.confirm(`${item.name} is on the board. Remove the post too?`)) return;
      await deletePost(offer);
    }
    await removePantryItem(user, item);
  }

  const onBoard = activeOffersByPantryItem(posts, user);
  const offering = items.filter((i) => onBoard.has(i.id));
  const keeping = items.filter((i) => !onBoard.has(i.id));

  // Soonest best-by date first; items with no date go last, alphabetically.
  const sorted = [...keeping].sort((a, b) => {
    const da = daysUntil(a.expiresOn), dbb = daysUntil(b.expiresOn);
    if (da === null && dbb === null) return a.name.localeCompare(b.name);
    if (da === null) return 1;
    if (dbb === null) return -1;
    return da - dbb;
  });
  const soonCount = sorted.filter((i) => {
    const d = daysUntil(i.expiresOn);
    return d !== null && d <= SOON_DAYS;
  }).length;

  return (
    <section className="pantry">
      <form className="card form pantry-form" onSubmit={add}>
        <div className="row">
          <label>Item
            <input name="name" value={form.name} onChange={update} placeholder="e.g. Tortillas" />
          </label>
          <label>Amount
            <input name="quantity" value={form.quantity} onChange={update} placeholder="e.g. 8" />
          </label>
          <label>Best by (optional)
            <input name="expiresOn" type="date" value={form.expiresOn} onChange={update} />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn primary">Add to pantry</button>
      </form>

      {soonCount > 0 && (
        <p className="pantry-alert">
          ⏰ {soonCount} {soonCount === 1 ? "item is" : "items are"} close to the best-by date. Use {soonCount === 1 ? "it" : "them"} or share with a neighbor.
        </p>
      )}

      {items.length === 0 && (
        <p className="empty">Your pantry is empty. Add what you have so you don't buy it twice.</p>
      )}

      {offering.length > 0 && (
        <>
          <h3 className="pantry-heading">📣 On the board ({offering.length})</h3>
          <ul className="pantry-list">
            {offering.map((item) => {
              const offer = onBoard.get(item.id);
              return (
                <li key={item.id} className="card pantry-item offering">
                  <div>
                    <strong>{item.name}</strong>
                    {item.quantity && <span className="qty"> · {item.quantity}</span>}
                    <div className="offer-status">
                      {offer.status === "claimed"
                        ? `🤝 ${offer.claimedByName} is picking this up${offer.claimedByEmail ? ` · ${offer.claimedByEmail}` : ""}`
                        : `Offered for pickup at ${offer.location}`}
                    </div>
                  </div>
                  <div className="pantry-actions">
                    <button className="btn ghost" onClick={() => useUp(item, offer)}>Used up</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {keeping.length > 0 && (
        <>
          {offering.length > 0 && <h3 className="pantry-heading">Keeping ({keeping.length})</h3>}
          <ul className="pantry-list">
            {sorted.map((item) => {
              const days = daysUntil(item.expiresOn);
              const soon = days !== null && days <= SOON_DAYS;
              return (
                <li key={item.id} className={soon ? "card pantry-item soon" : "card pantry-item"}>
                  <div>
                    <strong>{item.name}</strong>
                    {item.quantity && <span className="qty"> · {item.quantity}</span>}
                    {days !== null && <div className={soon ? "expiry soon" : "expiry muted"}>{expiryLabel(days)}</div>}
                  </div>
                  <div className="pantry-actions">
                    <button className="btn ghost" onClick={() => onShare(item)}>Share</button>
                    <button className="btn ghost" onClick={() => useUp(item, null)}>Used up</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="muted pantry-note">Only you can see your pantry. Items on the board leave it when you mark the hand-off completed.</p>
    </section>
  );
}
