// One match: MATCH_QUESTIONS questions = as many "minutes" (9', 18' ... 90' for 10). Mutable match object, driven by the view.
import { TIMER_MCQ_SECONDS, TIMER_INPUT_SECONDS, GOAL_EVERY_N_CORRECT } from '../config.js';
import { checkAnswer, displayAnswer } from './questions.js';

export const PRACTICE_OPPONENT = { id: 'practice', name: 'Équipe d\'entraînement', strength: 0.5 };

/** Seconds allowed for a question type. */
export function timeLimitSeconds(q) {
  return q.type === 'input' ? TIMER_INPUT_SECONDS : TIMER_MCQ_SECONDS;
}

/** Speed bonus 0..5 XP for a correct answer, from the share of the question's time limit used. */
export function speedBonus(ms, q) {
  const f = ms / (timeLimitSeconds(q) * 1000);
  if (f <= 0.1) return 5;
  if (f <= 0.2) return 4;
  if (f <= 0.35) return 3;
  if (f <= 0.5) return 2;
  if (f <= 0.7) return 1;
  return 0;
}

/** Minute shown for question index i of total: 90 / total per question (9', 18' ... 90' for 10). */
export function minuteOf(index, total) {
  return Math.round(((index + 1) * 90) / total);
}

/**
 * Create a match.
 *  mode: 'league' | 'training'
 *  questions: from pickQuestions
 *  opponent: {id, name, strength} (league). Training uses a neutral practice opponent.
 *  topicId/subjectId: the one topic (and its subject) being played
 *  division: 0..4 (league)
 *  coachPick: true if the chosen topic was the coach's pick (+50% coins)
 *  rng: seeded rng (used for goals against)
 *  now: timestamp ms (stored as startedAt)
 */
export function createMatch({
  mode = 'league', questions, opponent = null, topicId, subjectId = null,
  division = 0, coachPick = false, rng, now,
}) {
  if (!questions || !questions.length) throw new Error('createMatch: no questions');
  return {
    mode,
    timed: mode === 'league',
    topicId, subjectId, division, coachPick,
    opponent: opponent || PRACTICE_OPPONENT,
    questions,
    index: 0,
    correct: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    answers: [],
    finished: false,
    startedAt: now,
    rng,
  };
}

/** The question to show now, or null when finished. */
export function currentQuestion(match) {
  return match.finished ? null : match.questions[match.index];
}

/** Time limit in ms for the current question, or null if the match is untimed (training). */
export function currentTimeLimitMs(match) {
  const q = currentQuestion(match);
  return q && match.timed ? timeLimitSeconds(q) * 1000 : null;
}

/** Match minute of the current question (9, 18, ... 90). */
export function currentMinute(match) {
  return minuteOf(Math.min(match.index, match.questions.length - 1), match.questions.length);
}

/**
 * Answer the current question.
 *  given: the choice / typed text, or null for a timeout
 *  elapsedMs: time taken. In a timed match, elapsedMs above the limit counts as a timeout.
 * Returns {
 *   correct, timedOut, correctAnswer (display string), explanation, speedBonus,
 *   goalFor, goalAgainst, attack: {charge, max}, score: {for, against},
 *   minute, finished
 * }
 */
export function answerQuestion(match, given, elapsedMs) {
  if (match.finished) throw new Error('answerQuestion: match already finished');
  const q = match.questions[match.index];
  const minute = minuteOf(match.index, match.questions.length);
  const limit = match.timed ? timeLimitSeconds(q) * 1000 : null;
  const timedOut = given == null || (limit != null && elapsedMs > limit);
  const correct = !timedOut && checkAnswer(q, given);
  let goalFor = false;
  let goalAgainst = false;
  let bonus = 0;
  if (correct) {
    match.correct += 1;
    bonus = speedBonus(elapsedMs, q);
    if (match.correct % GOAL_EVERY_N_CORRECT === 0) {
      goalFor = true;
      match.goalsFor += 1;
    }
  } else if (match.rng.chance(match.opponent.strength)) {
    goalAgainst = true;
    match.goalsAgainst += 1;
  }
  match.answers.push({
    id: q.id,
    topicId: q.topicId,
    correct,
    timedOut,
    given: given == null ? null : String(given),
    ms: Math.max(0, Math.round(elapsedMs)),
    speedBonus: bonus,
    minute,
    goalFor,
    goalAgainst,
    prompt: q.prompt,
    answer: displayAnswer(q),
  });
  match.index += 1;
  if (match.index >= match.questions.length) match.finished = true;
  return {
    correct,
    timedOut,
    correctAnswer: displayAnswer(q),
    explanation: q.explain || '',
    speedBonus: bonus,
    goalFor,
    goalAgainst,
    attack: { charge: match.correct % GOAL_EVERY_N_CORRECT, max: GOAL_EVERY_N_CORRECT },
    score: { for: match.goalsFor, against: match.goalsAgainst },
    minute,
    finished: match.finished,
  };
}

/** Same as answerQuestion(match, null, limit): the timer ran out. */
export function timeoutQuestion(match) {
  const ms = currentTimeLimitMs(match) ?? 0;
  return answerQuestion(match, null, ms);
}

export function outcomeOf(goalsFor, goalsAgainst) {
  return goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D';
}

/**
 * Result object for a finished match (input of applyResult).
 * now: timestamp ms stored as playedAt.
 */
export function summarizeMatch(match, now) {
  if (!match.finished) throw new Error('summarizeMatch: match not finished');
  const total = match.questions.length;
  return {
    mode: match.mode,
    topicId: match.topicId,
    subjectId: match.subjectId,
    division: match.division,
    coachPick: match.coachPick,
    opponent: { id: match.opponent.id, name: match.opponent.name, strength: match.opponent.strength },
    goalsFor: match.goalsFor,
    goalsAgainst: match.goalsAgainst,
    outcome: outcomeOf(match.goalsFor, match.goalsAgainst),
    correct: match.correct,
    total,
    accuracy: match.correct / total,
    perfect: match.correct === total,
    cleanSheet: match.goalsAgainst === 0,
    speedBonus: match.answers.reduce((s, a) => s + a.speedBonus, 0),
    durationMs: match.answers.reduce((s, a) => s + a.ms, 0),
    playedAt: now,
    answers: match.answers.map((a) => ({ ...a })),
  };
}
