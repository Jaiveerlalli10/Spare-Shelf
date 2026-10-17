// Form for creating an Offer or a Request.
import { useEffect, useState } from "react";
import { createPost, watchPantry } from "../data";
import { activeOffersByPantryItem } from "../matching";

const EMPTY = { type: "request", item: "", quantity: "", location: "", expiresOn: "", estValue: "", notes: "", pantryItemId: "" };

// `initial` (optional) pre-fills the form, e.g. when sharing an item from the pantry.
// `posts` is used to hide pantry entries that are already on the board.
// `origin` is the poster's housing location from their profile (a rounded version is saved for distances).
export default function PostForm({ user, posts, origin, onDone, initial }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [pantry, setPantry] = useState([]);

  useEffect(() => watchPantry(user, setPantry), [user.uid]);

  // Pantry entries you could offer: everything not already in an active offer.
  const onBoard = activeOffersByPantryItem(posts, user);
  const offerable = pantry.filter((i) => !onBoard.has(i.id)).sort((a, b) => a.name.localeCompare(b.name));

  // Picking a pantry entry fills in its name, amount and best-by date.
  function pickPantryItem(e) {
    const item = pantry.find((i) => i.id === e.target.value);
    setForm(item
      ? { ...form, pantryItemId: item.id, item: item.name, quantity: item.quantity, expiresOn: item.expiresOn }
      : { ...form, pantryItemId: "" });
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // One handler for every input: uses the input's `name` to know which field to update.
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!form.item.trim() || !form.location.trim()) {
      setError("Please fill in the item and pickup area.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createPost(user, { ...form, origin });
      setForm(EMPTY);
      onDone();
    } catch (err) {
      setError("Couldn't save: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div className="type-toggle">
        <button type="button" className={form.type === "request" ? "chip active" : "chip"}
          onClick={() => setForm({ ...form, type: "request" })}>I need something</button>
        <button type="button" className={form.type === "offer" ? "chip active" : "chip"}
          onClick={() => setForm({ ...form, type: "offer" })}>I have extra</button>
      </div>
      {form.type === "offer" && (
        <label>From your pantry
          <select value={form.pantryItemId} onChange={pickPantryItem}>
            <option value="">Add as a new pantry item</option>
            {offerable.map((i) => (
              <option key={i.id} value={i.id}>{i.name}{i.quantity && ` · ${i.quantity}`}</option>
            ))}
          </select>
        </label>
      )}

      <label>Ingredient
        <input name="item" value={form.item} onChange={update} placeholder="e.g. Eggs" />
      </label>
      <div className="row">
        <label>Amount
          <input name="quantity" value={form.quantity} onChange={update} placeholder="e.g. 2, 1 cup" />
        </label>
        <label>Est. value ($)
          <input name="estValue" type="number" min="0" step="0.5" value={form.estValue} onChange={update} placeholder="3" />
        </label>
      </div>
      <div className="row">
        <label>Pickup area
          <input name="location" value={form.location} onChange={update} placeholder="e.g. Alder Hall lobby" />
        </label>
        {form.type === "offer" && (
          <label>Best by (optional)
            <input name="expiresOn" type="date" value={form.expiresOn} onChange={update} />
          </label>
        )}
      </div>
      <label>Notes (allergens, pickup times…)
        <textarea name="notes" rows="2" value={form.notes} onChange={update} />
      </label>

      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={saving}>{saving ? "Posting…" : "Post"}</button>
    </form>
  );
}
