// Match flow shared by play, training, match and result: building a match and applying its result exactly once.
// The match itself lives in module memory; a league or cup kick-off also writes a plain marker in the player state
// (state.pendingMatch) so that closing or reloading the page during the match is a forfeit defeat (see settlePendingForfeit).
import { loadTopicQuestions, pickQuestions, findTopic } from '../core/questions.js';
import { nextFixture, clubOf, goalEveryOf } from '../core/league.js';
import { createMatch, summarizeMatch, timeoutQuestion } from '../core/match.js';
import { applyResult, startPendingMatch, clearPendingMatch, applyPendingForfeit } from '../core/state.js';
import { cupById, cupPlan, ensureCupEdition } from '../core/cups.js';
import { activeEvent, eventTopic, eventTopics, eventOfTopicId, pickEventQuestions } from '../core/events.js';
import { LEAGUE_QUESTIONS, MATCH_QUESTIONS } from '../config.js';
import { myClub, subjectLabel } from './shell-utils.js';

export const flow = {
  /** The match being played: { match, mode, topic, me, opp, coachPick, applied } or null. */
  current: null,
  /** What the result screen shows: { result, events, ctxInfo, review } or null. */
  last: null,
};

const poolCache = new Map();
const fetchJson = (p) => fetch(p).then((r) => {
  if (!r.ok) throw new Error('Impossible de charger les questions. Vérifie ta connexion.');
  return r.json();
});

const TRAINING_OPPONENT = { id: 'practice', name: 'Entraînement', short: 'ENT', colors: ['#64748b', '#e2e8f0'], crest: 'round', strength: 0.5 };

/** Questions of a topic (cached). */
async function topicPool(topic) {
  let pool = poolCache.get(topic.id);
  if (!pool) {
    pool = await loadTopicQuestions(fetchJson, topic);
    poolCache.set(topic.id, pool);
  }
  return pool;
}

/**
 * The pools of an event mix: { subjectId: questions of every topic of the squad in that subject }, each question tagged with
 * `tag` (« Anglais · Past simple », shown on the question card) and `accents` (the accent keys follow the question's subject).
 */
async function eventPools(ctx, event) {
  const topics = eventTopics(ctx.catalog, ctx.state.profile.squad, event, ctx.state.optionalTopics);
  const pools = await Promise.all(topics.map((t) => topicPool(t)));
  const out = {};
  topics.forEach((t, i) => {
    const tag = `${subjectLabel({ id: t.subjectId, name: t.subjectName })} · ${t.name}`;
    (out[t.subjectId] ||= []).push(...pools[i].map((q) => ({ ...q, tag, accents: !!t.accents })));
  });
  return out;
}

/**
 * Build the match for `topic` (a Topic from listTopics, or the sentinel topic of an active event: eventTopic) and store it in flow.current.
 *  mode: 'league' | 'cup' | 'training'; for 'cup', cupId names the cup (its edition is started here when needed).
 * League and cup matches have LEAGUE_QUESTIONS questions and a kick-off marker; training has MATCH_QUESTIONS and none.
 */
export async function prepareMatch(ctx, { mode, topic, coachPick = false, cupId = null }) {
  const ranked = mode !== 'training';
  const now = ctx.now();
  const squad = ctx.state.profile.squad;
  const n = ranked ? LEAGUE_QUESTIONS : MATCH_QUESTIONS;
  const season = ctx.state.league.season;
  const cup = mode === 'cup' ? cupById(cupId) : null;
  if (mode === 'cup' && !cup) throw new Error("Cette coupe n'existe pas.");
  let state = ctx.state;
  if (cup) state = ensureCupEdition(state, cup, now, { clubs: ctx.clubs, cards: ctx.cards });
  const plan = cup ? cupPlan(state, cup, now) : null;
  const fx = mode === 'league' ? nextFixture(season) : null;
  const cupOpp = cup ? state.cups[cup.id].opponents[plan.round] : null;
  const opp = cup ? cupOpp : fx ? fx.opponent : TRAINING_OPPONENT;
  const division = ranked ? season.division : null;
  const event = topic.event && activeEvent(squad, now) ? topic.event : null;
  let questions;
  if (topic.event) {
    if (!event) throw new Error("L'évènement est terminé : choisis un thème.");
    questions = pickEventQuestions(event, await eventPools(ctx, event), { n, history: ctx.state.questions, division, rng: ctx.rng });
  } else {
    questions = pickQuestions(await topicPool(topic), { n, history: ctx.state.questions, division, rng: ctx.rng });
  }
  const goalEvery = cup ? cup.goalEvery : fx ? goalEveryOf(season.division) : undefined;
  const strength = cup ? cupOpp.strength : fx?.strength;
  const match = createMatch({
    mode, questions, topicId: topic.id, subjectId: topic.subjectId,
    division: ranked ? season.division : 0, goalEvery, squad, concedeAll: !!cup?.concedeAll, cupId: cup?.id,
    opponent: ranked ? { id: opp.id, name: opp.name, strength } : null,
    coachPick: ranked && coachPick, rng: ctx.rng, now,
  });
  flow.current = {
    match, mode, topic, me: myClub(ctx.state), opp, matchday: fx ? fx.matchday + 1 : null, coachPick: ranked && coachPick, applied: false,
    cup: cup ? { id: cup.id, name: cup.name, roundName: plan.roundName, round: plan.round, rounds: cup.rounds.length, edition: plan.edition } : null,
  };
  flow.last = null;
  if (ranked) { // kick-off marker: leaving by reload or closing the page is a forfeit
    ctx.setState(startPendingMatch(state, {
      mode, cupId: cup?.id, opponent: { id: opp.id, name: opp.name, strength }, topicId: topic.id, subjectId: topic.subjectId,
      division: season.division, total: questions.length, goalEvery: match.goalEvery, now,
    }));
    await ctx.save();
  } else if (state !== ctx.state) ctx.setState(state);
  return flow.current;
}

