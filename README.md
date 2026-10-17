# Spare Shelf 🥫

Borrow a cup of sugar from your neighbors, as an app. Post the ingredients you have extra of, or request ones you're missing. Neighbors nearby respond, food doesn't go to waste, and everyone saves money.

Built for DubHacks 2026 (Food theme, Community track).

## Run it

You need Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the link it prints (usually http://localhost:5173). Without Firebase keys the app runs in **demo mode**: sample posts and a fake login, saved only in your browser. That's enough to start building the UI.

## Connect Firebase (one person does this, about 10 minutes)

1. Go to https://console.firebase.google.com and create a project. You can skip Google Analytics.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Build → Firestore Database → Create database.** Start in **test mode** for now.
4. **Project settings (gear icon) → Your apps → Web (`</>`)**. Register the app and copy the config values.
5. Copy `.env.example` to `.env.local` and paste the values in. Share this file with teammates privately; it's not committed to git.
6. Restart `npm run dev`. The demo banner disappears and posts now sync live between everyone's browsers.
7. Before the demo, paste `firestore.rules` into **Firestore → Rules** and click Publish. This makes sure people can only edit their own posts.

## How the code is organized

| File | What it does |
|---|---|
| `src/data.js` | **All** database and login code. The UI only calls these functions. |
| `src/firebase.js` | Connects to Firebase using `.env.local`. |
| `src/App.jsx` | Main page: header, tabs, filters, feed. |
| `src/components/PostForm.jsx` | The "new post" form. |
| `src/components/PostCard.jsx` | One post, plus its buttons (claim, complete, delete). |
| `src/components/Pantry.jsx` | Pantry tab: your private list of what's at home, with a "Share" button that creates an Offer. |
| `src/dates.js` | Best-by date helpers. |
| `src/components/ImpactBar.jsx` | Impact counter (items shared, $ saved, kg of food saved). |
| `src/styles.css` | All styling. The colors are at the top. |

**React in 30 seconds (for Python/Java people):** a component is a function that returns HTML-like markup (JSX). `useState` is a variable that redraws the screen when you change it. `useEffect(fn, [])` runs once when the page loads. That covers most of what you need here.

## Hackathon plan (team of 3)

**Roles**
- **A, data/Firebase:** Firebase setup, `data.js`, security rules, deploying.
- **B, frontend:** components, new features (the stretch goals below).
- **C, design/pitch (codes too):** styling, demo data, Devpost, slides, the pitch, and the backup demo video.

**Timeline (about 24 hours)**
| Hours | Goal |
|---|---|
| 0–2 | Everyone runs the app locally. A sets up Firebase. Sketch any new screens. |
| 2–10 | Finish the core flow on live Firebase: sign in → post → respond → complete. |
| 10–14 | **Deploy it** (Vercel or Firebase Hosting) and **freeze the MVP.** |
| 14–20 | Polish, plus 1–2 stretch goals. |
| 20–24 | Load realistic demo posts, record a backup video, write the Devpost, practice the 2–3 minute pitch. |

**Stretch goals (pick 1–2)**
- Map view of pickup spots (Leaflet + OpenStreetMap, free)
- "What can I cook?" recipe ideas from what's offered nearby (AI API)
- Photo upload (Firebase Storage)
- Highlight items about to expire and sort them to the top
- In-app chat instead of showing emails
- Badges like "Good Neighbor" for people who share often

**Pitch outline**
1. The problem: a quick personal story about broke college students, forgotten ingredients and wasted groceries.
2. A live demo on two phones: one person requests sugar, the other taps "I can help", and it updates instantly.
3. The impact counter: money saved, food not wasted, neighbors connected.
4. Trust and safety: sealed or fresh food only, allergen notes, public pickup spots, campus email login.
5. What's next: dorm and campus groups, food bank partnerships.

## Deploy (Vercel)

Push to GitHub → import the repo at https://vercel.com → add the same `VITE_FIREBASE_*` variables under Environment Variables → Deploy. Then in Firebase, go to **Authentication → Settings → Authorized domains** and add your `*.vercel.app` domain.
