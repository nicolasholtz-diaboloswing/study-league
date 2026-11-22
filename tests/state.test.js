import { test, eq, assert } from './runner.js';
import { createRng } from '../js/core/rng.js';
import {
  loadCatalog, listTopics, loadTopicQuestions, pickQuestions, acceptedAnswers,
} from '../js/core/questions.js';
import { createMatch, answerQuestion, currentQuestion, summarizeMatch } from '../js/core/match.js';
import { nextFixture, seasonLength } from '../js/core/league.js';
import { MATCH_QUESTIONS as NQ, GOAL_EVERY_N_CORRECT as N, SEASON_MATCHDAYS as SL } from '../js/config.js';
import {
  newPlayerState, migrateState, ensureSeason, applyResult, buyPack, openFreePack, SCHEMA_VERSION,
} from '../js/core/state.js';
import { fetchJson, CLUBS, CARDS } from './fixtures.js';

const DAY = 86400000;
const T0 = new Date(2025, 0, 6, 10, 0).getTime();

const catalog = await loadCatalog(fetchJson);
const topics = listTopics(catalog, 'u13');
const POOL = (await Promise.all(topics.map((t) => loadTopicQuestions(fetchJson, t)))).flat();

function fresh(seed = 1) {
  return newPlayerState({ username: 'kid', displayName: 'Kid', squad: 'u13', club: 'My FC', colors: ['#f00', '#fff'], clubs: CLUBS, rng: createRng(seed), now: T0 });
}

function playMatch(state, rng, now, accuracy, { mode = 'league', topic = 'en-det' } = {}) {
  const season = state.league.season;
  const fx = mode === 'league' ? nextFixture(season) : null;
  const pool = POOL.filter((q) => q.topicId === topic);
  const questions = pickQuestions(pool, { history: state.questions, division: mode === 'league' ? season.division : null, rng });
  const m = createMatch({
    mode, questions, topicId: topic, subjectId: 'en',
    opponent: fx ? { id: fx.opponent.id, name: fx.opponent.name, strength: fx.strength } : null,
    division: season ? season.division : 0, rng, now,
  });
  while (!m.finished) {
    const q = currentQuestion(m);
    answerQuestion(m, rng.chance(accuracy) ? acceptedAnswers(q)[0] : 'zzz', 3000);
  }
  return summarizeMatch(m, now);
}

const ctx = (rng, now) => ({ now, rng, clubs: CLUBS, cards: CARDS, catalog });

function hasNestedArray(x) {
  if (Array.isArray(x)) return x.some((v) => Array.isArray(v) || hasNestedArray(v));
  if (x && typeof x === 'object') return Object.values(x).some(hasNestedArray);
  return false;
}

test('state: new player state shape', () => {
  const s = fresh();
  eq([s.schema, s.role, s.username, s.xp, s.coins, s.freePacks], [SCHEMA_VERSION, 'player', 'kid', 0, 0, 0]);
  eq(s.league.season.clubs.length, 8);
  eq(s.league.season.number, 1);
  eq(s.profile, { displayName: 'Kid', club: 'My FC', colors: ['#f00', '#fff'], squad: 'u13' });
  const noClubs = newPlayerState({ username: 'x', displayName: 'X', now: 0 });
  eq(noClubs.league.season, null);
  const ens = ensureSeason(noClubs, CLUBS, createRng(1));
  eq(ens.league.season.clubs.length, 8);
  eq(noClubs.league.season, null, 'input untouched');
  const coach = newPlayerState({ username: 'dad', displayName: 'Dad', role: 'coach', now: 0 });
  eq(coach.role, 'coach');
  assert(!('xp' in coach));
});

test('state: migrateState fills defaults, rejects non-objects, handles coach', () => {
  eq(migrateState(null), null);
  const m = migrateState({ username: 'old', profile: { displayName: 'Old' }, xp: 50, totals: { wins: 2 } });
  eq([m.schema, m.xp, m.coins, m.totals.wins, m.totals.matches, m.profile.squad, m.matches, m.badges], [SCHEMA_VERSION, 50, 0, 2, 0, 'u13', [], {}]);
  eq(m.league, { season: null, history: [] });
  const c = migrateState({ role: 'coach', username: 'dad', profile: { displayName: 'Dad' } });
  eq([c.role, c.schema], ['coach', SCHEMA_VERSION]);
});

