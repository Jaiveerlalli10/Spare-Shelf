// Line drawing for the empty board. Strokes follow the surrounding text color.

export function EmptyShelf() {
  return (
    <svg className="empty-shelf" viewBox="0 0 200 120" aria-hidden>
      <path d="M36 16h128" opacity="0.4" />
      <path d="M36 16v92M164 16v92" />
      <rect className="solid" x="28" y="46" width="144" height="7" />
      <path d="M48 53v9M152 53v9" />
      <rect className="solid" x="28" y="90" width="144" height="7" />
      <path d="M48 97v9M152 97v9" />
    </svg>
  );
}
