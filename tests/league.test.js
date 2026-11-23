import { test, eq, assert, near } from './runner.js';
import { createRng } from '../js/core/rng.js';
import { LEAGUE_QUESTIONS as NQ, SEASON_MATCHDAYS as SL } from '../js/config.js';
import { createMatch, answerQuestion, summarizeMatch } from '../js/core/match.js';
import {
  DIVISIONS, seasonLength, newSeason, nextFixture, playMatchday, computeTable, isSeasonOver, seasonEnd,
  startNextSeason, fixturesOf, simulateScore, divisionName, goalEveryOf, goalScale,
} from '../js/core/league.js';
import { CLUBS } from './fixtures.js';

const profile = { club: 'My FC', colors: ['#ff0000', '#ffffff'] };
const mkSeason = (division = 0, seed = 1) => newSeason({ clubs: CLUBS, profile, division, number: 1, rng: createRng(seed) });

test('league: 5 divisions in the right order', () => {
  eq(DIVISIONS.map((d) => d.name), ['District', 'Régional', 'National', 'Ligue 2', 'Ligue 1']);
});

test('league: new season has the player plus 7 clubs, strengths in the division range', () => {
  for (let d = 0; d < 5; d++) {
    const s = mkSeason(d, d + 3);
    eq(s.clubs.length, 8);
    eq(s.clubs.filter((c) => c.isPlayer).length, 1);
    const others = s.clubs.filter((c) => !c.isPlayer);
    eq(new Set(others.map((c) => c.id)).size, 7);
    const [lo, hi] = DIVISIONS[d].strength;
    for (const c of others) assert(c.strength >= lo - 0.02 && c.strength <= hi + 0.02 && c.strength >= 0.35 && c.strength <= 0.9, `${d} ${c.strength}`);
  }
});

test('league: higher division has stronger opponents on average', () => {
  const avg = (d) => { const s = mkSeason(d, 9); const o = s.clubs.filter((c) => !c.isPlayer); return o.reduce((a, c) => a + c.strength, 0) / o.length; };
  assert(avg(4) > avg(0) + 0.3);
});

test('league: double round-robin, SL = 14 matchdays, everyone plays once per day, each pair meets twice (home and away), home/away balanced', () => {
  eq(SL, 14);
  for (let seed = 1; seed <= 40; seed++) {
    const s = mkSeason(seed % 5, seed);
    eq(seasonLength(s), SL);
    eq(s.fixtures.length, SL * 4);
    for (let md = 0; md < SL; md++) {
      const day = s.fixtures.filter((f) => f.md === md);
      eq(day.length, 4);
      eq(new Set(day.flatMap((f) => [f.home, f.away])).size, 8);
    }
    const ordered = new Set(s.fixtures.map((f) => `${f.home}|${f.away}`));
    eq(ordered.size, s.fixtures.length, 'a home fixture is repeated');
    const pairs = new Map();
    for (const f of s.fixtures) { const k = [f.home, f.away].sort().join('|'); pairs.set(k, (pairs.get(k) || 0) + 1); }
    eq(pairs.size, 28);
    for (const n of pairs.values()) eq(n, 2, 'every pair meets twice');
    eq(fixturesOf(s).length, SL);
    for (const c of s.clubs) eq(s.fixtures.filter((f) => f.home === c.id).length, SL / 2, `seed ${seed} ${c.id} home games`);
  }
});

test('league: goals per division, correct answers needed per goal: 2, 3, 3, 4, 5 (training keeps 2)', () => {
  eq(DIVISIONS.map((d) => d.goalEvery), [2, 3, 3, 4, 5]);
  eq(DIVISIONS.map((d) => goalEveryOf(d.index)), [2, 3, 3, 4, 5]);
  eq(DIVISIONS.map((d) => goalScale(d.index)), [7, 5, 5, 3, 3], 'most goals in a 15-question match');
  eq([goalEveryOf(-3), goalEveryOf(99), goalEveryOf(NaN), goalEveryOf('x')], [2, 5, 2, 2], 'hostile indexes are clamped like divisionName');
  eq(NQ, 15);
});

