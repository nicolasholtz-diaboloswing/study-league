import { test, eq, assert } from './runner.js';
import { MATCH_QUESTIONS as NQ, GOAL_EVERY_N_CORRECT as N } from '../js/config.js';
import { createRng } from '../js/core/rng.js';
import { acceptedAnswers } from '../js/core/questions.js';
import {
  createMatch, answerQuestion, timeoutQuestion, summarizeMatch, currentQuestion, currentMinute,
  currentTimeLimitMs, minuteOf, speedBonus, outcomeOf,
} from '../js/core/match.js';

function mk(strength = 0.5, mode = 'league', n = NQ) {
  const questions = Array.from({ length: n }, (_, i) => (i % 2
    ? { id: 'q' + i, topicId: 't1', level: 1, type: 'input', prompt: 'P' + i, answer: ['yes', 'oui'], explain: 'E' + i }
    : { id: 'q' + i, topicId: 't1', level: 1, type: 'mcq', prompt: 'P' + i, choices: ['a', 'b', 'c', 'd'], answer: 'b', explain: 'E' + i }));
  return createMatch({
    mode, questions, opponent: { id: 'c01', name: 'Club A', strength }, topicId: 't1', subjectId: 'en',
    division: 0, rng: createRng(1), now: 1000,
  });
}
const right = (m) => acceptedAnswers(currentQuestion(m))[0];

test('match: all correct = NQ/N goals, attack meter has N steps, no goals against', () => {
  const m = mk(1);
  const goals = [];
  const charges = [];
  while (!m.finished) { const r = answerQuestion(m, right(m), 2000); goals.push(r.goalFor); charges.push(r.attack.charge); }
  eq(goals, Array.from({ length: NQ }, (_, i) => (i + 1) % N === 0));
  eq(charges, Array.from({ length: NQ }, (_, i) => (i + 1) % N));
  eq(m.goalsFor, Math.floor(NQ / N));
  eq(m.goalsAgainst, 0);
  const res = summarizeMatch(m, 5000);
  eq([res.outcome, res.perfect, res.cleanSheet, res.correct, res.total], ['W', true, true, NQ, NQ]);
});

test('match: correct answers are counted across wrong ones (every Nth correct scores)', () => {
  const m = mk(0);
  // wrong answers between correct ones do not reset the count
  const seq = [];
  for (let i = 0; seq.length < NQ; i++) seq.push(i % 3 !== 1);
  const goalsAt = [];
  let correct = 0;
  for (const ok of seq) {
    const g = answerQuestion(m, ok ? right(m) : 'zzz', 1000).goalFor;
    if (ok) correct++;
    goalsAt.push([ok, g, correct]);
  }
  for (const [ok, g, c] of goalsAt) eq(g, ok && c % N === 0);
  eq(m.goalsFor, Math.floor(correct / N));
});

test('match: wrong answers concede with probability = strength (0 never, 1 always)', () => {
  const never = mk(0), always = mk(1);
  while (!never.finished) answerQuestion(never, 'zzz', 100);
  while (!always.finished) answerQuestion(always, 'zzz', 100);
  eq(never.goalsAgainst, 0);
  eq(always.goalsAgainst, NQ);
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
  eq([r.correctAnswer, r.explanation, r.minute], ['b', 'E0', 90 / NQ]);
  const r2 = answerQuestion(m, 'zzz', 100);
  eq(r2.correctAnswer, 'yes / oui');
});

test('match: minutes, limits, training is untimed with neutral opponent', () => {
  eq([0, 1, 9].map((i) => minuteOf(i, 10)), [9, 18, 90]);
  const m = mk(0.5);
  eq(currentMinute(m), 90 / NQ);
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
  eq(res.durationMs, NQ * 1000);
  eq(res.speedBonus, NQ * speedBonus(1000, { type: 'mcq' }));
  eq(res.answers.length, NQ);
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

// ---------- goals per division, "every error concedes" (cup flag) ----------
const mkWith = (opts) => createMatch({ mode: 'league', questions: mk(0).questions, opponent: { id: 'c01', name: 'Club A', strength: opts.strength ?? 0 }, topicId: 't1', subjectId: 'en', division: 0, rng: createRng(1), now: 1000, ...opts });

test('goalEvery: every Nth correct answer scores, the attack meter has that many steps, stored on the match', () => {
  for (const g of [2, 3, 4, 5]) {
    const m = mkWith({ goalEvery: g });
    eq(m.goalEvery, g);
    const charges = [];
    while (!m.finished) { const r = answerQuestion(m, right(m), 2000); charges.push([r.attack.charge, r.attack.max]); }
    eq(m.goalsFor, Math.floor(NQ / g), `goalEvery ${g}`);
    eq(charges.map((c) => c[1]), Array(NQ).fill(g));
    eq(charges.map((c) => c[0]), Array.from({ length: NQ }, (_, i) => (i + 1) % g));
  }
  eq(mk(0).goalEvery, N, 'default is GOAL_EVERY_N_CORRECT (training)');
});

test('league and cup matches are timed, training is not; a cup match carries its cupId into the summary', () => {
  eq([mk(0, 'league').timed, mk(0, 'training').timed, mkWith({ mode: 'cup', cupId: 'league-cup' }).timed], [true, false, true]);
  const m = mkWith({ mode: 'cup', cupId: 'league-cup' });
  while (!m.finished) answerQuestion(m, right(m), 100);
  eq([summarizeMatch(m, 0).mode, summarizeMatch(m, 0).cupId], ['cup', 'league-cup']);
  const plain = mk(0);
  while (!plain.finished) answerQuestion(plain, right(plain), 100);
  assert(!('cupId' in summarizeMatch(plain, 0)));
});

test('concedeAll (Coupe du monde): every wrong answer or timeout is a goal against, even when the strength is 0, and it draws no random number', () => {
  const m = mkWith({ concedeAll: true });
  const r1 = answerQuestion(m, 'zzz', 100);
  const r2 = timeoutQuestion(m);
  eq([r1.goalAgainst, r2.goalAgainst, m.goalsAgainst], [true, true, 2]);
  const r3 = answerQuestion(m, right(m), 100);
  eq([r3.goalAgainst, m.goalsAgainst], [false, 2], 'a correct answer never concedes');
  while (!m.finished) answerQuestion(m, 'zzz', 100);
  eq(m.goalsAgainst, NQ - 1);
  eq(m.rng.next(), createRng(1).next());
});

test('without concedeAll the strength decides (default), and no match carries a difficulty any more', () => {
  const m = mkWith({});
  eq(m.concedeAll, false);
  while (!m.finished) answerQuestion(m, 'zzz', 100);
  eq(m.goalsAgainst, 0);
  assert(!('difficulty' in m) && !('difficulty' in summarizeMatch(m, 0)));
});

test('squad u10: "ê" and "e" are the same typed letter in a match; u13 and no squad stay strict', () => {
  const qs = [{ id: 'q', topicId: 't', level: 1, type: 'input', prompt: 'Vous ___ (être)', answer: 'êtes', explain: '' }];
  const play = (squad, given) => {
    const m = createMatch({ mode: 'training', questions: qs, topicId: 't', squad, rng: createRng(1), now: 0 });
    return answerQuestion(m, given, 100).correct;
  };
  eq([play('u10', 'etes'), play('u10', 'êtes'), play('u10', 'ÊTES'), play('u13', 'etes'), play(null, 'etes'), play('u13', 'êtes')], [true, true, true, false, false, true]);
  eq([play('u10', 'ètes'), play('u10', 'étes')], [false, false], 'other accents still count');
});
