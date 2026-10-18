// Address search and "what's at this spot?" lookups, from the free Photon geocoder (OpenStreetMap data).
// Used when the giver chooses a pickup spot: they drag a pin (we look up its address) or search an address.
import { milesBetween } from "./location";

const PHOTON = "https://photon.komoot.io";
const MAX_MILES = 15; // ignore search results far from where you are

/** A short readable name for a Photon result, like "Suzzallo Library" or "4521 Brooklyn Ave NE". */
function labelFor(props) {
  const street = [props.housenumber, props.street].filter(Boolean).join(" ");
  if (props.name && street && props.name !== props.street) return `${props.name}, ${street}`;
  return props.name || street || props.district || props.city || "";
}

/** Places matching `query` near `near` ({ lat, lng }): [{ label, lat, lng }]. */
export async function searchPlaces(query, near, signal) {
  const q = query.trim();
  if (q.length < 3) return [];
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : "";
  const res = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(q)}${bias}&limit=8`, { signal });
  if (!res.ok) throw new Error("Address search failed");
  const data = await res.json();
  const seen = new Set();
  const out = [];
  for (const f of data.features || []) {
    const [lng, lat] = (f.geometry && f.geometry.coordinates) || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (near && milesBetween(near, { lat, lng }) > MAX_MILES) continue;
    const label = labelFor(f.properties || {});
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, lat, lng, detail: [f.properties.city, f.properties.state].filter(Boolean).join(", ") });
  }
  return out.slice(0, 6);
}

/** The address or place name at a point, or "" if nothing is found. */
export async function reverseGeocode(lat, lng, signal) {
  const res = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lng}`, { signal });
  if (!res.ok) return "";
  const data = await res.json();
  const f = (data.features || [])[0];
  return f ? labelFor(f.properties || {}) : "";
}
