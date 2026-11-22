// Cloud backend: Firebase Auth (email/password, synthetic email) + Firestore.
// The Firebase SDK is loaded from the gstatic CDN here and nowhere else, only when this backend is used.
// Collections: users/{uid} (full state), leaderboard/{uid} (public summary), coaches/{uid} (created by hand).
import { EMAIL_DOMAIN, FIREBASE_SDK_BASE } from '../config.js';
import { migrateState } from '../core/state.js';
import { leaderboardSummary } from '../core/stats.js';
import { StoreError, validateUsername, validatePassword } from './common.js';

/** Map a Firebase error to a StoreError with a friendly French message. */
export function mapFirebaseError(e) {
  if (e instanceof StoreError) return e;
  const code = String(e?.code || '');
  const table = {
    'auth/email-already-in-use': ['username-taken', 'Cet identifiant est déjà pris.'],
    'auth/invalid-credential': ['wrong-credentials', 'Identifiant ou mot de passe incorrect.'],
    'auth/invalid-login-credentials': ['wrong-credentials', 'Identifiant ou mot de passe incorrect.'],
    'auth/wrong-password': ['wrong-credentials', 'Identifiant ou mot de passe incorrect.'],
    'auth/user-not-found': ['wrong-credentials', 'Identifiant ou mot de passe incorrect.'],
    'auth/invalid-email': ['bad-username', 'Cet identifiant n\'est pas valide.'],
    'auth/weak-password': ['weak-password', 'Mot de passe trop faible : au moins 6 caractères.'],
    'auth/too-many-requests': ['too-many-requests', 'Trop d\'essais. Attends quelques minutes puis réessaie.'],
    'auth/network-request-failed': ['network', 'Pas de connexion. Vérifie ton internet et réessaie.'],
    'auth/user-disabled': ['forbidden', 'Ce compte a été désactivé.'],
    'auth/operation-not-allowed': ['forbidden', 'La connexion par e-mail et mot de passe n\'est pas activée dans le projet Firebase.'],
    // Firestore rules: the account is not on the family list (members/<identifiant>@study-league.app).
    'permission-denied': ['not-authorized', 'Ton compte n\'est pas encore autorisé. Demande à ton parent de l\'ajouter à la liste de la famille.'],
    'unavailable': ['network', 'Le serveur est injoignable pour le moment. Réessaie dans un instant.'],
    'unauthenticated': ['not-signed-in', 'Connecte-toi d\'abord.'],
  };
  const hit = table[code] || table[code.replace(/^firestore\//, '')];
  if (hit) return new StoreError(hit[0], hit[1]);
  return new StoreError('unknown', 'Une erreur est survenue. Réessaie.');
}

const emailOf = (username) => `${username}@${EMAIL_DOMAIN}`;
const usernameOf = (email) => String(email || '').split('@')[0];
// Firestore rejects undefined values: round-trip through JSON.
const clean = (x) => JSON.parse(JSON.stringify(x));

/**
 * createFirebaseStore(config, { now })
 * Same interface as the local store. Roles: 'coach' if a coaches/{uid} document exists, else 'player'.
 * signUp with role 'coach' creates a normal account; it becomes a coach once the parent creates its
 * coaches/{uid} document (docs/FIREBASE_SETUP.md). The returned user then has coachPending: true.
 */
export function createFirebaseStore(config, { now = () => Date.now() } = {}) {
  let sdk = null;
  let user = null;
  // State that could not be written yet (sign-up refused or offline): handed back by loadState and re-saved by the app.
  let pending = null;

  async function load() {
    if (sdk) return sdk;
    const [app, auth, fs] = await Promise.all([
      import(FIREBASE_SDK_BASE + 'firebase-app.js'),
      import(FIREBASE_SDK_BASE + 'firebase-auth.js'),
      import(FIREBASE_SDK_BASE + 'firebase-firestore.js'),
    ]);
    const fbApp = app.initializeApp(config);
    sdk = { auth, fs, a: auth.getAuth(fbApp), db: fs.getFirestore(fbApp) };
    return sdk;
  }

  async function isCoach(uid) {
    const { fs, db } = await load();
    try {
      return (await fs.getDoc(fs.doc(db, 'coaches', uid))).exists();
    } catch {
      return false;
    }
  }

  async function toUser(fbUser, wantedCoach = false) {
    const coach = await isCoach(fbUser.uid);
    const u = { uid: fbUser.uid, username: usernameOf(fbUser.email), role: coach ? 'coach' : 'player' };
    if (!coach) {
      // A parent account stays "pending" on every later sign-in or reload until coaches/{uid} exists:
      // its saved state carries role 'coach'.
      let wants = wantedCoach;
      if (!wants) {
        try {
          const { fs, db } = await load();
          const snap = await fs.getDoc(fs.doc(db, 'users', fbUser.uid));
          wants = snap.exists() && snap.data().role === 'coach';
        } catch {
          wants = false;
        }
      }
      if (wants) u.coachPending = true;
    }
    return u;
  }

  const need = () => {
    if (!user) throw new StoreError('not-signed-in', 'Connecte-toi d\'abord.');
    return user;
  };

  async function writeState(state) {
    const { fs, db } = await load();
    const writes = [fs.setDoc(fs.doc(db, 'users', user.uid), clean(state))];
    // Only a player writes the leaderboard (the rules require a family member); a coach never does.
    if (state.role === 'player' && user.role !== 'coach') {
      writes.push(fs.setDoc(fs.doc(db, 'leaderboard', user.uid), clean(leaderboardSummary(state, now()))));
    }
    await Promise.all(writes);
    pending = null;
  }

  return {
    mode: 'cloud',

    /** Load the SDK and restore the remembered session. Returns the user or null. */
    async init() {
      try {
        const { auth, a } = await load();
        const fbUser = await new Promise((resolve) => {
          const off = auth.onAuthStateChanged(a, (u) => { off(); resolve(u); });
        });
        user = fbUser ? await toUser(fbUser) : null;
        return user;
      } catch (e) {
        throw mapFirebaseError(e);
      }
    },

    currentUser: () => user,

    /** True when a state from sign-up could not be written yet and must be saved (see loadState). */
    pendingSave: () => !!pending,

    /** signUp({ username, password, role, state }) -> user. Signs the user in and saves `state`. */
    async signUp({ username, password, role = 'player', state = null }) {
      const name = validateUsername(username);
      validatePassword(password);
      try {
        const { auth, a } = await load();
        const cred = await auth.createUserWithEmailAndPassword(a, emailOf(name), password);
        user = await toUser(cred.user, role === 'coach');
        if (state) {
          try { await writeState(state); } catch (e) { pending = state; throw e; }
        }
        return user;
      } catch (e) {
        throw mapFirebaseError(e);
      }
    },

    /** signIn({ username, password }) -> user */
    async signIn({ username, password }) {
      let name;
      try { name = validateUsername(username); } catch { throw mapFirebaseError({ code: 'auth/invalid-credential' }); }
      try {
        const { auth, a } = await load();
        const cred = await auth.signInWithEmailAndPassword(a, emailOf(name), String(password ?? ''));
        user = await toUser(cred.user);
        return user;
      } catch (e) {
        throw mapFirebaseError(e);
      }
    },

    async signOut() {
      try {
        const { auth, a } = await load();
        await auth.signOut(a);
      } catch (e) {
        throw mapFirebaseError(e);
      } finally {
        user = null;
      }
    },

    /** State of the signed-in user (migrated), or null if none saved yet. */
    async loadState() {
      need();
      try {
        const { fs, db } = await load();
        const snap = await fs.getDoc(fs.doc(db, 'users', user.uid));
        if (snap.exists()) return migrateState(snap.data());
        return pending ? migrateState(pending) : null;
      } catch (e) {
        throw mapFirebaseError(e);
      }
    },

    /** Save the full state and refresh the public leaderboard summary. */
    async saveState(state) {
      need();
      try {
        await writeState(state);
      } catch (e) {
        throw mapFirebaseError(e);
      }
    },

    /** Public summaries of all players: [{uid, ...summary}] */
    async listLeaderboard() {
      need();
      try {
        const { fs, db } = await load();
        const snap = await fs.getDocs(fs.collection(db, 'leaderboard'));
        return snap.docs.map((d) => ({ ...d.data(), uid: d.id }));
      } catch (e) {
        throw mapFirebaseError(e);
      }
    },

    /** Coach only: [{uid, username, state}] for every player. */
    async listPlayerStates() {
      if (!need() || user.role !== 'coach') throw new StoreError('forbidden', 'Seul un compte coach peut voir cet écran.');
      try {
        const { fs, db } = await load();
        const snap = await fs.getDocs(fs.collection(db, 'users'));
        const out = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (data.role === 'coach') continue;
          const st = migrateState(data);
          if (st) out.push({ uid: d.id, username: st.username || d.id, state: st });
        }
        return out;
      } catch (e) {
        throw mapFirebaseError(e);
      }
    },
  };
}