test('league: the strength ranges are unchanged', () => {
  eq(DIVISIONS.map((d) => d.strength), [[0.35, 0.5], [0.45, 0.6], [0.55, 0.7], [0.65, 0.8], [0.75, 0.9]]);
});

test('league: simulated scores follow the goal scale of the division (default scale 5 = the original 6 chances)', () => {
  const mean = (maxGoals) => { const rng = createRng(31); let t = 0; for (let i = 0; i < 4000; i++) { const [h, a] = simulateScore(0.6, 0.6, rng, maxGoals); t += h + a; } return t / 8000; };
  const [m3, m5, m7] = [mean(3), mean(5), mean(7)];
  assert(m3 < m5 && m5 < m7, `${m3} ${m5} ${m7}`);
  near(m7 / m5, 7 / 5, 0.12);
  near(m3 / m5, 3 / 5, 0.15);
  const rng = createRng(31); let t = 0;
  for (let i = 0; i < 4000; i++) { const [h, a] = simulateScore(0.6, 0.6, rng); t += h + a; }
  near(t / 8000, m5, 1e-9, 'default = scale 5');
  // playMatchday uses the division of the season: the other clubs score fewer goals in Ligue 1 than in District
  const total = (division) => { let g = 0; for (let seed = 1; seed <= 60; seed++) { const s = mkSeason(division, seed); const r = playMatchday(s, { goalsFor: 0, goalsAgainst: 0 }, createRng(seed)); for (const f of r.results) if (f.home !== 'me' && f.away !== 'me') g += f.hg + f.ag; } return g; };
  assert(total(4) < total(0) * 0.7, `${total(4)} vs ${total(0)}`);
});

test('league: no club name equals the player club; next season avoids previous opponents when possible', () => {
  const s = mkSeason(0, 4);
  const s2 = startNextSeason(
    (() => { const x = JSON.parse(JSON.stringify(s)); x.matchday = SL; return x; })(),
    { clubs: CLUBS, profile, rng: createRng(8) });
  const prev = new Set(s.clubs.map((c) => c.id));
  eq(s2.clubs.filter((c) => !c.isPlayer && prev.has(c.id)).length, 0);
  eq(s2.number, 2);
});

test('league: nextFixture and playMatchday record the player score and simulate the rest', () => {
  const s = mkSeason();
  const rng = createRng(2);
  const f = nextFixture(s);
  eq(f.matchday, 0);
  assert(f.opponent && !f.opponent.isPlayer && typeof f.strength === 'number');
  const r = playMatchday(s, { goalsFor: 3, goalsAgainst: 1 }, rng);
  eq(r.results.length, 4);
  const mine = r.results.find((x) => x.home === 'me' || x.away === 'me');
  eq(mine.home === 'me' ? [mine.hg, mine.ag] : [mine.ag, mine.hg], [3, 1]);
  assert(r.results.every((x) => Number.isInteger(x.hg) && Number.isInteger(x.ag)));
  eq(s.matchday, 1);
  eq(nextFixture(s).matchday, 1);
});

test('league: table sorting by points, goal difference, goals for', () => {
  const clubs = ['A', 'B', 'C', 'D'].map((n) => ({ id: n, name: n, short: n, colors: ['#000', '#fff'], crest: 'shield', strength: 0.5, isPlayer: n === 'A' }));
  const fixtures = [
    { md: 0, home: 'A', away: 'B', hg: 1, ag: 0 },  // A 3
    { md: 0, home: 'C', away: 'D', hg: 3, ag: 0 },  // C 3, gd +3
    { md: 1, home: 'A', away: 'C', hg: 0, ag: 0 },  // A 4, C 4
    { md: 1, home: 'B', away: 'D', hg: 2, ag: 2 },  // B 1, D 1
  ];
  const t = computeTable({ clubs, fixtures, matchday: 2 });
  eq(t.map((r) => r.clubId), ['C', 'A', 'B', 'D']); // C 4pts gd+3; A 4pts gd+1; B 1pt gd-1; D 1pt gd-3
});

