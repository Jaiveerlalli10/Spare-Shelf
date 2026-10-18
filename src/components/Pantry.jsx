// The Pantry tab: a private list of what you have at home.
// Items you're offering on the board get their own highlighted section.
// Everything else is sorted so items about to go bad come first, with a "Share" button to offer them.
import { useEffect, useState } from "react";
import { watchPantry, addPantryItem, removePantryItems, mergePantryItems, deletePost, setPostQuantity } from "../data";
import { daysUntil, expiryLabel } from "../dates";
import { activeOffersByPantryItem } from "../matching";
import { foodEmoji } from "../foodEmoji";
import { groupPantryItems, groupToJoin, parseUsedAmount, quantityAfterUse, formatAmount } from "../pantryGroups";

const EMPTY = { name: "", quantity: "", expiresOn: "" };
const SOON_DAYS = 2; // "expiring soon" = within this many days

export default function Pantry({ user, posts, onShare, onMessage }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [using, setUsing] = useState(null); // { group, offer } while the "how much did you use?" popup is open

  useEffect(() => watchPantry(user, setItems), [user.uid]);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function add(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("What's the item?");
      return;
    }
    setError("");
    const draft = { name: form.name.trim(), quantity: form.quantity.trim(), expiresOn: form.expiresOn || "" };
    // Same ingredient already on the shelf: add onto that pile instead of a new row.
    const joined = groupToJoin(keeping, draft);
    try {
      if (joined) {
        const stored = joined.items.filter((item) => item.id !== "__draft__");
        const keeper = stored.reduce((best, item) => ((item.addedAt || 0) < (best.addedAt || 0) ? item : best));
        await mergePantryItems(user, keeper.id, joined, stored.map((item) => item.id));
      } else {
        await addPantryItem(user, form);
      }
      setForm(EMPTY);
    } catch (err) {
      setError("Couldn't save: " + err.message);
    }
  }

  function askUse(group, offer = null) {
    setUsing({ group, offer });
  }

  const onBoard = activeOffersByPantryItem(posts, user);
  const offering = items.filter((i) => onBoard.has(i.id));
  const keeping = items.filter((i) => !onBoard.has(i.id));

  // Soonest best-by date first; items with no date go last, alphabetically.
  const sorted = groupPantryItems(keeping).sort((a, b) => {
    const da = daysUntil(a.expiresOn), dbb = daysUntil(b.expiresOn);
    if (da === null && dbb === null) return a.name.localeCompare(b.name);
    if (da === null) return 1;
    if (dbb === null) return -1;
    return da - dbb;
  });
  const soonCount = sorted.filter((group) => {
    const d = daysUntil(group.expiresOn);
    return d !== null && d <= SOON_DAYS;
  }).length;

  // Share the whole pile. Fold the rows into one first so the hand-off removes all of them.
  async function share(group) {
    try {
      let item = group.items[0];
      if (group.items.length > 1) {
        await mergePantryItems(user, group.id, group, group.ids);
        item = { id: group.id, name: group.name, quantity: group.quantity, expiresOn: group.expiresOn };
      }
      onShare(item);
    } catch (err) {
      setError("Couldn't combine those: " + err.message);
    }
  }

  async function applyUse(group, offer, leftover) {
    if (!leftover) {
      if (offer) await deletePost(offer);
      await removePantryItems(user, group.items);
      return;
    }
    await mergePantryItems(user, group.id, {
      name: group.name,
      quantity: leftover,
      expiresOn: group.expiresOn,
    }, group.ids);
    if (offer) await setPostQuantity(offer, leftover);
  }

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
                    <span className="pantry-emoji" aria-hidden>{foodEmoji(item.name)}</span>
                    <strong>{item.name}</strong>
                    {item.quantity && <span className="qty"> · {item.quantity}</span>}
                    <div className="offer-status">
                      {offer.status === "claimed"
                        ? `🤝 ${offer.claimedByName} is picking this up`
                        : `Offered for pickup at ${offer.location}`}
                    </div>
                  </div>
                  <div className="pantry-actions">
                    {offer.status === "claimed" && (
                      <button className="btn ghost" onClick={() => onMessage(offer)}>💬 Message</button>
                    )}
                    <button className="btn ghost" onClick={() => askUse(groupPantryItems([item])[0] || itemGroup(item), offer)}>Used up</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {keeping.length > 0 && (
        <>
          {offering.length > 0 && <h3 className="pantry-heading">Keeping ({sorted.length})</h3>}
          <ul className="pantry-list">
            {sorted.map((group) => {
              const days = daysUntil(group.expiresOn);
              const soon = days !== null && days <= SOON_DAYS;
              return (
                <li key={group.ids.join("-")} className={soon ? "card pantry-item soon" : "card pantry-item"}>
                  <div>
                    <span className="pantry-emoji" aria-hidden>{foodEmoji(group.name)}</span>
                    <strong>{group.label}</strong>
                    {group.qtyText && <span className="qty"> · {group.qtyText}</span>}
                    {days !== null && <div className={soon ? "expiry soon" : "expiry muted"}>{expiryLabel(days)}</div>}
                  </div>
                  <div className="pantry-actions">
                    <button className="btn ghost" onClick={() => share(group)}>Share</button>
                    <button className="btn ghost" onClick={() => askUse(group)}>Used up</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="muted pantry-note">Only you can see your pantry. Items on the board leave it when you mark the hand-off completed.</p>
      {using && (
        <UseUpDialog
          group={using.group}
          offer={using.offer}
          onClose={() => setUsing(null)}
          onApply={(leftover) => applyUse(using.group, using.offer, leftover)}
        />
      )}
    </section>
  );
}

function itemGroup(item) {
  return {
    id: item.id,
    ids: [item.id],
    items: [item],
    name: item.name,
    quantity: item.quantity || "",
    amount: null,
    unit: "",
    expiresOn: item.expiresOn || "",
    label: item.name,
    qtyText: item.quantity || "",
  };
}

function haveLabel(group) {
  if (group.qtyText) return `${group.label} · ${group.qtyText}`;
  return group.label;
}

/** Asks how much was used so a partial amount can stay in the pantry. */
function UseUpDialog({ group, offer, onClose, onApply }) {
  const counted = typeof group.amount === "number";
  const [used, setUsed] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const unitLabel = group.unit || (counted ? group.name : "");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(leftover) {
    setBusy(true);
    setError("");
    try {
      await onApply(leftover);
      onClose();
    } catch (err) {
      setError("Couldn't update that: " + err.message);
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!counted) {
      const left = used.trim();
      if (!left) {
        setError("Type what's left, or choose Used all of it.");
        return;
      }
      await run(left);
      return;
    }
    const amount = parseUsedAmount(used, { unit: group.unit, name: group.name });
    if (amount == null) {
      setError("Enter how much you used, like 2.");
      return;
    }
    if (amount > group.amount + 0.0005) {
      const have = group.unit ? `${formatAmount(group.amount)} ${group.unit}` : formatAmount(group.amount);
      setError(`You only have ${have}.`);
      return;
    }
    await run(quantityAfterUse(group.amount, amount, group.unit));
  }

  return (
    <div className="review-backdrop" onClick={onClose}>
      <form className="card use-sheet" role="dialog" aria-modal="true" aria-labelledby="use-up-title" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2 id="use-up-title">How much did you use?</h2>
        <p className="muted">You have {haveLabel(group)}. The rest stays in your pantry.</p>
        {offer && (
          <p className="muted">
            {offer.status === "claimed"
              ? "Someone is picking this up. Using all of it takes the post down. Using some updates the amount on the post."
              : "This is on the board. Using all of it takes the post down. Using some updates the amount on the post."}
          </p>
        )}
        <label>
          {counted ? "Amount used" : "What's left"}
          <span className="use-amount">
            <input
              autoFocus
              inputMode="decimal"
              value={used}
              placeholder={counted ? "e.g. 2" : group.quantity || "What's still left"}
              aria-label={counted ? "Amount used" : "What's left"}
              onChange={(e) => setUsed(e.target.value)}
            />
            {unitLabel && <span>{unitLabel}</span>}
          </span>
        </label>
        {!counted && <p className="hint">This amount isn't a count, so type what's still left, or mark it all used.</p>}
        {error && <p className="error">{error}</p>}
        <div className="use-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn ghost" onClick={() => run("")} disabled={busy}>Used all of it</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
