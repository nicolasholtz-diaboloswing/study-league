// Player state: creation, migration, and the orchestrator that applies a match result.
// Nothing here mutates its inputs: functions return new state objects.
import {
  HISTORY_LIMIT, MASTERY_WINDOW, ACTIVITY_DAYS_KEPT, PACKS, FREE_PACK_EVERY_N_LEVELS, LEAGUE_QUESTIONS,
} from '../config.js';
import { newSeason, playMatchday, isSeasonOver, seasonEnd, startNextSeason, computeTable } from './league.js';
import { matchXp, matchCoins, levelForXp, openPack, pickCupCard, evaluateBadges, PACK_ODDS } from './rewards.js';
import { dayKey, updateStreak, topicStars } from './stats.js';
import { cupById, ensureCupEdition, advanceCup } from './cups.js';

// Schema 2: the one-off demotion (see MIGRATIONS[1] and applyDemotion). New states are created at the current schema.
export const SCHEMA_VERSION = 2;

/** Divisions dropped, once, by every player that existed before schema 2 (floor: District). */
export const DEMOTION_DIVISIONS = 2;

const clone = (x) => JSON.parse(JSON.stringify(x));

function emptyTotals() {
  return {
    matches: 0, leagueMatches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
    correct: 0, answered: 0, perfect: 0, cleanSheets: 0, hatTricks: 0,
    winStreak: 0, bestWinStreak: 0, promotions: 0, titles: 0, legends: 0, timePlayedMs: 0,
  };
}

/**
 * New state.
 *  { username, displayName, role: 'player'|'coach', squad: 'u13'|'u10', club, colors:[c1,c2],
 *    clubs (array from clubs.json, optional), rng (needed with clubs), now }
 * Without `clubs`, league.season is null: call ensureSeason before the first league match.
 */
export function newPlayerState({
  username, displayName, role = 'player', squad = 'u13', club = '', colors = ['#1e40af', '#fbbf24'],
  clubs = null, rng = null, now,
}) {
  if (role === 'coach') {
    return {
      schema: SCHEMA_VERSION, role: 'coach', username, createdAt: now, lastActive: now,
      profile: { displayName, club: '', colors, squad: null },
    };
  }
  const state = {
    schema: SCHEMA_VERSION,
    role: 'player',
    username,
    createdAt: now,
    lastActive: now,
    profile: { displayName, club, colors, squad },
    xp: 0,
    coins: 0,
    freePacks: 0,
    totals: emptyTotals(),
    topics: {},
    questions: {},
    league: { season: null, history: [] },
    matches: [],
    cards: {},
    badges: {},
    streak: { current: 0, best: 0, lastDay: null },
    activity: {},
    pendingMatch: null,
    cups: {}, // parallel cups, see core/cups.js
    optionalTopics: {}, // optional topics the child switched on: { [topicId]: ms of the last activation } (top level: firestore.rules restricts `profile`)
  };
  return clubs ? ensureSeason(state, clubs, rng) : state;
}

/** Return a state whose league.season exists (creates season 1 in division 0 if missing). */
export function ensureSeason(state, clubs, rng) {
  if (state.role === 'coach' || state.league.season) return state;
  const s = clone(state);
  s.league.season = newSeason({
    clubs, profile: s.profile, division: 0, number: s.league.history.length + 1, rng,
  });
  return s;
}

/**
 * State with the optional topic `topicId` switched on (the entry becomes `now`, ms: switching on again updates it) or off (the key is
 * removed). A coach state is returned unchanged.
 */
export function setOptionalTopic(state, topicId, on, now) {
  if (state.role === 'coach') return state;
  const optionalTopics = { ...(state.optionalTopics || {}) };
  if (on) optionalTopics[topicId] = now; else delete optionalTopics[topicId];
  return { ...state, optionalTopics };
}

// Migrations keyed by the schema version they upgrade FROM.
// 1 -> 2: marks every existing player for the one-off demotion by DEMOTION_DIVISIONS divisions. Migration has no clubs nor rng,
// so the new season is built by applyDemotion (called by restoreSession in main.js, which saves). A new player is created at
// schema 2 and never goes through this.
const MIGRATIONS = {
  1: (s) => (s.role === 'coach' ? s : { ...s, pendingDemotion: DEMOTION_DIVISIONS }),
};

