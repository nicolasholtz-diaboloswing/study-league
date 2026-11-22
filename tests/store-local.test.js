import { test, eq, assert, throws } from './runner.js';
import { createRng } from '../js/core/rng.js';
import { newPlayerState } from '../js/core/state.js';
import { createLocalStore, createMemoryStorage } from '../js/store/local.js';
import { mapFirebaseError } from '../js/store/firebase.js';
import { CLUBS } from './fixtures.js';

const NOW = new Date(2025, 0, 15, 12).getTime();
const mkState = (username, displayName = username) => newPlayerState({ username, displayName, club: 'My FC', clubs: CLUBS, rng: createRng(1), now: NOW });
const mk = (storage = createMemoryStorage()) => ({ storage, store: createLocalStore({ storage, now: () => NOW }) });

test('local store: sign up signs in, saves and loads the state', async () => {
  const { store } = mk();
  eq(await store.init(), null);
  const u = await store.signUp({ username: 'Leo', password: 'secret1', state: mkState('leo', 'Leo') });
  eq([u.username, u.role], ['leo', 'player']);
  assert(u.uid);
  eq(store.currentUser(), u);
  const st = await store.loadState();
  eq(st.profile.displayName, 'Leo');
  st.xp = 123;
  await store.saveState(st);
  eq((await store.loadState()).xp, 123);
});

test('local store: wrong password and unknown user are refused with the same error', async () => {
  const { store } = mk();
  await store.signUp({ username: 'leo', password: 'secret1', state: mkState('leo') });
  await store.signOut();
  eq(store.currentUser(), null);
  const e1 = await throws(() => store.signIn({ username: 'leo', password: 'nope123' }), 'wrong-credentials');
  const e2 = await throws(() => store.signIn({ username: 'ghost', password: 'secret1' }), 'wrong-credentials');
  eq(e1.message, e2.message);
  eq(store.currentUser(), null);
  const u = await store.signIn({ username: 'LEO', password: 'secret1' });
  eq(u.username, 'leo');
});

test('local store: usernames are validated and case-insensitively unique; passwords need 6 chars', async () => {
  const { store } = mk();
  await store.signUp({ username: 'Leo_1', password: 'secret1', state: mkState('leo_1') });
  await throws(() => store.signUp({ username: 'leo_1', password: 'another1' }), 'username-taken');
  await throws(() => store.signUp({ username: 'LEO_1', password: 'another1' }), 'username-taken');
  await throws(() => store.signUp({ username: 'ab', password: 'secret1' }), 'bad-username');
  await throws(() => store.signUp({ username: 'a'.repeat(17), password: 'secret1' }), 'bad-username');
  await throws(() => store.signUp({ username: 'has space', password: 'secret1' }), 'bad-username');
  await throws(() => store.signUp({ username: 'café', password: 'secret1' }), 'bad-username');
  await throws(() => store.signUp({ username: 'newone', password: '12345' }), 'weak-password');
  await store.signUp({ username: 'abc', password: '123456' });
  await store.signUp({ username: 'a'.repeat(16), password: '123456' });
});

test('local store: session and data survive a reload (new store, same storage)', async () => {
  const { storage, store } = mk();
  await store.signUp({ username: 'leo', password: 'secret1', state: mkState('leo', 'Leo') });
  const again = createLocalStore({ storage, now: () => NOW });
  const u = await again.init();
  eq(u.username, 'leo');
  eq((await again.loadState()).profile.displayName, 'Leo');
  await again.signOut();
  const third = createLocalStore({ storage, now: () => NOW });
  eq(await third.init(), null);
});

test('local store: password is not stored in clear text', async () => {
  const { storage, store } = mk();
  await store.signUp({ username: 'leo', password: 'topsecret', state: mkState('leo') });
  assert(!storage.getItem('studyleague.accounts').includes('topsecret'));
  assert(storage.getItem('studyleague.accounts').includes('sha256:') || storage.getItem('studyleague.accounts').includes('fnv:'));
});

test('local store: signed-out calls are refused', async () => {
  const { store } = mk();
  await throws(() => store.loadState(), 'not-signed-in');
  await throws(() => store.saveState({}), 'not-signed-in');
  await throws(() => store.listLeaderboard(), 'not-signed-in');
});

test('local store: leaderboard lists players only; players cannot list states; coach can', async () => {
  const { storage, store } = mk();
  const a = mkState('amy'); a.xp = 500; a.totals.wins = 3;
  const b = mkState('bob'); b.xp = 200;
  await store.signUp({ username: 'amy', password: 'secret1', state: a });
  await store.signUp({ username: 'bob', password: 'secret1', state: b });
  await store.signUp({ username: 'dad', password: 'secret1', role: 'coach', state: newPlayerState({ username: 'dad', displayName: 'Dad', role: 'coach', now: NOW }) });
  const board = await store.listLeaderboard();
  eq(board.map((x) => x.username).sort(), ['amy', 'bob']);
  const amy = board.find((x) => x.username === 'amy');
  eq([amy.xp, amy.wins, amy.displayName], [500, 3, 'amy']);
  assert(amy.uid);
  const coach = await store.listPlayerStates();
  eq(coach.map((x) => x.username).sort(), ['amy', 'bob']);
  eq(coach.find((x) => x.username === 'amy').state.xp, 500);
  const kid = createLocalStore({ storage, now: () => NOW });
  await kid.signIn({ username: 'bob', password: 'secret1' });
  await throws(() => kid.listPlayerStates(), 'forbidden');
  eq((await kid.listLeaderboard()).length, 2);
});

test('local store: peekState reads a local account without signing in (cloud import helper)', async () => {
  const { store } = mk();
  const s = mkState('leo'); s.xp = 42;
  await store.signUp({ username: 'leo', password: 'secret1', state: s });
  await store.signOut();
  eq((await store.peekState('LEO')).xp, 42);
  eq(await store.peekState('nobody'), null);
});

test('firebase error mapping gives friendly French messages', () => {
  eq(mapFirebaseError({ code: 'auth/email-already-in-use' }).code, 'username-taken');
  eq(mapFirebaseError({ code: 'auth/invalid-credential' }).message, 'Identifiant ou mot de passe incorrect.');
  eq(mapFirebaseError({ code: 'auth/network-request-failed' }).code, 'network');
  eq(mapFirebaseError({ code: 'permission-denied' }).code, 'not-authorized');
  eq(mapFirebaseError({ code: 'firestore/permission-denied' }).code, 'not-authorized');
  eq(mapFirebaseError(new Error('boom')).code, 'unknown');
  assert(!/auth\//.test(mapFirebaseError({ code: 'auth/weird' }).message));
});