test('league: table tie-breaks gd then gf then name', () => {
  const clubs = ['A', 'B', 'C', 'D'].map((n) => ({ id: n, name: n, short: n, colors: [], crest: 'shield', strength: 0.5, isPlayer: n === 'A' }));
  const fixtures = [
    { md: 0, home: 'A', away: 'B', hg: 2, ag: 2 },
    { md: 0, home: 'C', away: 'D', hg: 1, ag: 1 },
  ];
  const t = computeTable({ clubs, fixtures, matchday: 1 });
  // all 1 pt, gd 0; goals for: A 2, B 2, C 1, D 1 -> A, B (name), C, D
  eq(t.map((r) => r.clubId), ['A', 'B', 'C', 'D']);
  eq(t.map((r) => r.position), [1, 2, 3, 4]);
  eq(computeTable({ clubs, fixtures: [{ md: 0, home: 'A', away: 'B', hg: 0, ag: 3 }], matchday: 1 })[0].clubId, 'B');
});

function playAll(season, goalsFor, goalsAgainst, seed = 5) {
  const rng = createRng(seed);
  while (!isSeasonOver(season)) playMatchday(season, { goalsFor, goalsAgainst }, rng);
}

test('league: perfect season = title and promotion; next season starts one division up', () => {
  const s = mkSeason(1, 6);
  playAll(s, 3, 0);
  eq(isSeasonOver(s), true);
  eq(nextFixture(s), null);
  const end = seasonEnd(s);
  eq([end.position, end.points, end.champion, end.promoted, end.nextDivision], [1, SL * 3, true, true, 2]);
  const s2 = startNextSeason(s, { clubs: CLUBS, profile, rng: createRng(1) });
  eq([s2.division, s2.number, s2.matchday], [2, 2, 0]);
});

test('league: top division winner stays up (title, no promotion)', () => {
  const s = mkSeason(4, 6);
  playAll(s, 3, 0);
  const end = seasonEnd(s);
  eq([end.champion, end.promoted, end.nextDivision], [true, false, 4]);
});

test('league: a bad season is not promoted and stays in its division (no relegation)', () => {
  const s = mkSeason(2, 7);
  playAll(s, 0, 3);
  const end = seasonEnd(s);
  assert(end.position > 2, String(end.position));
  eq([end.champion, end.promoted, end.nextDivision, end.points], [false, false, 2, 0]);
});

test('league: second place is promoted but is not champion', () => {
  const clubs = ['me', 'B', 'C', 'D'].map((n) => ({ id: n, name: n, short: n, colors: [], crest: 'shield', strength: 0.5, isPlayer: n === 'me' }));
  const w = (home, away) => ({ md: 0, home, away, hg: 1, ag: 0 });
  const fixtures = [w('B', 'me'), w('B', 'C'), w('B', 'D'), w('me', 'C'), w('me', 'D'), w('C', 'D')];
  const end = seasonEnd({ number: 1, division: 1, clubs, fixtures, matchday: SL });
  eq([end.position, end.champion, end.promoted, end.nextDivision], [2, false, true, 2]);
});

test('league: playing past the end throws; simulateScore favours the stronger side', () => {
  const s = mkSeason();
  playAll(s, 1, 0);
  let threw = false;
  try { playMatchday(s, { goalsFor: 1, goalsAgainst: 0 }, createRng(1)); } catch { threw = true; }
  assert(threw);
  const rng = createRng(4);
  let strong = 0, weak = 0;
  for (let i = 0; i < 2000; i++) { const [h, a] = simulateScore(0.85, 0.4, rng); strong += h; weak += a; }
  assert(strong > weak * 1.15, `${strong} vs ${weak}`);
});

