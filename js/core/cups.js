// Parallel cups: four knockout cups played next to the league season (match mode 'cup', state.cups).
// Pure: functions take the state, `now` (ms) and data as parameters and return new objects; nothing here mutates its inputs.
//
// state.cups[cupId] = {
//   edition (1-based), round (0-based index of the round to play), status 'active' | 'out' | 'won',
//   endedDay (local 'YYYY-MM-DD' on which the edition ended, null while active), trophies (finals won),
//   opponents: [{ id, name, short, colors, crest, strength }] one per round (fixed when the edition starts),
// }
// A cup match is a league-like match (timer, kick-off marker, XP, coins) that does not touch the league season.
import { dayKey } from './stats.js';
import { createRng } from './rng.js';

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Cup definitions.
 *  unlock: { division } (current league division at least) or { world: true } (a Ligue 1 title or a Ligue des champions won)
 *  rounds: names of the rounds, the last one is the final
 *  goalEvery: correct answers per goal; concedeAll: every error is a goal for the opponent
 *  opponents: 'clubs' (fictional clubs of data/clubs.json) or 'nations' (national teams)
 *  cardKind: kind of the card won with each match won ('club' or 'nation'); strength: [first round, final] of the opponents
 *  finalCoins: coins added to the match coins when the final is won
 */
export const CUPS = [
  {
    id: 'league-cup', name: 'Coupe de la Ligue', icon: '🏆', unlock: { division: 2 }, unlockText: 'Atteins la division National',
    rounds: ['Quart de finale', 'Demi-finale', 'Finale'], goalEvery: 3, concedeAll: false,
    opponents: 'clubs', cardKind: 'club', strength: [0.55, 0.7], finalCoins: 20,
  },
  {
    id: 'europe-cup', name: 'Coupe d\'Europe', icon: '🌍', unlock: { division: 3 }, unlockText: 'Atteins la Ligue 2',
    rounds: ['Huitième de finale', 'Quart de finale', 'Demi-finale', 'Finale'], goalEvery: 4, concedeAll: false,
    opponents: 'nations', cardKind: 'nation', strength: [0.65, 0.8], finalCoins: 30,
  },
  {
    id: 'champions-league', name: 'Ligue des champions', icon: '⭐', unlock: { division: 4 }, unlockText: 'Atteins la Ligue 1',
    rounds: ['Huitième de finale', 'Quart de finale', 'Demi-finale', 'Finale'], goalEvery: 5, concedeAll: false,
    opponents: 'clubs', cardKind: 'club', strength: [0.75, 0.9], finalCoins: 40,
  },
  {
    id: 'world-cup', name: 'Coupe du monde', icon: '🥇', unlock: { world: true }, unlockText: 'Gagne un titre de Ligue 1 ou la Ligue des champions',
    rounds: ['Huitième de finale', 'Quart de finale', 'Demi-finale', 'Finale'], goalEvery: 5, concedeAll: true,
    opponents: 'nations', cardKind: 'nation', strength: [0.75, 0.9], finalCoins: 60,
  },
];

export const cupById = (id) => CUPS.find((c) => c.id === id) || null;

const TOP_DIVISION = 4; // Ligue 1 (league.js DIVISIONS)

// ---------- opponents ----------

// [name, short, colors] of the national teams used when the card file has no nation cards (or too few of them)
const FALLBACK_NATIONS = [
  ['France', 'FRA', '#1e40af', '#ffffff'], ['Brésil', 'BRE', '#16a34a', '#fbbf24'], ['Argentine', 'ARG', '#7dd3fc', '#ffffff'],
  ['Allemagne', 'ALL', '#111827', '#dc2626'], ['Espagne', 'ESP', '#dc2626', '#fbbf24'], ['Italie', 'ITA', '#1e40af', '#f3f4f6'],
  ['Angleterre', 'ANG', '#f3f4f6', '#dc2626'], ['Portugal', 'POR', '#dc2626', '#16a34a'], ['Pays-Bas', 'PBA', '#ea580c', '#1e40af'],
  ['Belgique', 'BEL', '#dc2626', '#111827'], ['Croatie', 'CRO', '#dc2626', '#f3f4f6'], ['Uruguay', 'URU', '#7dd3fc', '#111827'],
  ['Maroc', 'MAR', '#dc2626', '#16a34a'], ['Sénégal', 'SEN', '#16a34a', '#fbbf24'], ['Japon', 'JAP', '#1e40af', '#f3f4f6'],
  ['Mexique', 'MEX', '#16a34a', '#f3f4f6'],
];
const PALETTE = ['#1e40af', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#111827', '#ea580c'];

const stripAccents = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (s) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Three capital letters of a name ("Côte d'Ivoire" -> "COT"). */
function shortOfName(name) {
  const letters = stripAccents(name).replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'XXX').padEnd(3, 'X');
}