/**
 * Carry out the demotion marked by MIGRATIONS[1]: a new season, restarting at matchday 0, in the division lowered by
 * state.pendingDemotion (floor District), same season number; the marker is removed so it happens exactly once. History, totals,
 * cards, xp and coins are untouched. A player already at the floor keeps the season in progress. Any kick-off marker is dropped
 * with the old season. The caller saves the result.
 */
export function applyDemotion(state, clubs, rng) {
  if (!state.pendingDemotion) return state;
  const s = clone(state);
  const by = Number(s.pendingDemotion) || 0;
  delete s.pendingDemotion;
  const season = s.league?.season;
  if (!season) return s; // ensureSeason builds season 1 in District
  const division = Math.max(0, season.division - by);
  if (division === season.division) return s;
  s.league.season = newSeason({
    clubs, profile: s.profile, division, number: season.number, rng,
    exclude: season.clubs.filter((c) => !c.isPlayer).map((c) => c.id),
  });
  s.pendingMatch = null;
  return s;
}

/**
 * Bring a stored state to the current schema, filling missing fields with defaults.
 * Returns null if `raw` is not an object.
 */
export function migrateState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let s = clone(raw);
  let v = s.schema || 0;
  while (v < SCHEMA_VERSION) {
    if (MIGRATIONS[v]) s = MIGRATIONS[v](s);
    v++;
  }
  s.schema = SCHEMA_VERSION;
  s.profile = { displayName: '', club: '', colors: ['#1e40af', '#fbbf24'], squad: 'u13', ...s.profile };
  if (s.role === 'coach') return s;
  s.role = 'player';
  const d = newPlayerState({ username: s.username, displayName: '', now: s.createdAt || 0 });
  s.xp ??= 0;
  s.coins ??= 0;
  s.freePacks ??= 0;
  s.totals = { ...d.totals, ...s.totals };
  s.topics ??= {};
  s.questions ??= {};
  s.league = { season: null, history: [], ...s.league };
  s.matches ??= [];
  s.cards ??= {};
  s.badges ??= {};
  s.streak = { ...d.streak, ...s.streak };
  s.activity ??= {};
  s.pendingMatch ??= null;
  s.cups ??= {};
  // { [topicId]: ms of the last activation }: only positive numbers are kept (a leftover `true` or any other shape is dropped)
  s.optionalTopics = Object.fromEntries(Object.entries(s.optionalTopics && typeof s.optionalTopics === 'object' && !Array.isArray(s.optionalTopics) ? s.optionalTopics : {})
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0));
  delete s.packs; // field of an unreleased draft
  delete s.difficulty; // the u13 "expert" mode no longer exists; old states may still carry the field
  s.createdAt ??= 0;
  s.lastActive ??= s.createdAt;
  return s;
}

function badgeEnv(ctx) {
  return { catalog: ctx.catalog, totalCards: ctx.cards ? ctx.cards.length : undefined }; // the album is the whole deck: players, countries and clubs
}

function grantBadges(s, ctx, events) {
  for (const badge of evaluateBadges(s, badgeEnv(ctx))) {
    s.badges[badge.id] = ctx.now;
    events.push({ type: 'badge', badge: { id: badge.id, name: badge.name, desc: badge.desc, icon: badge.icon } });
  }
}

function pruneActivity(s) {
  const days = Object.keys(s.activity).sort();
  while (days.length > ACTIVITY_DAYS_KEPT) delete s.activity[days.shift()];
}

