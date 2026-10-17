// React hook: the device's live location from the browser (GPS / Wi-Fi), for directions.
// It is never saved anywhere; it only lives in this browser tab.
//
// Starts when `wanted` is true. Returns:
//   status: "idle" | "asking" | "on" | "denied" | "insecure" | "unsupported" | "unavailable"
//   pos:    { lat, lng, accuracy } | null
//   retry:  call to ask again (e.g. after the person changes their browser settings)
import { useEffect, useState } from "react";

export function useDeviceLocation(wanted) {
  const [state, setState] = useState({ status: "idle", pos: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!wanted) return;
    if (!window.isSecureContext) {
      // Browsers only share location on https:// pages or localhost.
      setState({ status: "insecure", pos: null });
      return;
    }
    if (!navigator.geolocation) {
      setState({ status: "unsupported", pos: null });
      return;
    }
    setState((s) => (s.pos ? s : { ...s, status: "asking" }));
    const id = navigator.geolocation.watchPosition(
      (p) => setState({ status: "on", pos: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } }),
      (err) => {
        console.warn("Device location error:", err.code, err.message);
        setState((s) => ({ pos: s.pos, status: err.code === 1 ? "denied" : s.pos ? "on" : "unavailable" }));
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [wanted, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
