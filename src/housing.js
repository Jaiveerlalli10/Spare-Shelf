// University of Washington halls are the current HFS list. Other campuses use
// OpenStreetMap. Address suggestions come from a geocoder biased to campus.
import { milesBetween } from "./location";

// Official UW Seattle residence halls and apartments. Coordinates are the building
// points from OpenStreetMap. Former names stay searchable.
export const UW_SEATTLE_HOUSING = [
  { name: "Alder Hall", kind: "dorm", lat: 47.65567, lng: -122.31355 },
  { name: "Elm Hall", kind: "dorm", lat: 47.65653, lng: -122.31525 },
  { name: "Hansee Hall", kind: "dorm", lat: 47.66078, lng: -122.30652 },
  { name: "Lander Hall", kind: "dorm", lat: 47.65566, lng: -122.31468 },
  { name: "Maple Hall", kind: "dorm", lat: 47.65568, lng: -122.31584 },
  { name: "McCarty Hall", kind: "dorm", lat: 47.6608, lng: -122.30502 },
  { name: "McMahon Hall", kind: "dorm", lat: 47.65824, lng: -122.30364 },
  { name: "Oak Hall", kind: "dorm", lat: 47.65936, lng: -122.30546 },
  { name: "Oliver Hall", kind: "dorm", lat: 47.65983, lng: -122.30427, also: "Willow Hall" },
  { name: "Poplar Hall", kind: "dorm", lat: 47.65655, lng: -122.31402 },
  { name: "Spratlen Hall", kind: "dorm", lat: 47.66013, lng: -122.30547, also: "Madrona Hall" },
  { name: "Terry Hall", kind: "dorm", lat: 47.65573, lng: -122.31707 },
  { name: "Cedar Apartments", kind: "apartment", lat: 47.65924, lng: -122.31948 },
  { name: "Commodore Duchess Apartments", kind: "apartment", lat: 47.65563, lng: -122.31239 },
  { name: "Mercer Court", kind: "apartment", lat: 47.65446, lng: -122.31781 },
  { name: "Nordheim Court", kind: "apartment", lat: 47.66524, lng: -122.29961 },
  { name: "Radford Court", kind: "apartment", lat: 47.67382, lng: -122.26019 },
  { name: "Stevens Court", kind: "apartment", lat: 47.65435, lng: -122.316 },
];

export function isUwSeattle(campus) {
  return Boolean(campus && /university of washington/i.test(campus.name) && campus.city === "Seattle");
}

/** Keyword match, so "lander" and "Lander Hall" both find Lander Hall. */
export function searchHousing(query, places) {
  const q = query.trim().toLowerCase();
  if (q.length < 2 || !places) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const hits = [];
  for (const place of places) {
    const blob = `${place.name} ${place.also || ""}`.toLowerCase();
    if (!words.every((word) => blob.includes(word))) continue;
    const nameTokens = blob.split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    for (const word of words) {
      if (nameTokens.includes(word)) score += 50;
      else score += 15;
    }
    if (place.name.toLowerCase() === q) score += 100;
    else if (place.name.toLowerCase().startsWith(q)) score += 8;
    hits.push({ ...place, score });
  }
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, 8);
}

/** Local hall matches first, then nearby addresses that aren't already listed. */
export function mergePlaces(local, remote) {
  const seen = new Set((local || []).map((place) => place.name.toLowerCase()));
  const extra = (remote || []).filter((place) => !seen.has(place.name.toLowerCase()));
  return [...(local || []), ...extra].slice(0, 8);
}

function placeKind(props) {
  const value = `${props.osm_key || ""} ${props.osm_value || ""}`;
  if (/dormitory|student_accommodation/.test(value)) return "dorm";
  if (/apartment/.test(value)) return "apartment";
  return "address";
}

function placeLabel(props) {
  if (props.name) return props.name;
  return [props.housenumber, props.street].filter(Boolean).join(" ");
}

