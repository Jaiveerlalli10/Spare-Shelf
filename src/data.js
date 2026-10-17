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
//   pantryItemId: for offers, the exact pantry entry being given away ("" if none),
//   approxLat, approxLng: the poster's housing rounded to ~200 m, for "0.3 mi away" (null if unknown),
//   ownerConfirmed, claimerConfirmed: true once each side confirms the hand-off,
//   createdAt: number (milliseconds)
// }
// A post becomes "completed" only when BOTH sides have confirmed.

import { firebaseReady, auth, db } from "./firebase";
import { milesBetween, approxPoint } from "./location";
import { NEAR_CAMPUS_MILES } from "./housing";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, runTransaction,
  setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";

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

// `fields.origin` is the poster's housing location ({ lat, lng }); only a rounded version is saved.
// For an offer, `fields.pantryItemId` says which pantry entry is being given away.
// If it's empty, a new pantry entry is created for the offer (offering it means you have it).
export async function createPost(user, fields) {
  let pantryItemId = "";
  if (fields.type === "offer") {
    try {
      pantryItemId = fields.pantryItemId ||
        (await addPantryItem(user, { name: fields.item, quantity: fields.quantity, expiresOn: fields.expiresOn }));
    } catch (err) {
      console.error("Couldn't add it to your pantry, posting anyway:", err);
    }
  }
  const approx = approxPoint(fields.origin);
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
    pantryItemId,
    approxLat: approx ? approx.lat : null,
    approxLng: approx ? approx.lng : null,
    ownerConfirmed: false,
    claimerConfirmed: false,
    createdAt: Date.now(),
  };
  if (!isDemoMode) return addDoc(collection(db, "posts"), post);
  demo.addPost(post);
}

/** Someone says "I can help" (on a request) or "I'll take it" (on an offer). Also opens a chat between the two. */
export async function claimPost(user, post) {
  const changes = { status: "claimed", claimedById: user.uid, claimedByName: user.name, claimedByEmail: user.email };
  if (!isDemoMode) await updateDoc(doc(db, "posts", post.id), changes);
  else demo.updatePost(post.id, changes);
  await ensureChat({ ...post, ...changes });
}

// ---------- Hand-off (both sides confirm) ----------

/** Who gives and who receives. On an offer the poster gives; on a request the poster receives. */
export function handoffRoles(post) {
  const ownerGives = post.type === "offer";
  return {
    giverId: ownerGives ? post.ownerId : post.claimedById,
    giverName: ownerGives ? post.ownerName : post.claimedByName,
    receiverId: ownerGives ? post.claimedById : post.ownerId,
    receiverName: ownerGives ? post.claimedByName : post.ownerName,
  };
}

/**
 * One side confirms the hand-off ("I handed it off" / "I got it").
 * When both have confirmed, the post becomes "completed" and counts toward the impact stats.
 * Each person's own pantry updates when they confirm: the giver's linked entry is removed,
 * and the item is added to the receiver's pantry.
 */
export async function confirmHandoff(user, post) {
  const isOwner = user.uid === post.ownerId;
  const myField = isOwner ? "ownerConfirmed" : "claimerConfirmed";
  const otherField = isOwner ? "claimerConfirmed" : "ownerConfirmed";

  if (!isDemoMode) {
    // A transaction so that if both people tap at the same moment, the post still ends up completed.
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "posts", post.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("This post was deleted.");
      const otherDone = snap.data()[otherField] === true;
      tx.update(ref, { [myField]: true, status: otherDone ? "completed" : "claimed" });
    });
  } else {
    demo.confirm(post.id, myField, otherField);
  }

  const { giverId, receiverId } = handoffRoles(post);
  try {
    if (user.uid === giverId && post.type === "offer" && post.pantryItemId) {
      await removePantryItem(user, { id: post.pantryItemId });
    }
    if (user.uid === receiverId) {
      await addPantryItem(user, { name: post.item, quantity: post.quantity, expiresOn: post.expiresOn });
    }
  } catch (err) {
    console.error("Confirmed, but couldn't update your pantry:", err);
  }
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
  if (!isDemoMode) return (await addDoc(pantryCollection(user), item)).id;
  return demo.addPantryItem(item);
}

export async function removePantryItem(user, item) {
  if (!isDemoMode) return deleteDoc(doc(db, "users", user.uid, "pantry", item.id));
  demo.removePantryItem(item.id);
}

