import { test, eq, assert } from './runner.js';
import { createRng } from '../js/core/rng.js';
import { LEAGUE_QUESTIONS as LQ } from '../js/config.js';
import { dayKey, leaderboardSummary } from '../js/core/stats.js';
import {
  CUPS, cupById, isCupUnlocked, cupPlan, cupPlans, ensureCupEdition, cupOpponents, nationPool, cupOutcome, advanceCup,
} from '../js/core/cups.js';
import { newPlayerState, applyResult, applyPendingForfeit, startPendingMatch, migrateState } from '../js/core/state.js';
import { evaluateBadges } from '../js/core/rewards.js';
import { CLUBS, CARDS, ALL_CARDS, NATION_CARDS, CLUB_CARDS } from './fixtures.js';

const DAY1 = new Date(2025, 0, 6, 10, 0).getTime();
const DAY2 = new Date(2025, 0, 7, 9, 0).getTime();
const DAY3 = new Date(2025, 0, 8, 9, 0).getTime();
const DATA = { clubs: CLUBS, cards: ALL_CARDS };

function player(division, seed = 1) {
  const s = newPlayerState({ username: 'kid', displayName: 'Kid', squad: 'u13', club: 'My FC', colors: ['#f00', '#fff'], clubs: CLUBS, rng: createRng(seed), now: DAY1 });
  s.league.season.division = division;
  return s;
}
const ctx = (now, cards = ALL_CARDS, seed = 9) => ({ now, rng: createRng(seed), clubs: CLUBS, cards, catalog: { subjects: [] } });

/** A finished cup match as summarizeMatch would give it. */
function cupResult(cupId, { goalsFor, goalsAgainst, correct }, now = DAY1) {
  const outcome = goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D';
  return {
    mode: 'cup', cupId, topicId: 'en-det', subjectId: 'en', division: 0, coachPick: false,
    opponent: { id: 'c01', name: 'Club A', strength: 0.5 }, goalsFor, goalsAgainst, outcome, correct, total: LQ, accuracy: correct / LQ,
    perfect: correct === LQ, cleanSheet: goalsAgainst === 0, speedBonus: 10, durationMs: 60000, playedAt: now, answers: [],
  };
}
const WIN = { goalsFor: 3, goalsAgainst: 1, correct: 12 };
const LOSS = { goalsFor: 0, goalsAgainst: 2, correct: 3 };

function hasNestedArray(x) {
  if (Array.isArray(x)) return x.some((v) => Array.isArray(v) || hasNestedArray(v));
  if (x && typeof x === 'object') return Object.values(x).some(hasNestedArray);
  return false;
}

test('cups: the four cups, their rounds, goal rule and card kind (only the Coupe du monde concedes every error)', () => {
  eq(CUPS.map((c) => c.id), ['league-cup', 'europe-cup', 'champions-league', 'world-cup']);
  eq(CUPS.map((c) => c.name), ['Coupe de la Ligue', 'Coupe d\'Europe', 'Ligue des champions', 'Coupe du monde']);
  eq(CUPS.map((c) => c.rounds.length), [3, 4, 4, 4]);
  eq(cupById('league-cup').rounds, ['Quart de finale', 'Demi-finale', 'Finale']);
  eq(CUPS.map((c) => c.goalEvery), [3, 4, 5, 5]);
  eq(CUPS.map((c) => c.finalCoins), [20, 30, 40, 60]);
  eq(CUPS.map((c) => c.concedeAll), [false, false, false, true]);
  eq(CUPS.map((c) => c.opponents), ['clubs', 'nations', 'clubs', 'nations']);
  eq(CUPS.map((c) => c.cardKind), ['club', 'nation', 'club', 'nation']);
  eq(cupById('nope'), null);
});

