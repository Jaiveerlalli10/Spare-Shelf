import { useEffect, useState } from "react";
import { saveProfile } from "../data";
import { nearbyDorms, suggestNearby, searchHousing, mergePlaces, isUwSeattle, UW_SEATTLE_HOUSING, formatMiles, NEAR_CAMPUS_MILES } from "../housing";
import { milesBetween } from "../location";
import { UNIVERSITIES, searchUniversities } from "../universities";
import PhotoField from "./PhotoField";

export default function ProfileSetup({ user, profile, required, onSaved }) {
  const savedUni = profile && profile.universityName ? {
    name: profile.universityName,
    city: profile.universityCity,
    state: profile.universityState,
    lat: profile.universityLat,
    lng: profile.universityLng,
  } : null;

  const [query, setQuery] = useState(savedUni ? savedUni.name : "");
  const [open, setOpen] = useState(false);
  const [university, setUniversity] = useState(savedUni);
  const [dorms, setDorms] = useState([]);
  const [housingOpen, setHousingOpen] = useState(false);
  const [remotePlaces, setRemotePlaces] = useState([]);
  const [housingStatus, setHousingStatus] = useState("idle");
  const [housingText, setHousingText] = useState(profile?.housingLabel || "");
  const [verified, setVerified] = useState(profile?.housingLabel ? {
    kind: profile.housingKind || "dorm",
    label: profile.housingLabel,
    lat: profile.housingLat,
    lng: profile.housingLng,
  } : null);
  const [bio, setBio] = useState(profile?.bio || "");
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || user.photoURL || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const matches = open ? searchUniversities(query) : [];
  const miles = university && verified ? milesBetween(university, verified) : null;
  const catalog = isUwSeattle(university) ? UW_SEATTLE_HOUSING : dorms;
  const localPlaces = housingOpen ? searchHousing(housingText, catalog) : [];
  const suggestions = mergePlaces(localPlaces, housingOpen ? remotePlaces : []);

  useEffect(() => {
    if (!university || isUwSeattle(university)) {
      setDorms([]);
      return;
    }
    let cancelled = false;
    nearbyDorms(university)
      .then((list) => { if (!cancelled) setDorms(list); })
      .catch(() => { if (!cancelled) setDorms([]); });
    return () => { cancelled = true; };
  }, [university]);

  useEffect(() => {
    const typed = housingText.trim();
    if (!university || !housingOpen || typed.length < 3) {
      setRemotePlaces([]);
      setHousingStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    setHousingStatus("loading");
    const timer = setTimeout(() => {
      suggestNearby(typed, university, ctrl.signal)
        .then((list) => {
          setRemotePlaces(list);
          setHousingStatus("ready");
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setRemotePlaces([]);
          setHousingStatus("ready");
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [housingText, housingOpen, university]);

  function onQuery(e) {
    setQuery(e.target.value);
    setOpen(true);
    setUniversity(null);
    setVerified(null);
    setHousingText("");
    setError("");
  }

  function chooseUniversity(uni) {
    setUniversity(uni);
    setQuery(uni.name);
    setOpen(false);
    setVerified(null);
    setHousingText("");
    setError("");
  }

  function chosenPlace() {
    const typed = housingText.trim();
    if (verified && verified.label === typed) return verified;
    return null;
  }

  function pickPlace(place) {
    const kind = place.kind || "address";
    setHousingText(place.name);
    setVerified({ kind, label: place.name, lat: place.lat, lng: place.lng });
    setHousingOpen(false);
    setError("");
  }

  function onHousingText(e) {
    setHousingText(e.target.value);
    setHousingOpen(true);
    setVerified(null);
    setError("");
  }

  function onHousingKeyDown(e) {
    if (e.key !== "Enter" || chosenPlace()) return;
    e.preventDefault();
    setError("Choose your dorm, apartment, or address from the list.");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!university) {
      setError("Choose your university.");
      return;
    }
    const place = chosenPlace();
    if (!place) {
      setError("Choose your dorm, apartment, or address from the list.");
      return;
    }
    setSaving(true);
    try {
      await saveProfile(user, {
        university,
        housing: place,
        bio,
        photoURL,
        createdAt: profile?.createdAt,
      });
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.message || "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form profile-setup" onSubmit={submit}>
      <h2>{required ? "Finish your profile" : "Your profile"}</h2>
      <p className="auth-lead">
        {required
          ? "Before you can use Spare Shelf, add your university and where you live near campus."
          : "Update your campus, housing, photo, or bio."}
      </p>

      <label>University
        <input
          value={query}
          onChange={onQuery}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search U.S. universities"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="university-list"
        />
      </label>
      <p className="hint">{UNIVERSITIES.length.toLocaleString()} colleges and universities, from the U.S. Department of Education directory.</p>
      {open && query.trim().length >= 2 && (
        <ul className="combo-list" id="university-list" role="listbox">
          {matches.length === 0 ? (
            <li className="muted combo-empty">No campus matches that.</li>
          ) : matches.map((uni) => (
            <li key={`${uni.name}|${uni.city}|${uni.state}`}>
              <button type="button" onClick={() => chooseUniversity(uni)}>
                {uni.name}
                <span className="muted"> {uni.city}, {uni.state}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {university && <p className="status done">{university.name} · {university.city}, {university.state}</p>}

      {university && (
        <>
          <label>Dorm, apartment, or address
            <input
              value={housingText}
              onChange={onHousingText}
              onKeyDown={onHousingKeyDown}
              onFocus={() => setHousingOpen(true)}
              onBlur={() => setTimeout(() => setHousingOpen(false), 150)}
              placeholder={isUwSeattle(university) ? "Lander Hall, Mercer Court, or a street address" : "Hall name or a street address near campus"}
              autoComplete="off"
              role="combobox"
              aria-expanded={housingOpen}
              aria-controls="housing-list"
              required
            />
          </label>
          {housingOpen && housingText.trim().length >= 2 && (
            <ul className="combo-list" id="housing-list" role="listbox">
              {suggestions.length === 0 && housingStatus === "loading" && (
                <li className="muted combo-empty">Looking up places near campus…</li>
              )}
              {suggestions.length === 0 && housingStatus !== "loading" && (
                <li className="muted combo-empty">No places near campus match that.</li>
              )}
              {suggestions.map((place) => (
                <li key={`${place.name}|${place.lat}|${place.lng}`}>
                  <button type="button" onClick={() => pickPlace(place)}>
                    <span>
                      {place.name}
                      {place.also && <span className="muted"> · was {place.also}</span>}
                      {place.detail && <span className="muted"> · {place.detail}</span>}
                    </span>
                    <span className="muted">{place.kind === "dorm" ? "Dorm" : place.kind === "apartment" ? "Apartment" : "Address"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">
            Click a match from the list. Typing alone will not save. It has to be within {NEAR_CAMPUS_MILES} miles of campus.
            {isUwSeattle(university) ? " UW Seattle halls and apartments are included, and nearby addresses fill in as you type." : ""}
          </p>
          {verified && Number.isFinite(miles) && (
            <p className="status done">
              About {formatMiles(miles)} from campus.
            </p>
          )}
        </>
      )}

      <p className="section-label">Photo and bio, optional</p>
      <div className="nudge">
        <strong>Add a photo if you can.</strong> A face makes Spare Shelf feel like a community, so neighbors know who they're meeting.
      </div>
      <PhotoField
        name={user.name}
        photoURL={photoURL}
        onChange={setPhotoURL}
        hint={photoURL ? "You can keep this photo or choose another." : "A clear photo of you works best."}
      />
      <label>Bio
        <textarea
          rows="2"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={480}
          placeholder="I bake on Sundays and always have extra flour."
        />
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary" type="submit" disabled={saving}>
        {saving ? "Checking…" : required ? "Save and continue" : "Save profile"}
      </button>
    </form>
  );
}