// ---------- Messages ----------
//
// One chat per claimed post, stored at chats/{postId}:
// { postId, item, ownerId, ownerName, claimerId, claimerName, members: [ownerId, claimerId],
//   lastMessage, lastAt, lastSenderId, lastRead: { [uid]: milliseconds } }
// Messages live at chats/{postId}/messages/{id}: { senderId, senderName, text, createdAt }

function chatInfo(post) {
  return {
    postId: post.id, item: post.item,
    ownerId: post.ownerId, ownerName: post.ownerName,
    claimerId: post.claimedById, claimerName: post.claimedByName,
    members: [post.ownerId, post.claimedById],
  };
}

/** Makes sure the chat for this claimed post exists (safe to call more than once). */
export async function ensureChat(post) {
  if (!isDemoMode) return setDoc(doc(db, "chats", post.id), chatInfo(post), { merge: true });
  demo.ensureChat(chatInfo(post));
}

const byLatest = (chats) => chats.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

/** Calls callback(listOfChats) with every chat this user is in, most recent first. */
export function watchChats(user, callback) {
  if (!isDemoMode) {
    const q = query(collection(db, "chats"), where("members", "array-contains", user.uid));
    return onSnapshot(
      q,
      (snap) => callback(byLatest(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      (err) => console.error("Couldn't load chats (check Firestore rules):", err)
    );
  }
  const send = () => callback(byLatest(demo.getChats().filter((c) => c.members.includes(user.uid))));
  send();
  return demo.on("chats", send);
}

/** Calls callback(listOfMessages) for one chat, oldest first. */
export function watchMessages(chatId, callback) {
  if (!isDemoMode) {
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt"));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Couldn't load messages (check Firestore rules):", err)
    );
  }
  const send = () => callback(demo.getMessages(chatId));
  send();
  return demo.on("chats", send);
}

export async function sendMessage(user, chat, text) {
  const msg = { senderId: user.uid, senderName: user.name, text: text.trim(), createdAt: Date.now() };
  if (!isDemoMode) {
    // Save the message and update the chat's preview together.
    const batch = writeBatch(db);
    batch.set(doc(collection(db, "chats", chat.id, "messages")), msg);
    batch.update(doc(db, "chats", chat.id), {
      lastMessage: msg.text, lastAt: msg.createdAt, lastSenderId: user.uid, [`lastRead.${user.uid}`]: msg.createdAt,
    });
    return batch.commit();
  }
  demo.addMessage(chat.id, msg);
  demo.fakeReplyOnce(chat, user);
}

export async function markChatRead(user, chat) {
  if (!isDemoMode) return updateDoc(doc(db, "chats", chat.id), { [`lastRead.${user.uid}`]: Date.now() });
  demo.markRead(chat.id, user.uid);
}

/** True if the other person sent something this user hasn't seen yet. */
export function isUnread(chat, user) {
  const seen = (chat.lastRead || {})[user.uid] || 0;
  return Boolean(chat.lastSenderId) && chat.lastSenderId !== user.uid && (chat.lastAt || 0) > seen;
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
    { ...base, id: "s7", type: "offer", item: "Garlic", quantity: "1 head", location: "McCarty Hall", estValue: 1,
      ownerId: "nia", ownerName: "Nia", ownerEmail: "nia@uw.edu", createdAt: now - 3 * HOUR },
    { ...base, id: "s8", type: "offer", item: "Green onions", quantity: "1 bunch", location: "West Campus", estValue: 1,
      expiresOn: daysFromNow(3), ownerId: "jordan", ownerName: "Jordan", ownerEmail: "jordan@uw.edu", createdAt: now - 4 * HOUR },
    { ...base, id: "s9", type: "offer", item: "Chickpeas", quantity: "2 cans (sealed)", location: "The Ave", estValue: 2,
      ownerId: "sam", ownerName: "Sam", ownerEmail: "sam@uw.edu", createdAt: now - 6 * HOUR },
    { ...base, id: "s5", type: "offer", item: "Rice", quantity: "2 lbs (sealed)", location: "North Campus", estValue: 4,
      status: "completed", claimedById: "alex", claimedByName: "Alex", ownerId: "lee", ownerName: "Lee", ownerEmail: "lee@uw.edu", createdAt: now - 26 * HOUR },
    { ...base, id: "s6", type: "offer", item: "Milk", quantity: "Half gallon", location: "Alder Hall", estValue: 3,
      expiresOn: daysFromNow(1), status: "completed", claimedById: "maya", claimedByName: "Maya", ownerId: "jordan", ownerName: "Jordan", ownerEmail: "jordan@uw.edu", createdAt: now - 30 * HOUR },
  ].map((p) => ({ ...p, ...SEED_SPOTS[p.location] }));
}