/**
 * Apply a finished match to the state.
 *  result: from summarizeMatch
 *  ctx: { now (ms), rng, clubs (data/clubs.json `.clubs`, needed for league mode), catalog (optional, for subject-master) ,
 *         cards (optional, deck size for the album badge) }
 * Returns { state (new), events }. Events, in order:
 *  {type:'xp', base, speed, outcome, total}      {type:'coins', base, perfect, coachPick, total}  (league only)
 *  {type:'mastery', topicId, from, to}           (a topic gained stars)
 *  {type:'level-up', from, to}                   {type:'free-pack', reason:'level'|'promotion'|'title', level?}
 *  {type:'streak', days}                         (day streak grew)
 *  {type:'matchday', matchday, results, position, table}  (league only)
 *  {type:'season-end', summary, nextDivision, promoted, champion}  (league only, after matchday)
 *  {type:'cup', cupId, cupName, edition, round, roundName, rounds, qualified, shootout, eliminated, finalWon, card: {card,isNew}|null, coins}
 *    (cup only; card = the nation/club card won by a qualification; coins = final bonus; a won final also gives a
 *    {type:'free-pack', reason:'cup'})
 *  {type:'badge', badge:{id,name,desc,icon}}
 */
export function applyResult(state, result, ctx) {
  const { now, rng } = ctx;
  const league = result.mode === 'league';
  const cup = result.mode === 'cup';
  const ranked = league || cup; // timed matches: kick-off marker, coins
  const cupDef = cup ? cupById(result.cupId) : null;
  let s = league && !state.league.season ? ensureSeason(state, ctx.clubs, rng) : state;
  if (cupDef && state.cups?.[cupDef.id]?.status !== 'active') {
    try { s = ensureCupEdition(s, cupDef, now, { clubs: ctx.clubs, cards: ctx.cards }); } catch { /* locked or ended today: recorded as a plain match */ }
  }
  s = clone(s);
  const events = [];
  const t = s.totals;
  const oldLevel = levelForXp(s.xp);

  // totals
  t.matches += 1;
  t.correct += result.correct;
  t.answered += result.total;
  t.timePlayedMs += result.durationMs;
  if (result.perfect) t.perfect += 1;
  if (league) {
    t.leagueMatches += 1;
    t.goalsFor += result.goalsFor;
    t.goalsAgainst += result.goalsAgainst;
    if (result.outcome === 'W') { t.wins += 1; t.winStreak += 1; t.bestWinStreak = Math.max(t.bestWinStreak, t.winStreak); }
    else { t.winStreak = 0; if (result.outcome === 'D') t.draws += 1; else t.losses += 1; }
    if (result.cleanSheet) t.cleanSheets += 1;
    if (result.goalsFor >= 3) t.hatTricks += 1;
  }

  // topic and question history
  const topicIds = [...new Set(result.answers.map((a) => a.topicId))];
  const starsBefore = Object.fromEntries(topicIds.map((id) => [id, topicStars(s, id)]));
  for (const a of result.answers) {
    const tp = (s.topics[a.topicId] ||= { recent: [], answered: 0, correct: 0, lastAt: 0 });
    tp.recent.push(a.correct ? 1 : 0);
    if (tp.recent.length > MASTERY_WINDOW) tp.recent.splice(0, tp.recent.length - MASTERY_WINDOW);
    tp.answered += 1;
    if (a.correct) tp.correct += 1;
    tp.lastAt = now;
    const q = (s.questions[a.id] ||= { seen: 0, correct: 0, wrong: 0, lastAt: 0, lastCorrect: null, topicId: a.topicId });
    q.seen += 1;
    q.lastAt = now;
    q.lastCorrect = a.correct;
    if (a.correct) q.correct += 1;
    else { q.wrong += 1; q.p = a.prompt; q.a = a.answer; }
  }

  // XP, coins
  const xp = matchXp(result);
  s.xp += xp.total;
  events.push({ type: 'xp', ...xp });
  const coins = matchCoins(result);
  if (ranked) {
    s.coins += coins.total;
    events.push({ type: 'coins', ...coins });
  }
  for (const id of topicIds) {
    const to = topicStars(s, id);
    if (to > starsBefore[id]) events.push({ type: 'mastery', topicId: id, from: starsBefore[id], to });
  }
  const newLevel = levelForXp(s.xp);
  if (newLevel > oldLevel) {
    events.push({ type: 'level-up', from: oldLevel, to: newLevel });
    for (let l = oldLevel + 1; l <= newLevel; l++) {
      if (l % FREE_PACK_EVERY_N_LEVELS === 0) {
        s.freePacks += 1;
        events.push({ type: 'free-pack', reason: 'level', level: l });
      }
    }
  }

  // streak and activity
  const streak = updateStreak(s.streak, now);
  if (streak.lastDay !== s.streak.lastDay) events.push({ type: 'streak', days: streak.current });
  s.streak = streak;
  const day = dayKey(now);
  const act = (s.activity[day] ||= { matches: 0, xp: 0, answered: 0, correct: 0, ms: 0 });
  act.matches += 1;
  act.xp += xp.total;
  act.answered += result.total;
  act.correct += result.correct;
  act.ms += result.durationMs;
  pruneActivity(s);

  // league
  if (league) {
    const season = s.league.season;
    const md = playMatchday(season, result, rng);
    const table = computeTable(season);
    events.push({ type: 'matchday', matchday: md.matchday, results: md.results, position: table.find((r) => r.isPlayer).position, table });
    if (isSeasonOver(season)) {
      const end = seasonEnd(season);
      s.league.history.push({
        season: end.number, division: end.division, position: end.position, points: end.points,
        gf: end.gf, ga: end.ga, promoted: end.promoted, champion: end.champion, at: now,
      });
      if (end.promoted) {
        t.promotions += 1;
        s.freePacks += 1;
        events.push({ type: 'free-pack', reason: 'promotion' });
      }
      if (end.champion) {
        t.titles += 1;
        s.freePacks += 1;
        events.push({ type: 'free-pack', reason: 'title' });
      }
      events.push({ type: 'season-end', summary: end, nextDivision: end.nextDivision, promoted: end.promoted, champion: end.champion });
      s.league.season = startNextSeason(season, { clubs: ctx.clubs, profile: s.profile, rng });
    }
  }

  // cup: the knockout round, the card won, the final's rewards (the league season is untouched)
  const cupRec = cupDef ? s.cups?.[cupDef.id] : null;
  if (cupRec && cupRec.status === 'active') {
    const adv = advanceCup(cupDef, cupRec, result, now);
    s.cups[cupDef.id] = adv.record;
    const ev = {
      type: 'cup', cupId: cupDef.id, cupName: cupDef.name, edition: cupRec.edition, round: adv.round, roundName: adv.roundName,
      rounds: cupDef.rounds.length, qualified: adv.qualified, shootout: adv.shootout, eliminated: adv.eliminated, finalWon: adv.finalWon,
      card: null, coins: 0,
    };
    if (adv.qualified) {
      const won = pickCupCard(ctx.cards || [], rng, s.cards, cupDef.cardKind, { final: adv.finalWon });
      if (won) { addCards(s, [won]); ev.card = won; }
    }
    events.push(ev);
    if (adv.finalWon) {
      s.coins += cupDef.finalCoins;
      ev.coins = cupDef.finalCoins;
      s.freePacks += 1;
      events.push({ type: 'free-pack', reason: 'cup' });
    }
  }

  if (ranked) s.pendingMatch = null; // the kick-off marker is settled

  // match record
  s.matches.push({
    at: now, mode: result.mode, topicId: result.topicId, subjectId: result.subjectId,
    opponent: result.opponent.name, division: result.division,
    goalsFor: result.goalsFor, goalsAgainst: result.goalsAgainst, outcome: result.outcome,
    correct: result.correct, total: result.total, xp: xp.total, coins: coins.total,
    ...(cup ? { cup: result.cupId } : {}),
  });
  if (s.matches.length > HISTORY_LIMIT) s.matches.splice(0, s.matches.length - HISTORY_LIMIT);

  s.lastActive = now;
  grantBadges(s, ctx, events);
  return { state: s, events };
}

