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
//   claimerApproxLat, claimerApproxLng: the claimer's housing, rounded the same way (set when claiming),
//   ownerConfirmed, claimerConfirmed: true once each side confirms the hand-off,
//   createdAt: number (milliseconds)
// }
// A post becomes "completed" only when BOTH sides have confirmed.

import { firebaseReady, auth, db } from "./firebase";
import { milesBetween, approxPoint } from "./location";
import { NEAR_CAMPUS_MILES } from "./housing";
import { hasProfanity, PROFANITY_MESSAGE } from "./profanity";
import { NOTE_MAX, otherParty, reviewDocId, tagsFor } from "./reviews";
import { communityId } from "./community";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction,
  setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";

export const isDemoMode = !firebaseReady;

/**
 * Starts a live Firestore listener (same arguments as onSnapshot), but never lets it crash the page.
 * The Firestore library has a known bug where its internal queue breaks ("INTERNAL ASSERTION FAILED")
 * after listeners are started and stopped very quickly; after that, every call throws right away.
 * Here, those throws go to `onError` instead, and stopping the listener is safe too.
 */
function listen(target, onNext, onError) {
  try {
    const stop = onSnapshot(target, onNext, onError);
    return () => {
      try { stop(); } catch (err) { console.error("Couldn't stop a Firestore listener:", err); }
    };
  } catch (err) {
    console.error("Couldn't start a Firestore listener:", err);
    if (onError) onError(err);
    return () => {};
  }
}

