export default function Avatar({ name, photoURL, size = "sm" }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const cls = size === "lg" ? "avatar lg" : size === "md" ? "avatar md" : "avatar";
  if (photoURL) return <img className={cls} src={photoURL} alt="" />;
  return <span className={cls} aria-hidden="true">{initial}</span>;
}