test('applyResult: full perfect season (SL matchdays: promotion, title, packs, badges) (promotion, title, packs, badges)', () => {
  const rng = createRng(11);
  let s = fresh(2);
  const original = JSON.stringify(s);
  const allEvents = [];
  for (let i = 0; i < SL; i++) {
    const now = T0 + i * DAY;
    const before = JSON.stringify(s);
    const res = playMatch(s, rng, now, 1);
    eq([res.outcome, res.goalsFor, res.goalsAgainst], ['W', NQ / N, 0]);
    const out = applyResult(s, res, ctx(rng, now));
    eq(JSON.stringify(s), before, 'input state not mutated');
    s = out.state;
    allEvents.push(...out.events);
  }
  assert(JSON.stringify(s) !== original);
  const t = s.totals;
  eq([t.matches, t.leagueMatches, t.wins, t.winStreak, t.bestWinStreak, t.perfect, t.cleanSheets, t.hatTricks], [SL, SL, SL, SL, SL, SL, SL, SL]);
  eq([t.promotions, t.titles, t.correct, t.answered, t.goalsFor, t.goalsAgainst], [1, 1, SL * NQ, SL * NQ, SL * NQ / N, 0]);
  eq(s.coins, SL * 40);
  eq(s.xp, SL * (NQ * 15 + 50));
  eq(s.league.history.length, 1);
  eq(s.league.history[0].position, 1);
  eq([s.league.history[0].promoted, s.league.history[0].champion], [true, true]);
  eq([s.league.season.number, s.league.season.division, s.league.season.matchday], [2, 1, 0]);
  eq(s.freePacks, 3, 'promotion + title + level 5');
  eq(s.streak, { current: SL, best: SL, lastDay: s.streak.lastDay });
  eq(s.matches.length, SL);
  const types = allEvents.map((e) => e.type);
  eq(types.filter((x) => x === 'matchday').length, SL);
  eq(types.filter((x) => x === 'season-end').length, 1);
  const se = allEvents.find((e) => e.type === 'season-end');
  eq([se.promoted, se.champion, se.nextDivision, se.summary.table.length], [true, true, 1, 8]);
  eq(allEvents.filter((e) => e.type === 'free-pack').map((e) => e.reason).sort(), ['level', 'promotion', 'title']);
  for (const id of ['first-match', 'first-win', 'streak-3', 'streak-5', 'hat-trick', 'clean-sheet', 'perfect', 'promotion', 'title', 'day-streak-7']) {
    assert(s.badges[id], 'badge ' + id);
  }
  eq(allEvents.filter((e) => e.type === 'badge').length, Object.keys(s.badges).length);
  assert(allEvents.some((e) => e.type === 'level-up'));
  assert(!hasNestedArray(s), 'no nested arrays (Firestore)');
  eq(JSON.parse(JSON.stringify(s)), s, 'JSON round trip');
});

test('applyResult: 120 league matches keep 100 in history, seasons roll over, state stays valid', () => {
  const rng = createRng(21);
  let s = fresh(5);
  for (let i = 0; i < 120; i++) {
    const now = T0 + i * 3600000;
    s = applyResult(s, playMatch(s, rng, now, 0.6), ctx(rng, now)).state;
  }
  eq(s.totals.matches, 120);
  eq(s.matches.length, 100);
  eq(s.matches[99].at, T0 + 119 * 3600000);
  eq(s.league.history.length, Math.floor(120 / SL));
  eq(s.league.season.number, Math.floor(120 / SL) + 1);
  eq(s.totals.wins + s.totals.draws + s.totals.losses, 120);
  assert(s.league.season.division >= 0 && s.league.season.division <= 4);
  assert(Object.keys(s.activity).length <= 60);
  assert(!hasNestedArray(s));
});