// ---------- league or cup match in progress (forfeit when the page is closed or reloaded) ----------

/**
 * Marker written at kick-off of a league or cup match: { mode: 'league' | 'cup', opponent: {id, name, strength}, topicId, subjectId,
 * division, total, startedAt, goalEvery?, cupId? }. A plain JSON object stored in state.pendingMatch; applyResult clears it.
 * A marker written before cups and per-division goals has no goalEvery and is a league marker.
 */
export function startPendingMatch(state, {
  mode = 'league', cupId = null, opponent, topicId, subjectId = null, division = 0, total = LEAGUE_QUESTIONS, goalEvery = null, now,
}) {
  const s = clone(state);
  s.pendingMatch = {
    mode,
    opponent: { id: opponent.id, name: opponent.name, strength: opponent.strength ?? 0.5 },
    topicId, subjectId, division, total, startedAt: now,
    ...(goalEvery ? { goalEvery } : {}),
    ...(cupId ? { cupId } : {}),
  };
  return s;
}

/** State without the kick-off marker (match left before the first answer, which costs nothing). */
export function clearPendingMatch(state) {
  const s = clone(state);
  s.pendingMatch = null;
  return s;
}

/** The result of a forfeited match: 0 goals for, 3 against, every question unanswered, no per-question history. */
export function forfeitResult(pending, now) {
  const total = pending.total || LEAGUE_QUESTIONS;
  const cup = pending.mode === 'cup' && pending.cupId;
  return {
    mode: cup ? 'cup' : 'league', ...(cup ? { cupId: pending.cupId } : {}),
    topicId: pending.topicId, subjectId: pending.subjectId ?? null, division: pending.division ?? 0, coachPick: false,
    opponent: { id: pending.opponent.id, name: pending.opponent.name, strength: pending.opponent.strength ?? 0.5 },
    goalsFor: 0, goalsAgainst: 3, outcome: 'L', correct: 0, total, accuracy: 0, perfect: false, cleanSheet: false,
    speedBonus: 0, durationMs: 0, playedAt: now,
    answers: [], // nothing reaches the per-question or topic mastery history
  };
}

