// The "Taste profile" part of the profile form: tap chips to pick diet, allergies, cuisines, etc.
// `taste` is the current value and `onChange(next)` gets the updated one.
import { DIETS, ALLERGIES, CUISINES, SPICE, TIME } from "../taste";

// One row of chips. `multi` lets you pick several; otherwise tapping the picked one clears it.
function Chips({ options, value, multi, onChange }) {
  const picked = (o) => (multi ? value.includes(o) : value === o);
  function toggle(o) {
    if (multi) onChange(picked(o) ? value.filter((v) => v !== o) : [...value, o]);
    else onChange(picked(o) ? "" : o);
  }
  return (
    <div className="taste-chips">
      {options.map((o) => (
        <button key={o} type="button" className={picked(o) ? "chip active" : "chip"} aria-pressed={picked(o)} onClick={() => toggle(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

// `firstTime`: shown during first profile setup, so we mention it can be changed later.
export default function TasteFields({ taste, onChange, firstTime }) {
  const set = (field) => (value) => onChange({ ...taste, [field]: value });
  return (
    <div className="taste-fields">
      <p className="section-label">Taste profile, optional</p>
      <p className="hint">
        Used to personalize recipe ideas on the Recipes tab. Only you can see it.
        {firstTime && " You can skip this for now and edit it later in your profile settings."}
      </p>

      <span className="taste-label">Diet</span>
      <Chips options={DIETS} value={taste.diet} onChange={set("diet")} />

      <span className="taste-label">Allergies</span>
      <Chips options={ALLERGIES} value={taste.allergies} multi onChange={set("allergies")} />

      <span className="taste-label">Favorite cuisines</span>
      <Chips options={CUISINES} value={taste.cuisines} multi onChange={set("cuisines")} />

      <span className="taste-label">Spice level</span>
      <Chips options={SPICE} value={taste.spice} onChange={set("spice")} />

      <span className="taste-label">Cooking time</span>
      <Chips options={TIME} value={taste.time} onChange={set("time")} />

      <label>Foods you don't like
        <input value={taste.dislikes} maxLength={200} onChange={(e) => set("dislikes")(e.target.value)}
          placeholder="e.g. mushrooms, cilantro" />
      </label>
    </div>
  );
}