test('cups: unlock conditions (National, Ligue 2, Ligue 1; the world cup after a Ligue 1 title or a Ligue des champions)', () => {
  const open = (st) => CUPS.map((c) => isCupUnlocked(st, c));
  eq(open(player(0)), [false, false, false, false]);
  eq(open(player(1)), [false, false, false, false]);
  eq(open(player(2)), [true, false, false, false]);
  eq(open(player(3)), [true, true, false, false]);
  eq(open(player(4)), [true, true, true, false]);
  const champ = player(4);
  champ.league.history = [{ season: 1, division: 3, champion: true }, { season: 2, division: 4, champion: false }];
  eq(isCupUnlocked(champ, cupById('world-cup')), false, 'a Ligue 2 title or a Ligue 1 finish is not enough');
  champ.league.history.push({ season: 3, division: 4, champion: true });
  eq(isCupUnlocked(champ, cupById('world-cup')), true);
  const cl = player(4);
  cl.cups = { 'champions-league': { edition: 1, round: 0, status: 'won', endedDay: '2025-01-01', trophies: 1, opponents: [] } };
  eq(isCupUnlocked(cl, cupById('world-cup')), true, 'Ligue des champions won');
  eq(cupPlans(player(2), DAY1).map((p) => p.status), ['ready', 'locked', 'locked', 'locked']);
});

test('cups: opponents are fictional clubs for the club cups (never the player\'s club), national teams for the nation cups, strength rising', () => {
  const league = cupById('league-cup');
  const o = cupOpponents(league, 1, 'kid', { clubs: CLUBS, cards: ALL_CARDS, clubName: 'club c' });
  eq(o.length, 3);
  eq(new Set(o.map((x) => x.id)).size, 3);
  assert(o.every((x) => CLUBS.some((c) => c.id === x.id)) && !o.some((x) => x.name.toLowerCase() === 'club c'));
  assert(o[0].strength < o[2].strength && o[0].strength >= 0.55 && o[2].strength <= 0.7, JSON.stringify(o.map((x) => x.strength)));
  eq(cupOpponents(league, 1, 'kid', { clubs: CLUBS, clubName: 'club c' }), cupOpponents(league, 1, 'kid', { clubs: CLUBS, clubName: 'club c' }), 'deterministic');
  const europe = cupOpponents(cupById('europe-cup'), 1, 'kid', DATA);
  eq(europe.length, 4);
  assert(europe.every((x) => NATION_CARDS.some((c) => c.name === x.name)), 'nation names come from the nation cards');
  assert(europe.every((x) => /^[A-Z]{3}$/.test(x.short) && x.colors.length === 2 && x.crest === 'round'));
  const fallback = cupOpponents(cupById('world-cup'), 1, 'kid', { clubs: CLUBS, cards: CARDS });
  eq(fallback.length, 4, 'built-in list when the file has no nation cards');
  assert(fallback.every((x) => typeof x.name === 'string' && x.name));
  eq(nationPool([{ kind: 'nation', name: 'France' }], 3).map((n) => n.name).slice(0, 1), ['France']);
  assert(new Set(nationPool([{ kind: 'nation', name: 'France' }, { kind: 'nation', name: 'france' }], 5).map((n) => n.name.toLowerCase())).size === 5, 'no duplicate between cards and the built-in list');
  const e2 = cupOpponents(cupById('europe-cup'), 2, 'kid', DATA);
  assert(JSON.stringify(e2) !== JSON.stringify(europe), 'a new edition draws other opponents');
});

test('cups: knockout outcome, a draw goes to the shoot-out (qualified when right answers outnumber wrong ones)', () => {
  eq(cupOutcome({ goalsFor: 2, goalsAgainst: 1, correct: 5, total: 15 }), { qualified: true, shootout: false });
  eq(cupOutcome({ goalsFor: 1, goalsAgainst: 2, correct: 14, total: 15 }), { qualified: false, shootout: false });
  eq(cupOutcome({ goalsFor: 1, goalsAgainst: 1, correct: 8, total: 15 }), { qualified: true, shootout: true });
  eq(cupOutcome({ goalsFor: 1, goalsAgainst: 1, correct: 7, total: 15 }), { qualified: false, shootout: true });
  eq(cupOutcome({ goalsFor: 0, goalsAgainst: 0, correct: 5, total: 10 }), { qualified: false, shootout: true }, 'equal counts: out');
});

test('cups: advanceCup moves through the rounds, wins the final once, or eliminates', () => {
  const cup = cupById('league-cup');
  let rec = { edition: 1, round: 0, status: 'active', endedDay: null, trophies: 0, opponents: [] };
  let a = advanceCup(cup, rec, cupResult('league-cup', WIN), DAY1);
  eq([a.record.round, a.record.status, a.qualified, a.round, a.roundName, a.finalWon], [1, 'active', true, 0, 'Quart de finale', false]);
  a = advanceCup(cup, a.record, cupResult('league-cup', WIN), DAY1);
  eq([a.record.round, a.roundName], [2, 'Demi-finale']);
  const final = advanceCup(cup, a.record, cupResult('league-cup', WIN), DAY1);
  eq([final.record.status, final.record.trophies, final.record.endedDay, final.finalWon, final.roundName], ['won', 1, dayKey(DAY1), true, 'Finale']);
  const out = advanceCup(cup, a.record, cupResult('league-cup', LOSS), DAY1);
  eq([out.record.status, out.record.trophies, out.eliminated, out.record.endedDay], ['out', 0, true, dayKey(DAY1)]);
  eq(a.record.status, 'active', 'input untouched');
});

