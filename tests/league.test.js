import { test, eq, assert } from './runner.js';
import { createRng } from '../js/core/rng.js';
import {
  DIVISIONS, MATCHDAYS, newSeason, nextFixture, playMatchday, computeTable, isSeasonOver, seasonEnd,
  startNextSeason, fixturesOf, simulateScore, divisionName,
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

test('league: double round-robin, 14 matchdays, everyone plays once per day, each pair twice home and away', () => {
  const s = mkSeason();
  eq(s.fixtures.length, 56);
  for (let md = 0; md < MATCHDAYS; md++) {
    const day = s.fixtures.filter((f) => f.md === md);
    eq(day.length, 4);
    eq(new Set(day.flatMap((f) => [f.home, f.away])).size, 8);
  }
  const seen = new Set(s.fixtures.map((f) => `${f.home}>${f.away}`));
  eq(seen.size, 56);
  for (const a of s.clubs) for (const b of s.clubs) if (a !== b) assert(seen.has(`${a.id}>${b.id}`), `${a.id}>${b.id}`);
  eq(fixturesOf(s).length, 14);
});

test('league: no club name equals the player club; next season avoids previous opponents when possible', () => {
  const s = mkSeason(0, 4);
  const s2 = startNextSeason(
    (() => { const x = JSON.parse(JSON.stringify(s)); x.matchday = 14; return x; })(),
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
  eq([end.position, end.points, end.champion, end.promoted, end.nextDivision], [1, 42, true, true, 2]);
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
  const end = seasonEnd({ number: 1, division: 1, clubs, fixtures, matchday: 14 });
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
