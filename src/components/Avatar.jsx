// Round profile picture. With no photo (or one that fails to load), shows an empty person silhouette.
// `size` is "sm" (32px), "md" (48px), "lg" (76px), or a number of pixels.
import { useState } from "react";

export default function Avatar({ name, photoURL, size = "sm" }) {
  const [broken, setBroken] = useState("");
  const named = typeof size === "string";
  const cls = named && size !== "sm" ? `avatar ${size}` : "avatar";
  const style = named ? undefined : { width: size, height: size };

  if (photoURL && broken !== photoURL) {
    return <img className={cls} style={style} src={photoURL} alt={name ? `${name}'s photo` : ""} onError={() => setBroken(photoURL)} />;
  }
  return (
    <span className={`${cls} avatar-empty`} style={style} role="img" aria-label={name ? `${name} (no photo)` : "No photo"}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="9" r="4.2" />
        <path d="M3.6 21.5c.6-4.6 4-7.3 8.4-7.3s7.8 2.7 8.4 7.3" />
      </svg>
    </span>
  );
}