test('cups: plan of a cup: ready with a new edition, waiting the day it ended, ready again the next local day with edition + 1', () => {
  const st0 = player(2);
  let p = cupPlan(st0, cupById('league-cup'), DAY1, DATA);
  eq([p.status, p.edition, p.round, p.roundName, p.isFinal, typeof p.opponent.name], ['ready', 1, 0, 'Quart de finale', false, 'string']);
  eq(cupPlan(st0, cupById('league-cup'), DAY1).opponent, null, 'no data, no opponent');
  const st1 = ensureCupEdition(st0, cupById('league-cup'), DAY1, DATA);
  eq(st0.cups, {}, 'input untouched');
  const rec = st1.cups['league-cup'];
  eq([rec.edition, rec.round, rec.status, rec.endedDay, rec.opponents.length], [1, 0, 'active', null, 3]);
  eq(rec.opponents[0], p.opponent, 'the pre-match opponent is the one of the edition');
  assert(ensureCupEdition(st1, cupById('league-cup'), DAY1, DATA) === st1, 'an active edition is kept');
  // eliminated today: waiting; tomorrow: a new edition
  const out = applyResult(st1, cupResult('league-cup', LOSS), ctx(DAY1)).state;
  eq(out.cups['league-cup'].status, 'out');
  eq(cupPlan(out, cupById('league-cup'), DAY1 + 3600000, DATA).status, 'waiting');
  p = cupPlan(out, cupById('league-cup'), DAY2, DATA);
  eq([p.status, p.edition, p.round], ['ready', 2, 0]);
  const again = ensureCupEdition(out, cupById('league-cup'), DAY2, DATA);
  eq([again.cups['league-cup'].edition, again.cups['league-cup'].status, again.cups['league-cup'].trophies], [2, 'active', 0]);
  let threw = false;
  try { ensureCupEdition(out, cupById('league-cup'), DAY1, DATA); } catch { threw = true; }
  assert(threw, 'no new edition the day the last one ended');
  threw = false;
  try { ensureCupEdition(player(0), cupById('league-cup'), DAY1, DATA); } catch { threw = true; }
  assert(threw, 'locked cup');
});

test('cups: a won edition also waits for the next day, and the trophy count is kept', () => {
  let st = ensureCupEdition(player(2), cupById('league-cup'), DAY1, DATA);
  for (let i = 0; i < 3; i++) st = applyResult(st, cupResult('league-cup', WIN), ctx(DAY1, ALL_CARDS, i)).state;
  eq([st.cups['league-cup'].status, st.cups['league-cup'].trophies], ['won', 1]);
  eq(cupPlan(st, cupById('league-cup'), DAY1, DATA).status, 'waiting');
  const next = cupPlan(st, cupById('league-cup'), DAY3, DATA);
  eq([next.status, next.edition, next.trophies], ['ready', 2, 1]);
});

test('cups: a cup match behaves like a league match for XP, coins, totals and the marker, and leaves the season alone', () => {
  const base = ensureCupEdition(player(2, 3), cupById('league-cup'), DAY1, DATA);
  const st = startPendingMatch(base, { mode: 'cup', cupId: 'league-cup', opponent: { id: 'x', name: 'X', strength: 0.5 }, topicId: 'en-det', subjectId: 'en', division: 2, goalEvery: 3, now: DAY1 });
  eq([st.pendingMatch.mode, st.pendingMatch.cupId, st.pendingMatch.goalEvery, st.pendingMatch.total], ['cup', 'league-cup', 3, LQ]);
  const before = JSON.stringify(st.league);
  const out = applyResult(st, cupResult('league-cup', WIN), ctx(DAY1));
  const s = out.state;
  eq(JSON.stringify(s.league), before, 'season, table and history untouched');
  eq([s.pendingMatch, s.totals.matches, s.totals.leagueMatches, s.totals.wins, s.totals.goalsFor, s.totals.winStreak], [null, 1, 0, 0, 0, 0]);
  eq([s.totals.correct, s.totals.answered], [12, LQ]);
  eq(s.coins, 30, 'a win earns the league coins');
  const types = out.events.map((e) => e.type);
  assert(types.includes('xp') && types.includes('coins') && types.includes('cup') && !types.includes('matchday') && !types.includes('season-end'), types.join());
  eq(s.xp, 12 * 10 + 10 + 50);
  eq([s.matches[0].mode, s.matches[0].cup, s.matches[0].coins], ['cup', 'league-cup', 30]);
  assert(!hasNestedArray(s), 'no nested arrays (Firestore)');
  eq(JSON.parse(JSON.stringify(s)), s, 'JSON round trip');
});