/** Leaving a league or cup match before the first answer costs nothing: drop the kick-off marker. */
export async function dropPendingMatch(ctx) {
  if (!ctx.state?.pendingMatch) return;
  ctx.setState(clearPendingMatch(ctx.state));
  await ctx.save();
}

/**
 * At session start: a marker left by a reload / closed page is settled as a forfeit defeat through applyResult, saved,
 * and the result screen data is prepared in flow.last. Returns true when a forfeit was applied (go to #/result).
 */
export async function settlePendingForfeit(ctx) {
  const p = ctx.state?.pendingMatch;
  if (!p) return false;
  const season = ctx.state.league.season;
  const cupOpp = p.mode === 'cup' ? ctx.state.cups?.[p.cupId]?.opponents?.find((o) => o.id === p.opponent?.id) : null;
  const club = cupOpp || (season && p.opponent?.id ? clubOf(season, p.opponent.id) : null);
  const opp = club || { id: p.opponent?.id, name: p.opponent?.name || 'Adversaire', short: 'ADV', colors: ['#64748b', '#e2e8f0'], crest: 'round' };
  const event = eventOfTopicId(p.topicId);
  const topic = (event && eventTopic(event)) || findTopic(ctx.catalog, p.topicId) || { id: p.topicId, name: 'Thème', subjectId: p.subjectId };
  const cupDef = p.mode === 'cup' ? cupById(p.cupId) : null;
  const cupInfo = cupDef ? { id: cupDef.id, name: cupDef.name, roundName: cupDef.rounds[ctx.state.cups?.[cupDef.id]?.round ?? 0] || '', round: ctx.state.cups?.[cupDef.id]?.round ?? 0, rounds: cupDef.rounds.length, edition: ctx.state.cups?.[cupDef.id]?.edition || 1 } : null;
  const out = applyPendingForfeit(ctx.state, { now: ctx.now(), rng: ctx.rng, clubs: ctx.clubs, cards: ctx.cards, catalog: ctx.catalog });
  if (!out) return false;
  ctx.setState(out.state);
  flow.current = null;
  flow.last = { result: out.result, events: out.events, mode: out.result.mode, cup: cupInfo, topic, me: myClub(ctx.state), opp, forfeit: true, forfeitReason: 'reload', review: [] };
  await ctx.save();
  return true;
}

/**
 * Finish the current match: summarise, apply to the player's state, save. Idempotent: a second call returns the same result.
 * `forfeit` answers every remaining question as a timeout first (league: leaving a match counts as a loss).
 */
export async function finishMatch(ctx, { forfeit = false } = {}) {
  const c = flow.current;
  if (!c) return flow.last;
  if (c.applied) return flow.last;
  c.applied = true;
  if (forfeit) while (!c.match.finished) timeoutQuestion(c.match);
  const result = summarizeMatch(c.match, ctx.now());
  const out = applyResult(ctx.state, result, { now: ctx.now(), rng: ctx.rng, clubs: ctx.clubs, cards: ctx.cards, catalog: ctx.catalog });
  ctx.setState(out.state);
  const byId = new Map(c.match.questions.map((q) => [q.id, q]));
  flow.last = {
    result, events: out.events, mode: c.mode, cup: c.cup, topic: c.topic, me: c.me, opp: c.opp, forfeit,
    review: result.answers.filter((a) => !a.correct).map((a) => ({ prompt: a.prompt, answer: a.answer, given: a.given, timedOut: a.timedOut, explain: byId.get(a.id)?.explain || '' })),
  };
  flow.current = null;
  await ctx.save(); // never throws; a failure shows its own toast and the next save retries
  return flow.last;
}
