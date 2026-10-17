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

/** Instagram-style short age: "now", "5m", "3h", "2d", "1w". */
export function shortAgo(ms) {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/** Centered chat timestamp: "3:05 PM" today, otherwise "Oct 17, 3:05 PM". */
export function chatStamp(ms) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}
