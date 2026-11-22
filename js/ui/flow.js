// Match flow shared by play, training, match and result: building a match and applying its result exactly once.
// The match itself lives in module memory; a league kick-off also writes a plain marker in the player state
// (state.pendingMatch) so that closing or reloading the page during the match is a forfeit defeat (see settlePendingForfeit).
import { loadTopicQuestions, pickQuestions, listTopics } from '../core/questions.js';
import { nextFixture, clubOf } from '../core/league.js';
import { createMatch, summarizeMatch, timeoutQuestion } from '../core/match.js';
import { applyResult, startPendingMatch, clearPendingMatch, applyPendingForfeit, playerDifficulty } from '../core/state.js';
import { myClub } from './shell-utils.js';

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

/** Build the match for `topic` (a Topic from listTopics) and store it in flow.current. */
export async function prepareMatch(ctx, { mode, topic, coachPick = false }) {
  let pool = poolCache.get(topic.id);
  if (!pool) {
    pool = await loadTopicQuestions(fetchJson, topic);
    poolCache.set(topic.id, pool);
  }
  const league = mode === 'league';
  const season = ctx.state.league.season;
  const fx = league ? nextFixture(season) : null;
  const questions = pickQuestions(pool, { history: ctx.state.questions, division: league ? season.division : null, rng: ctx.rng });
  const opp = league ? fx.opponent : TRAINING_OPPONENT;
  const difficulty = league ? playerDifficulty(ctx.state) : 'normal'; // expert mode: u13 league matches only
  const match = createMatch({
    mode, questions, topicId: topic.id, subjectId: topic.subjectId,
    division: league ? season.division : 0,
    opponent: league ? { id: opp.id, name: opp.name, strength: fx.strength } : null,
    coachPick: league && coachPick, difficulty, rng: ctx.rng, now: ctx.now(),
  });
  flow.current = { match, mode, topic, me: myClub(ctx.state), opp, matchday: fx ? fx.matchday + 1 : null, coachPick: league && coachPick, applied: false };
  flow.last = null;
  if (league) { // kick-off marker: leaving by reload or closing the page is a forfeit
    ctx.setState(startPendingMatch(ctx.state, {
      opponent: { id: opp.id, name: opp.name, strength: fx.strength }, topicId: topic.id, subjectId: topic.subjectId,
      division: season.division, total: questions.length, difficulty, now: ctx.now(),
    }));
    await ctx.save();
  }
  return flow.current;
}

/** Leaving a league match before the first answer costs nothing: drop the kick-off marker. */
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
  const club = season && p.opponent?.id ? clubOf(season, p.opponent.id) : null;
  const opp = club || { id: p.opponent?.id, name: p.opponent?.name || 'Adversaire', short: 'ADV', colors: ['#64748b', '#e2e8f0'], crest: 'round' };
  const topic = listTopics(ctx.catalog, ctx.state.profile.squad).find((t) => t.id === p.topicId) || { id: p.topicId, name: 'Thème', subjectId: p.subjectId };
  const out = applyPendingForfeit(ctx.state, { now: ctx.now(), rng: ctx.rng, clubs: ctx.clubs, cards: ctx.cards, catalog: ctx.catalog });
  if (!out) return false;
  ctx.setState(out.state);
  flow.current = null;
  flow.last = { result: out.result, events: out.events, mode: 'league', topic, me: myClub(ctx.state), opp, forfeit: true, forfeitReason: 'reload', review: [] };
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
    result, events: out.events, mode: c.mode, topic: c.topic, me: c.me, opp: c.opp, forfeit,
    review: result.answers.filter((a) => !a.correct).map((a) => ({ prompt: a.prompt, answer: a.answer, given: a.given, timedOut: a.timedOut, explain: byId.get(a.id)?.explain || '' })),
  };
  flow.current = null;
  await ctx.save(); // never throws; a failure shows its own toast and the next save retries
  return flow.last;
}