// Rough points around UW Seattle for the demo posts' pickup areas.
const SEED_SPOTS = {
  "Alder Hall": { approxLat: 47.656, approxLng: -122.314 },
  "West Campus": { approxLat: 47.658, approxLng: -122.316 },
  "The Ave": { approxLat: 47.660, approxLng: -122.312 },
  "Lander Hall": { approxLat: 47.656, approxLng: -122.316 },
  "McCarty Hall": { approxLat: 47.662, approxLng: -122.304 },
  "North Campus": { approxLat: 47.660, approxLng: -122.304 },
};

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
  const listeners = { user: new Set(), posts: new Set(), pantry: new Set(), profile: new Set(), chats: new Set() };
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
  let chats = load("spareShelf.chats", []);
  let messages = load("spareShelf.messages", {});
  const saveChats = () => { save("spareShelf.chats", chats); save("spareShelf.messages", messages); emit("chats"); };
  const updateChat = (id, fn) => { chats = chats.map((c) => (c.id === id ? fn(c) : c)); };
  const addMessage = (chatId, msg) => {
    messages = { ...messages, [chatId]: [...(messages[chatId] || []), { ...msg, id: "m" + Date.now() + Math.random() }] };
    updateChat(chatId, (c) => ({
      ...c, lastMessage: msg.text, lastAt: msg.createdAt, lastSenderId: msg.senderId,
      lastRead: { ...c.lastRead, [msg.senderId]: msg.createdAt },
    }));
    saveChats();
  };
  // In demo mode the other person is fake, so they "reply" and "confirm" on their own.
  const otherPerson = (chat, user) => chat.ownerId === user.uid
    ? { id: chat.claimerId, name: chat.claimerName }
    : { id: chat.ownerId, name: chat.ownerName };

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
    addPantryItem(item) {
      const id = "i" + Date.now();
      setPantry([...pantry, { ...item, id }]);
      return id;
    },
    removePantryItem(id) { setPantry(pantry.filter((i) => i.id !== id)); },

    getChats: () => [...chats],
    getMessages: (id) => [...(messages[id] || [])],
    ensureChat(info) {
      const exists = chats.some((c) => c.id === info.postId);
      if (exists) updateChat(info.postId, (c) => ({ ...c, ...info }));
      else chats = [...chats, { id: info.postId, lastMessage: "", lastAt: 0, lastSenderId: "", lastRead: {}, ...info }];
      saveChats();
    },
    addMessage,
    markRead(chatId, uid) {
      updateChat(chatId, (c) => ({ ...c, lastRead: { ...c.lastRead, [uid]: Date.now() } }));
      saveChats();
    },
    fakeReplyOnce(chat, user) {
      const mine = (messages[chat.id] || []).filter((m) => m.senderId === user.uid);
      if (mine.length !== 1) return;
      const other = otherPerson(chat, user);
      setTimeout(() => addMessage(chat.id, {
        senderId: other.id, senderName: other.name, text: "Sounds good! See you there 🙂", createdAt: Date.now(),
      }), 1500);
    },
    confirm(postId, myField, otherField) {
      const post = posts.find((p) => p.id === postId);
      if (!post) return;
      const otherDone = post[otherField] === true;
      setPosts(posts.map((p) => (p.id === postId ? { ...p, [myField]: true, status: otherDone ? "completed" : "claimed" } : p)));
      if (otherDone) return;
      setTimeout(() => {
        setPosts(posts.map((p) => (p.id === postId ? { ...p, [otherField]: true, status: "completed" } : p)));
        const chat = chats.find((c) => c.id === postId);
        const other = chat && otherPerson(chat, user);
        if (other) addMessage(postId, { senderId: other.id, senderName: other.name, text: "Confirmed on my end too. Thanks! 🙏", createdAt: Date.now() });
      }, 2000);
    },
  };
})();

/** Demo-only helper: put the sample data back. */
export function resetDemoData() {
  try {
    localStorage.removeItem("spareShelf.posts");
    localStorage.removeItem("spareShelf.pantry");
    localStorage.removeItem("spareShelf.chats");
    localStorage.removeItem("spareShelf.messages");
  } catch { /* ignore */ }
  window.location.reload();
}
