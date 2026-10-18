// While the app is open, sends my live location to each person I chose to share it with
// (about every 20 seconds, or sooner if I moved more than 15 m).
import { useEffect, useRef } from "react";
import { shareLiveLocation } from "./data";
import { milesBetween } from "./location";

const SEND_EVERY_MS = 20000;
const SEND_IF_MOVED_M = 15;

export function useLiveSharing(user, pos, sharingWith) {
  const latest = useRef({ user, pos, sharingWith });
  latest.current = { user, pos, sharingWith };
  const lastSent = useRef({}); // uid -> { lat, lng, t }

  function sendIfNeeded() {
    const { user: me, pos: p, sharingWith: people } = latest.current;
    if (!me || !p) return;
    for (const uid of people) {
      const last = lastSent.current[uid];
      const movedM = last ? milesBetween(last, p) * 1609.34 : Infinity;
      if (!last || movedM > SEND_IF_MOVED_M || Date.now() - last.t > SEND_EVERY_MS) {
        lastSent.current[uid] = { lat: p.lat, lng: p.lng, t: Date.now() };
        shareLiveLocation(me, uid, p).catch((err) => console.error("Couldn't share live location:", err));
      }
    }
  }

  const key = sharingWith.join(",");
  // Send when I move or when the list changes...
  useEffect(sendIfNeeded, [pos?.lat, pos?.lng, key]);
  // ...and keep it fresh even if I'm standing still.
  useEffect(() => {
    if (!key) return;
    const id = setInterval(sendIfNeeded, SEND_EVERY_MS);
    return () => clearInterval(id);
  }, [key]);
}
