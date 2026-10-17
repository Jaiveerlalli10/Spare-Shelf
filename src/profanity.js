// Blocks swearing in the optional review note.
// Catches spaced-out, dotted, repeated, and lookalike spellings ("f.u.c.k", "fuuuck", "sh1t").
// Ordinary words that only contain those letters, like "class" or "cocktail", are allowed.

const WORDS = [
  "fuck", "shit", "bitch", "asshole", "bastard", "dick", "cock", "pussy", "cunt",
  "slut", "whore", "damn", "hell", "piss", "crap", "suck", "ass", "arse",
  "motherfucker", "bullshit", "dickhead", "jackass", "dumbass", "badass", "fuckyou",
  "nigger", "nigga", "faggot", "fag", "retard", "tranny", "kike", "spic", "chink",
  "shitty", "bitchy", "fvck", "phuck", "fuk", "fuq", "shyt", "biatch", "azz",
  "fck", "sht", "btch", "dck", "fk",
];

// Distinctive stems. A note token that contains one of these is blocked ("fuckyou").
const CONTAINS = ["fuck", "shit", "bitch", "pussy", "cunt", "slut", "whore", "piss", "bastard", "nigger", "nigga", "faggot", "retard", "tranny"];

// Whole words that merely share letters with a blocked word.
const ALLOW = new Set([
  "hello", "hellos", "shell", "shells", "helicopter", "helicopters",
  "classic", "classics", "class", "classes", "assignment", "assignments",
  "assassin", "assassins", "password", "passwords", "bass", "passion", "passionate",
  "spicy", "spice", "spices", "shiitake", "shiitakes",
  "cocktail", "cocktails", "peacock", "peacocks", "hitchcock", "cockatoo", "cockatoos", "cockatiel", "cockatiels",
  "dickinson", "scrap", "scraps", "scrape", "scraped", "scrapes", "grape", "grapes",
  "therapist", "therapists",
]);

const SUFFIXES = ["ing", "ers", "er", "ed", "es", "head", "hole", "ish", "s"];
const WORD_SET = new Set(WORDS);

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", $: "s", "!": "i" };
const HOMO = { "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0456": "i", "\u0455": "s" };

function squeeze(value) {
  return value.replace(/(.)\1+/g, "$1");
}

function normalize(text) {
  let value = text.toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, "");
  value = value.replace(/[\u0430\u0435\u043e\u0440\u0441\u0443\u0456\u0455]/g, (ch) => HOMO[ch] || ch);
  value = value.replace(/[013457@$!]/g, (ch) => LEET[ch] || ch);
  return value;
}

function stemsOf(token) {
  const stems = [];
  for (const suffix of SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) stems.push(token.slice(0, -suffix.length));
  }
  return stems;
}

function tokenBlocked(token) {
  if (!token || ALLOW.has(token)) return false;
  const forms = [token, squeeze(token)];
  for (const form of forms) {
    if (ALLOW.has(form) || WORD_SET.has(form)) return WORD_SET.has(form);
    if (stemsOf(form).some((stem) => WORD_SET.has(stem) || WORD_SET.has(squeeze(stem)))) return true;
    if (CONTAINS.some((word) => form.includes(word))) return true;
  }
  return false;
}

/** True when the note includes profanity. Empty notes are fine. */
export function hasProfanity(text) {
  if (!text || !text.trim()) return false;
  const normalized = normalize(text);
  const tokens = normalized.replace(/[^a-z]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (tokens.some(tokenBlocked)) return true;

  let run = "";
  const flush = () => {
    const hit = run.length >= 3 && tokenBlocked(run);
    run = "";
    return hit;
  };
  for (const token of tokens) {
    if (token.length === 1) run += token;
    else if (flush()) return true;
  }
  if (flush()) return true;

  if (!/[*]/.test(normalized)) return false;
  const masked = normalized.replace(/[*._-]+/g, "");
  const maskedTokens = masked.replace(/[^a-z]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return maskedTokens.some(tokenBlocked);
}

export const PROFANITY_MESSAGE = "Take the swearing out of your note and try again.";
