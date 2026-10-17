// The map on the right: dark street map (OpenStreetMap via Leaflet) with zoom, a "You" dot at your
// housing, a pin for every active post, and walking directions to the selected post.
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { foodEmoji } from "../foodEmoji";
import { walkingRoute, stepText, formatWalkDistance } from "../directions";

const CAMPUS = [47.6553, -122.3035]; // fallback center: UW Seattle
// Standard OpenStreetMap tiles (free, no key). They're darkened with a CSS filter (.leaflet-tile-pane in styles.css).
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ROUTE_COLOR = "#a334fa";

const hasSpot = (p) => p && Number.isFinite(p.approxLat) && Number.isFinite(p.approxLng);

// `here`: your housing { lat, lng } (or null). `target`: the selected post (or null).
export default function MapPanel({ here, posts, user, target, onSelect, onClear }) {
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

  // "You" dot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (meRef.current) meRef.current.remove();
    meRef.current = null;
    if (!here) return;
    meRef.current = L.marker([here.lat, here.lng], {
      icon: L.divIcon({ className: "map-me", html: "<span></span>", iconSize: [22, 22] }),
      title: "You",
      zIndexOffset: 1000,
    }).addTo(map);
    if (!target) map.setView([here.lat, here.lng], map.getZoom());
  }, [here?.lat, here?.lng]);

  // A pin for every post that isn't finished.
  useEffect(() => {
    const layer = pinsRef.current;
    if (!layer) return;
    layer.clearLayers();
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

  // Active posts that can't be pinned (posted before locations were saved).
  const unpinned = posts.filter((p) => p.status !== "completed" && !hasSpot(p)).length;

  // Walking directions from you to the selected post.
  const isMine = target && user && target.ownerId === user.uid;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeRef.current) routeRef.current.remove();
    routeRef.current = null;
    setRoute(null);
    setShowSteps(false);
    if (!target || !hasSpot(target)) {
      setRouteState("idle");
      return;
    }
    const to = { lat: target.approxLat, lng: target.approxLng };
    if (!here || isMine) {
      setRouteState("idle");
      map.setView([to.lat, to.lng], Math.max(map.getZoom(), 16));
      return;
    }

    const draw = (layers) => {
      routeRef.current = L.featureGroup(layers).addTo(map);
      map.fitBounds(routeRef.current.getBounds(), { padding: [48, 48], maxZoom: 17 });
    };
    const ctrl = new AbortController();
    setRouteState("loading");
    walkingRoute(here, to, ctrl.signal)
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
        const line = L.polyline([[here.lat, here.lng], [to.lat, to.lng]], { color: ROUTE_COLOR, weight: 4, dashArray: "8 10" });
        draw([line]);
        const meters = map.distance([here.lat, here.lng], [to.lat, to.lng]);
        setRoute({ distance: meters, duration: meters / 1.35, steps: [], straight: true });
        setRouteState("ready");
      });
    return () => ctrl.abort();
  }, [target?.id, here?.lat, here?.lng]);

  return (
    <aside className="map-panel" id="map-panel" aria-label="Map and directions">
      <div className="map-head">
        <h2>🗺️ Map</h2>
        <span className="map-legend">
          <i className="lg offer" /> Offers <i className="lg request" /> Requests <i className="lg me" /> You
        </span>
      </div>

      <div className="map-wrap">
        <div className="map-box" ref={boxRef} />
        {here && (
          <button className="map-recenter" title="Center on you" aria-label="Center the map on you"
            onClick={() => mapRef.current && mapRef.current.setView([here.lat, here.lng], 16)}>
            ◎
          </button>
        )}
      </div>

      {target ? (
        <div className="map-card">
          <div className="map-card-top">
            <span className="map-card-emoji" aria-hidden>{foodEmoji(target.item)}</span>
            <div className="map-card-title">
              <strong>{isMine ? "Your post" : target.ownerName} · {target.item}</strong>
              <span className="muted">📍 {target.location}</span>
            </div>
            <button className="map-close" onClick={onClear} aria-label="Close directions">×</button>
          </div>

          {!hasSpot(target) && <p className="muted">This post has no location saved, so it can't be shown on the map.</p>}
          {hasSpot(target) && isMine && <p className="muted">This is your post. Neighbors get directions to you.</p>}
          {hasSpot(target) && !here && !isMine && <p className="muted">Finish your profile to get directions from your place.</p>}
          {routeState === "loading" && <p className="muted">Finding a walking route…</p>}

          {route && (
            <>
              <div className="map-stats">
                <span><b>{Math.max(1, Math.round(route.duration / 60))} min</b> walk</span>
                <span><b>{formatWalkDistance(route.distance)}</b></span>
              </div>
              {route.straight && <p className="muted">Couldn't get street directions, so this is a straight line.</p>}
              <p className="muted map-approx">Pins are approximate (about a block). Confirm the exact spot in chat.</p>
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
          {here ? "Tap a pin, or a post's 🧭 Directions button, for walking directions." : "Sign in and finish your profile to get directions."}
          {unpinned > 0 && (
            <span className="map-unpinned">
              {" "}{unpinned} {unpinned === 1 ? "post isn't" : "posts aren't"} on the map yet: {unpinned === 1 ? "it was" : "they were"} posted
              before locations were saved, and will appear once the poster opens Spare Shelf.
            </span>
          )}
        </p>
      )}
    </aside>
  );
}
