// Form for creating an Offer or a Request.
import { useState } from "react";
import { createPost } from "../data";

const EMPTY = { type: "request", item: "", quantity: "", location: "", expiresOn: "", estValue: "", notes: "" };

export default function PostForm({ user, onDone }) {
  const [form, setForm] = useState(EMPTY);
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
      await createPost(user, form);
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
