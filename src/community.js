// Groups neighbors who picked the same dorm, apartment, or building.
// The id is stored on the private profile and on communities/{id}/members/{uid}.

function slug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Building name, with apartment or unit numbers removed so roommates share one community. */
export function placeSlug(label) {
  const stripped = String(label || "")
    .replace(/\b(?:apt|unit|suite|ste)\.?\s*[a-z0-9-]+\b/gi, " ")
    .replace(/#\s*[a-z0-9-]+\b/gi, " ");
  return slug(stripped);
}

/** Stable id for one campus building. Empty if either part is missing. */
export function communityId(universityName, housingLabel) {
  const uni = slug(universityName);
  const place = placeSlug(housingLabel);
  if (!uni || !place) return "";
  return `${uni}__${place}`;
}

function activePosts(posts, uid) {
  return (posts || []).filter((post) => post.ownerId === uid && post.status !== "completed");
}

/**
 * Neighbors in this dorm or apartment, each with their current offers and requests.
 * Search matches a name, or an item someone is offering or looking to buy.
 */
export function communityPeople({ me, members, posts, search }) {
  const byId = new Map();
  for (const member of members || []) {
    if (member && member.uid) byId.set(member.uid, member);
  }
  if (me && me.uid) {
    const existing = byId.get(me.uid) || {};
    byId.set(me.uid, {
      ...existing,
      uid: me.uid,
      name: me.name || existing.name || "Neighbor",
      photoURL: me.photoURL || existing.photoURL || "",
    });
  }

  const term = (search || "").trim().toLowerCase();
  const people = [];
  for (const member of byId.values()) {
    const mine = activePosts(posts, member.uid);
    const nameHit = (member.name || "").toLowerCase().includes(term);
    const itemHit = mine.some((post) => `${post.item || ""} ${post.quantity || ""}`.toLowerCase().includes(term));
    if (term && !nameHit && !itemHit) continue;
    people.push({
      ...member,
      offers: mine.filter((post) => post.type === "offer"),
      requests: mine.filter((post) => post.type === "request"),
    });
  }

  people.sort((a, b) => {
    if (me && a.uid === me.uid) return -1;
    if (me && b.uid === me.uid) return 1;
    const aCount = a.offers.length + a.requests.length;
    const bCount = b.offers.length + b.requests.length;
    if ((aCount === 0) !== (bCount === 0)) return aCount === 0 ? 1 : -1;
    return (a.name || "").localeCompare(b.name || "");
  });
  return people;
}
