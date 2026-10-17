// Stars and quick notes neighbors leave after a hand-off.
// A review is one person's take on the other person for a single post.
// The same phrases are checked again in firestore.rules.

export const SHARED_TAGS = ["On time", "Friendly", "Easy to meet"];
export const GIVER_TAGS = ["Item was given as listed", "Good portion"];
export const RECEIVER_TAGS = ["Ready at the meetup", "Clear about what they needed"];
export const ALL_TAGS = [...SHARED_TAGS, ...GIVER_TAGS, ...RECEIVER_TAGS];
export const NOTE_MAX = 280;

/** The other person in this hand-off, or null if `uid` is not part of it. */
export function otherParty(post, uid) {
  if (!post || !uid) return null;
  if (uid === post.ownerId) return { id: post.claimedById, name: post.claimedByName || "Neighbor" };
  if (uid === post.claimedById) return { id: post.ownerId, name: post.ownerName || "Neighbor" };
  return null;
}

/** Quick notes that make sense for the person being reviewed. */
export function tagsFor(post, otherId) {
  const ownerGives = post.type === "offer";
  const giverId = ownerGives ? post.ownerId : post.claimedById;
  const roleTags = otherId === giverId ? GIVER_TAGS : RECEIVER_TAGS;
  return [...SHARED_TAGS, ...roleTags];
}

export function reviewDocId(postId, fromId) {
  return `${postId}_${fromId}`;
}

/** Average stars plus the notes neighbors use most. Null when nobody has reviewed them. */
export function summarizeReviews(reviews) {
  if (!reviews || reviews.length === 0) return null;
  const total = reviews.reduce((sum, review) => sum + Number(review.stars), 0);
  const counts = new Map();
  for (const review of reviews) {
    for (const tag of review.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const tags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([tag]) => tag);
  const written = reviews
    .filter((review) => (review.comment || "").trim())
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const note = written.length ? written[0].comment.trim() : "";
  return { average: total / reviews.length, count: reviews.length, tags, note };
}
