// ALL reading/writing of data lives in this file.
// The UI only calls these functions, so it doesn't care whether we're using
// real Firebase or the in-browser demo mode.
//
// A "post" looks like:
// {
//   id, type: "offer" | "request", item, quantity, location, notes,
//   expiresOn: "2026-10-20" | "", estValue: number (dollars),
//   ownerId, ownerName, ownerEmail,
//   status: "open" | "claimed" | "completed",
//   claimedById, claimedByName, claimedByEmail,
//   createdAt: number (milliseconds)
// }

import { firebaseReady, auth, db } from "./firebase";
import { milesBetween } from "./location";
import { NEAR_CAMPUS_MILES } from "./housing";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from "firebase/firestore";

export const isDemoMode = !firebaseReady;

// ---------- Users ----------

function toUser(fbUser) {
  if (!fbUser) return null;
  return {
    uid: fbUser.uid,
    name: fbUser.displayName || "Neighbor",
    email: fbUser.email || "",
    photoURL: fbUser.photoURL || "",
  };
}

/** Calls callback(user or null) now and whenever sign-in state changes. Returns an unsubscribe function. */
export function watchUser(callback) {
  if (!isDemoMode) return onAuthStateChanged(auth, (u) => callback(toUser(u)));
  callback(demo.getUser());
  return demo.on("user", () => callback(demo.getUser()));
}

export async function signIn() {
  if (!isDemoMode) return signInWithPopup(auth, new GoogleAuthProvider());
  demo.setUser({ uid: "demo-you", name: "You (demo)", email: "you@uw.edu" });
}

export async function signOut() {
  if (!isDemoMode) return fbSignOut(auth);
  demo.setUser(null);
}

// ---------- Profile (required after sign-in) ----------
//
// Stored on users/{uid}. A finished profile has a campus and a dorm, apartment,
// or address whose coordinates are near that campus.

export function isProfileComplete(profile) {
  return Boolean(
    profile
    && profile.universityName
    && profile.housingLabel
    && Number.isFinite(profile.housingLat)
    && Number.isFinite(profile.housingLng)
  );
}

/** Calls callback(profile or null) now and whenever this person's profile changes. */
export function watchProfile(user, callback) {
  if (!user) {
    callback(null);
    return () => {};
  }
  if (!isDemoMode) {
    return onSnapshot(
      doc(db, "users", user.uid),
      (snap) => callback(snap.exists() ? snap.data() : null),
      (err) => {
        console.error("Couldn't load profile (check Firestore rules):", err);
        callback(null);
      }
    );
  }
  callback(demo.getProfile(user.uid));
  return demo.on("profile", () => callback(demo.getProfile(user.uid)));
}

export async function saveProfile(user, fields) {
  const profile = {
    name: user.name,
    email: user.email || "",
    photoURL: fields.photoURL || "",
    bio: (fields.bio || "").trim(),
    universityName: fields.university.name,
    universityCity: fields.university.city,
    universityState: fields.university.state,
    universityLat: fields.university.lat,
    universityLng: fields.university.lng,
    housingKind: fields.housing.kind,
    housingLabel: fields.housing.label.trim(),
    housingLat: fields.housing.lat,
    housingLng: fields.housing.lng,
    createdAt: fields.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  const miles = milesBetween(
    { lat: profile.universityLat, lng: profile.universityLng },
    { lat: profile.housingLat, lng: profile.housingLng }
  );
  if (miles > NEAR_CAMPUS_MILES) {
    throw new Error(`That place is about ${miles.toFixed(1)} miles from campus. Choose somewhere within ${NEAR_CAMPUS_MILES} miles.`);
  }
  if (!isDemoMode) return setDoc(doc(db, "users", user.uid), profile, { merge: true });
  demo.setProfile(user.uid, profile);
}

// ---------- Posts ----------

/** Calls callback(listOfPosts) now and every time any post changes (newest first). */
export function watchPosts(callback) {
  if (!isDemoMode) {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Couldn't load posts (check Firestore rules):", err)
    );
  }
  callback(demo.getPosts());
  return demo.on("posts", () => callback(demo.getPosts()));
}