/**
 * Settle a pending league or cup match as a forfeit defeat through applyResult (a cup forfeit eliminates the player). Returns
 * { state, events, result } or null when there is no marker. Totals count every question as answered (wrong); question and
 * topic history are untouched.
 */
export function applyPendingForfeit(state, ctx) {
  const p = state.pendingMatch;
  if (!p || !p.opponent) return null;
  const result = forfeitResult(p, ctx.now);
  const out = applyResult(state, result, ctx);
  out.state.pendingMatch = null;
  return { ...out, result };
}

function addCards(s, drawn) {
  for (const { card } of drawn) {
    s.cards[card.id] = (s.cards[card.id] || 0) + 1;
    if (card.rarity === 'legend') s.totals.legends += 1;
  }
}

/**
 * Pay the pack's cost and open it. kind: 'big' (default, 150 coins, 3 cards) or 'small' (75 coins, 1 card, no legend).
 *  ctx: { now, rng, cards (array from cards.json), catalog (optional) }
 * Returns { state, cards: [{card, isNew}], events: [{type:'badge',...}] }. Throws if not enough coins or unknown kind.
 */
export function buyPack(state, ctx, kind = 'big') {
  const pack = PACKS[kind];
  if (!pack) throw new Error('Unknown pack');
  if (state.coins < pack.cost) throw new Error('Not enough coins');
  const s = clone(state);
  s.coins -= pack.cost;
  const drawn = openPack(ctx.cards, ctx.rng, s.cards, pack.size, PACK_ODDS[kind]);
  addCards(s, drawn);
  const events = [];
  s.lastActive = ctx.now;
  grantBadges(s, ctx, events);
  return { state: s, cards: drawn, events };
}

/** Open one free pack (state.freePacks > 0). Same return shape as buyPack. */
export function openFreePack(state, ctx) {
  if (!(state.freePacks > 0)) throw new Error('No free pack');
  const s = clone(state);
  s.freePacks -= 1;
  const drawn = openPack(ctx.cards, ctx.rng, s.cards);
  addCards(s, drawn);
  const events = [];
  s.lastActive = ctx.now;
  grantBadges(s, ctx, events);
  return { state: s, cards: drawn, events };
}
