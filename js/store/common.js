// Shared by both store backends: errors and input validation.
import { USERNAME_MIN, USERNAME_MAX, PASSWORD_MIN } from '../config.js';

/** Error thrown by every store function. `code` is machine readable, `message` is friendly French. */
export class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}
// codes: bad-username, weak-password, username-taken, wrong-credentials, not-signed-in,
//        forbidden, not-authorized (account not on the family list), network, too-many-requests, storage, unknown

/** Usernames are case-insensitive: stored and compared in lower case. */
export function normalizeUsername(u) {
  return String(u ?? '').trim().toLowerCase();
}

const USERNAME_RE = new RegExp(`^[A-Za-z0-9_]{${USERNAME_MIN},${USERNAME_MAX}}$`);

/** Returns the normalised username or throws StoreError('bad-username'). */
export function validateUsername(u) {
  const name = String(u ?? '').trim();
  if (!USERNAME_RE.test(name)) {
    throw new StoreError('bad-username', `L'identifiant doit faire ${USERNAME_MIN} à ${USERNAME_MAX} caractères : lettres, chiffres ou tiret bas (_).`);
  }
  return name.toLowerCase();
}

export function validatePassword(p) {
  if (String(p ?? '').length < PASSWORD_MIN) {
    throw new StoreError('weak-password', `Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères.`);
  }
}
