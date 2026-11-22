import { test, eq, assert } from './runner.js';
import { createRng } from '../js/core/rng.js';
import { acceptedAnswers } from '../js/core/questions.js';
import {
  createMatch, answerQuestion, timeoutQuestion, summarizeMatch, currentQuestion, currentMinute,
  currentTimeLimitMs, minuteOf, speedBonus, outcomeOf,
} from '../js/core/match.js';

function mk(strength = 0.5, mode = 'league', n = 15) {
  const questions = Array.from({ length: n }, (_, i) => (i % 2
    ? { id: 'q' + i, topicId: 't1', level: 1, type: 'input', prompt: 'P' + i, answer: ['yes', 'oui'], explain: 'E' + i }
    : { id: 'q' + i, topicId: 't1', level: 1, type: 'mcq', prompt: 'P' + i, choices: ['a', 'b', 'c', 'd'], answer: 'b', explain: 'E' + i }));
  return createMatch({
    mode, questions, opponent: { id: 'c01', name: 'Club A', strength }, topicId: 't1', subjectId: 'en',
    division: 0, rng: createRng(1), now: 1000,
  });
}
const right = (m) => acceptedAnswers(currentQuestion(m))[0];

test('match: 15/15 correct = 5 goals, attack meter has 3 steps, no goals against', () => {
  const m = mk(1);
  const goals = [];
  const charges = [];
  while (!m.finished) { const r = answerQuestion(m, right(m), 2000); goals.push(r.goalFor); charges.push(r.attack.charge); }
  eq(goals, [false, false, true, false, false, true, false, false, true, false, false, true, false, false, true]);
  eq(charges, [1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0]);
  eq(m.goalsFor, 5);
  eq(m.goalsAgainst, 0);
  const res = summarizeMatch(m, 5000);
  eq([res.outcome, res.perfect, res.cleanSheet, res.correct, res.total], ['W', true, true, 15, 15]);
});

test('match: correct answers are counted across wrong ones (every 3rd correct scores)', () => {
  const m = mk(0);
  const seq = [true, false, true, true, false, true, true, true, false, false, false, false, false, false, false];
  const goalsAt = [];
  for (const ok of seq) goalsAt.push(answerQuestion(m, ok ? right(m) : 'zzz', 1000).goalFor);
  eq(goalsAt.filter(Boolean).length, 2);
  eq(goalsAt[3], true);   // 3rd correct
  eq(goalsAt[7], true);   // 6th correct
  eq(m.goalsFor, 2);
});

test('match: wrong answers concede with probability = strength (0 never, 1 always)', () => {
  const never = mk(0), always = mk(1);
  while (!never.finished) answerQuestion(never, 'zzz', 100);
  while (!always.finished) answerQuestion(always, 'zzz', 100);
  eq(never.goalsAgainst, 0);
  eq(always.goalsAgainst, 15);
  eq(summarizeMatch(always, 0).outcome, 'L');
  eq(summarizeMatch(never, 0).outcome, 'D');
});

test('match: concession rate is close to strength over many wrong answers', () => {
  let conceded = 0, wrong = 0;
  for (let s = 0; s < 60; s++) {
    const m = mk(0.7);
    m.rng = createRng(s);
    while (!m.finished) { answerQuestion(m, 'zzz', 100); wrong++; }
    conceded += m.goalsAgainst;
  }
  assert(Math.abs(conceded / wrong - 0.7) < 0.06, String(conceded / wrong));
});

test('match: timeout and over-limit answers are wrong', () => {
  const m = mk(0);
  const r1 = timeoutQuestion(m);
  eq([r1.correct, r1.timedOut], [false, true]);
  const r2 = answerQuestion(m, right(m), 45001); // input limit 45 s
  eq([r2.correct, r2.timedOut], [false, true]);
  const r3 = answerQuestion(m, 'b', 30001);       // mcq limit 30 s
  eq(r3.correct, false);
  const r4 = answerQuestion(m, right(m), 29000);
  eq(r4.correct, true);
});

test('match: answer feedback carries correct answer and explanation', () => {
  const m = mk(0);
  const r = answerQuestion(m, 'zzz', 100);
  eq([r.correctAnswer, r.explanation, r.minute], ['b', 'E0', 6]);
  const r2 = answerQuestion(m, 'zzz', 100);
  eq(r2.correctAnswer, 'yes / oui');
});

test('match: minutes, limits, training is untimed with neutral opponent', () => {
  eq([0, 1, 14].map((i) => minuteOf(i, 15)), [6, 12, 90]);
  const m = mk(0.5);
  eq(currentMinute(m), 6);
  eq(currentTimeLimitMs(m), 30000);
  const t = createMatch({ mode: 'training', questions: m.questions, topicId: 't1', rng: createRng(2), now: 0 });
  eq(currentTimeLimitMs(t), null);
  const r = answerQuestion(t, 'b', 999999);
  eq(r.correct, true);
  eq(t.opponent.id, 'practice');
});

test('match: summarize requires a finished match, aggregates speed and time', () => {
  const m = mk(0);
  let threw = false;
  try { summarizeMatch(m, 0); } catch { threw = true; }
  assert(threw);
  while (!m.finished) answerQuestion(m, right(m), 1000);
  const res = summarizeMatch(m, 7777);
  eq(res.playedAt, 7777);
  eq(res.durationMs, 15000);
  eq(res.speedBonus, 15 * speedBonus(1000, { type: 'mcq' }));
  eq(res.answers.length, 15);
  eq(res.answers[0].topicId, 't1');
  eq(res.answers[0].prompt, 'P0');
  assert(speedBonus(100, { type: 'mcq' }) === 5 && speedBonus(29000, { type: 'mcq' }) === 0);
  eq([outcomeOf(2, 1), outcomeOf(1, 1), outcomeOf(0, 3)], ['W', 'D', 'L']);
});

test('match: answering after the end throws', () => {
  const m = mk(0, 'league', 2);
  answerQuestion(m, 'b', 1); answerQuestion(m, 'yes', 1);
  let threw = false;
  try { answerQuestion(m, 'b', 1); } catch { threw = true; }
  assert(threw);
  eq(currentQuestion(m), null);
});
