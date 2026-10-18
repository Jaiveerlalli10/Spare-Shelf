// While the app is open, sends my live location to each person I'm sharing it with:
// whenever I move SEND_IF_MOVED_M (at most once every MIN_GAP_MS), plus a heartbeat every
// HEARTBEAT_MS while standing still so I don't look "stale" to them.
import { useEffect, useRef } from "react";
import { shareLiveLocation } from "./data";
import { milesBetween } from "./location";

const SEND_IF_MOVED_M = 5;
const MIN_GAP_MS = 2000;
const HEARTBEAT_MS = 15000;
const CHECK_EVERY_MS = 2000; // also sends a move that was held back by MIN_GAP_MS

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
      const sinceLast = last ? Date.now() - last.t : Infinity;
      const moved = movedM >= SEND_IF_MOVED_M && sinceLast >= MIN_GAP_MS;
      if (!last || moved || sinceLast >= HEARTBEAT_MS) {
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
    const id = setInterval(sendIfNeeded, CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [key]);
}
