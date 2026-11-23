// Set FIREBASE_CONFIG to the object from the Firebase console to switch on cloud mode.
// null = local mode (localStorage). See docs/FIREBASE_SETUP.md.
// This key is public by design; access is protected by firestore.rules.
const CLOUD_CONFIG = {
  apiKey: 'AIzaSyDJEWyRpshEjAUYkU84RqaYvRPNF2113mk',
  authDomain: 'study-league-83cbe.firebaseapp.com',
  projectId: 'study-league-83cbe',
  storageBucket: 'study-league-83cbe.firebasestorage.app',
  messagingSenderId: '351616927430',
  appId: '1:351616927430:web:a5166a8b5870e656c4b9c7',
};

// On a dev machine (localhost) the app stays in local mode so tests never write to the
// real project; add ?cloud=1 to the URL to try cloud mode from localhost.
const loc = typeof location !== 'undefined' ? location : null;
const isDevHost = !!loc && ['localhost', '127.0.0.1'].includes(loc.hostname);
const forceCloud = !!loc && new URLSearchParams(loc.search).has('cloud');

export const FIREBASE_CONFIG = isDevHost && !forceCloud ? null : CLOUD_CONFIG;

export const APP_NAME = 'Study League';
export const APP_VERSION = '1.1.0'; // shown in the top bar and on the login screen; bump it at every release (go-live)

// Match
export const MATCH_QUESTIONS = 10;   // questions per match (league and training), about 3 minutes
export const MATCH_MINUTES = 3;      // about how long a match takes (shown to the child)
export const TIMER_MCQ_SECONDS = 30;
export const TIMER_INPUT_SECONDS = 45;
export const GOAL_EVERY_N_CORRECT = 2; // every Nth correct answer scores (the attack meter has N segments)

// League season: 8 clubs (the player + 7 opponents), single round-robin = one match per opponent, one matchday each.
export const OPPONENTS_PER_SEASON = 7;
export const SEASON_MATCHDAYS = OPPONENTS_PER_SEASON; // a season of about one week at one match a day

// Rewards
// Two packs: "small" (1 card, never a legend) and "big" (3 cards, legend possible, better odds). Odds: see PACK_ODDS in core/rewards.js.
export const PACKS = { small: { cost: 75, size: 1 }, big: { cost: 150, size: 3 } };
export const PACK_COST = PACKS.big.cost;   // the big pack (also the free pack)
export const PACK_SIZE = PACKS.big.size;
export const FREE_PACK_EVERY_N_LEVELS = 10;
export const TRAINING_XP_FACTOR = 0.5;

// State
export const HISTORY_LIMIT = 100;      // matches kept in state
export const MASTERY_WINDOW = 20;      // last N answers of a topic
export const MASTERY_MIN_ANSWERS = 10; // needed before stars appear
export const ACTIVITY_DAYS_KEPT = 60;

// Accounts
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;
export const PASSWORD_MIN = 6;
export const EMAIL_DOMAIN = 'study-league.app';
export const FIREBASE_SDK_BASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