test('applyResult: deterministic with the same seeds', () => {
  const run = () => {
    const rng = createRng(77);
    let s = fresh(3);
    for (let i = 0; i < 16; i++) s = applyResult(s, playMatch(s, rng, T0 + i * DAY, 0.7), ctx(rng, T0 + i * DAY)).state;
    return JSON.stringify(s);
  };
  eq(run(), run());
});

test('applyResult: training gives half XP, no coins, no league effect, updates mastery and history', () => {
  const rng = createRng(4);
  const s0 = fresh(1);
  const res = playMatch(s0, rng, T0, 1, { mode: 'training', topic: 'en-det' });
  const { state: s, events } = applyResult(s0, res, ctx(rng, T0));
  eq(s.league.season.matchday, 0);
  eq(s.coins, 0);
  eq(s.totals.leagueMatches, 0);
  eq(s.totals.wins, 0);
  eq(s.totals.matches, 1);
  const xpEv = events.find((e) => e.type === 'xp');
  eq(xpEv.total, Math.floor((NQ * 10 + res.speedBonus + 50) / 2));
  eq(s.xp, xpEv.total);
  assert(!events.some((e) => e.type === 'coins' || e.type === 'matchday'));
  eq(s.topics['en-det'].recent.length, NQ);
  const mastery = events.find((e) => e.type === 'mastery');
  eq([mastery.topicId, mastery.from, mastery.to], ['en-det', 0, 3]);
  assert(s.badges['topic-master'] && s.badges['perfect']);
  eq(s.matches[0].mode, 'training');
});

test('applyResult: question history records misses with prompt/answer, and wrong answers feed selection', () => {
  const rng = createRng(8);
  const s0 = fresh(1);
  const res = playMatch(s0, rng, T0, 0, { mode: 'training', topic: 'fr-gram' });
  const { state: s } = applyResult(s0, res, ctx(rng, T0));
  const ids = Object.keys(s.questions);
  eq(ids.length, NQ);
  const q = s.questions[ids[0]];
  eq([q.seen, q.wrong, q.correct, q.lastCorrect, q.topicId, typeof q.p, typeof q.a], [1, 1, 0, false, 'fr-gram', 'string', 'string']);
  const next = pickQuestions(POOL.filter((x) => x.topicId === 'fr-gram'), { n: 9, history: s.questions, rng: createRng(1) });
  assert(next.every((x) => !s.questions[x.id]), 'unseen questions come first');
});

test('applyResult: coach pick bonus and loss/draw coins flow into state', () => {
  const rng = createRng(31);
  const s0 = fresh(9);
  const res = playMatch(s0, rng, T0, 1);
  res.coachPick = true;
  const { state: s, events } = applyResult(s0, res, ctx(rng, T0));
  eq(s.coins, 60);
  eq(events.find((e) => e.type === 'coins').coachPick, 20);
});

test('buyPack: needs 50 coins, adds cards and counts legends; openFreePack uses free packs', () => {
  const rng = createRng(6);
  const s0 = fresh(1);
  let threw = false;
  try { buyPack(s0, ctx(rng, T0)); } catch { threw = true; }
  assert(threw, 'not enough coins');
  const rich = { ...s0, coins: 120 };
  const out = buyPack(rich, ctx(rng, T0));
  eq(out.state.coins, 70);
  eq(out.cards.length, 3);
  eq(Object.values(out.state.cards).reduce((a, b) => a + b, 0), 3);
  eq(rich.coins, 120, 'input untouched');
  threw = false;
  try { openFreePack(s0, ctx(rng, T0)); } catch { threw = true; }
  assert(threw, 'no free pack');
  const free = openFreePack({ ...s0, freePacks: 2 }, ctx(rng, T0));
  eq([free.state.freePacks, free.state.coins], [1, 0]);
  // many packs: legends are counted and the badge appears
  let s = { ...s0, coins: 100000 };
  for (let i = 0; i < 60; i++) s = buyPack(s, ctx(rng, T0)).state;
  const legends = Object.entries(s.cards).filter(([id]) => CARDS.find((c) => c.id === id).rarity === 'legend').reduce((a, [, n]) => a + n, 0);
  eq(s.totals.legends, legends);
  assert(legends > 0 && s.badges['first-legend'] && s.badges['cards-10']);
});