/** True for the Firestore library bug above. The only fix is reloading the page. */
export function isFirestoreStuck(err) {
  return /INTERNAL ASSERTION FAILED|AsyncQueue is already failed/i.test(String(err && (err.message || err)));
}

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
    return listen(
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

// ---------- Public profiles (name + photo that other signed-in people can see) ----------
//
// The full profile (housing, bio...) stays private at users/{uid}. Only the name and
// profile picture are copied to publicProfiles/{uid}, so chats can show photos.

const publicProfileCache = new Map(); // uid -> Promise<{ name, photoURL } | null>

/** Loads one person's name + photo (once per page load). Resolves to null if missing or not allowed. */
export function getPublicProfile(uid) {
  if (isDemoMode) return Promise.resolve(demo.getPublicProfile(uid));
  if (!publicProfileCache.has(uid)) {
    const request = getDoc(doc(db, "publicProfiles", uid))
      .then((snap) => (snap.exists() ? snap.data() : null))
      .catch((err) => {
        console.error("Couldn't load a profile picture (check Firestore rules):", err);
        publicProfileCache.delete(uid); // try again next time
        return null;
      });
    publicProfileCache.set(uid, request);
  }
  return publicProfileCache.get(uid);
}

// ---------- Community (same dorm or apartment) ----------
//
// communities/{communityId}/members/{uid} is readable only by people who have joined
// that building. The id comes from the campus name plus the housing label.

/** Puts this person in their building's community, and leaves the previous one if they moved. */
export async function syncCommunity(user, profile) {
  const id = communityId(profile && profile.universityName, profile && profile.housingLabel);
  if (!id || !user) return "";
  const member = {
    name: (user.name || profile.name || "Neighbor").slice(0, 119),
    photoURL: profile.photoURL || "",
    updatedAt: Date.now(),
  };
  const previous = profile.communityId || "";
  if (isDemoMode) {
    demo.joinCommunity(user.uid, previous, id, member);
    if (previous !== id) demo.setProfile(user.uid, { ...profile, communityId: id });
    return id;
  }
  if (previous !== id) await setDoc(doc(db, "users", user.uid), { communityId: id }, { merge: true });
  await setDoc(doc(db, "communities", id, "members", user.uid), member);
  if (previous && previous !== id) await deleteDoc(doc(db, "communities", previous, "members", user.uid));
  return id;
}

/** Calls callback(members) for everyone who joined this building. */
export function watchCommunityMembers(communityIdValue, onNext, onError) {
  if (!communityIdValue) {
    onNext([]);
    return () => {};
  }
  if (isDemoMode) {
    const send = () => onNext(demo.communityMembers(communityIdValue));
    send();
    return demo.on("community", send);
  }
  return listen(
    collection(db, "communities", communityIdValue, "members"),
    (snap) => onNext(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    (err) => {
      console.error("Couldn't load your dorm or apartment (check Firestore rules):", err);
      if (onError) onError(err);
    }
  );
}

/** Publishes this person's name and photo ("" = no photo). */
export async function savePublicProfile(user, photoURL) {
  const data = { name: user.name, photoURL: photoURL || "", updatedAt: Date.now() };
  if (!isDemoMode) return setDoc(doc(db, "publicProfiles", user.uid), data);
  demo.setPublicProfile(user.uid, data);
}

// ---------- Posts ----------

/** Calls callback(listOfPosts) now and every time any post changes (newest first). */
export function watchPosts(callback) {
  if (!isDemoMode) {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    return listen(
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

/**
 * Someone says "I can help" (on a request) or "I'll take it" (on an offer). Also opens a chat between the two.
 * `origin` is the claimer's housing; a rounded version is saved so a requester can walk to their helper.
 */
export async function claimPost(user, post, origin) {
  const approx = approxPoint(origin);
  const changes = {
    status: "claimed", claimedById: user.uid, claimedByName: user.name, claimedByEmail: user.email,
    claimerApproxLat: approx ? approx.lat : null, claimerApproxLng: approx ? approx.lng : null,
  };
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

// ---------- Reviews ----------
//
// One review per person per hand-off, at reviews/{postId}_{fromId}:
// { postId, fromId, fromName, toId, toName, stars: 1-5, tags: string[], comment, item, createdAt, updatedAt }
// Tags use the phrases in src/reviews.js. Anyone signed in can read them; only the author can write.

const reviewCache = new Map(); // toId -> Promise<review[]>
const reviewSubs = new Set();
const savedReviewSubs = new Set();

/** Tells open reputation badges to reload this person. */
export function subscribeReviews(fn) {
  reviewSubs.add(fn);
  return () => reviewSubs.delete(fn);
}

/** Tells the hand-off button that this user just saved their review. */
export function subscribeSavedReviews(fn) {
  savedReviewSubs.add(fn);
  return () => savedReviewSubs.delete(fn);
}

function notifyReviews(uid, review) {
  reviewCache.delete(uid);
  reviewSubs.forEach((fn) => fn(uid));
  if (review) savedReviewSubs.forEach((fn) => fn(review));
}

/** Every review neighbors have left for this person. */
export function getReviewsFor(uid) {
  if (!uid) return Promise.resolve([]);
  if (!reviewCache.has(uid)) {
    const request = (isDemoMode
      ? Promise.resolve(demo.getReviewsFor(uid))
      : getDocs(query(collection(db, "reviews"), where("toId", "==", uid)))
        .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    ).catch((err) => {
      console.error("Couldn't load reviews (check Firestore rules):", err);
      reviewCache.delete(uid);
      throw err;
    });
    reviewCache.set(uid, request);
  }
  return reviewCache.get(uid);
}

/** This person's review of the hand-off, or null. */
export async function getMyReview(postId, uid) {
  const id = reviewDocId(postId, uid);
  if (isDemoMode) return demo.getReview(id);
  const snap = await getDoc(doc(db, "reviews", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Saves stars and quick notes about the other person. One review per hand-off. */
export async function saveReview(user, post, fields) {
  const other = otherParty(post, user.uid);
  if (!other?.id) throw new Error("There's nobody to review on this post.");
  const stars = Number(fields.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error("Choose 1 to 5 stars.");
  const allowed = new Set(tagsFor(post, other.id));
  const tags = [...new Set((fields.tags || []).filter((tag) => allowed.has(tag)))].slice(0, 6);
  const rawComment = (fields.comment || "").trim();
  if (hasProfanity(rawComment)) throw new Error(PROFANITY_MESSAGE);
  const comment = rawComment.slice(0, NOTE_MAX);
  const id = reviewDocId(post.id, user.uid);
  const previous = await getMyReview(post.id, user.uid);
  const now = Date.now();
  const review = {
    postId: post.id,
    fromId: user.uid,
    fromName: user.name,
    toId: other.id,
    toName: other.name,
    stars,
    tags,
    comment,
    item: post.item,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
  if (!isDemoMode) await setDoc(doc(db, "reviews", id), review);
  else demo.setReview({ ...review, id });
  const saved = { ...review, id };
  notifyReviews(other.id, saved);
  return saved;
}

/**
 * Gives one of your own posts a location (rounded, like new posts get) if it doesn't have one.
 * Used to fix posts made before distances existed, so they show up on the map.
 */
export async function addLocationToPost(post, origin) {
  const approx = approxPoint(origin);
  if (!approx) return;
  const changes = { approxLat: approx.lat, approxLng: approx.lng };
  if (!isDemoMode) return updateDoc(doc(db, "posts", post.id), changes);
  demo.updatePost(post.id, changes);
}

/** Saves the claimer's rounded location on a post they claimed before locations were saved on claims. */
export async function addClaimerLocation(post, origin) {
  const approx = approxPoint(origin);
  if (!approx) return;
  const changes = { claimerApproxLat: approx.lat, claimerApproxLng: approx.lng };
  if (!isDemoMode) return updateDoc(doc(db, "posts", post.id), changes);
  demo.updatePost(post.id, changes);
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
    return listen(
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
// ONE chat per pair of people (however many posts they trade), stored at chats/{pairId},
// where pairId is the two uids sorted and joined with "__":
// { members: [uidA, uidB] (sorted), names: { [uid]: name }, item: the latest item they talked about,
//   lastMessage, lastAt, lastSenderId, lastRead: { [uid]: milliseconds } }
// Messages live at chats/{pairId}/messages/{id}: { senderId, senderName, text, createdAt }
//
// Older versions made one chat per post (chats/{postId}, with ownerId/claimerId fields).
// Those still load; the inbox merges them into the same conversation as the pair chat.

/** The chat id for two people (same no matter who's first). */
export function pairId(a, b) {
  return [a, b].sort().join("__");
}

/** The other person in a chat, { id, name }. Works for pair chats and older per-post chats. */
export function chatOther(chat, user) {
  const id = (chat.members || []).find((m) => m !== user.uid) || "";
  const name = (chat.names && chat.names[id]) || (chat.ownerId === id ? chat.ownerName : chat.claimerName) || "Neighbor";
  return { id, name };
}

/** Makes sure the chat between two people ({ id, name } each) exists. Safe to call again. Returns its id. */
export async function ensurePairChat(a, b, item) {
  const id = pairId(a.id, b.id);
  const info = { members: [a.id, b.id].sort(), names: { [a.id]: a.name, [b.id]: b.name } };
  if (item) info.item = item;
  if (!isDemoMode) await setDoc(doc(db, "chats", id), info, { merge: true });
  else demo.ensureChat(id, info);
  return id;
}

/** The chat for a claimed post: the poster and the claimer's one shared chat. Returns its id. */
export function ensureChat(post) {
  return ensurePairChat(
    { id: post.ownerId, name: post.ownerName },
    { id: post.claimedById, name: post.claimedByName },
    post.item
  );
}

const byLatest = (chats) => chats.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

/** Calls callback(listOfChats) with every chat this user is in, most recent first. */
export function watchChats(user, callback) {
  if (!isDemoMode) {
    const q = query(collection(db, "chats"), where("members", "array-contains", user.uid));
    return listen(
      q,
      (snap) => callback(byLatest(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      (err) => console.error("Couldn't load chats (check Firestore rules):", err)
    );
  }
  const send = () => callback(byLatest(demo.getChats().filter((c) => c.members.includes(user.uid))));
  send();
  return demo.on("chats", send);
}

/** Calls callback(listOfMessages) for one chat, oldest first. Calls onError(err) if loading fails. */
export function watchMessages(chatId, callback, onError) {
  if (!isDemoMode) {
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt"));
    return listen(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("Couldn't load messages (check Firestore rules):", err);
        if (onError) onError(err);
      }
    );
  }
  const send = () => callback(demo.getMessages(chatId));
  send();
  return demo.on("chats", send);
}

/** Sends a message in the pair chat `chat` ({ id, members }). Creates the chat if it doesn't exist yet. */
export async function sendMessage(user, chat, text) {
  const msg = { senderId: user.uid, senderName: user.name, text: text.trim(), createdAt: Date.now() };
  if (!isDemoMode) {
    // Save the message and update the chat's preview together. "set + merge" also creates
    // the chat if needed (members must be included for the security rules).
    const batch = writeBatch(db);
    batch.set(doc(db, "chats", chat.id), {
      members: chat.members, names: { [user.uid]: user.name },
      lastMessage: msg.text, lastAt: msg.createdAt, lastSenderId: user.uid, lastRead: { [user.uid]: msg.createdAt },
    }, { merge: true });
    batch.set(doc(collection(db, "chats", chat.id, "messages")), msg);
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

// ---------- Pickup spots (giver chooses, receiver accepts) ----------
//
// Stored in the two people's private chat: chats/{pairId}.pickups.{postId} =
// { lat, lng, label, setBy, setAt, accepted, acceptedAt }. Only those two can read it.
// Changing the spot resets `accepted`, so the receiver accepts the new one.

function otherInPost(post, user) {
  return post.ownerId === user.uid
    ? { id: post.claimedById, name: post.claimedByName }
    : { id: post.ownerId, name: post.ownerName };
}

/** The giver sets (or changes) the pickup spot for a claimed post, and the chat gets a message about it. */
export async function setPickupSpot(user, post, spot) {
  const other = otherInPost(post, user);
  const chatId = await ensureChat(post);
  const value = {
    lat: spot.lat, lng: spot.lng, label: spot.label.trim().slice(0, 80),
    setBy: user.uid, setAt: Date.now(), accepted: false, acceptedAt: 0,
  };
  if (!isDemoMode) await updateDoc(doc(db, "chats", chatId), { [`pickups.${post.id}`]: value });
  else demo.setPickup(chatId, post.id, value);
  await sendMessage(user, { id: chatId, members: [user.uid, other.id].sort() }, `📍 Pickup spot for ${post.item}: ${value.label}`);
}

/** The receiver accepts the current pickup spot. */
export async function acceptPickupSpot(user, post, pickup) {
  const other = otherInPost(post, user);
  const chatId = pairId(user.uid, other.id);
  if (!isDemoMode) {
    await updateDoc(doc(db, "chats", chatId), {
      [`pickups.${post.id}.accepted`]: true,
      [`pickups.${post.id}.acceptedAt`]: Date.now(),
    });
  } else {
    demo.setPickup(chatId, post.id, { ...pickup, accepted: true, acceptedAt: Date.now() });
  }
  await sendMessage(user, { id: chatId, members: [user.uid, other.id].sort() }, `✅ Sounds good, see you at ${pickup.label}!`);
}

/** { [postId]: pickup } from all of this user's chats. */
export function pickupsFromChats(chats) {
  const all = {};
  for (const chat of chats) Object.assign(all, chat.pickups || {});
  return all;
}

// ---------- Live location (the giver's, during a hand-off with a pickup spot) ----------
//
// While the giver heads to the pickup spot, their exact live position is written to
// chats/{pairId}/live/{uid}: { lat, lng, accuracy, updatedAt }. Only the two people in that
// chat can read it (see firestore.rules). It's deleted when sharing stops (paused or hand-off done), and anything
// older than LIVE_FRESH_MS is ignored (e.g. if they just closed the app).

export const LIVE_FRESH_MS = 3 * 60 * 1000;

export async function shareLiveLocation(user, otherId, pos) {
  const data = { lat: pos.lat, lng: pos.lng, accuracy: Math.round(pos.accuracy || 0), updatedAt: Date.now() };
  const chatId = pairId(user.uid, otherId);
  if (!isDemoMode) return setDoc(doc(db, "chats", chatId, "live", user.uid), data);
  demo.setLive(chatId, user.uid, data);
}

export async function stopSharingLiveLocation(user, otherId) {
  const chatId = pairId(user.uid, otherId);
  if (!isDemoMode) return deleteDoc(doc(db, "chats", chatId, "live", user.uid));
  demo.setLive(chatId, user.uid, null);
}

/** Calls callback({ lat, lng, accuracy, updatedAt } or null) with `uid`'s shared live location in this chat. */
export function watchLiveLocation(chatId, uid, callback) {
  if (!isDemoMode) {
    return listen(
      doc(db, "chats", chatId, "live", uid),
      (snap) => callback(snap.exists() ? snap.data() : null),
      (err) => {
        console.error("Couldn't load a live location (check Firestore rules):", err);
        callback(null);
      }
    );
  }
  callback(demo.getLive(chatId, uid));
  return demo.on("live", () => callback(demo.getLive(chatId, uid)));
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
    { ...base, id: "s10", type: "offer", item: "Oat milk", quantity: "1 carton", location: "Lander Hall", estValue: 3,
      expiresOn: daysFromNow(4), ownerId: "chris", ownerName: "Chris", ownerEmail: "chris@uw.edu", createdAt: now - 3 * HOUR },
    { ...base, id: "s11", type: "offer", item: "Bananas", quantity: "3", location: "Alder Hall", estValue: 1,
      expiresOn: daysFromNow(2), ownerId: "riley", ownerName: "Riley", ownerEmail: "riley@uw.edu", createdAt: now - 2 * HOUR },
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

function seedReviews() {
  const now = Date.now();
  const ago = (hours) => now - hours * HOUR;
  return [
    { id: "s6_maya", postId: "s6", fromId: "maya", fromName: "Maya", toId: "jordan", toName: "Jordan", stars: 5, tags: ["On time", "Item was given as listed", "Friendly"], comment: "Left the milk by the lobby desk, still cold.", item: "Milk", createdAt: ago(20), updatedAt: ago(20) },
    { id: "s2_priya", postId: "s2x", fromId: "priya", fromName: "Priya", toId: "jordan", toName: "Jordan", stars: 4, tags: ["Friendly", "Easy to meet"], item: "Spinach", createdAt: ago(10), updatedAt: ago(10) },
    { id: "s3_lee", postId: "s3x", fromId: "lee", fromName: "Lee", toId: "sam", toName: "Sam", stars: 5, tags: ["Item was given as listed", "On time"], item: "Eggs", createdAt: ago(8), updatedAt: ago(8) },
    { id: "s1_jordan", postId: "s1x", fromId: "jordan", fromName: "Jordan", toId: "maya", toName: "Maya", stars: 5, tags: ["On time", "Clear about what they needed", "Friendly"], item: "Sugar", createdAt: ago(6), updatedAt: ago(6) },
    { id: "s5_alex", postId: "s5", fromId: "alex", fromName: "Alex", toId: "lee", toName: "Lee", stars: 5, tags: ["Item was given as listed", "Good portion"], item: "Rice", createdAt: ago(24), updatedAt: ago(24) },
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

function seedCommunities() {
  const lander = communityId("University of Washington-Seattle Campus", "Lander Hall");
  const alder = communityId("University of Washington-Seattle Campus", "Alder Hall");
  const mccarty = communityId("University of Washington-Seattle Campus", "McCarty Hall");
  const member = (name) => ({ name, photoURL: "", updatedAt: 1 });
  return {
    [lander]: { priya: member("Priya"), chris: member("Chris") },
    [alder]: { maya: member("Maya"), riley: member("Riley") },
    [mccarty]: { nia: member("Nia") },
  };
}

const demo = (() => {
  const listeners = { user: new Set(), posts: new Set(), pantry: new Set(), profile: new Set(), chats: new Set(), live: new Set(), community: new Set() };
  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  };
  let user = load("spareShelf.user", null);
  let posts = load("spareShelf.posts", null) || seedPosts();
  let profiles = load("spareShelf.profiles", {});
  let publicProfiles = load("spareShelf.publicProfiles", {});

  const emit = (kind) => listeners[kind].forEach((fn) => fn());
  const setPosts = (next) => { posts = next; save("spareShelf.posts", posts); emit("posts"); };
  let pantry = load("spareShelf.pantry", null) || seedPantry();
  const setPantry = (next) => { pantry = next; save("spareShelf.pantry", pantry); emit("pantry"); };
  let chats = load("spareShelf.chats", []);
  let live = load("spareShelf.live", {}); // "chatId/uid" -> location
  let messages = load("spareShelf.messages", {});
  let reviews = load("spareShelf.reviews", null) || seedReviews();
  let communities = load("spareShelf.community", null) || seedCommunities();
  const setCommunities = (next) => { communities = next; save("spareShelf.community", communities); emit("community"); };
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
  const otherPerson = (chat, user) => chatOther(chat, user);

  return {
    on(kind, fn) { listeners[kind].add(fn); return () => listeners[kind].delete(fn); },
    getUser: () => user,
    setUser(u) { user = u; save("spareShelf.user", u); emit("user"); },
    getProfile: (uid) => profiles[uid] || null,
    getPublicProfile: (uid) => publicProfiles[uid] || null,
    setPublicProfile(uid, data) {
      const old = publicProfiles[uid];
      if (old && old.name === data.name && old.photoURL === data.photoURL) return;
      publicProfiles = { ...publicProfiles, [uid]: data };
      save("spareShelf.publicProfiles", publicProfiles);
      emit("profile");
    },
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
    getLive: (chatId, uid) => live[`${chatId}/${uid}`] || null,
    setLive(chatId, uid, data) {
      live = { ...live };
      if (data) live[`${chatId}/${uid}`] = data;
      else delete live[`${chatId}/${uid}`];
      save("spareShelf.live", live);
      emit("live");
    },
    setPickup(chatId, postId, value) {
      updateChat(chatId, (c) => ({ ...c, pickups: { ...(c.pickups || {}), [postId]: value } }));
      saveChats();
    },
    getMessages: (id) => [...(messages[id] || [])],
    ensureChat(id, info) {
      const existing = chats.find((c) => c.id === id);
      if (existing) updateChat(id, (c) => ({ ...c, ...info, names: { ...c.names, ...info.names } }));
      else chats = [...chats, { id, lastMessage: "", lastAt: 0, lastSenderId: "", lastRead: {}, ...info }];
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
    joinCommunity(uid, previousId, nextId, member) {
      const next = { ...communities };
      if (previousId && previousId !== nextId && next[previousId]) {
        const group = { ...next[previousId] };
        delete group[uid];
        next[previousId] = group;
      }
      next[nextId] = { ...(next[nextId] || {}), [uid]: member };
      setCommunities(next);
    },
    communityMembers(id) {
      const group = communities[id] || {};
      return Object.entries(group).map(([uid, data]) => ({ uid, ...data }));
    },
    getReviewsFor: (uid) => reviews.filter((r) => r.toId === uid),
    getReview: (id) => reviews.find((r) => r.id === id) || null,
    setReview(review) {
      reviews = [...reviews.filter((r) => r.id !== review.id), review];
      save("spareShelf.reviews", reviews);
    },
    confirm(postId, myField, otherField) {
      const post = posts.find((p) => p.id === postId);
      if (!post) return;
      const otherDone = post[otherField] === true;
      setPosts(posts.map((p) => (p.id === postId ? { ...p, [myField]: true, status: otherDone ? "completed" : "claimed" } : p)));
      if (otherDone) return;
      setTimeout(() => {
        setPosts(posts.map((p) => (p.id === postId ? { ...p, [otherField]: true, status: "completed" } : p)));
        const chat = chats.find((c) => c.id === pairId(post.ownerId, post.claimedById));
        const other = chat && otherPerson(chat, user);
        if (other) addMessage(chat.id, { senderId: other.id, senderName: other.name, text: "Confirmed on my end too. Thanks! 🙏", createdAt: Date.now() });
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
    localStorage.removeItem("spareShelf.live");
    localStorage.removeItem("spareShelf.reviews");
    localStorage.removeItem("spareShelf.community");
  } catch { /* ignore */ }
  window.location.reload();
}
