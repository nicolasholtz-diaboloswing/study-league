// Player state: creation, migration, and the orchestrator that applies a match result.
// Nothing here mutates its inputs: functions return new state objects.
import {
  HISTORY_LIMIT, MASTERY_WINDOW, ACTIVITY_DAYS_KEPT, PACK_COST, FREE_PACK_EVERY_N_LEVELS, MATCH_QUESTIONS,
} from '../config.js';
import { newSeason, playMatchday, isSeasonOver, seasonEnd, startNextSeason, computeTable } from './league.js';
import { matchXp, matchCoins, levelForXp, openPack, evaluateBadges } from './rewards.js';
import { dayKey, updateStreak, topicStars } from './stats.js';

export const SCHEMA_VERSION = 1;

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

// Migrations keyed by the schema version they upgrade FROM. None yet.
const MIGRATIONS = {};

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
  s.createdAt ??= 0;
  s.lastActive ??= s.createdAt;
  return s;
}

function badgeEnv(ctx) {
  return { catalog: ctx.catalog, totalCards: ctx.cards ? ctx.cards.length : undefined };
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
 *  {type:'badge', badge:{id,name,desc,icon}}
 */
export function applyResult(state, result, ctx) {
  const { now, rng } = ctx;
  const league = result.mode === 'league';
  let s = league && !state.league.season ? ensureSeason(state, ctx.clubs, rng) : state;
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
  if (league) {
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

  if (league) s.pendingMatch = null; // the kick-off marker is settled

  // match record
  s.matches.push({
    at: now, mode: result.mode, topicId: result.topicId, subjectId: result.subjectId,
    opponent: result.opponent.name, division: result.division,
    goalsFor: result.goalsFor, goalsAgainst: result.goalsAgainst, outcome: result.outcome,
    correct: result.correct, total: result.total, xp: xp.total, coins: league ? coins.total : 0,
  });
  if (s.matches.length > HISTORY_LIMIT) s.matches.splice(0, s.matches.length - HISTORY_LIMIT);

  s.lastActive = now;
  grantBadges(s, ctx, events);
  return { state: s, events };
}

// ---------- league match in progress (forfeit when the page is closed or reloaded) ----------

/**
 * Marker written at kick-off of a league match: { mode: 'league', opponent: {id, name, strength}, topicId, subjectId,
 * division, total, startedAt }. A plain JSON object stored in state.pendingMatch; applyResult clears it.
 */
export function startPendingMatch(state, { opponent, topicId, subjectId = null, division = 0, total = MATCH_QUESTIONS, now }) {
  const s = clone(state);
  s.pendingMatch = {
    mode: 'league',
    opponent: { id: opponent.id, name: opponent.name, strength: opponent.strength ?? 0.5 },
    topicId, subjectId, division, total, startedAt: now,
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
  const total = pending.total || MATCH_QUESTIONS;
  return {
    mode: 'league', topicId: pending.topicId, subjectId: pending.subjectId ?? null, division: pending.division ?? 0, coachPick: false,
    opponent: { id: pending.opponent.id, name: pending.opponent.name, strength: pending.opponent.strength ?? 0.5 },
    goalsFor: 0, goalsAgainst: 3, outcome: 'L', correct: 0, total, accuracy: 0, perfect: false, cleanSheet: false,
    speedBonus: 0, durationMs: 0, playedAt: now,
    answers: [], // nothing reaches the per-question or topic mastery history
  };
}

/**
 * Settle a pending league match as a forfeit defeat through applyResult. Returns { state, events, result } or null
 * when there is no marker. Totals count every question as answered (wrong); question and topic history are untouched.
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
 * Pay PACK_COST coins and open a pack.
 *  ctx: { now, rng, cards (array from cards.json), catalog (optional) }
 * Returns { state, cards: [{card, isNew}], events: [{type:'badge',...}] }. Throws if not enough coins.
 */
export function buyPack(state, ctx) {
  if (state.coins < PACK_COST) throw new Error('Not enough coins');
  const s = clone(state);
  s.coins -= PACK_COST;
  const drawn = openPack(ctx.cards, ctx.rng, s.cards);
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