// ---- firestore.rules contract: what the client writes must pass validState / validSummary / validProfile ----
const SUMMARY_KEYS = ['username', 'displayName', 'club', 'colors', 'squad', 'xp', 'division', 'weekXp', 'xpByDay', 'wins', 'draws', 'losses',
  'matches', 'accuracy', 'bestWinStreak', 'cards', 'titles', 'updatedAt'];
const INT_KEYS = ['xp', 'division', 'weekXp', 'wins', 'draws', 'losses', 'matches', 'bestWinStreak', 'cards', 'titles', 'updatedAt'];
const HEX6 = /^#[0-9a-fA-F]{6}$/;

test('rules contract: leaderboardSummary keys are in the allow-list and counters are integers', async () => {
  const { leaderboardSummary } = await import('../js/core/stats.js');
  const rng = createRng(5);
  let s = fresh(3);
  s.profile.colors = ['#1e40af', '#fbbf24'];
  s.profile.crest = 'round';
  const sums = [leaderboardSummary(s, T0)];
  for (let i = 0; i < 6; i++) {
    const mode = i % 2 ? 'training' : 'league';
    s = applyResult(s, playMatch(s, rng, T0 + i * DAY, [0.2, 1, 0.7][i % 3], { mode }), ctx(rng, T0 + i * DAY)).state;
    sums.push(leaderboardSummary(s, T0 + i * DAY));
    eq([Number.isInteger(s.xp), Number.isInteger(s.coins)], [true, true], 'xp/coins stay integers');
  }
  for (const sum of sums) {
    for (const k of Object.keys(sum)) assert(SUMMARY_KEYS.includes(k), `key outside the rules allow-list: ${k}`);
    for (const k of SUMMARY_KEYS) assert(k in sum, `key required by the rules is missing: ${k}`);
    for (const k of INT_KEYS) assert(Number.isInteger(sum[k]) && sum[k] >= 0, `${k} must be an int: ${sum[k]}`);
    assert(sum.division <= 4 && Object.keys(sum.xpByDay).length <= 7);
    assert(typeof sum.accuracy === 'number' && sum.accuracy >= 0 && sum.accuracy <= 1);
    assert(sum.colors.length === 2 && sum.colors.every((c) => HEX6.test(c)));
    assert(['u10', 'u13'].includes(sum.squad) && sum.displayName.length <= 40 && sum.club.length <= 24);
  }
});

