// Picks the backend: Firebase when js/config.js has FIREBASE_CONFIG, else localStorage.
import { FIREBASE_CONFIG } from '../config.js';
import { createLocalStore } from './local.js';
import { createFirebaseStore } from './firebase.js';

export { StoreError } from './common.js';
export { createLocalStore, createMemoryStorage } from './local.js';
export { createFirebaseStore } from './firebase.js';

export const mode = FIREBASE_CONFIG ? 'cloud' : 'local';

const local = createLocalStore();

/** The app's store. Interface: init, signUp, signIn, signOut, currentUser, loadState, saveState, listLeaderboard, listPlayerStates. */
export const store = FIREBASE_CONFIG ? createFirebaseStore(FIREBASE_CONFIG) : local;

/**
 * Cloud mode only: progress of a local account with this username on this device (a state), or null.
 * Call it after a cloud signUp; if it returns a state, offer to import it.
 */
export async function findLocalProgress(username) {
  if (mode !== 'cloud') return null;
  return local.peekState(username);
}

/**
 * Cloud mode only: copy the local account's progress (same username as the signed-in user) into the
 * cloud account. Returns the imported state, or null if there was nothing to import.
 */
export async function importLocalProgress() {
  const u = store.currentUser();
  if (mode !== 'cloud' || !u) return null;
  const state = await local.peekState(u.username);
  if (!state) return null;
  await store.saveState(state);
  return state;
}
