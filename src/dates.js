// Small date helpers shared by posts and the pantry.

/** Whole days from today until "YYYY-MM-DD" (0 = today, negative = past). null if no date. */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(new Date().toDateString());
  return Math.round((new Date(dateStr + "T00:00") - today) / 86400000);
}

/** Short label like "best by 3d" for a days-until number. */
export function expiryLabel(days) {
  if (days === null) return "";
  if (days < 0) return "past best-by";
  if (days === 0) return "best by today";
  return `best by ${days}d`;
}