/** Address and place suggestions near campus for the housing autocomplete. */
export async function suggestNearby(query, campus, signal) {
  const typed = query.trim();
  if (typed.length < 3) return [];
  const q = `${typed}, ${campus.city}, ${campus.state}`;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${campus.lat}&lon=${campus.lng}&limit=6`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Couldn't look up places.");
  const data = await res.json();
  const hits = [];
  for (const feature of data.features || []) {
    const coords = feature.geometry && feature.geometry.coordinates;
    if (!coords) continue;
    const [lng, lat] = coords;
    const miles = milesBetween(campus, { lat, lng });
    if (miles > NEAR_CAMPUS_MILES) continue;
    const props = feature.properties || {};
    const name = placeLabel(props);
    if (!name) continue;
    const blob = `${name} ${props.street || ""} ${props.housenumber || ""}`.toLowerCase();
    const skip = new Set(["ne", "nw", "se", "sw", "ave", "avenue", "st", "street", "rd", "road", "blvd", "dr", "drive", "ln", "lane", "the", "of", "and"]);
    const words = typed.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 2 && !skip.has(word));
    const needed = words.filter((word) => !/^\d+$/.test(word));
    const numbers = words.filter((word) => /^\d+$/.test(word));
    if (needed.length && !needed.every((word) => blob.includes(word))) continue;
    if (!needed.length && numbers.length && !numbers.some((word) => blob.includes(word))) continue;
    const detail = props.name && props.street
      ? [props.housenumber, props.street].filter(Boolean).join(" ")
      : "";
    hits.push({
      name,
      kind: placeKind(props),
      lat,
      lng,
      miles,
      detail,
      numberHits: numbers.filter((word) => blob.includes(word)).length,
    });
  }
  hits.sort((a, b) => b.numberHits - a.numberHits || a.miles - b.miles);
  const seen = new Set();
  return hits.filter((hit) => {
    const key = hit.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

export const NEAR_CAMPUS_MILES = 12;

export function formatMiles(miles) {
  if (!Number.isFinite(miles)) return "";
  if (miles < 0.1) return "under a tenth of a mile";
  if (miles < 10) return `${miles.toFixed(1)} miles`;
  return `${Math.round(miles)} miles`;
}

/** Named residence halls and student housing within a few miles of campus. */
export async function nearbyDorms(campus) {
  const query = `[out:json][timeout:20];(nwr["building"="dormitory"](around:6000,${campus.lat},${campus.lng});nwr["amenity"="student_accommodation"](around:6000,${campus.lat},${campus.lng}););out center tags;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error("Couldn't load dorm halls.");
  const data = await res.json();
  const byName = new Map();
  for (const el of data.elements || []) {
    const name = el.tags && el.tags.name ? el.tags.name.trim() : "";
    if (name.length < 3) continue;
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lng = el.lon != null ? el.lon : el.center && el.center.lon;
    if (!name || lat == null || lng == null) continue;
    const miles = milesBetween(campus, { lat, lng });
    if (miles > NEAR_CAMPUS_MILES) continue;
    const key = name.toLowerCase();
    const prev = byName.get(key);
    if (!prev || miles < prev.miles) byName.set(key, { name, lat, lng, miles, kind: "dorm" });
  }
  return [...byName.values()].sort((a, b) => a.miles - b.miles || a.name.localeCompare(b.name));
}

const GENERIC_WORDS = new Set([
  "the", "and", "of", "at", "hall", "dorm", "dormitory", "residence", "residential",
  "ave", "avenue", "st", "street", "rd", "road", "blvd", "drive", "dr", "ln", "lane",
  "ne", "nw", "se", "sw", "apt", "apartment", "unit", "north", "south", "east", "west",
]);

function words(value) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

// Keep a typed place only when the map result is near campus and actually matches the name or street.
function candidateScore(typed, props) {
  const distinctive = words(typed).filter((word) => word.length >= 4 && !GENERIC_WORDS.has(word) && !/^\d+$/.test(word));
  const blob = `${props.name || ""} ${props.street || ""} ${props.housenumber || ""}`.toLowerCase();
  if (distinctive.length === 0) {
    const first = words(typed).find((word) => word.length >= 3 && !GENERIC_WORDS.has(word));
    return first && blob.includes(first) ? 1 : 0;
  }
  const hits = distinctive.filter((word) => blob.includes(word)).length;
  return hits / distinctive.length;
}

/**
 * Find a typed dorm, apartment, or address and reject it when it is not near campus.
 * Returns the closest good match's coordinates. The caller keeps the text the person typed.
 */
export async function verifyHousing(text, campus) {
  const typed = text.trim();
  if (!typed) throw new Error("Enter a dorm hall, apartment, or address.");
  const q = `${typed}, ${campus.city}, ${campus.state}`;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${campus.lat}&lon=${campus.lng}&limit=5`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("Couldn't check that place. Try again.");
  const data = await res.json();
  let best = null;
  let nearest = null;
  for (const feature of data.features || []) {
    const coords = feature.geometry && feature.geometry.coordinates;
    if (!coords) continue;
    const [lng, lat] = coords;
    const miles = milesBetween(campus, { lat, lng });
    const props = feature.properties || {};
    const matched = props.name || [props.housenumber, props.street].filter(Boolean).join(" ") || typed;
    if (!nearest || miles < nearest.miles) nearest = { matched, miles };
    if (miles > NEAR_CAMPUS_MILES || candidateScore(typed, props) < 1) continue;
    if (!best || miles < best.miles) best = { matched, lat, lng, miles };
  }
  if (best) return best;
  if (nearest && nearest.miles > NEAR_CAMPUS_MILES) {
    throw new Error(`${nearest.matched} is about ${formatMiles(nearest.miles)} from campus. Enter a dorm, apartment, or address within ${NEAR_CAMPUS_MILES} miles.`);
  }
  throw new Error(`Couldn't find ${typed} within ${NEAR_CAMPUS_MILES} miles of campus. Pick a hall from the list, or enter a street address nearby.`);
}