function nationOpponent(name) {
  const known = FALLBACK_NATIONS.find((n) => n[0].toLowerCase() === String(name).toLowerCase());
  const h = [...name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const c1 = PALETTE[h % PALETTE.length];
  const c2 = PALETTE[(h >> 3) % PALETTE.length];
  const colors = known ? [known[2], known[3]] : [c1, c2 === c1 ? '#f3f4f6' : c2];
  return { id: `nat-${slug(name)}`, name, short: known ? known[1] : shortOfName(name), colors, crest: 'round' };
}

/**
 * The national teams to draw from: the names of the nation cards (kind 'nation') when there are, completed by the built-in list
 * when there are fewer than `need`.
 */
export function nationPool(cards, need) {
  const names = [];
  for (const c of cards || []) if (c.kind === 'nation' && c.name && !names.some((x) => x.toLowerCase() === c.name.toLowerCase())) names.push(c.name);
  for (const n of FALLBACK_NATIONS) if (names.length < need && !names.some((x) => x.toLowerCase() === n[0].toLowerCase())) names.push(n[0]);
  return names.map(nationOpponent);
}

/**
 * The opponents of an edition, one per round, weaker first. Deterministic for (seed, cup, edition), so the pre-match screen and the
 * start of the edition agree.
 *  data: { clubs (data/clubs.json `.clubs`), cards (data/cards.json `.cards`, for the nation names), clubName (the player's club: never drawn) }
 */
export function cupOpponents(cup, edition, seed, data = {}) {
  const rng = createRng(`${seed}|${cup.id}|${edition}`);
  const n = cup.rounds.length;
  let pool;
  if (cup.opponents === 'nations') pool = nationPool(data.cards, n);
  else {
    const mine = String(data.clubName || '').toLowerCase();
    pool = (data.clubs || []).filter((c) => c.name.toLowerCase() !== mine).map((c) => ({ id: c.id, name: c.name, short: c.short, colors: c.colors, crest: c.crest }));
  }
  const picked = rng.shuffle(pool).slice(0, n);
  const [lo, hi] = cup.strength;
  return picked.map((o, i) => ({ ...o, strength: round2(lo + ((hi - lo) * i) / (n - 1 || 1)) }));
}

// ---------- status ----------

/** Is the cup open to this player? (the Coupe du monde needs a Ligue 1 title or a Ligue des champions won) */
export function isCupUnlocked(state, cup) {
  if (cup.unlock.world) {
    return !!state.league?.history?.some((h) => h.division === TOP_DIVISION && h.champion) || (state.cups?.['champions-league']?.trophies || 0) > 0;
  }
  return (state.league?.season?.division ?? 0) >= cup.unlock.division;
}

/**
 * Where a cup stands for this player at `now`.
 * { cup, status: 'locked' | 'ready' | 'waiting', edition, round, roundName, isFinal, trophies, opponent, record }
 *  'ready': a match can be played (a new edition starts with round 0 when there is no active edition, or when the last one
 *  ended on an earlier local day); 'waiting': the edition ended today, the next one is available tomorrow.
 *  data: { clubs, cards, clubName } for the opponent of the round (see cupOpponents); without it, opponent is null.
 */
export function cupPlan(state, cup, now, data = null) {
  const rec = state.cups?.[cup.id] || null;
  const trophies = rec?.trophies || 0;
  const base = { cup, trophies, record: rec, edition: rec?.edition || 1, round: 0, roundName: cup.rounds[0], isFinal: false, opponent: null };
  if (!isCupUnlocked(state, cup)) return { ...base, status: 'locked' };
  let edition;
  let round;
  let opponents;
  if (rec && rec.status === 'active') {
    edition = rec.edition; round = rec.round; opponents = rec.opponents;
  } else if (rec && rec.endedDay === dayKey(now)) {
    return { ...base, status: 'waiting' };
  } else {
    edition = (rec?.edition || 0) + 1; round = 0;
    opponents = data ? cupOpponents(cup, edition, state.username || '', data) : null;
  }
  return {
    ...base, status: 'ready', edition, round, roundName: cup.rounds[round], isFinal: round === cup.rounds.length - 1,
    opponent: opponents ? opponents[round] || null : null,
  };
}

/** Plans of the four cups, in display order. */
export const cupPlans = (state, now, data = null) => CUPS.map((cup) => cupPlan(state, cup, now, data));

/**
 * State with an active edition of the cup: unchanged when one is already running, a new edition (round 0, opponents drawn) when the
 * previous one ended on an earlier day or there was none. Throws when the cup is locked or its edition ended today.
 *  data: { clubs, cards } (the player's club name is taken from the state)
 */
export function ensureCupEdition(state, cup, now, data) {
  const rec = state.cups?.[cup.id];
  if (rec && rec.status === 'active') return state;
  const plan = cupPlan(state, cup, now);
  if (plan.status !== 'ready') throw new Error(`ensureCupEdition: ${cup.id} is ${plan.status}`);
  const s = JSON.parse(JSON.stringify(state));
  s.cups = s.cups || {};
  s.cups[cup.id] = {
    edition: plan.edition, round: 0, status: 'active', endedDay: null, trophies: rec?.trophies || 0,
    opponents: cupOpponents(cup, plan.edition, state.username || '', { ...data, clubName: state.profile?.club }),
  };
  return s;
}

// ---------- results ----------

/**
 * Knockout outcome of a finished cup match (a result from summarizeMatch). A draw goes to "tirs au but": the player goes
 * through when the correct answers outnumber the wrong ones, else is out.
 * { qualified, shootout }
 */
export function cupOutcome(result) {
  if (result.goalsFor !== result.goalsAgainst) return { qualified: result.goalsFor > result.goalsAgainst, shootout: false };
  return { qualified: result.correct > result.total - result.correct, shootout: true };
}

/**
 * The cup record after a match of the round it stands on.
 * Returns { record (new), qualified, shootout, round, roundName, finalWon, eliminated }.
 */
export function advanceCup(cup, record, result, now) {
  const { qualified, shootout } = cupOutcome(result);
  const round = record.round;
  const last = round === cup.rounds.length - 1;
  const next = { ...record };
  let finalWon = false;
  if (!qualified) { next.status = 'out'; next.endedDay = dayKey(now); }
  else if (last) { next.status = 'won'; next.endedDay = dayKey(now); next.trophies = (record.trophies || 0) + 1; finalWon = true; }
  else next.round = round + 1;
  return { record: next, qualified, shootout, round, roundName: cup.rounds[round], finalWon, eliminated: !qualified };
}

/** "Demain" text helper: the cup is playable again from the next local day. */
export const NEXT_EDITION_TEXT = 'Nouvelle édition demain';
