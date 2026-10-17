// React hook: the device's live location from the browser (GPS / Wi-Fi), for directions.
// It is never saved anywhere; it only lives in this browser tab.
//
// It starts when `wanted` is true (e.g. after you tap Directions), or right away if this site
// was already given location permission before. Returns:
//   { status: "idle" | "asking" | "on" | "denied" | "unavailable", pos: { lat, lng, accuracy } | null }
import { useEffect, useState } from "react";

export function useDeviceLocation(wanted) {
  const [alreadyAllowed, setAlreadyAllowed] = useState(false);
  const [state, setState] = useState({ status: "idle", pos: null });

  // If permission was granted on an earlier visit, start without waiting for a tap.
  useEffect(() => {
    if (!navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions.query({ name: "geolocation" })
      .then((p) => { if (p.state === "granted") setAlreadyAllowed(true); })
      .catch(() => {});
  }, []);

  const active = wanted || alreadyAllowed;
  useEffect(() => {
    if (!active) return;
    if (!navigator.geolocation || !window.isSecureContext) {
      // Browsers only share location on https:// or localhost.
      setState({ status: "unavailable", pos: null });
      return;
    }
    setState((s) => (s.pos ? s : { ...s, status: "asking" }));
    const id = navigator.geolocation.watchPosition(
      (p) => setState({ status: "on", pos: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } }),
      (err) => setState((s) => ({ pos: s.pos, status: err.code === 1 ? "denied" : s.pos ? "on" : "unavailable" })),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  return state;
}
