// Every U.S. campus in the Department of Education College Scorecard that has
// coordinates (pulled March 2023). Each row is [name, city, state, lat, lng].
import rows from "./universities.json";

export const UNIVERSITIES = rows.map(([name, city, state, lat, lng]) => ({ name, city, state, lat, lng }));

function tokens(value) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Campuses whose name, city, or state includes every keyword.
 * A word anywhere in the name counts, so "Washington" finds University of Washington
 * as well as names that start with Washington.
 */
export function searchUniversities(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const hits = [];
  for (const uni of UNIVERSITIES) {
    const name = uni.name.toLowerCase();
    const nameTokens = tokens(name);
    const city = uni.city.toLowerCase();
    const state = uni.state.toLowerCase();
    const hay = `${name} ${city} ${state}`;
    if (!words.every((word) => hay.includes(word))) continue;

    let score = 0;
    for (const word of words) {
      if (nameTokens.includes(word)) score += 50;
      else if (name.includes(word)) score += 15;
      else score += 5;
      if (name.includes("of " + word)) score += 40;
    }
    if (name === q) score += 100;
    else if (name.startsWith(q)) score += 8;
    score -= name.length * 0.02;
    hits.push({ uni, score });
  }
  hits.sort((a, b) => b.score - a.score || a.uni.name.localeCompare(b.uni.name));
  return hits.slice(0, 8).map((hit) => hit.uni);
}