export async function createPost(user, fields) {
  const post = {
    type: fields.type,
    item: fields.item.trim(),
    quantity: fields.quantity.trim(),
    location: fields.location.trim(),
    notes: fields.notes.trim(),
    expiresOn: fields.expiresOn || "",
    estValue: Number(fields.estValue) || 0,
    ownerId: user.uid,
    ownerName: user.name,
    ownerEmail: user.email,
    status: "open",
    claimedById: "",
    claimedByName: "",
    claimedByEmail: "",
    createdAt: Date.now(),
  };
  if (!isDemoMode) return addDoc(collection(db, "posts"), post);
  demo.addPost(post);
}

/** Someone says "I can help" (on a request) or "I'll take it" (on an offer). */
export async function claimPost(user, post) {
  const changes = { status: "claimed", claimedById: user.uid, claimedByName: user.name, claimedByEmail: user.email };
  if (!isDemoMode) return updateDoc(doc(db, "posts", post.id), changes);
  demo.updatePost(post.id, changes);
}

/** The owner confirms the hand-off happened. This is what counts toward the impact stats. */
export async function completePost(post) {
  if (!isDemoMode) return updateDoc(doc(db, "posts", post.id), { status: "completed" });
  demo.updatePost(post.id, { status: "completed" });
}

export async function deletePost(post) {
  if (!isDemoMode) return deleteDoc(doc(db, "posts", post.id));
  demo.removePost(post.id);
}

// ---------- Pantry (private to each user) ----------
//
// Stored in Firestore at users/{uid}/pantry/{itemId}. A pantry item looks like:
// { id, name, quantity, expiresOn: "2026-10-20" | "", addedAt: number (milliseconds) }

function pantryCollection(user) {
  return collection(db, "users", user.uid, "pantry");
}

/** Calls callback(listOfItems) now and every time this user's pantry changes. */
export function watchPantry(user, callback) {
  if (!isDemoMode) {
    return onSnapshot(
      pantryCollection(user),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Couldn't load pantry (check Firestore rules):", err)
    );
  }
  callback(demo.getPantry());
  return demo.on("pantry", () => callback(demo.getPantry()));
}

export async function addPantryItem(user, fields) {
  const item = {
    name: fields.name.trim(),
    quantity: fields.quantity.trim(),
    expiresOn: fields.expiresOn || "",
    addedAt: Date.now(),
  };
  if (!isDemoMode) return addDoc(pantryCollection(user), item);
  demo.addPantryItem(item);
}

export async function removePantryItem(user, item) {
  if (!isDemoMode) return deleteDoc(doc(db, "users", user.uid, "pantry", item.id));
  demo.removePantryItem(item.id);
}

// ---------- Demo mode (fake data saved in this browser) ----------

const HOUR = 60 * 60 * 1000;

function daysFromNow(n) {
  const d = new Date(Date.now() + n * 24 * HOUR);
  return d.toISOString().slice(0, 10);
}

