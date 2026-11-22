// Local backend: accounts and states in localStorage. The password lock is a soft lock, not security.
import { hashString } from '../core/rng.js';
import { migrateState } from '../core/state.js';
import { leaderboardSummary } from '../core/stats.js';
import { StoreError, normalizeUsername, validateUsername, validatePassword } from './common.js';

/** In-memory stand-in for localStorage (tests, or when localStorage is blocked). */
export function createMemoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function defaultStorage() {
  try {
    const ls = globalThis.localStorage;
    ls.setItem('studyleague.probe', '1');
    ls.removeItem('studyleague.probe');
    return ls;
  } catch {
    return createMemoryStorage();
  }
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(a);
  else for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
  return hex(a);
}

async function hashPassword(salt, password) {
  const text = `${salt}:${password}`;
  if (globalThis.crypto?.subtle) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return 'sha256:' + hex(buf);
  }
  return 'fnv:' + hashString(text).toString(16); // non-secure context fallback (soft lock anyway)
}

/**
 * createLocalStore({ storage, prefix, now })
 *  storage: object with getItem/setItem/removeItem (default localStorage, memory if blocked)
 *  now: () => ms (default Date.now), used for the leaderboard summary timestamp
 */
export function createLocalStore({ storage = defaultStorage(), prefix = 'studyleague.', now = () => Date.now() } = {}) {
  const K = { accounts: `${prefix}accounts`, session: `${prefix}session`, state: (uid) => `${prefix}state.${uid}` };
  let user = null;

  const readJson = (key, fallback) => {
    try {
      const raw = storage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const writeJson = (key, value) => {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch {
      throw new StoreError('storage', 'Impossible d\'enregistrer sur cet appareil (stockage plein ou bloqué).');
    }
  };
  const accounts = () => readJson(K.accounts, {});
  const publicUser = (a) => ({ uid: a.uid, username: a.username, role: a.role });

  return {
    mode: 'local',

    /** Restore the remembered session. Returns the user or null. */
    async init() {
      const uid = readJson(K.session, null);
      const acc = uid && Object.values(accounts()).find((a) => a.uid === uid);
      user = acc ? publicUser(acc) : null;
      return user;
    },

    /** Current user {uid, username, role} or null. Synchronous (cached after init/signUp/signIn). */
    currentUser: () => user,

    /**
     * signUp({ username, password, role: 'player'|'coach', state }) -> user. Signs the user in.
     * `state` is the initial state (newPlayerState); it is saved under the new account.
     */
    async signUp({ username, password, role = 'player', state = null }) {
      const name = validateUsername(username);
      validatePassword(password);
      const all = accounts();
      if (all[name]) throw new StoreError('username-taken', 'Cet identifiant est déjà pris.');
      const salt = randomHex(16);
      const acc = {
        uid: 'u' + randomHex(8), username: name, role: role === 'coach' ? 'coach' : 'player',
        salt, hash: await hashPassword(salt, password), createdAt: now(),
      };
      all[name] = acc;
      writeJson(K.accounts, all);
      if (state) writeJson(K.state(acc.uid), state);
      writeJson(K.session, acc.uid);
      user = publicUser(acc);
      return user;
    },

    /** signIn({ username, password }) -> user. Throws 'wrong-credentials' for unknown user or bad password. */
    async signIn({ username, password }) {
      const acc = accounts()[normalizeUsername(username)];
      const bad = new StoreError('wrong-credentials', 'Identifiant ou mot de passe incorrect.');
      if (!acc) throw bad;
      if ((await hashPassword(acc.salt, String(password ?? ''))) !== acc.hash) throw bad;
      writeJson(K.session, acc.uid);
      user = publicUser(acc);
      return user;
    },

    async signOut() {
      try { storage.removeItem(K.session); } catch { /* ignore */ }
      user = null;
    },

    /** State of the signed-in user (migrated), or null if none saved. */
    async loadState() {
      if (!user) throw new StoreError('not-signed-in', 'Connecte-toi d\'abord.');
      return migrateState(readJson(K.state(user.uid), null));
    },

    /** Save the signed-in user's state (also refreshes their public leaderboard summary). */
    async saveState(state) {
      if (!user) throw new StoreError('not-signed-in', 'Connecte-toi d\'abord.');
      writeJson(K.state(user.uid), state);
    },

    /** Public summaries of all players on this device: [{uid, ...leaderboardSummary}] */
    async listLeaderboard() {
      if (!user) throw new StoreError('not-signed-in', 'Connecte-toi d\'abord.');
      const t = now();
      const out = [];
      for (const a of Object.values(accounts())) {
        if (a.role !== 'player') continue;
        try {
          const st = migrateState(readJson(K.state(a.uid), null));
          if (st) out.push({ ...leaderboardSummary(st, t), uid: a.uid });
        } catch { /* unreadable account: skipped */ }
      }
      return out;
    },

    /** Coach only: [{uid, username, state}] for every player. */
    async listPlayerStates() {
      if (!user || user.role !== 'coach') throw new StoreError('forbidden', 'Seul un compte coach peut voir cet écran.');
      const out = [];
      for (const a of Object.values(accounts())) {
        if (a.role !== 'player') continue;
        try {
          const st = migrateState(readJson(K.state(a.uid), null));
          if (st) out.push({ uid: a.uid, username: a.username, state: st });
        } catch { /* unreadable account: skipped */ }
      }
      return out;
    },

    /** Saved state of a local account by username, without signing in (for the cloud import helper). */
    async peekState(username) {
      const acc = accounts()[normalizeUsername(username)];
      return acc ? migrateState(readJson(K.state(acc.uid), null)) : null;
    },
  };
}