test('rules contract: every colour palette of the sign-up and profile forms is 6-digit hex', async () => {
  for (const f of ['login', 'profile']) {
    const src = await (await fetch(new URL(`../js/ui/views/${f}.js`, import.meta.url))).text();
    const lines = src.split('\n').filter((l) => /^const (KIT_MAIN|KIT_SECOND|PALETTE)\b/.test(l));
    assert(lines.length >= 1, `palette lines in ${f}.js`);
    for (const l of lines) for (const c of l.match(/#[0-9a-fA-F]+/g)) assert(HEX6.test(c), `${f}.js palette colour ${c}`);
  }
  const art = await (await fetch(new URL('../js/core/state.js', import.meta.url))).text();
  for (const c of art.match(/#[0-9a-fA-F]{3,8}\b/g) || []) assert(HEX6.test(c), `state.js default colour ${c}`);
});

test('rules contract: coach state has the profile shape validProfile accepts', () => {
  const c = newPlayerState({ username: 'dad', displayName: 'Papa', role: 'coach', now: 0 });
  eq(Object.keys(c.profile).sort(), ['club', 'colors', 'displayName', 'squad']);
  eq(c.profile.squad, null);
  assert(c.profile.colors.every((x) => HEX6.test(x)));
});

// ---------- pending match marker and forfeit ----------
import { startPendingMatch, clearPendingMatch, applyPendingForfeit } from '../js/core/state.js';

const OPP = { id: 'c02', name: 'Club B', strength: 0.6 };

test('pendingMatch: new states have a null marker; startPendingMatch writes a plain serialisable object without mutating', () => {
  const s0 = fresh(40);
  eq(s0.pendingMatch, null);
  const s1 = startPendingMatch(s0, { opponent: OPP, topicId: 'en-det', subjectId: 'en', division: 0, now: T0 });
  eq(s0.pendingMatch, null, 'input untouched');
  eq(s1.pendingMatch, { mode: 'league', opponent: OPP, topicId: 'en-det', subjectId: 'en', division: 0, total: NQ, startedAt: T0 });
  eq(JSON.parse(JSON.stringify(s1)).pendingMatch, s1.pendingMatch, 'JSON round trip');
  eq(migrateState(JSON.parse(JSON.stringify(s1))).pendingMatch, s1.pendingMatch, 'survives migration');
  eq(migrateState({ username: 'old', profile: { displayName: 'Old' } }).pendingMatch, null);
  eq(clearPendingMatch(s1).pendingMatch, null);
});

test('applyResult: a league result clears the marker, a training one leaves it alone', () => {
  const rng = createRng(41);
  const s0 = startPendingMatch(fresh(41), { opponent: OPP, topicId: 'en-det', now: T0 });
  const t = applyResult(s0, playMatch(s0, rng, T0, 1, { mode: 'training' }), ctx(rng, T0));
  assert(t.state.pendingMatch, 'training keeps it');
  const l = applyResult(s0, playMatch(s0, rng, T0, 1), ctx(rng, T0));
  eq(l.state.pendingMatch, null);
});

test('applyPendingForfeit: one defeat 0-3, all questions counted wrong in totals, no question or topic history, once only', () => {
  const rng = createRng(42);
  const s0 = startPendingMatch(fresh(42), { opponent: OPP, topicId: 'en-det', subjectId: 'en', division: 0, now: T0 });
  eq(applyPendingForfeit(fresh(42), ctx(rng, T0)), null, 'no marker: nothing');
  const out = applyPendingForfeit(s0, ctx(rng, T0 + 1000));
  const s = out.state;
  eq(s.pendingMatch, null);
  eq([s.totals.losses, s.totals.wins, s.totals.leagueMatches, s.totals.matches], [1, 0, 1, 1]);
  eq([s.totals.goalsFor, s.totals.goalsAgainst, s.totals.correct, s.totals.answered], [0, 3, 0, NQ]);
  eq([out.result.outcome, out.result.goalsFor, out.result.goalsAgainst], ['L', 0, 3]);
  eq([s.questions, s.topics], [{}, {}], 'no mastery history');
  eq(s.coins, 0);
  eq(s.xp, 10);
  eq(s.league.season.matchday, 1);
  eq(s.matches.length, 1);
  assert(out.events.some((e) => e.type === 'matchday'));
  eq(applyPendingForfeit(s, ctx(rng, T0 + 2000)), null, 'second pass: nothing');
  eq(s0.league.season.matchday, 0, 'input untouched');
});

test('a match or pending forfeit stored with 15 questions (before the 10-question format) still settles', () => {
  const rng = createRng(43);
  const s0 = startPendingMatch(fresh(43), { opponent: OPP, topicId: 'en-det', subjectId: 'en', division: 0, total: 15, now: T0 });
  const out = applyPendingForfeit(s0, ctx(rng, T0 + 1000));
  eq([out.result.total, out.state.totals.answered, out.state.pendingMatch], [15, 15, null]);
  // a 15-question match played now: goals follow GOAL_EVERY_N_CORRECT, perfect = all right, total kept per match
  const s1 = fresh(44);
  const fx = nextFixture(s1.league.season);
  const questions = pickQuestions(POOL.filter((q) => q.topicId === 'en-det'), { n: 15, history: {}, division: 0, rng });
  const m = createMatch({ mode: 'league', questions, topicId: 'en-det', subjectId: 'en', opponent: { id: fx.opponent.id, name: fx.opponent.name, strength: fx.strength }, division: 0, rng, now: T0 });
  while (!m.finished) answerQuestion(m, acceptedAnswers(currentQuestion(m))[0], 2000);
  const res = summarizeMatch(m, T0);
  eq([res.total, res.correct, res.goalsFor, res.perfect], [15, 15, Math.floor(15 / N), true]);
  const s2 = applyResult(s1, res, ctx(rng, T0)).state;
  eq([s2.matches[0].total, s2.totals.answered], [15, 15]);
});