test('cups: each match won gives a card of the cup\'s kind not owned yet (clubs: Ligue / Ligue des champions; nations: Europe / monde)', () => {
  for (const [id, division, kind] of [['league-cup', 2, 'club'], ['champions-league', 4, 'club'], ['europe-cup', 3, 'nation']]) {
    let st = ensureCupEdition(player(division, 5), cupById(id), DAY1, DATA);
    const got = new Set();
    for (let i = 0; i < cupById(id).rounds.length - 1; i++) {
      const out = applyResult(st, cupResult(id, WIN), ctx(DAY1, ALL_CARDS, i));
      const ev = out.events.find((e) => e.type === 'cup');
      eq([ev.qualified, ev.card.card.kind, ev.card.isNew, ev.finalWon], [true, kind, true, false], id);
      assert(!got.has(ev.card.card.id), 'no duplicate');
      got.add(ev.card.card.id);
      eq(out.state.cards[ev.card.card.id], 1);
      st = out.state;
    }
  }
  const wc = player(4, 6);
  wc.league.history = [{ season: 1, division: 4, champion: true }];
  const out = applyResult(ensureCupEdition(wc, cupById('world-cup'), DAY1, DATA), cupResult('world-cup', WIN), ctx(DAY1));
  eq(out.events.find((e) => e.type === 'cup').card.card.kind, 'nation');
});

test('cups: an eliminated match gives no card; a file without nation/club cards gives none either and nothing breaks', () => {
  const st = ensureCupEdition(player(2), cupById('league-cup'), DAY1, DATA);
  const lost = applyResult(st, cupResult('league-cup', LOSS), ctx(DAY1));
  eq([lost.events.find((e) => e.type === 'cup').card, lost.events.find((e) => e.type === 'cup').eliminated, lost.state.cups['league-cup'].status], [null, true, 'out']);
  eq(lost.state.cards, {});
  const noCards = applyResult(st, cupResult('league-cup', WIN), ctx(DAY1, CARDS));
  eq([noCards.events.find((e) => e.type === 'cup').card, noCards.state.cups['league-cup'].round], [null, 1]);
});

test('cups: duplicates only once the set is complete; the final gives the highest rarity still missing', () => {
  const full = Object.fromEntries(CLUB_CARDS.map((c) => [c.id, 1]));
  let st = ensureCupEdition({ ...player(2), cards: full }, cupById('league-cup'), DAY1, DATA);
  const out = applyResult(st, cupResult('league-cup', WIN), ctx(DAY1));
  const ev = out.events.find((e) => e.type === 'cup');
  eq([ev.card.card.kind, ev.card.isNew], ['club', false]);
  eq(Object.values(out.state.cards).reduce((a, b) => a + b, 0), CLUB_CARDS.length + 1);
  // the final: legend club still missing -> the legend
  const legend = CLUB_CARDS.find((c) => c.rarity === 'legend');
  const owned = Object.fromEntries(CLUB_CARDS.filter((c) => c.id !== legend.id).map((c) => [c.id, 1]));
  st = { ...ensureCupEdition(player(2), cupById('league-cup'), DAY1, DATA), cards: owned };
  st.cups['league-cup'].round = 2;
  const fin = applyResult(st, cupResult('league-cup', WIN), ctx(DAY1));
  eq(fin.events.find((e) => e.type === 'cup').card.card.id, legend.id);
});

