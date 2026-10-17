// Device location is required to use the board. Coordinates stay on the
// profile so we can show distance. The UI shows a neighborhood label, not a pin.

export function formatDistance(from, to) {
  if (from == null || to == null || from.lat == null || to.lat == null) return "";
  const km = haversineKm(from.lat, to.lat, from.lng, to.lng);
  if (!Number.isFinite(km)) return "";
  if (km < 0.05) return "about 50 m away";
  if (km < 1) return `about ${Math.round((km * 1000) / 50) * 50} m away`;
  if (km < 10) return `about ${km.toFixed(1)} km away`;
  return `about ${Math.round(km)} km away`;
}

export function milesBetween(from, to) {
  if (from == null || to == null || from.lat == null || to.lat == null) return Infinity;
  return haversineKm(from.lat, to.lat, from.lng, to.lng) * 0.621371;
}

function haversineKm(lat1, lat2, lng1, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a1 = (lat1 * Math.PI) / 180;
  const a2 = (lat2 * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function requestDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser can't share device location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const label = await neighborhoodLabel(lat, lng);
        resolve({ lat, lng, label });
      },
      (err) => {
        if (err.code === 1) {
          reject(new Error("Location access is required. Allow it for this site, then try again."));
        } else if (err.code === 2) {
          reject(new Error("Couldn't find this device. Check that location is turned on, then try again."));
        } else {
          reject(new Error("The location request timed out. Try again."));
        }
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
    );
  });
}

async function neighborhoodLabel(lat, lng) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return "Location verified";
    const data = await res.json();
    const city = data.city || data.locality || "";
    const region = data.principalSubdivision || "";
    const neighborhood = data.locality && data.city && data.locality !== data.city ? data.locality : "";
    const parts = neighborhood ? [neighborhood, city] : [city, region];
    return parts.filter(Boolean).join(", ") || "Location verified";
  } catch {
    return "Location verified";
  }
}

// ---------- Distances on posts ----------
//
// Posts store the poster's housing location rounded to a ~200 m grid (approxLat/approxLng),
// so other people see "0.3 mi away" without learning anyone's exact address.

const GRID = 0.002; // degrees, roughly 200 m

/** Rounds a point to the grid. Returns null if the point is missing. */
export function approxPoint(point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  const snap = (v) => Number((Math.round(v / GRID) * GRID).toFixed(3));
  return { lat: snap(point.lat), lng: snap(point.lng) };
}

/** Miles from `here` (the viewer's housing) to a post, or null if either location is unknown. */
export function milesToPost(here, post) {
  if (!here || !post || !Number.isFinite(post.approxLat) || !Number.isFinite(post.approxLng)) return null;
  const miles = milesBetween(here, { lat: post.approxLat, lng: post.approxLng });
  return Number.isFinite(miles) ? miles : null;
}

/** Short label like "0.3 mi away". Empty if the distance is unknown. */
export function awayLabel(miles) {
  if (miles === null || miles === undefined) return "";
  if (miles < 0.1) return "< 0.1 mi away";
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}
