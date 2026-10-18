// The map on the right: dark street map (OpenStreetMap via Leaflet) with zoom, a "You" dot,
// walking directions to the pickup spot, and a "picking" mode where the giver chooses the pickup spot.
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { foodEmoji } from "../foodEmoji";
import { walkingRoute, stepText, formatWalkDistance } from "../directions";
import { noTripReason, tripFor } from "../location";
import { handoffRoles, pairId, watchLiveLocation, LIVE_FRESH_MS } from "../data";
import { searchPlaces, reverseGeocode } from "../geocode";
import LiveNote from "./LiveNote";

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
// `pickups`: { [postId]: pickup spot in effect }. `picking`: { key, subtitle, initial } while choosing a spot (or null).
// Directions go from your live location (or `here`) to the pickup spot, or the giver's area if none is set yet.
export default function MapPanel({
  here, homeLabel, device, posts, user, target, pickups = {}, picking,
  onSelect, onClear, onChoosePickup, onAcceptPickup, onPickSave, onPickCancel, liveShare,
}) {
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

  // Where you're walking: the pickup spot (agreed or suggested), or the giver's area if none yet.
  const targetPickup = target ? pickups[target.id] : null;
  const goal = target ? tripFor(target, user, targetPickup) : null;
  // You're the giver: of a claimed hand-off, or of your own offer nobody has claimed yet.
  const openOffer = target && target.status === "open" && target.type === "offer";
  const iGive = Boolean(target && user && (target.status === "claimed"
    ? handoffRoles(target).giverId === user.uid
    : openOffer && target.ownerId === user.uid));
  const otherName = target && user ? (target.ownerId === user.uid ? target.claimedByName : target.ownerName) : "";

  // Where the route ends; like routeFrom, only moves after REROUTE_METERS so it doesn't jitter.
  const [routeTo, setRouteTo] = useState(null);
  useEffect(() => {
    if (!goal) { setRouteTo(null); return; }
    setRouteTo((prev) => {
      const moved = prev ? L.latLng(prev.lat, prev.lng).distanceTo([goal.lat, goal.lng]) : Infinity;
      if (prev && prev.kind === goal.kind && moved < 5) return prev;
      return { lat: goal.lat, lng: goal.lng, kind: goal.kind };
    });
  }, [goal?.lat, goal?.lng, goal?.kind]);
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
    if (!routeFrom || !goal || !routeTo) {
      // No trip for you. If you're the giver and chose a pickup spot, show it; otherwise show the post's area.
      setRouteState("idle");
      if (targetPickup) {
        routeRef.current = L.featureGroup([pickupMarker(targetPickup, targetPickup.accepted)]).addTo(map);
        map.setView([targetPickup.lat, targetPickup.lng], Math.max(map.getZoom(), 16));
      } else if (hasSpot(target)) {
        map.setView([target.approxLat, target.approxLng], Math.max(map.getZoom(), 16));
      }
      return;
    }
    const to = { lat: routeTo.lat, lng: routeTo.lng };

    // Mark where you're going: the pickup spot, or a 🤝 at the giver's area if none is chosen yet.
    const endMarker = routeTo.kind === "area"
      ? L.marker([to.lat, to.lng], {
          icon: L.divIcon({ className: "map-dest", html: "<span>🤝</span>", iconSize: [30, 30] }),
          title: `${goal.name}'s area`,
          zIndexOffset: 950,
        })
      : pickupMarker({ ...to, label: goal.label }, routeTo.kind === "agreed");
    const from = routeFrom;
    const draw = (layers) => {
      routeRef.current = L.featureGroup([...layers, endMarker]).addTo(map);
      // Zoom to the whole route when it's a new destination, not on every re-route while walking.
      const fitKey = `${target.id}:${routeTo.kind}:${routeTo.lat},${routeTo.lng}`;
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
  }, [target?.id, routeTo?.lat, routeTo?.lng, routeTo?.kind, routeFrom?.lat, routeFrom?.lng,
      targetPickup?.lat, targetPickup?.lng, targetPickup?.accepted]);

  // ---------- Picking mode: the giver drags a pin (or searches an address) to choose the pickup spot ----------
  // The spot's name is filled in automatically from the address at the pin.
  const [candidate, setCandidate] = useState(null); // { lat, lng }
  const [spotLabel, setSpotLabel] = useState(""); // address/place at the pin
  const [labelState, setLabelState] = useState("idle"); // idle | looking | done
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const candidateRef = useRef(null);
  const knownLabel = useRef(null); // label we already know for a spot (from search), so we skip the lookup

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !picking) return;
    // Start with the pin on the current spot, or on you, so it's ready to drag.
    const existing = picking.initial;
    const start = existing
      ? { lat: existing.lat, lng: existing.lng }
      : device.pos ? { lat: device.pos.lat, lng: device.pos.lng }
      : here ? { lat: here.lat, lng: here.lng }
      : { lat: map.getCenter().lat, lng: map.getCenter().lng };
    if (existing) knownLabel.current = { ...start, label: existing.label };
    setCandidate(start);
    setSearch("");
    setResults([]);
    map.setView([start.lat, start.lng], 17);
    const onClick = (e) => setCandidate({ lat: e.latlng.lat, lng: e.latlng.lng });
    map.on("click", onClick);
    map.getContainer().classList.add("picking");
    return () => {
      map.off("click", onClick);
      map.getContainer().classList.remove("picking");
      setCandidate(null);
      setSpotLabel("");
      knownLabel.current = null;
    };
  }, [picking?.key]);

  // The draggable pin.
  useEffect(() => {
    const map = mapRef.current;
    if (candidateRef.current) candidateRef.current.remove();
    candidateRef.current = null;
    if (!map || !picking || !candidate) return;
    const marker = pickupMarker({ ...candidate, label: "Drag me to the pickup spot" }, false, true);
    marker.on("dragend", () => {
      const ll = marker.getLatLng();
      setCandidate({ lat: ll.lat, lng: ll.lng });
    });
    candidateRef.current = marker.addTo(map);
  }, [picking?.key, candidate?.lat, candidate?.lng]);

  // Look up the address wherever the pin lands.
  useEffect(() => {
    if (!picking || !candidate) return;
    const known = knownLabel.current;
    if (known && Math.abs(known.lat - candidate.lat) < 1e-7 && Math.abs(known.lng - candidate.lng) < 1e-7) {
      setSpotLabel(known.label);
      setLabelState("done");
      return;
    }
    const ctrl = new AbortController();
    setLabelState("looking");
    const timer = setTimeout(() => {
      reverseGeocode(candidate.lat, candidate.lng, ctrl.signal)
        .then((label) => { setSpotLabel(label); setLabelState("done"); })
        .catch((err) => { if (err.name !== "AbortError") { setSpotLabel(""); setLabelState("done"); } });
    }, 350);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [picking?.key, candidate?.lat, candidate?.lng]);

  // Address search: picking a result moves the pin there.
  useEffect(() => {
    if (!picking || search.trim().length < 3) { setResults([]); return; }
    const ctrl = new AbortController();
    const near = device.pos || here || (mapRef.current && mapRef.current.getCenter());
    const timer = setTimeout(() => {
      searchPlaces(search, near && { lat: near.lat, lng: near.lng }, ctrl.signal)
        .then(setResults)
        .catch((err) => { if (err.name !== "AbortError") setResults([]); });
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [picking?.key, search]);

  function pickResult(r) {
    knownLabel.current = { lat: r.lat, lng: r.lng, label: r.label };
    setCandidate({ lat: r.lat, lng: r.lng });
    setSearch("");
    setResults([]);
    if (mapRef.current) mapRef.current.setView([r.lat, r.lng], 17);
  }

  async function savePick() {
    if (!candidate) return;
    setSaving(true);
    try {
      const label = spotLabel.trim() || `Dropped pin (${candidate.lat.toFixed(4)}, ${candidate.lng.toFixed(4)})`;
      await onPickSave(picking, { lat: candidate.lat, lng: candidate.lng, label });
    } catch (err) {
      alert("Couldn't save the pickup spot: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---------- The giver's live location + ETA (shown to the receiver) ----------
  const roles = target && target.status === "claimed" ? handoffRoles(target) : null;
  const giverToWatch = roles && user && roles.receiverId === user.uid ? roles.giverId : null;
  const [giverLive, setGiverLive] = useState(null);
  useEffect(() => {
    setGiverLive(null);
    if (!giverToWatch) return;
    return watchLiveLocation(pairId(user.uid, giverToWatch), giverToWatch, setGiverLive);
  }, [giverToWatch, user?.uid]);
  const [now, setNow] = useState(Date.now()); // keeps "updated 20s ago" and staleness current
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);
  const giverNow = giverLive && now - giverLive.updatedAt < LIVE_FRESH_MS ? giverLive : null;

  // Their dot on the map.
  const giverDotRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (giverDotRef.current) giverDotRef.current.remove();
    giverDotRef.current = null;
    if (!map || !giverNow || !roles) return;
    giverDotRef.current = L.marker([giverNow.lat, giverNow.lng], {
      icon: L.divIcon({ className: "map-other", html: "<span>🧑</span>", iconSize: [30, 30] }),
      title: `${roles.giverName} (live)`,
      zIndexOffset: 990,
    }).addTo(map);
  }, [giverNow?.lat, giverNow?.lng, Boolean(giverNow), roles?.giverName]);

  // Their walking ETA to the pickup spot (re-checked after they move ~40 m).
  const [giverFrom, setGiverFrom] = useState(null);
  useEffect(() => {
    if (!giverNow) { setGiverFrom(null); return; }
    setGiverFrom((prev) => (prev && L.latLng(prev.lat, prev.lng).distanceTo([giverNow.lat, giverNow.lng]) < 40
      ? prev : { lat: giverNow.lat, lng: giverNow.lng }));
  }, [giverNow?.lat, giverNow?.lng, Boolean(giverNow)]);
  const [giverEta, setGiverEta] = useState(null); // { arrived } or { duration, distance }
  const giverRouteRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (giverRouteRef.current) giverRouteRef.current.remove();
    giverRouteRef.current = null;
    setGiverEta(null);
    if (!map || !giverFrom || !targetPickup) return;
    const to = { lat: targetPickup.lat, lng: targetPickup.lng };
    const meters = map.distance([giverFrom.lat, giverFrom.lng], [to.lat, to.lng]);
    if (meters < 40) { setGiverEta({ arrived: true }); return; }
    const ctrl = new AbortController();
    walkingRoute(giverFrom, to, ctrl.signal)
      .then((r) => {
        giverRouteRef.current = L.geoJSON(r.geometry, { style: { color: "#3797f0", weight: 4, opacity: 0.8, dashArray: "2 8", lineCap: "round" } }).addTo(map);
        setGiverEta({ duration: r.duration, distance: r.distance });
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setGiverEta({ duration: meters / 1.35, distance: meters });
      });
    return () => ctrl.abort();
  }, [giverFrom?.lat, giverFrom?.lng, targetPickup?.lat, targetPickup?.lng]);

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

      {picking ? (
        <div className="map-card picking-card">
          <div className="map-card-top">
            <span className="map-card-emoji" aria-hidden>📍</span>
            <div className="map-card-title">
              <strong>Choose the pickup spot</strong>
              <span className="muted">{picking.subtitle}</span>
            </div>
            <button className="map-close" onClick={onPickCancel} aria-label="Cancel">×</button>
          </div>
          <p className="muted">Drag the pin (or tap the map) to where you'd like to meet, or search an address. Public spots like a lobby or library entrance work best.</p>

          <div className="pick-search">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search an address or building…" aria-label="Search an address" />
            {results.length > 0 && (
              <ul className="combo-list">
                {results.map((r) => (
                  <li key={`${r.label}|${r.lat}|${r.lng}`}>
                    <button type="button" onClick={() => pickResult(r)}>
                      <span>{r.label}</span>
                      {r.detail && <span className="muted">{r.detail}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="pick-address">
            📍 {labelState === "looking"
              ? <span className="muted">Finding the address…</span>
              : spotLabel || <span className="muted">No address here, so it'll be saved as a dropped pin.</span>}
          </p>
          <div className="pick-actions">
            <button className="btn ghost small" disabled={!device.pos} title={device.pos ? "" : "Turn on location first"}
              onClick={() => {
                setCandidate({ lat: device.pos.lat, lng: device.pos.lng });
                if (mapRef.current) mapRef.current.setView([device.pos.lat, device.pos.lng], 17);
              }}>
              📡 Move pin to me
            </button>
          </div>
          <div className="pick-actions">
            <button className="btn primary" onClick={savePick} disabled={!candidate || labelState === "looking" || saving}>
              {saving ? "Saving…" : "Save pickup spot"}
            </button>
            <button className="btn ghost" onClick={onPickCancel}>Cancel</button>
          </div>
        </div>
      ) : target ? (
        <div className="map-card">
          <div className="map-card-top">
            <span className="map-card-emoji" aria-hidden>{foodEmoji(target.item)}</span>
            <div className="map-card-title">
              <strong>
                {user && target.ownerId === user.uid ? "Your post" : target.ownerName} · {target.item}
              </strong>
              <span className="muted">
                📍 {goal ? (goal.kind === "area" ? `Pick up from ${goal.label}` : goal.label) : targetPickup ? targetPickup.label : target.location}
              </span>
            </div>
            <button className="map-close" onClick={onClear} aria-label="Close directions">×</button>
          </div>

          {/* Giver: the spot you chose and whether it's accepted */}
          {iGive && (
            <div className="map-pickup">
              {targetPickup ? (
                <span>
                  📍 Pickup spot: <strong>{targetPickup.label}</strong>
                  {openOffer ? " · shown on your post" : targetPickup.accepted ? ` · ✅ ${otherName} accepted` : ` · waiting for ${otherName} to accept`}
                </span>
              ) : (
                <span>Choose where {openOffer ? "neighbors" : otherName} should pick it up.</span>
              )}
              {onChoosePickup && (
                <button className="btn small ghost" onClick={() => onChoosePickup(target)}>
                  {targetPickup ? "Change" : "📍 Choose pickup spot"}
                </button>
              )}
            </div>
          )}
          {!goal && !iGive && <p className="muted">{noTripReason(target, user)}</p>}
          {iGive && <p className="muted">You're giving this, so {openOffer ? "whoever takes it" : otherName} comes to the pickup spot.</p>}
          {iGive && targetPickup && roles && (
            <p className="map-from"><LiveNote liveShare={liveShare} otherId={roles.receiverId} otherName={otherName} /></p>
          )}
          {goal && !origin && <p className="muted">Allow location access, or finish your profile, to get directions.</p>}
          {goal && origin && (
            <p className="map-from">
              {routeFrom && routeFrom.live
                ? <>📡 From your current location{device.pos && device.pos.accuracy > 0 && ` (±${Math.round(device.pos.accuracy)} m)`}</>
                : <>🏠 From {homeLabel || "your profile address"}</>}
            </p>
          )}
          {goal && origin && (
            <p className="map-from">
              {goal.kind === "agreed" && <>✅ To the agreed pickup spot: <strong>{goal.label}</strong></>}
              {goal.kind === "listed" && <>📍 To the pickup spot: <strong>{goal.label}</strong></>}
              {goal.kind === "proposed" && (
                <>
                  📍 To the suggested pickup spot: <strong>{goal.label}</strong>
                  {onAcceptPickup && (
                    <button className="btn primary small map-accept" onClick={() => onAcceptPickup(target)}>Accept spot</button>
                  )}
                </>
              )}
              {goal.kind === "area" && (
                <>🏠 To {goal.name}'s area<span className="muted"> · {target.status === "claimed" ? `${goal.name} hasn't chosen a pickup spot yet.` : "Claim it, and they'll choose a pickup spot."}</span></>
              )}
            </p>
          )}
          {/* Receiver: where the giver is, and how long until they reach the pickup spot */}
          {giverToWatch && targetPickup && (
            <p className="map-other-eta">
              {giverNow ? (
                giverEta && giverEta.arrived
                  ? <>🧑 <strong>{roles.giverName}</strong> is at the pickup spot.</>
                  : giverEta
                    ? <>🧑 <strong>{roles.giverName}</strong>: <b>{Math.max(1, Math.round(giverEta.duration / 60))} min</b> from the pickup spot ({formatWalkDistance(giverEta.distance)})</>
                    : <>🧑 <strong>{roles.giverName}</strong> is on the map.</>
              ) : (
                <span className="muted">🧑 {roles.giverName}'s live location isn't available right now.</span>
              )}
              {giverNow && <span className="muted"> · updated {agoText(now - giverNow.updatedAt)}</span>}
            </p>
          )}
          {routeState === "loading" && <p className="muted">Finding a walking route…</p>}

          {route && (
            <>
              <div className="map-stats">
                <span>You: <b>{Math.max(1, Math.round(route.duration / 60))} min</b> walk</span>
                <span><b>{formatWalkDistance(route.distance)}</b></span>
              </div>
              {route.straight && <p className="muted">Couldn't get street directions, so this is a straight line.</p>}
              {goal && goal.kind === "area" && (
                <p className="muted map-approx">This area is approximate (about a block). The giver will choose the exact pickup spot.</p>
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

/** 📍 marker for a pickup spot (green check once accepted). `draggable` while the giver is choosing it. */
function pickupMarker(spot, accepted, draggable = false) {
  return L.marker([spot.lat, spot.lng], {
    icon: L.divIcon({
      className: accepted ? "map-pickup-pin accepted" : "map-pickup-pin",
      html: `<span class="pin"><span class="pin-emoji">${accepted ? "✅" : "📍"}</span></span>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    }),
    title: spot.label || "Pickup spot",
    draggable,
    zIndexOffset: 960,
  });
}

function agoText(ms) {
  const sec = Math.max(1, Math.round(ms / 1000));
  return sec < 60 ? `${sec}s ago` : `${Math.round(sec / 60)} min ago`;
}
