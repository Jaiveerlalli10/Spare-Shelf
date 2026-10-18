// Form for creating an Offer or a Request.
import { useEffect, useState } from "react";
import { createPost, watchPantry, mergePantryItems } from "../data";
import { activeOffersByPantryItem } from "../matching";
import { aiReady, describeFoodPhoto } from "../ai";
import { readFoodPhoto } from "../photo";
import { paymentsOn, watchSellerAccount, MIN_PRICE, MAX_PRICE, money } from "../payments";
import { groupPantryItems } from "../pantryGroups";

const EMPTY = { type: "request", item: "", quantity: "", location: "", expiresOn: "", estValue: "", price: "", notes: "", pantryItemId: "", pickup: null };

// `initial` (optional) pre-fills the form, e.g. when sharing an item from the pantry.
// `posts` is used to hide pantry entries that are already on the board.
// `origin` is the poster's housing location from their profile (a rounded version is saved for distances).
// `homeLabel` is the place name from their profile (like "Alder Hall"), used as the post's location.
// `onPickDraft(current, item, onPicked)` opens the map so an offer's pickup spot can be chosen by pin.
export default function PostForm({ user, posts, origin, homeLabel, onDone, initial, onPickDraft }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [pantry, setPantry] = useState([]);

  useEffect(() => watchPantry(user, setPantry), [user.uid]);
  // Sellers with payouts set up can put a price on offers.
  const [seller, setSeller] = useState(null);
  useEffect(() => watchSellerAccount(user, setSeller), [user.uid]);
  const canSell = paymentsOn && Boolean(seller?.ready);

  // Pantry entries you could offer: everything not already in an active offer.
  const onBoard = activeOffersByPantryItem(posts, user);
  const offerable = pantry.filter((i) => !onBoard.has(i.id));
  const groups = groupPantryItems(offerable).sort((a, b) => a.name.localeCompare(b.name));

  // Picking a pantry entry fills in its name, amount and best-by date.
  // Like ingredients are one choice ("6 eggs"); picking that folds them into one row.
  async function pickPantryItem(e) {
    const id = e.target.value;
    if (!id) {
      setForm({ ...form, pantryItemId: "" });
      return;
    }
    const group = groups.find((g) => g.ids.includes(id));
    if (!group) return;
    let item = group.items.find((entry) => entry.id === group.id) || group.items[0];
    try {
      if (group.items.length > 1) {
        await mergePantryItems(user, group.id, group, group.ids);
        item = { id: group.id, name: group.name, quantity: group.quantity, expiresOn: group.expiresOn };
      }
      setForm({
        ...form,
        pantryItemId: item.id,
        item: item.name,
        quantity: group.items.length > 1 ? group.quantity : item.quantity,
        expiresOn: group.items.length > 1 ? group.expiresOn : item.expiresOn,
      });
    } catch (err) {
      setError("Couldn't combine those: " + err.message);
    }
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Gemini reads a food photo and fills in the ingredient, amount, value, best-by date and notes.
  const [reading, setReading] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  async function fillFromPhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setReading(true);
    setPhotoNote("");
    setError("");
    try {
      const found = await describeFoodPhoto(await readFoodPhoto(file));
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(found.expiresOn || "");
      setForm((f) => ({
        ...f,
        pantryItemId: "", // a new item, not one picked from the pantry
        item: found.item,
        quantity: found.quantity || f.quantity,
        estValue: found.estValue ? String(Math.round(found.estValue * 2) / 2) : f.estValue,
        expiresOn: validDate ? found.expiresOn : f.expiresOn,
        notes: found.notes || f.notes,
      }));
      setPhotoNote("✨ Filled in from your photo. Check it over before posting.");
    } catch (err) {
      setError("Couldn't read the photo: " + err.message);
    } finally {
      setReading(false);
    }
  }

  // One handler for every input: uses the input's `name` to know which field to update.
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!form.item.trim()) {
      setError("Please fill in the ingredient.");
      return;
    }
    const price = form.type === "offer" && canSell ? Number(form.price) || 0 : 0;
    if (price && (price < MIN_PRICE || price > MAX_PRICE)) {
      setError(`Price has to be between ${money(MIN_PRICE)} and ${money(MAX_PRICE)}, or empty to give it away free.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createPost(user, { ...form, price, location: homeLabel || "Near campus", origin });
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
      {aiReady && form.type === "offer" && (
        <div className="ai-photo">
          <label className={`file-btn btn ghost${reading ? " disabled" : ""}`}>
            {reading ? "Reading photo…" : "📷 Fill in from a photo"}
            <input type="file" accept="image/*" onChange={fillFromPhoto} disabled={reading} />
          </label>
          {photoNote && <span className="muted">{photoNote}</span>}
        </div>
      )}
      {form.type === "offer" && (
        <label>From your pantry
          <select value={form.pantryItemId} onChange={pickPantryItem}>
            <option value="">Add as a new pantry item</option>
            {groups.map((group) => (
              <option key={group.ids.join("-")} value={group.id}>
                {group.qtyText ? `${group.label} · ${group.qtyText}` : group.label}
              </option>
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
      {form.type === "offer" && canSell && (
        <label>Price ($, optional)
          <input name="price" type="number" min="0" max={MAX_PRICE} step="0.25" value={form.price} onChange={update} placeholder="Leave empty to give it away free" />
        </label>
      )}
      {form.type === "offer" && paymentsOn && !canSell && (
        <p className="muted form-place">💳 Want to sell this instead of giving it away? Set up payouts in your profile first.</p>
      )}
      {form.type === "offer" && (
        <label>Best by (optional)
          <input name="expiresOn" type="date" value={form.expiresOn} onChange={update} />
        </label>
      )}
      <label>Notes (allergens, pickup times…)
        <textarea name="notes" rows="2" value={form.notes} onChange={update} />
      </label>

      {form.type === "offer" && onPickDraft ? (
        <div className="form-pickup">
          <span>
            📍 Pickup spot: <strong>{form.pickup ? form.pickup.label : homeLabel || "near campus"}</strong>
            {!form.pickup && <span className="muted"> (your profile, by default)</span>}
          </span>
          <span className="form-pickup-actions">
            <button type="button" className="btn ghost small"
              onClick={() => onPickDraft(form.pickup, form.item, (spot) => setForm((f) => ({ ...f, pickup: spot })))}>
              {form.pickup ? "Change" : "Choose on map"}
            </button>
            {form.pickup && <button type="button" className="link" onClick={() => setForm((f) => ({ ...f, pickup: null }))}>Remove</button>}
          </span>
        </div>
      ) : (
        <p className="muted form-place">📍 Posting from <strong>{homeLabel || "near campus"}</strong> (from your profile)</p>
      )}

      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={saving}>{saving ? "Posting…" : "Post"}</button>
    </form>
  );
}
