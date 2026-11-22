// League: divisions, seasons, fixtures, table. Season objects are plain JSON (no nested arrays,
// so they can be stored in Firestore). playMatchday mutates the season it is given.

import { OPPONENTS_PER_SEASON, SEASON_MATCHDAYS } from '../config.js';

export const PLAYER_CLUB_ID = 'me';
export const PROMOTION_PLACES = 2;

export const DIVISIONS = [
  { index: 0, id: 'district', name: 'District', strength: [0.35, 0.5] },
  { index: 1, id: 'regional', name: 'Régional', strength: [0.45, 0.6] },
  { index: 2, id: 'national', name: 'National', strength: [0.55, 0.7] },
  { index: 3, id: 'ligue2', name: 'Ligue 2', strength: [0.65, 0.8] },
  { index: 4, id: 'ligue1', name: 'Ligue 1', strength: [0.75, 0.9] },
];
export const TOP_DIVISION = DIVISIONS.length - 1;

export function divisionName(index) {
  const i = Number.isInteger(index) ? Math.max(0, Math.min(TOP_DIVISION, index)) : 0;
  return DIVISIONS[i].name;
}

const round2 = (x) => Math.round(x * 100) / 100;

function shortOf(name) {
  const letters = String(name).replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'ME').padEnd(3, 'X');
}

/**
 * Round-robin by the circle method: `rounds` rounds of n/2 [home, away] pairs. With rounds <= n - 1 every pair meets once;
 * beyond that the first rounds are replayed with home and away swapped.
 */
function roundRobin(ids, rounds) {
  const n = ids.length;
  const arr = ids.slice();
  const pairs = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) round.push([arr[i], arr[n - 1 - i]]);
    pairs.push(round);
    arr.splice(1, 0, arr.pop());
  }
  // home side = the club that has played fewer home games so far (keeps every club near half home, half away)
  const home = new Map(ids.map((id) => [id, 0]));
  const first = pairs.map((round, r) => round.map(([a, b], i) => {
    const flip = home.get(a) === home.get(b) ? (r + i) % 2 === 1 : home.get(a) > home.get(b);
    const [h, w] = flip ? [b, a] : [a, b];
    home.set(h, home.get(h) + 1);
    return [h, w];
  }));
  const all = [...first, ...first.map((round) => round.map(([h, a]) => [a, h]))];
  return all.slice(0, rounds);
}

/**
 * New season.
 *  clubs: array from data/clubs.json (`clubsData.clubs`)
 *  profile: {club, colors:[c1,c2]} of the player
 *  division: 0..4, number: season number (1-based), rng, exclude: club ids to avoid (previous opponents)
 * Season: { number, division, clubs:[{id,name,short,colors,crest,strength,isPlayer}],
 *           fixtures:[{md,home,away,hg,ag}] (28, flat), matchday: 0 }
 */
export function newSeason({ clubs, profile, division = 0, number = 1, rng, exclude = [] }) {
  const ex = new Set(exclude);
  const playerName = String(profile.club || '').toLowerCase();
  const eligible = clubs.filter((c) => c.name.toLowerCase() !== playerName);
  let pool = eligible.filter((c) => !ex.has(c.id));
  if (pool.length < OPPONENTS_PER_SEASON) pool = eligible;
  const picked = rng.shuffle(pool).slice(0, OPPONENTS_PER_SEASON);
  const [lo, hi] = DIVISIONS[division].strength;
  const strengths = rng.shuffle(picked.map((_, i) => lo + ((hi - lo) * i) / (picked.length - 1 || 1)));
  const teams = [
    {
      id: PLAYER_CLUB_ID,
      name: profile.club,
      short: shortOf(profile.club),
      colors: profile.colors || ['#1e40af', '#fbbf24'],
      crest: profile.crest || 'shield',
      strength: null,
      isPlayer: true,
    },
    ...picked.map((c, i) => ({
      id: c.id, name: c.name, short: c.short, colors: c.colors, crest: c.crest,
      strength: round2(Math.min(0.9, Math.max(0.35, strengths[i] + (rng.next() - 0.5) * 0.02))),
      isPlayer: false,
    })),
  ];
  const rounds = roundRobin(rng.shuffle(teams.map((t) => t.id)), SEASON_MATCHDAYS);
  const fixtures = [];
  rounds.forEach((round, md) => round.forEach(([home, away]) => fixtures.push({ md, home, away, hg: null, ag: null })));
  return { number, division, clubs: teams, fixtures, matchday: 0 };
}

export function clubOf(season, id) {
  return season.clubs.find((c) => c.id === id);
}

/** Number of matchdays of this season, read from its own fixtures (a season saved with 14 matchdays stays a 14-matchday season). */
export function seasonLength(season) {
  let max = -1;
  for (const f of season?.fixtures || []) if (f.md > max) max = f.md;
  return max >= 0 ? max + 1 : SEASON_MATCHDAYS;
}

