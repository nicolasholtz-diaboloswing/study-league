import { test, eq, assert } from './runner.js';
import { createRng } from '../js/core/rng.js';
import {
  loadCatalog, listTopics, loadTopicQuestions, pickQuestions, acceptedAnswers,
} from '../js/core/questions.js';
import { createMatch, answerQuestion, currentQuestion, summarizeMatch } from '../js/core/match.js';
import { nextFixture, seasonLength, newSeason, DIVISIONS } from '../js/core/league.js';
import {
  MATCH_QUESTIONS as NQ, LEAGUE_QUESTIONS as LQ, GOAL_EVERY_N_CORRECT as N, SEASON_MATCHDAYS as SL, PACKS, PACK_COST, PACK_SIZE, FREE_PACK_EVERY_N_LEVELS as EVERY,
} from '../js/config.js';
import { xpToReach, levelForXp } from '../js/core/rewards.js';
import {
  newPlayerState, migrateState, ensureSeason, applyResult, buyPack, openFreePack, SCHEMA_VERSION, applyDemotion,
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
  const levelPacks = Math.floor(levelForXp(s.xp) / EVERY);
  eq(s.freePacks, 2 + levelPacks, 'promotion + title + one per multiple of the free-pack level step');
  eq(s.streak, { current: SL, best: SL, lastDay: s.streak.lastDay });
  eq(s.matches.length, SL);
  const types = allEvents.map((e) => e.type);
  eq(types.filter((x) => x === 'matchday').length, SL);
  eq(types.filter((x) => x === 'season-end').length, 1);
  const se = allEvents.find((e) => e.type === 'season-end');
  eq([se.promoted, se.champion, se.nextDivision, se.summary.table.length], [true, true, 1, 8]);
  eq(allEvents.filter((e) => e.type === 'free-pack').map((e) => e.reason).sort(), [...Array(levelPacks).fill('level'), 'promotion', 'title']);
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

test('applyResult: a free pack comes only when crossing a multiple of the level step (no retroactive pack)', () => {
  const rng = createRng(11);
  for (const L of [5, EVERY]) {
    const s = { ...fresh(2), xp: xpToReach(L) - 1 };
    const res = playMatch(s, rng, T0, 1);
    const out = applyResult(s, res, ctx(rng, T0));
    const lv = out.events.filter((e) => e.type === 'free-pack' && e.reason === 'level');
    eq(lv.length, L % EVERY === 0 ? 1 : 0, 'level ' + L);
    eq(out.state.freePacks - s.freePacks, lv.length + out.events.filter((e) => e.type === 'free-pack' && e.reason !== 'level').length);
  }
});

test('buyPack: needs PACK_COST coins, adds cards and counts legends; openFreePack uses free packs', () => {
  const rng = createRng(6);
  const s0 = fresh(1);
  let threw = false;
  try { buyPack({ ...s0, coins: PACK_COST - 1 }, ctx(rng, T0)); } catch { threw = true; }
  assert(threw, 'not enough coins');
  const rich = { ...s0, coins: PACK_COST + 70 };
  const out = buyPack(rich, ctx(rng, T0));
  eq(out.state.coins, 70);
  eq(out.cards.length, PACK_SIZE);
  eq(Object.values(out.state.cards).reduce((a, b) => a + b, 0), PACK_SIZE);
  eq(rich.coins, PACK_COST + 70, 'input untouched');
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

test('buyPack small: 75 coins, 1 card, never a legend; unknown kind throws', () => {
  const rng = createRng(8);
  const s0 = { ...fresh(1), coins: 74 };
  let threw = false;
  try { buyPack(s0, ctx(rng, T0), 'small'); } catch { threw = true; }
  assert(threw, 'not enough coins');
  const out = buyPack({ ...s0, coins: 80 }, ctx(rng, T0), 'small');
  eq([out.state.coins, out.cards.length, PACKS.small.cost], [5, 1, 75]);
  threw = false;
  try { buyPack({ ...s0, coins: 1000 }, ctx(rng, T0), 'huge'); } catch { threw = true; }
  assert(threw, 'unknown pack');
  let s = { ...s0, coins: 100000 };
  for (let i = 0; i < 400; i++) s = buyPack(s, ctx(rng, T0), 'small').state;
  eq(s.totals.legends, 0);
  assert(!s.badges['first-legend']);
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
  eq(s1.pendingMatch, { mode: 'league', opponent: OPP, topicId: 'en-det', subjectId: 'en', division: 0, total: LQ, startedAt: T0 });
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
  eq([s.totals.goalsFor, s.totals.goalsAgainst, s.totals.correct, s.totals.answered], [0, 3, 0, LQ]);
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

test('a pending forfeit stored with 10 or 15 questions settles with its own total; a 15-question match is scored by GOAL_EVERY_N_CORRECT', () => {
  const rng = createRng(43);
  const s0 = startPendingMatch(fresh(43), { opponent: OPP, topicId: 'en-det', subjectId: 'en', division: 0, total: 10, now: T0 });
  const out = applyPendingForfeit(s0, ctx(rng, T0 + 1000));
  eq([out.result.total, out.state.totals.answered, out.state.pendingMatch], [10, 10, null]);
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

// ---------- the u13 "expert" mode is gone: old states still load ----------

test('old states with difficulty or matches flagged expert load without error and drop the field', () => {
  const old = { schema: 1, role: 'player', username: 'kid', profile: { displayName: 'Kid', squad: 'u13' }, difficulty: 'expert',
    pendingMatch: { mode: 'league', opponent: OPP, topicId: 'en-det', subjectId: 'en', division: 0, total: 10, startedAt: T0, difficulty: 'expert' },
    matches: [{ at: T0, mode: 'league', topicId: 'en-det', subjectId: 'en', opponent: 'Club B', division: 0, goalsFor: 1, goalsAgainst: 3, outcome: 'L', correct: 4, total: 10, xp: 50, coins: 5, difficulty: 'expert' }] };
  const m = migrateState(old);
  assert(!('difficulty' in m));
  eq(m.matches[0].difficulty, 'expert', 'history stays readable');
  const out = applyPendingForfeit(m, ctx(createRng(1), T0 + 1000));
  eq([out.result.goalsAgainst, out.result.total, 'difficulty' in out.result, out.state.pendingMatch], [3, 10, false, null]);
});

// ---------- one-off demotion by two divisions (schema 2) ----------

/** A player as saved by the previous version: schema 1 (no marker), in `division`, `played` matchdays in. */
function schema1(division, played = 3, seed = 70) {
  const s = fresh(seed);
  s.league.season = newSeason({ clubs: CLUBS, profile: s.profile, division, number: 5, rng: createRng(seed) });
  for (let i = 0; i < played; i++) { for (const x of s.league.season.fixtures.filter((f) => f.md === i)) { x.hg = 1; x.ag = 0; } s.league.season.matchday = i + 1; }
  s.league.history = [{ season: 4, division: 3, position: 1, points: 20, gf: 9, ga: 2, promoted: true, champion: true, at: T0 }];
  s.xp = 900; s.coins = 120; s.cards = { p001: 2 }; s.totals.titles = 1; s.totals.wins = 7;
  s.pendingMatch = null; s.schema = 1; delete s.cups;
  return JSON.parse(JSON.stringify(s));
}

test('demotion: schema is 2; a state saved at schema 1 is marked by the migration, a new player is not', () => {
  eq(SCHEMA_VERSION, 2);
  const marked = migrateState(schema1(4));
  eq([marked.schema, marked.pendingDemotion], [2, 2]);
  eq(marked.league.season.division, 4, 'the migration does not touch the season (no clubs, no rng)');
  const unversioned = schema1(4); delete unversioned.schema;
  eq(migrateState(unversioned).pendingDemotion, 2, 'a state older than schema 1 is marked too');
  const brandNew = fresh(71);
  eq(brandNew.schema, 2);
  assert(!('pendingDemotion' in brandNew) && !('pendingDemotion' in migrateState(JSON.parse(JSON.stringify(brandNew)))), 'a new player is never demoted');
  assert(!('pendingDemotion' in migrateState({ role: 'coach', username: 'dad', schema: 1, profile: { displayName: 'Dad' } })), 'a coach has no season');
  eq(migrateState(JSON.parse(JSON.stringify(marked))).pendingDemotion, 2, 'the marker survives a save and load until applied');
});

test('demotion: Ligue 1 -> National, new season from matchday 0, history/totals/cards/xp/coins untouched, marker removed', () => {
  const marked = migrateState(schema1(4));
  const before = JSON.stringify(marked);
  const d = applyDemotion(marked, CLUBS, createRng(5));
  eq(JSON.stringify(marked), before, 'input untouched');
  assert(!('pendingDemotion' in d));
  const season = d.league.season;
  eq([season.division, season.matchday, season.number, season.clubs.length, seasonLength(season)], [2, 0, 5, 8, SL]);
  assert(season.fixtures.every((f) => f.hg === null && f.ag === null), 'fresh fixtures');
  const [lo, hi] = DIVISIONS[2].strength;
  for (const c of season.clubs.filter((x) => !x.isPlayer)) assert(c.strength >= lo - 0.02 && c.strength <= hi + 0.02, `strength ${c.strength}`);
  eq(d.league.history, marked.league.history);
  eq([d.xp, d.coins, d.cards, d.totals, d.profile], [marked.xp, marked.coins, marked.cards, marked.totals, marked.profile]);
});

test('demotion: floor District (Régional -> District, District stays, a District season in progress is not restarted)', () => {
  eq(applyDemotion(migrateState(schema1(1)), CLUBS, createRng(1)).league.season.division, 0);
  eq(applyDemotion(migrateState(schema1(3)), CLUBS, createRng(1)).league.season.division, 1);
  const out = applyDemotion(migrateState(schema1(0, 4)), CLUBS, createRng(1));
  eq([out.league.season.division, out.league.season.matchday], [0, 4], 'already at the floor: the season goes on');
  assert(!('pendingDemotion' in out));
});

test('demotion: happens exactly once (a second pass changes nothing), and a state without marker is returned as is', () => {
  const once = applyDemotion(migrateState(schema1(4)), CLUBS, createRng(3));
  const twice = applyDemotion(once, CLUBS, createRng(4));
  assert(twice === once, 'no marker: same object');
  eq(twice.league.season.division, 2);
  const reloaded = migrateState(JSON.parse(JSON.stringify(once)));
  eq([reloaded.schema, 'pendingDemotion' in reloaded, applyDemotion(reloaded, CLUBS, createRng(5)).league.season.division], [2, false, 2], 'saved at schema 2: no second demotion');
  const fresh4 = fresh(72);
  assert(applyDemotion(fresh4, CLUBS, createRng(1)) === fresh4, 'a new player is untouched');
});

test('demotion: a kick-off marker of the old season is dropped with it', () => {
  const m = migrateState(schema1(4));
  m.pendingMatch = { mode: 'league', opponent: OPP, topicId: 'en-det', subjectId: 'en', division: 4, total: 10, startedAt: T0 };
  eq(applyDemotion(m, CLUBS, createRng(1)).pendingMatch, null);
});

// ---------- per-match goal rule through applyResult ----------

test('applyResult: a 15-question match played with goalEvery 5 scores one goal per 5 right answers', () => {
  const rng = createRng(80);
  const s0 = fresh(80);
  const fx = nextFixture(s0.league.season);
  const questions = pickQuestions(POOL.filter((q) => q.topicId === 'en-det'), { n: LQ, history: {}, division: 4, rng });
  const m = createMatch({ mode: 'league', questions, topicId: 'en-det', subjectId: 'en', opponent: { id: fx.opponent.id, name: fx.opponent.name, strength: 0 }, division: 0, goalEvery: 5, squad: 'u13', rng, now: T0 });
  eq(m.questions.length, LQ);
  while (!m.finished) answerQuestion(m, acceptedAnswers(currentQuestion(m))[0], 2000);
  const res = summarizeMatch(m, T0);
  eq([res.total, res.goalsFor, res.perfect], [LQ, 3, true]);
  eq(applyResult(s0, res, ctx(rng, T0)).state.matches[0].total, LQ);
});
