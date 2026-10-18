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
8. Turn on auto-delete for cleared history: **Firestore → TTL → Create policy**, collection group `posts`, timestamp field `deleteAt`. A post is cleared once both people press "Clear history", and Firestore deletes it for good after its `deleteAt` time (30 days later, usually within a day of that).

## How the code is organized

| File | What it does |
|---|---|
| `src/data.js` | **All** database and login code. The UI only calls these functions. |
| `src/firebase.js` | Connects to Firebase using `.env.local`. |
| `src/App.jsx` | Main page: header, tabs, filters, feed. |
| `src/components/PostForm.jsx` | The "new post" form. |
| `src/components/PostCard.jsx` | One post, plus its buttons (claim, complete, delete). |
| `src/components/Pantry.jsx` | Pantry tab: your private list of what's at home, with a "Share" button that creates an Offer. |
| `src/components/Recipes.jsx` | Recipes tab: mock recipes with tag filters. |
| `src/components/RecipeDetail.jsx` | One recipe: what you have, what you need, and who's offering it. |
| `src/components/Messages.jsx` | Messages tab: list of your chats. |
| `src/components/ChatView.jsx` | One chat about one post, with the hand-off confirmation. |
| `src/components/Handoff.jsx` | "I handed it off" / "I got it" buttons. A post completes when both sides confirm. |
| `src/components/MapPanel.jsx` | Map on the right: OpenStreetMap streets (Leaflet), zoom, post pins, walking directions. |
| `src/directions.js` | Walking routes from the free OpenStreetMap routing service, plus step text. |
| `src/recipes.js` | The mock recipe data. Add recipes here. |
| `src/matching.js` | Matches ingredient names to pantry items and posts. |
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

1. Push to GitHub → import the repo at https://vercel.com.
2. Under **Environment Variables**, add everything from your `.env.local`: the six `VITE_FIREBASE_*` values **and** `VITE_RECAPTCHA_SITE_KEY`. Without the reCAPTCHA key, App Check never starts and Firebase rejects the live site's requests. Then **Deploy**.
3. Firebase console → **Authentication → Settings → Authorized domains**: add your `*.vercel.app` domain (otherwise Google sign-in fails).
4. Firebase console → **Firestore → Rules**: paste in `firestore.rules` from this repo and **Publish**.
5. Google Cloud console → **Security → reCAPTCHA** → your key → **Key details**: add your `*.vercel.app` domain and `localhost`.
6. Do one full run on the live site: sign in, post an offer, claim it from a second account, agree on a pickup spot, confirm.

Each teammate testing on localhost also needs their own App Check debug token: it's printed in the browser console the first time, and gets added under Firebase console → **App Check → Apps → ⋮ → Manage debug tokens**.

## Payments (Stripe test mode, `payments` branch)

Sellers can put a price on offers. The buyer's card is **held** when they claim, **charged** only after both people confirm the hand-off, and **released** if the hand-off is declined for good. Stripe handles all card and bank details; the browser never sees them or the secret key. Everything runs in Stripe **test mode**: use card `4242 4242 4242 4242`, any future date, any CVC. The server refuses live keys.

How it fits together:

| Where | What |
| --- | --- |
| `src/payments.js` | Browser side: "Pay & claim", payout setup, calls the server. |
| `api/payments/*.js` | Server functions Vercel runs: `connect` + `status` (seller payouts), `checkout` (Stripe Checkout page), `confirm` (claims the post after paying), `capture` (charge after hand-off), `release` (cancel the hold). |
| `firestore.rules` | Only the server can write `payment` and `stripeAccounts`; paid offers can't be claimed without paying. |

Setup:

1. Create a free account at https://dashboard.stripe.com and stay in **test mode**. Turn on **Connect** (Settings → Connect), choosing Express accounts.
2. Copy the test **Secret key** (`sk_test_...`).
3. Firebase console → **Project settings → Service accounts → Generate new private key**. Keep this file secret; never commit it.
4. Add to `.env.local` (and to Vercel's Environment Variables for deploys): `VITE_PAYMENTS=on`, `STRIPE_SECRET_KEY`, `FIREBASE_SERVICE_ACCOUNT`.
5. Publish the updated `firestore.rules`.
6. Run locally with `npx vercel dev` (it runs the `/api` functions too; `npm run dev` doesn't).

To try it: in Profile, **Set up payouts** (Stripe's test sign-up accepts fake details, like routing `110000000`, account `000123456789`, SSN `000-00-0000`). Post an offer with a price, then claim it from a second account.

