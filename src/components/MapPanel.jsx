// The map on the right: dark street map (OpenStreetMap via Leaflet) with zoom, a "You" dot at your
// housing, a pin for every active post, and walking directions to the selected post.
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { foodEmoji } from "../foodEmoji";
import { walkingRoute, stepText, formatWalkDistance } from "../directions";
import { pickupSpot, noTripReason } from "../location";
import { handoffRoles, pairId, watchLiveLocation, LIVE_FRESH_MS } from "../data";

const CAMPUS = [47.6553, -122.3035]; // fallback center: UW Seattle
// Standard OpenStreetMap tiles (free, no key). They're darkened with a CSS filter (.leaflet-tile-pane in styles.css).
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ROUTE_COLOR = "#a334fa";
// Post pins are turned off for now. Set to true to show an emoji pin for every active post again.
const SHOW_POST_PINS = false;

const hasSpot = (p) => p && Number.isFinite(p.approxLat) && Number.isFinite(p.approxLng);

const REROUTE_METERS = 50; // walk this far from where the route started before it re-routes

// `here`: your housing { lat, lng } from your profile (or null), with `homeLabel` its name.
// `device`: your live device location (from useDeviceLocation in App). `target`: the selected post (or null).
// Directions start from your live location when the browser allows it, otherwise from `here`,
// and go to the giver's shared live location when they share it, otherwise to their area.
export default function MapPanel({ here, homeLabel, device, posts, user, target, onSelect, onClear }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const pinsRef = useRef(null);
  const meRef = useRef(null);
  const routeRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [route, setRoute] = useState(null); // { distance, duration, steps, straight }
  const [routeState, setRouteState] = useState("idle"); // idle | loading | ready
  const [showSteps, setShowSteps] = useState(false);

  const origin = device.pos
    ? { lat: device.pos.lat, lng: device.pos.lng, accuracy: device.pos.accuracy, live: true }
    : here ? { lat: here.lat, lng: here.lng, live: false } : null;

  // Where the current route starts. Only moves after walking REROUTE_METERS, so GPS jitter
  // doesn't re-route constantly.
  const [routeFrom, setRouteFrom] = useState(null);
  useEffect(() => {
    if (!origin) { setRouteFrom(null); return; }
    setRouteFrom((prev) => {
      const moved = prev ? L.latLng(prev.lat, prev.lng).distanceTo([origin.lat, origin.lng]) : Infinity;
      if (prev && prev.live === origin.live && moved < REROUTE_METERS) return prev;
      return { lat: origin.lat, lng: origin.lng, live: origin.live };
    });
  }, [origin?.lat, origin?.lng, origin?.live]);

  // Create the map once.
  useEffect(() => {
    const map = L.map(boxRef.current, { zoomControl: false }).setView(here ? [here.lat, here.lng] : CAMPUS, 15);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    pinsRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Keep tiles filling the box when the layout changes size.
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(boxRef.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // "You" dot (live location if allowed, otherwise your profile address), plus an accuracy circle.
  const centeredOn = useRef(""); // re-center only when switching between profile and live location
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (meRef.current) meRef.current.remove();
    meRef.current = null;
    if (!origin) return;
    const layers = [L.marker([origin.lat, origin.lng], {
      icon: L.divIcon({ className: origin.live ? "map-me live" : "map-me", html: "<span></span>", iconSize: [22, 22] }),
      title: origin.live ? "You (live location)" : `You (${homeLabel || "your profile"})`,
      zIndexOffset: 1000,
    })];
    if (origin.live && origin.accuracy < 500) {
      layers.unshift(L.circle([origin.lat, origin.lng], {
        radius: origin.accuracy, color: "#3797f0", weight: 1, opacity: 0.5, fillColor: "#3797f0", fillOpacity: 0.12, interactive: false,
      }));
    }
    meRef.current = L.featureGroup(layers).addTo(map);
    const mode = origin.live ? "live" : "home";
    if (!target && centeredOn.current !== mode) {
      centeredOn.current = mode;
      map.setView([origin.lat, origin.lng], map.getZoom());
    }
  }, [origin?.lat, origin?.lng, origin?.live, origin?.accuracy]);

  // A pin for every post that isn't finished (only when SHOW_POST_PINS is on).
  useEffect(() => {
    const layer = pinsRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!SHOW_POST_PINS) return;
    const perSpot = {};
    for (const p of posts) {
      if (p.status === "completed" || !hasSpot(p)) continue;
      // Posts from the same building share a rounded spot, so fan them out a little.
      const key = `${p.approxLat},${p.approxLng}`;
      const n = (perSpot[key] = (perSpot[key] || 0) + 1);
      const r = n === 1 ? 0 : 0.00016 * Math.sqrt(n);
      const lat = p.approxLat + r * Math.cos(n * 2.4);
      const lng = p.approxLng + r * Math.sin(n * 2.4) * 1.5;

      const classes = ["map-pin", p.type];
      if (target && target.id === p.id) classes.push("selected");
      if (user && p.ownerId === user.uid) classes.push("mine");
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: classes.join(" "),
          html: `<span class="pin"><span class="pin-emoji">${foodEmoji(p.item)}</span></span>`,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
        }),
        title: `${p.ownerName} is ${p.type === "offer" ? "offering" : "requesting"} ${p.item}`,
        zIndexOffset: target && target.id === p.id ? 900 : 0,
      })
        .on("click", () => onSelectRef.current(p))
        .addTo(layer);
    }
  }, [posts, target?.id, user?.uid]);

  // Active posts with no saved location (posted before locations were saved), so no directions yet.
  const unpinned = posts.filter((p) => p.status !== "completed" && !hasSpot(p)).length;

  // Walking directions from you to wherever you pick the food up (see pickupSpot in location.js).
  const dest = target ? pickupSpot(target, user) : null;

  // The giver's live location, if they chose to share it with you (active hand-off only).
  const giverId = target && dest && target.status === "claimed" ? handoffRoles(target).giverId : null;
  const [giverLive, setGiverLive] = useState(null);
  useEffect(() => {
    setGiverLive(null);
    if (!giverId || !user) return;
    return watchLiveLocation(pairId(user.uid, giverId), giverId, setGiverLive);
  }, [giverId, user?.uid]);
  const [now, setNow] = useState(Date.now()); // ticks so "updated 20s ago" and staleness stay current
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);
  const liveFresh = giverLive && now - giverLive.updatedAt < LIVE_FRESH_MS;
  const goal = dest && liveFresh
    ? { lat: giverLive.lat, lng: giverLive.lng, live: true, updatedAt: giverLive.updatedAt }
    : dest ? { lat: dest.lat, lng: dest.lng, live: false } : null;

  // Where the route ends; like routeFrom, only moves after REROUTE_METERS so it doesn't jitter.
  const [routeTo, setRouteTo] = useState(null);
  useEffect(() => {
    if (!goal) { setRouteTo(null); return; }
    setRouteTo((prev) => {
      const moved = prev ? L.latLng(prev.lat, prev.lng).distanceTo([goal.lat, goal.lng]) : Infinity;
      if (prev && prev.live === goal.live && moved < REROUTE_METERS) return prev;
      return { lat: goal.lat, lng: goal.lng, live: goal.live };
    });
  }, [goal?.lat, goal?.lng, goal?.live]);
  const fittedFor = useRef(null);
  useEffect(() => { if (!target) fittedFor.current = null; }, [target?.id]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeRef.current) routeRef.current.remove();
    routeRef.current = null;
    setRoute(null);
    setShowSteps(false);
    if (!target) {
      setRouteState("idle");
      return;
    }
    if (!routeFrom || !dest || !routeTo) {
      // No trip for you: just show where the post is.
      setRouteState("idle");
      if (hasSpot(target)) map.setView([target.approxLat, target.approxLng], Math.max(map.getZoom(), 16));
      return;
    }
    const to = { lat: routeTo.lat, lng: routeTo.lng };

    // Mark the pickup spot (for requests it's the helper's place, which has no post pin).
    const endMarker = L.marker([to.lat, to.lng], {
      icon: L.divIcon({ className: routeTo.live ? "map-dest live" : "map-dest", html: "<span>🤝</span>", iconSize: [30, 30] }),
      title: routeTo.live ? `${dest.name} (live location)` : `Pick up from ${dest.name}`,
      zIndexOffset: 950,
    });
    const from = routeFrom;
    const draw = (layers) => {
      routeRef.current = L.featureGroup([...layers, endMarker]).addTo(map);
      // Zoom to the whole route when it's a new destination, not on every re-route while walking.
      const fitKey = `${target.id}:${routeTo.live}`;
      if (fittedFor.current !== fitKey) {
        fittedFor.current = fitKey;
        map.fitBounds(routeRef.current.getBounds(), { padding: [48, 48], maxZoom: 17 });
      }
    };
    const ctrl = new AbortController();
    setRouteState("loading");
    walkingRoute(from, to, ctrl.signal)
      .then((r) => {
        draw([
          L.geoJSON(r.geometry, { style: { color: "#ffffff", weight: 10, opacity: 0.12, lineCap: "round" } }),
          L.geoJSON(r.geometry, { style: { color: ROUTE_COLOR, weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" } }),
        ]);
        setRoute({ distance: r.distance, duration: r.duration, steps: r.steps, straight: false });
        setRouteState("ready");
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        // No street route: show a straight dashed line and estimate walking time (~1.35 m/s).
        const line = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], { color: ROUTE_COLOR, weight: 4, dashArray: "8 10" });
        draw([line]);
        const meters = map.distance([from.lat, from.lng], [to.lat, to.lng]);
        setRoute({ distance: meters, duration: meters / 1.35, steps: [], straight: true });
        setRouteState("ready");
      });
    return () => ctrl.abort();
  }, [target?.id, Boolean(dest), routeTo?.lat, routeTo?.lng, routeTo?.live, routeFrom?.lat, routeFrom?.lng]);

  return (
    <aside className="map-panel" id="map-panel" aria-label="Map and directions">
      <div className="map-head">
        <h2>🗺️ Map</h2>
        <span className="map-legend">
          {SHOW_POST_PINS && <><i className="lg offer" /> Offers <i className="lg request" /> Requests</>} <i className="lg me" /> You
        </span>
      </div>

      <div className="map-wrap">
        <div className="map-box" ref={boxRef} />
        <LocationNotice device={device} />
        {(origin || navigator.geolocation) && (
          <button className="map-recenter" title="Center on you (uses your device location)" aria-label="Center the map on you"
            onClick={() => {
              if (!device.pos) device.retry();
              if (origin && mapRef.current) mapRef.current.setView([origin.lat, origin.lng], 16);
            }}>
            ◎
          </button>
        )}
      </div>

      {target ? (
        <div className="map-card">
          <div className="map-card-top">
            <span className="map-card-emoji" aria-hidden>{foodEmoji(target.item)}</span>
            <div className="map-card-title">
              <strong>
                {user && target.ownerId === user.uid ? "Your post" : target.ownerName} · {target.item}
              </strong>
              <span className="muted">
                📍 {goal && goal.live ? `Meet ${dest.name} where they are` : dest ? `Pick up from ${dest.label}` : target.location}
              </span>
            </div>
            <button className="map-close" onClick={onClear} aria-label="Close directions">×</button>
          </div>

          {!dest && <p className="muted">{noTripReason(target, user)}</p>}
          {dest && !origin && <p className="muted">Allow location access, or finish your profile, to get directions.</p>}
          {dest && origin && (
            <p className="map-from">
              {routeFrom && routeFrom.live
                ? <>📡 From your current location{device.pos && device.pos.accuracy > 0 && ` (±${Math.round(device.pos.accuracy)} m)`}</>
                : <>🏠 From {homeLabel || "your profile address"}</>}

            </p>
          )}
          {dest && origin && (
            <p className="map-from">
              {goal && goal.live ? (
                <>📡 To {dest.name}'s live location <span className="muted">(updated {agoText(now - goal.updatedAt)})</span></>
              ) : (
                <>
                  🏠 To {dest.name}'s area
                  {target.status === "claimed" && (
                    <span className="muted"> · They aren't sharing their live location. Ask them in chat to tap "Share live location".</span>
                  )}
                </>
              )}
            </p>
          )}
          {routeState === "loading" && <p className="muted">Finding a walking route…</p>}

          {route && (
            <>
              <div className="map-stats">
                <span><b>{Math.max(1, Math.round(route.duration / 60))} min</b> walk</span>
                <span><b>{formatWalkDistance(route.distance)}</b></span>
              </div>
              {route.straight && <p className="muted">Couldn't get street directions, so this is a straight line.</p>}
              {!(goal && goal.live) && (
                <p className="muted map-approx">The pickup spot is approximate (about a block). Confirm the exact spot in chat.</p>
              )}
              {route.steps.length > 0 && (
                <button className="link" onClick={() => setShowSteps(!showSteps)}>
                  {showSteps ? "Hide steps" : `Show ${route.steps.length} steps`}
                </button>
              )}
              {showSteps && (
                <ol className="map-steps">
                  {route.steps.map((s, i) => (
                    <li key={i}>
                      <span>{stepText(s)}</span>
                      {s.distance > 0 && <span className="muted">{formatWalkDistance(s.distance)}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="map-hint muted">
          {here
            ? `Tap a post's 🧭 Directions button for walking directions${SHOW_POST_PINS ? ", or tap a pin" : ""}.`
            : "Sign in and finish your profile to get directions."}
          {unpinned > 0 && (
            <span className="map-unpinned">
              {" "}{unpinned} {unpinned === 1 ? "post has" : "posts have"} no location yet ({unpinned === 1 ? "it was" : "they were"} posted
              before locations were saved), so no directions until the poster opens Spare Shelf.
            </span>
          )}
        </p>
      )}
    </aside>
  );
}

/** Banner over the map explaining why live location isn't on yet, and how to fix it. */
function LocationNotice({ device }) {
  if (device.pos || device.status === "idle") return null;
  let text;
  let canRetry = true;
  switch (device.status) {
    case "asking":
      text = "Allow location access (look for the prompt near the address bar) so directions start from where you are.";
      canRetry = false;
      break;
    case "denied":
      text = "Location is blocked for this site. Click the location or 🔒 icon in the address bar, choose Allow, then tap Try again.";
      break;
    case "insecure":
      text = `Live location only works on https:// or localhost, and this page is ${window.location.origin}. Open it on the computer running the app (localhost) or on the deployed https site.`;
      canRetry = false;
      break;
    case "unsupported":
      text = "This browser can't share location. Directions start from your profile address.";
      canRetry = false;
      break;
    default:
      text = "Couldn't find your device. Make sure location services are on for your browser (on a Mac: System Settings → Privacy & Security → Location Services), then tap Try again.";
  }
  return (
    <div className="map-notice" role="status">
      <span>📍 {text}</span>
      {canRetry && <button className="btn small primary" onClick={device.retry}>Try again</button>}
    </div>
  );
}

function agoText(ms) {
  const sec = Math.max(1, Math.round(ms / 1000));
  return sec < 60 ? `${sec}s ago` : `${Math.round(sec / 60)} min ago`;
}