test('cups: winning the final gives coins, a free player pack and the trophy badge of that cup (and only that one)', () => {
  let st = ensureCupEdition(player(4, 8), cupById('champions-league'), DAY1, DATA);
  const events = [];
  const rounds = cupById('champions-league').rounds.length;
  let ownedBeforeFinal = null;
  for (let i = 0; i < rounds; i++) {
    if (i === rounds - 1) ownedBeforeFinal = { ...st.cards };
    const out = applyResult(st, cupResult('champions-league', WIN), ctx(DAY1, ALL_CARDS, i)); st = out.state; events.push(...out.events);
  }
  const cupEvents = events.filter((e) => e.type === 'cup');
  eq(cupEvents.map((e) => e.roundName), cupById('champions-league').rounds);
  const last = cupEvents[rounds - 1];
  eq([last.finalWon, last.coins, last.rounds], [true, 40, 4]);
  eq(events.filter((e) => e.type === 'free-pack').map((e) => e.reason), ['cup']);
  eq(st.freePacks, 1);
  eq(st.coins, 4 * 30 + 40);
  assert(st.badges['cup-champions-league'] && !st.badges['cup-league-cup'] && !st.badges['cup-world-cup'], Object.keys(st.badges).join());
  assert(events.some((e) => e.type === 'badge' && e.badge.id === 'cup-champions-league'));
  // the final's card has the highest rarity still missing among the clubs
  const order = ['common', 'rare', 'epic', 'legend'];
  const missing = CLUB_CARDS.filter((c) => !ownedBeforeFinal[c.id]);
  eq(last.card.card.rarity, order[Math.max(...missing.map((c) => order.indexOf(c.rarity)))]);
  eq(last.card.isNew, true);
  eq(st.cups['champions-league'].trophies, 1);
  eq(evaluateBadges({ ...st, badges: {} }).some((b) => b.id === 'cup-champions-league'), true);
  // the Coupe du monde opens
  assert(isCupUnlocked(st, cupById('world-cup')));
});

test('cups: a tied match goes to the shoot-out', () => {
  const st = ensureCupEdition(player(2), cupById('league-cup'), DAY1, DATA);
  const through = applyResult(st, cupResult('league-cup', { goalsFor: 1, goalsAgainst: 1, correct: 9 }), ctx(DAY1));
  eq([through.events.find((e) => e.type === 'cup').shootout, through.events.find((e) => e.type === 'cup').qualified, through.state.cups['league-cup'].round], [true, true, 1]);
  const out = applyResult(st, cupResult('league-cup', { goalsFor: 1, goalsAgainst: 1, correct: 7 }), ctx(DAY1));
  eq([out.events.find((e) => e.type === 'cup').shootout, out.events.find((e) => e.type === 'cup').qualified, out.state.cups['league-cup'].status], [true, false, 'out']);
});

test('cups: leaving a cup match (forfeit) eliminates the player; the marker is cleared', () => {
  const base = ensureCupEdition(player(2), cupById('league-cup'), DAY1, DATA);
  const st = startPendingMatch(base, { mode: 'cup', cupId: 'league-cup', opponent: { id: 'x', name: 'X', strength: 0.5 }, topicId: 'en-det', division: 2, now: DAY1 });
  const out = applyPendingForfeit(migrateState(JSON.parse(JSON.stringify(st))), ctx(DAY1 + 1000));
  eq([out.result.mode, out.result.cupId, out.result.goalsAgainst, out.result.total], ['cup', 'league-cup', 3, LQ]);
  eq([out.state.cups['league-cup'].status, out.state.pendingMatch, out.state.totals.leagueMatches], ['out', null, 0]);
  eq(out.state.league.season.matchday, 0);
});

test('cups: a result for a locked cup is recorded as a plain match, nothing else changes', () => {
  const st = player(0);
  const out = applyResult(st, cupResult('league-cup', WIN), ctx(DAY1));
  eq([out.state.cups, out.state.matches.length, out.events.some((e) => e.type === 'cup')], [{}, 1, false]);
});

test('cups: a cup match leaves the leaderboard summary as it was (same keys, division within 0..4)', () => {
  const st = player(4);
  const keys = Object.keys(leaderboardSummary(st, DAY1)).sort();
  let s = ensureCupEdition(st, cupById('champions-league'), DAY1, DATA);
  s = applyResult(s, cupResult('champions-league', WIN), ctx(DAY1)).state;
  const sum = leaderboardSummary(s, DAY1);
  eq(Object.keys(sum).sort(), keys);
  assert(sum.division >= 0 && sum.division <= 4);
  assert(!('cups' in sum) && !('eventSeen' in sum));
});