function seedPosts() {
  const now = Date.now();
  const base = { notes: "", expiresOn: "", status: "open", claimedById: "", claimedByName: "", claimedByEmail: "" };
  return [
    { ...base, id: "s1", type: "request", item: "Sugar", quantity: "1 cup", location: "Alder Hall", estValue: 1,
      notes: "Baking cookies for my floor tonight!", ownerId: "maya", ownerName: "Maya", ownerEmail: "maya@uw.edu", createdAt: now - 1 * HOUR },
    { ...base, id: "s2", type: "offer", item: "Spinach", quantity: "Half a bag", location: "West Campus", estValue: 2,
      expiresOn: daysFromNow(2), notes: "Bought too much, still fresh.", ownerId: "jordan", ownerName: "Jordan", ownerEmail: "jordan@uw.edu", createdAt: now - 2 * HOUR },
    { ...base, id: "s3", type: "offer", item: "Eggs", quantity: "6", location: "The Ave", estValue: 3,
      expiresOn: daysFromNow(5), ownerId: "sam", ownerName: "Sam", ownerEmail: "sam@uw.edu", createdAt: now - 5 * HOUR },
    { ...base, id: "s4", type: "request", item: "Soy sauce", quantity: "2 tbsp", location: "Lander Hall", estValue: 1,
      ownerId: "priya", ownerName: "Priya", ownerEmail: "priya@uw.edu", createdAt: now - 8 * HOUR },
    { ...base, id: "s5", type: "offer", item: "Rice", quantity: "2 lbs (sealed)", location: "North Campus", estValue: 4,
      status: "completed", claimedById: "alex", claimedByName: "Alex", ownerId: "lee", ownerName: "Lee", ownerEmail: "lee@uw.edu", createdAt: now - 26 * HOUR },
    { ...base, id: "s6", type: "offer", item: "Milk", quantity: "Half gallon", location: "Alder Hall", estValue: 3,
      expiresOn: daysFromNow(1), status: "completed", claimedById: "maya", claimedByName: "Maya", ownerId: "jordan", ownerName: "Jordan", ownerEmail: "jordan@uw.edu", createdAt: now - 30 * HOUR },
  ];
}

function seedPantry() {
  const now = Date.now();
  return [
    { id: "i1", name: "Tortillas", quantity: "8", expiresOn: daysFromNow(1), addedAt: now },
    { id: "i2", name: "Greek yogurt", quantity: "2 cups", expiresOn: daysFromNow(3), addedAt: now },
    { id: "i3", name: "Pasta", quantity: "1 box", expiresOn: "", addedAt: now },
    { id: "i4", name: "Onions", quantity: "3", expiresOn: daysFromNow(10), addedAt: now },
  ];
}

const demo = (() => {
  const listeners = { user: new Set(), posts: new Set(), pantry: new Set(), profile: new Set() };
  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  };
  let user = load("spareShelf.user", null);
  let posts = load("spareShelf.posts", null) || seedPosts();
  let profiles = load("spareShelf.profiles", {});

  const emit = (kind) => listeners[kind].forEach((fn) => fn());
  const setPosts = (next) => { posts = next; save("spareShelf.posts", posts); emit("posts"); };
  let pantry = load("spareShelf.pantry", null) || seedPantry();
  const setPantry = (next) => { pantry = next; save("spareShelf.pantry", pantry); emit("pantry"); };

  return {
    on(kind, fn) { listeners[kind].add(fn); return () => listeners[kind].delete(fn); },
    getUser: () => user,
    setUser(u) { user = u; save("spareShelf.user", u); emit("user"); },
    getProfile: (uid) => profiles[uid] || null,
    setProfile(uid, profile) {
      profiles = { ...profiles, [uid]: profile };
      save("spareShelf.profiles", profiles);
      emit("profile");
    },
    getPosts: () => [...posts].sort((a, b) => b.createdAt - a.createdAt),
    addPost(p) { setPosts([{ ...p, id: "p" + Date.now() }, ...posts]); },
    updatePost(id, changes) { setPosts(posts.map((p) => (p.id === id ? { ...p, ...changes } : p))); },
    removePost(id) { setPosts(posts.filter((p) => p.id !== id)); },
    getPantry: () => [...pantry],
    addPantryItem(item) { setPantry([...pantry, { ...item, id: "i" + Date.now() }]); },
    removePantryItem(id) { setPantry(pantry.filter((i) => i.id !== id)); },
  };
})();

/** Demo-only helper: put the sample data back. */
export function resetDemoData() {
  try {
    localStorage.removeItem("spareShelf.posts");
    localStorage.removeItem("spareShelf.pantry");
  } catch { /* ignore */ }
  window.location.reload();
}
