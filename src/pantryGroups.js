// Combines pantry rows that are the same ingredient so "2 eggs" three times
// shows up as one row, "6 eggs". Amounts add only when they share a unit.
import { nameKey } from "./matching";
import { daysUntil } from "./dates";

const QTY = /^(?:(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?)|(\.\d+))\s*(.*)$/;

function text(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** "6" or "2.5". Drops floating-point dust. */
export function formatAmount(n) {
  const rounded = Math.round((n + Number.EPSILON) * 1000) / 1000;
  return String(rounded);
}

// "2 eggs" -> { amount: 2, rest: "eggs" }. A bare "2" is not a name, so null.
function leadingAmount(value) {
  const raw = text(value).trim();
  const match = raw.match(QTY);
  if (!match) return null;
  const amount = match[1] ? Number(match[1]) / Number(match[2]) : Number(match[3] ?? match[4]);
  const rest = (match[5] || "").trim();
  if (!Number.isFinite(amount) || !nameKey(rest)) return null;
  return { amount, rest };
}

// A quantity is a number plus an optional unit. A unit that just repeats the
// ingredient ("2 eggs" on an item named eggs) counts as a plain number.
function parseQuantity(quantity, itemName) {
  const raw = text(quantity).trim();
  if (!raw) return { kind: "blank" };
  const match = raw.match(QTY);
  if (!match) return { kind: "text", raw };
  const amount = match[1] ? Number(match[1]) / Number(match[2]) : Number(match[3] ?? match[4]);
  if (!Number.isFinite(amount)) return { kind: "text", raw };
  const rest = (match[5] || "").trim();
  const repeatsName = rest && nameKey(rest) === nameKey(itemName);
  const unit = repeatsName ? "" : rest;
  return { kind: "num", amount, unit, unitKey: nameKey(unit) };
}

function describe(item) {
  let name = text(item.name).trim();
  const named = leadingAmount(name);
  if (named) name = named.rest;
  const parsed = parseQuantity(item.quantity, name);
  if (parsed.kind === "num") return { name, ...parsed };
  if (parsed.kind === "blank" && named) {
    return { name, kind: "num", amount: named.amount, unit: "", unitKey: "" };
  }
  if (parsed.kind === "blank") return { name, kind: "blank" };
  return { name, kind: "text", raw: parsed.raw };
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  let best = values[0] || "";
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function soonestDate(items) {
  let best = "";
  let bestDays = Infinity;
  for (const item of items) {
    const days = daysUntil(item.expiresOn);
    if (days === null || days >= bestDays) continue;
    bestDays = days;
    best = item.expiresOn;
  }
  return best;
}

function toGroup(entries) {
  const items = entries.map((entry) => entry.item);
  const described = entries.map((entry) => entry.described);
  const name = mostCommon(described.map((d) => d.name));
  const expiresOn = soonestDate(items);
  const keeper = items.reduce((best, item) => ((item.addedAt || 0) < (best.addedAt || 0) ? item : best));
  const kind = described[0].kind;

  let quantity = "";
  let label = name;
  let qtyText = "";

  if (kind === "num") {
    const total = described.reduce((sum, d) => sum + d.amount, 0);
    const unit = mostCommon(described.map((d) => d.unit).filter(Boolean));
    quantity = unit ? `${formatAmount(total)} ${unit}` : formatAmount(total);
    if (unit) {
      label = name;
      qtyText = quantity;
    } else {
      label = `${formatAmount(total)} ${name}`;
      qtyText = "";
    }
  } else if (kind === "text") {
    const raw = described[0].raw;
    quantity = items.length > 1 ? `${items.length} × ${raw}` : raw;
    qtyText = quantity;
  }

  return {
    key: entries[0].key,
    id: keeper.id,
    ids: items.map((item) => item.id).sort(),
    items,
    name,
    quantity,
    expiresOn,
    label,
    qtyText,
  };
}

/**
 * One group per ingredient (and unit). Items already on the board should be
 * passed separately from items you're keeping, so a live offer stays tied to its post.
 */
export function groupPantryItems(items) {
  const buckets = new Map();
  for (const item of items) {
    const described = describe(item);
    if (!nameKey(described.name)) continue;
    const key = described.kind === "num"
      ? `${nameKey(described.name)}|n:${described.unitKey}`
      : described.kind === "text"
        ? `${nameKey(described.name)}|t:${described.raw.toLowerCase()}`
        : `${nameKey(described.name)}|b`;
    const bucket = buckets.get(key) || [];
    bucket.push({ item, described, key });
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map(toGroup);
}

/**
 * The group a new pantry row would fall into, including the new amount in the total.
 * Null when nothing already stored matches it.
 * `group.items` includes a stand-in with id "__draft__".
 */
export function groupToJoin(items, draft) {
  const tagged = { ...draft, id: "__draft__", addedAt: Date.now() };
  const found = groupPantryItems([...items, tagged]).find((group) => group.items.some((item) => item.id === "__draft__"));
  if (!found || found.items.length < 2) return null;
  return found;
}