test('league: divisionName tolerates hostile indexes', () => {
  const names = DIVISIONS.map((d) => d.name);
  eq(divisionName(0), 'District');
  eq(divisionName(4), 'Ligue 1');
  for (const bad of [NaN, Infinity, -Infinity, 'x', '3', -5, 99, 1.5, null, undefined, {}]) {
    assert(names.includes(divisionName(bad)), `divisionName(${String(bad)})`);
  }
  eq([divisionName(NaN), divisionName('x'), divisionName(-5), divisionName(99), divisionName(Infinity)], ['District', 'District', 'District', 'Ligue 1', 'District']);
});

/** A season object as saved before the 14-matchday format: single round-robin, 7 matchdays, 28 fixtures. */
function legacySeason(seed = 3) {
  const s = mkSeason(1, seed);
  return JSON.parse(JSON.stringify({ ...s, fixtures: s.fixtures.filter((f) => f.md < 7) }));
}

test('league: a saved 7-matchday season still runs 7 matchdays, ends, promotes, then the next season has SL = 14', () => {
  const s = legacySeason();
  eq([seasonLength(s), s.fixtures.length], [7, 28]);
  const rng = createRng(5);
  for (let i = 0; i < 6; i++) { playMatchday(s, { goalsFor: 3, goalsAgainst: 0 }, rng); eq(isSeasonOver(s), false, 'matchday ' + i); }
  assert(nextFixture(s) && nextFixture(s).matchday === 6);
  playMatchday(s, { goalsFor: 3, goalsAgainst: 0 }, rng);
  eq(isSeasonOver(s), true);
  eq(nextFixture(s), null);
  const end = seasonEnd(s);
  eq([end.position, end.points, end.promoted, end.nextDivision], [1, 7 * 3, true, 2]);
  const s2 = startNextSeason(s, { clubs: CLUBS, profile, rng: createRng(1) });
  eq([seasonLength(s2), s2.fixtures.length, s2.matchday, s2.division], [SL, SL * 4, 0, 2]);
});

test('league: every season of SL matchdays ends exactly after SL played matchdays and the table is complete', () => {
  const s = mkSeason(0, 12);
  const rng = createRng(2);
  for (let i = 0; i < SL; i++) { eq(isSeasonOver(s), false); playMatchday(s, { goalsFor: 1, goalsAgainst: 1 }, rng); }
  eq(isSeasonOver(s), true);
  const t = computeTable(s);
  eq(t.every((r) => r.played === SL), true);
  eq(t.reduce((a, r) => a + r.won, 0), t.reduce((a, r) => a + r.lost, 0));
});

/** One league match through the real engine (15 questions, the goal rule of District): p = chance of a right answer per question. */
function playOne(opp, p, rng, seed) {
  const questions = Array.from({ length: NQ }, (_, i) => ({ id: 'q' + i, topicId: 't1', level: 1, type: 'input', prompt: 'P', answer: ['yes'], explain: '' }));
  const m = createMatch({ mode: 'league', questions, opponent: { id: opp.id, name: opp.name, strength: opp.strength }, topicId: 't1', subjectId: 'en', division: 0, goalEvery: goalEveryOf(0), rng: createRng(seed), now: 0 });
  while (!m.finished) answerQuestion(m, rng.chance(p) ? 'yes' : 'zzz', 3000);
  const r = summarizeMatch(m, 0);
  return { goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst };
}

function topTwoRate(p, runs = 300) {
  let top2 = 0, champ = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const s = mkSeason(0, seed);
    const rng = createRng(seed * 7919);
    while (!isSeasonOver(s)) playMatchday(s, playOne(nextFixture(s).opponent, p, rng, rng.int(1e9)), rng);
    const end = seasonEnd(s);
    if (end.position <= 2) top2++;
    if (end.position === 1) champ++;
  }
  return { top2: top2 / runs, champ: champ / runs };
}

test('league: simulation, a player at 80 % usually finishes top 2 of the lowest division; a player at 40 % usually does not', () => {
  const good = topTwoRate(0.8);
  const bad = topTwoRate(0.4);
  globalThis.__sim = { good, bad };
  assert(good.top2 > 0.6, `8/10 top2 rate ${good.top2}`);
  assert(bad.top2 < 0.4, `4/10 top2 rate ${bad.top2}`);
});
