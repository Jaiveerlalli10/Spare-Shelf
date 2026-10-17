import { useState } from "react";
import Avatar from "./Avatar";
import { readProfilePhoto } from "../photo";

export default function PhotoField({ name, photoURL, onChange, hint }) {
  const [error, setError] = useState("");

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      setError("");
      onChange(await readProfilePhoto(file));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="photo-row">
      <Avatar name={name || "?"} photoURL={photoURL} size="lg" />
      <div>
        <div className="photo-actions">
          <label className="file-btn btn ghost">
            {photoURL ? "Change photo" : "Add a photo"}
            <input type="file" accept="image/*" onChange={onFile} />
          </label>
          {photoURL && (
            <button type="button" className="btn ghost" onClick={() => onChange("")}>Remove</button>
          )}
        </div>
        <p className="hint">{hint || "Optional. A photo helps neighbors recognize you and makes this feel like a community."}</p>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