export function isSeasonOver(season) {
  return season.matchday >= seasonLength(season);
}

/**
 * The player's next fixture, or null when the season is over.
 * { matchday (0-based), home, away, isHome, opponent: club, strength }
 */
export function nextFixture(season) {
  if (isSeasonOver(season)) return null;
  const f = season.fixtures.find((x) => x.md === season.matchday && (x.home === PLAYER_CLUB_ID || x.away === PLAYER_CLUB_ID));
  const isHome = f.home === PLAYER_CLUB_ID;
  const opponent = clubOf(season, isHome ? f.away : f.home);
  return { matchday: f.md, home: f.home, away: f.away, isHome, opponent, strength: opponent.strength };
}

/** Score of a simulated fixture from two strengths (0.35..0.9). */
export function simulateScore(strengthHome, strengthAway, rng) {
  const share = strengthHome / (strengthHome + strengthAway);
  const pHome = 0.12 + 0.35 * share;
  const pAway = 0.12 + 0.35 * (1 - share);
  let hg = 0;
  let ag = 0;
  for (let i = 0; i < 6; i++) {
    if (rng.chance(pHome)) hg++;
    if (rng.chance(pAway)) ag++;
  }
  return [hg, ag];
}

/**
 * Record the player's score for the current matchday and simulate the other fixtures.
 * Mutates season (fixtures and matchday). Returns { matchday, results: [{md,home,away,hg,ag}] }
 * (the 4 fixtures of the matchday, the player's included).
 */
export function playMatchday(season, { goalsFor, goalsAgainst }, rng) {
  if (isSeasonOver(season)) throw new Error('playMatchday: season is over');
  const md = season.matchday;
  const results = [];
  for (const f of season.fixtures) {
    if (f.md !== md) continue;
    if (f.home === PLAYER_CLUB_ID) { f.hg = goalsFor; f.ag = goalsAgainst; }
    else if (f.away === PLAYER_CLUB_ID) { f.hg = goalsAgainst; f.ag = goalsFor; }
    else {
      const [hg, ag] = simulateScore(clubOf(season, f.home).strength, clubOf(season, f.away).strength, rng);
      f.hg = hg; f.ag = ag;
    }
    results.push({ ...f });
  }
  season.matchday += 1;
  return { matchday: md, results };
}

/**
 * League table from played fixtures. Sorted by points, goal difference, goals for, then name.
 * Rows: { clubId, name, short, colors, crest, isPlayer, played, won, drawn, lost, gf, ga, gd, pts, position }
 */
export function computeTable(season) {
  const rows = new Map(season.clubs.map((c) => [c.id, {
    clubId: c.id, name: c.name, short: c.short, colors: c.colors, crest: c.crest, isPlayer: !!c.isPlayer,
    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, position: 0,
  }]));
  for (const f of season.fixtures) {
    if (f.hg == null) continue;
    const h = rows.get(f.home);
    const a = rows.get(f.away);
    h.played++; a.played++;
    h.gf += f.hg; h.ga += f.ag; a.gf += f.ag; a.ga += f.hg;
    if (f.hg > f.ag) { h.won++; h.pts += 3; a.lost++; }
    else if (f.hg < f.ag) { a.won++; a.pts += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.pts++; a.pts++; }
  }
  const list = [...rows.values()];
  for (const r of list) r.gd = r.gf - r.ga;
  list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));
  list.forEach((r, i) => { r.position = i + 1; });
  return list;
}

/** Fixtures involving a club, in matchday order (for the fixtures list). */
export function fixturesOf(season, clubId = PLAYER_CLUB_ID) {
  return season.fixtures.filter((f) => f.home === clubId || f.away === clubId).sort((a, b) => a.md - b.md);
}

/**
 * Season end summary (call once isSeasonOver).
 * { number, division, position, points, gf, ga, champion, promoted, nextDivision, table }
 * Positions 1-2 are promoted (except in the top division, where they stay); position 1 = title.
 */
export function seasonEnd(season) {
  const table = computeTable(season);
  const me = table.find((r) => r.isPlayer);
  const promoted = me.position <= PROMOTION_PLACES && season.division < TOP_DIVISION;
  return {
    number: season.number,
    division: season.division,
    position: me.position,
    points: me.pts,
    gf: me.gf,
    ga: me.ga,
    champion: me.position === 1,
    promoted,
    nextDivision: promoted ? season.division + 1 : season.division,
    table,
  };
}

/** Start the season after `season` (division from seasonEnd, fresh opponents when the pool allows). */
export function startNextSeason(season, { clubs, profile, rng }) {
  const end = seasonEnd(season);
  return newSeason({
    clubs, profile, division: end.nextDivision, number: season.number + 1, rng,
    exclude: season.clubs.filter((c) => !c.isPlayer).map((c) => c.id),
  });
}
