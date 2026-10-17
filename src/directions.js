// Walking directions from the free OpenStreetMap routing service (FOSSGIS, same one openstreetmap.org uses).
// No API key needed. If it fails, callers fall back to a straight line.
const ROUTER = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

/** Walking route between two { lat, lng } points: { distance (m), duration (s), steps, geometry }. */
export async function walkingRoute(from, to, signal) {
  const url = `${ROUTER}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const data = await res.json();
  const route = data.routes && data.routes[0];
  if (data.code !== "Ok" || !route) throw new Error("No walking route found");
  return { distance: route.distance, duration: route.duration, geometry: route.geometry, steps: route.legs[0].steps };
}

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

/** Plain-English text for one routing step, like "Turn left onto NE 45th St". */
export function stepText(step) {
  const m = step.maneuver || {};
  const name = step.name;
  const onto = name ? ` onto ${name}` : "";
  const mod = m.modifier || "";
  switch (m.type) {
    case "depart":
      return `Head ${COMPASS[Math.round((m.bearing_after || 0) / 45) % 8]}${name ? ` on ${name}` : ""}`;
    case "arrive":
      return "Arrive at the pickup area";
    case "turn":
    case "end of road":
    case "fork":
    case "on ramp":
    case "off ramp":
      if (mod === "straight") return `Continue straight${onto}`;
      if (mod === "uturn") return "Make a U-turn";
      return `${mod.startsWith("slight") ? "Keep" : "Turn"} ${mod.replace("slight ", "")}${onto}`;
    case "roundabout":
    case "rotary":
      return `Go around the roundabout${onto}`;
    default:
      return `Continue${name ? ` on ${name}` : ""}`;
  }
}

/** "0.8 mi", or feet for short distances. */
export function formatWalkDistance(meters) {
  const miles = meters / 1609.34;
  if (miles < 0.1) return `${Math.max(10, Math.round((meters * 3.281) / 10) * 10)} ft`;
  return `${miles.toFixed(1)} mi`;
}
