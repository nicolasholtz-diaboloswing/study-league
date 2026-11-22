import { test, eq, assert } from './runner.js';
import { createRng } from '../js/core/rng.js';
import {
  normalizeAnswer, checkAnswer, acceptedAnswers, displayAnswer, listTopics, listSubjects, expandVerbs,
  loadCatalog, loadTopicQuestions, pickQuestions,
} from '../js/core/questions.js';
import { MATCH_QUESTIONS as NQ } from '../js/config.js';
import { fetchJson, FILES } from './fixtures.js';

test('normalizeAnswer: trim, case, spaces, apostrophes; accents kept', () => {
  eq(normalizeAnswer('  Hello   World '), 'hello world');
  eq(normalizeAnswer('l’été'), "l'été");
  assert(normalizeAnswer('été') !== normalizeAnswer('ete'));
  eq(normalizeAnswer(null), '');
});

test('checkAnswer: string answer, array answers, empty, null', () => {
  const one = { type: 'input', answer: 'went' };
  const many = { type: 'input', answer: ['much', 'a lot of'] };
  assert(checkAnswer(one, ' WENT '));
  assert(!checkAnswer(one, 'goed'));
  assert(checkAnswer(many, 'A  lot  of'));
  assert(checkAnswer(many, 'much'));
  assert(!checkAnswer(many, ''));
  assert(!checkAnswer(many, null));
  eq(acceptedAnswers(many), ['much', 'a lot of']);
  eq(displayAnswer(many), 'much / a lot of');
  assert(checkAnswer({ type: 'input', answer: "n'est" }, 'n’est'));
  assert(!checkAnswer({ type: 'input', answer: 'eté' }, 'ete'));
});

test('listTopics: squad filtering and subject filter', async () => {
  const cat = await loadCatalog(fetchJson);
  eq(listTopics(cat, 'u13').map((t) => t.id), ['en-det', 'en-verbs', 'fr-gram']);
  eq(listTopics(cat, 'u10').map((t) => t.id), ['en-verbs']);
  eq(listTopics(cat, 'u13', 'fr').map((t) => t.id), ['fr-gram']);
  eq(listTopics(cat, 'u13')[0].subjectName, 'English');
  eq(listSubjects(cat, 'u10').map((s) => s.id), ['en']);
});

const SAMPLE_VERBS = [
  { base: 'go', past: 'went', pp: 'gone' }, { base: 'eat', past: 'ate', pp: 'eaten' }, { base: 'see', past: 'saw', pp: 'seen' },
  { base: 'write', past: 'wrote', pp: 'written' }, { base: 'buy', past: 'bought', pp: 'bought' },
  { base: 'dive', past: ['dived', 'dove'], pp: ['dived', 'dove'] }, { base: 'get', past: 'got', pp: ['gotten', 'got'] },
  { base: 'put', past: 'put', pp: 'put' }, { base: 'come', past: 'came', pp: 'come' }, { base: 'be', past: ['was', 'were'], pp: 'been' },
];

/** forms that are a past participle and never a past simple in the file */
function ppOnlyForms(verbs) {
  const past = new Set(verbs.flatMap((v) => [].concat(v.past)).map(normalizeAnswer));
  return new Set(verbs.flatMap((v) => [].concat(v.pp)).map(normalizeAnswer).filter((f) => !past.has(f)));
}

function checkVerbQuestions(verbs, qs) {
  eq(qs.length, verbs.length * 2);
  const ppOnly = ppOnlyForms(verbs);
  for (const [i, q] of qs.entries()) {
    eq(q.label, 'Past simple', q.id);
    assert(!/participle|have/i.test(q.prompt) && !/participle/i.test(q.explain), q.id + ' no participle shown');
    const v = verbs[Math.floor(i / 2)];
    if (q.type !== 'mcq') continue;
    const accepted = [].concat(v.past).map(normalizeAnswer);
    eq(q.choices.length, 4, q.id);
    eq(new Set(q.choices.map(normalizeAnswer)).size, 4, q.id);
    eq(q.choices.filter((c) => c === q.answer).length, 1, q.id);
    eq(q.choices.filter((c) => accepted.includes(normalizeAnswer(c))).length, 1, q.id + ' only one accepted past form among the choices');
    for (const c of q.choices) assert(!ppOnly.has(normalizeAnswer(c)), `${q.id}: participle-only form "${c}" in ${q.choices}`);
  }
}

test('expandVerbs: 2 questions per verb, both about the past simple, ids stable, deterministic', () => {
  const qs = expandVerbs(FILES['data/en/verbs.json']);
  eq(qs.length, 12);
  eq(new Set(qs.map((q) => q.id)).size, 12);
  eq(qs.slice(0, 2).map((q) => q.id), ['en-verbs-go-past', 'en-verbs-go-form']);
  assert(!qs.some((q) => q.id.endsWith('-pp')));
  eq(expandVerbs(FILES['data/en/verbs.json']), qs, 'deterministic');
  eq(qs[0].type, 'input');
  eq(qs[0].answer, 'went');
});

test('expandVerbs: mcq has 4 distinct choices, one correct, no participle-only form (sample verbs)', () => {
  const qs = expandVerbs({ topic: 't', kind: 'verbs', verbs: SAMPLE_VERBS });
  checkVerbQuestions(SAMPLE_VERBS, qs);
  const get = qs.find((q) => q.id === 't-get-form');
  assert(!get.choices.includes('gotten'));
  const dive = qs.find((q) => q.id === 't-dive-past');
  eq(dive.answer, ['dived', 'dove']);
  const buy = qs.find((q) => q.id === 't-buy-form');
  assert(buy.choices.includes('bought') && buy.answer === 'bought');
});

test('expandVerbs: correction is base → past simple, both forms when two are accepted', () => {
  const qs = expandVerbs({ topic: 't', kind: 'verbs', verbs: SAMPLE_VERBS });
  for (const q of qs.filter((x) => x.group === 'go')) eq(q.explain, 'go → went');
  for (const q of qs.filter((x) => x.group === 'dive')) eq(q.explain, 'dive → dived / dove');
  eq(qs.find((q) => q.id === 't-be-past').explain, 'be → was / were');
});

test('expandVerbs: real data file (120 verbs) gives 240 questions with no participle-only choice', async () => {
  const res = await fetch('../data/en/irregular-verbs.json');
  assert(res.ok, 'fetch irregular-verbs.json');
  const file = await res.json();
  const qs = expandVerbs(file);
  eq(file.verbs.length, 120);
  eq(qs.length, 240);
  eq(new Set(qs.map((q) => q.id)).size, 240);
  checkVerbQuestions(file.verbs, qs);
});

test('pickQuestions: a 10-question match on the real irregular verbs has 10 distinct verbs', async () => {
  const file = await (await fetch('../data/en/irregular-verbs.json')).json();
  const pool = expandVerbs(file);
  for (let seed = 1; seed <= 20; seed++) {
    const picked = pickQuestions(pool, { n: 10, division: seed % 5, rng: createRng(seed) });
    eq(new Set(picked.map((q) => q.group)).size, 10, 'seed ' + seed);
  }
});

test('expandVerbs: duplicate bases get unique ids', () => {
  const qs = expandVerbs({ topic: 't', kind: 'verbs', verbs: [{ base: 'lie', past: 'lay', pp: 'lain' }, { base: 'lie', past: 'lied', pp: 'lied' }] });
  eq(new Set(qs.map((q) => q.id)).size, 4);
});

test('loadTopicQuestions tags topicId and expands verbs', async () => {
  const cat = await loadCatalog(fetchJson);
  const topics = listTopics(cat, 'u13');
  const det = await loadTopicQuestions(fetchJson, topics[0]);
  eq(det.length, 30);
  assert(det.every((q) => q.topicId === 'en-det'));
  const verbs = await loadTopicQuestions(fetchJson, topics[1]);
  eq(verbs.length, 12);
  assert(verbs.every((q) => q.topicId === 'en-verbs'));
});

test('pickQuestions: 10 unique ids, mcq choices shuffled but intact', async () => {
  const cat = await loadCatalog(fetchJson);
  const pool = await loadTopicQuestions(fetchJson, listTopics(cat, 'u13')[0]);
  const rng = createRng(5);
  const picked = pickQuestions(pool, { n: 10, division: 0, rng });
  eq(picked.length, 10);
  eq(new Set(picked.map((q) => q.id)).size, 10);
  for (const q of picked.filter((x) => x.choices)) eq(q.choices.slice().sort(), pool.find((p) => p.id === q.id).choices.slice().sort());
});

test('pickQuestions: fewer than n available returns what exists, no duplicates in pool', () => {
  const pool = [1, 2, 3].map((i) => ({ id: 'q' + i, level: 1, type: 'input', answer: 'x', prompt: 'p' }));
  pool.push(pool[0]);
  eq(pickQuestions(pool, { n: 10, rng: createRng(1) }).length, 3);
});

test('pickQuestions: prefers unseen, then wrong, then least recently seen', () => {
  const pool = Array.from({ length: 12 }, (_, i) => ({ id: 'q' + i, level: 1, type: 'input', answer: 'x', prompt: 'p' }));
  const history = {};
  for (let i = 0; i < 12; i++) history[`q${i}`] = { seen: 1, lastAt: 1000 + i, lastCorrect: true };
  delete history.q10; delete history.q11;                 // unseen
  history.q5.lastCorrect = false; history.q7.lastCorrect = false; // wrong
  const ids = pickQuestions(pool, { n: 6, history, rng: createRng(2) }).map((q) => q.id).sort();
  // 2 unseen + 2 wrong + 2 least recently seen correct (q0, q1)
  eq(ids, ['q0', 'q1', 'q10', 'q11', 'q5', 'q7']);
});

test('pickQuestions: higher division shifts the level mix upward', () => {
  const pool = [];
  for (let l = 1; l <= 3; l++) for (let i = 0; i < 40; i++) pool.push({ id: `l${l}-${i}`, level: l, type: 'input', answer: 'x', prompt: 'p' });
  const avg = (div) => {
    let sum = 0, n = 0;
    for (let s = 0; s < 60; s++) for (const q of pickQuestions(pool, { n: 10, division: div, rng: createRng(s) })) { sum += q.level; n++; }
    return sum / n;
  };
  const lo = avg(0), hi = avg(4);
  assert(hi > lo + 0.4, `lo ${lo} hi ${hi}`);
});

function bigPool(n, prefix = 'b') {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, topicId: 't', level: (i % 3) + 1, type: 'input', answer: 'x', prompt: 'p' }));
}

function playRounds(pool, rounds, division, seed, wrongEvery = 0) {
  const rng = createRng(seed);
  const history = {};
  const matches = [];
  for (let m = 0; m < rounds; m++) {
    const picked = pickQuestions(pool, { n: NQ, history, division, rng });
    matches.push(picked.map((q) => q.id));
    picked.forEach((q, i) => {
      const h = history[q.id] || { seen: 0 };
      history[q.id] = { seen: h.seen + 1, lastAt: 1000 + m, lastCorrect: !(wrongEvery && i % wrongEvery === 0) };
    });
  }
  return matches;
}

test('pickQuestions: 15 consecutive matches on a 150-question topic share no question (MATCH_QUESTIONS each) (every division)', () => {
  for (const division of [null, 0, 2, 4]) {
    for (let seed = 1; seed <= 5; seed++) {
      const matches = playRounds(bigPool(15 * NQ), 15, division, seed, 3);
      const all = matches.flat();
      eq(all.length, 15 * NQ);
      eq(new Set(all).size, 15 * NQ, `division ${division} seed ${seed}`);
    }
  }
});

test('pickQuestions: once exhausted, wrong-last-time come back first, then least recently seen', () => {
  const pool = bigPool(30);
  const history = {};
  pool.forEach((q, i) => { history[q.id] = { seen: 1, lastAt: 1000 + (i < NQ ? 0 : 1), lastCorrect: !(i === 20 || i === 25) }; });
  const ids = pickQuestions(pool, { n: NQ, history, rng: createRng(3) }).map((q) => q.id);
  assert(ids.includes('b20') && ids.includes('b25'), 'wrong ones first');
  // the others come from the older group (lastAt 1000)
  const others = ids.filter((id) => id !== 'b20' && id !== 'b25');
  assert(others.every((id) => Number(id.slice(1)) < NQ), others.join());
  // a match after a full cycle of the pool replays match 1 (the oldest)
  const cycle = 7;
  const matches = playRounds(bigPool(cycle * NQ), cycle + 1, 4, 9);
  eq(matches[cycle].slice().sort(), matches[0].slice().sort());
});

test('pickQuestions: unseen questions beat the level mix', () => {
  // all level-3 questions already seen, level-1 unseen: a division-4 match (wants level 3) still takes unseen first
  const pool = bigPool(6 * NQ);
  const history = {};
  for (const q of pool) if (q.level === 3) history[q.id] = { seen: 1, lastAt: 5, lastCorrect: true };
  const picked = pickQuestions(pool, { n: NQ, history, division: 4, rng: createRng(2) });
  assert(picked.every((q) => q.level !== 3), 'no repeat while unseen remain');
});

// ---------- verbs: model sentences, one question per verb, typed options ----------
import { optionChoices } from '../js/core/questions.js';

test('expandVerbs: model sentences without grammar jargon, exactly one ___, label, group = verb', () => {
  const qs = expandVerbs(FILES['data/en/verbs.json']);
  for (const q of qs) {
    eq(q.prompt.split('___').length - 1, 1, q.id + ' one blank');
    assert(!/participle|simple of/i.test(q.prompt), q.id + ' no jargon in prompt');
    assert(typeof q.group === 'string' && q.id.includes(`-${q.group}-`), q.id + ' group');
  }
  const go = qs.filter((q) => q.group === 'go');
  eq(go.map((q) => q.id), ['en-verbs-go-past', 'en-verbs-go-form']);
  eq([go[0].prompt, go[0].label], ['Yesterday, I ___ . (to go)', 'Past simple']);
  assert(go[1].prompt.startsWith('Which one is correct?'), go[1].prompt);
  assert(go[1].prompt.endsWith('(to go)'));
});

function verbPool(n) {
  const verbs = Array.from({ length: n }, (_, i) => ({ base: 'v' + i, past: 'p' + i, pp: 'x' + i, level: (i % 3) + 1 }));
  return expandVerbs({ topic: 'tv', kind: 'verbs', verbs });
}

test('pickQuestions: never two questions about the same verb in a match while others exist', () => {
  const pool = verbPool(25);
  for (let seed = 1; seed <= 40; seed++) {
    const picked = pickQuestions(pool, { n: NQ, division: seed % 5, rng: createRng(seed) });
    eq(picked.length, NQ);
    eq(new Set(picked.map((q) => q.group)).size, NQ, 'seed ' + seed);
  }
});

test('pickQuestions: with fewer verbs than questions, groups repeat only as a last resort', () => {
  const picked = pickQuestions(verbPool(6), { n: NQ, rng: createRng(4) });
  eq(picked.length, NQ);
  eq(new Set(picked.map((q) => q.id)).size, NQ);
  eq(new Set(picked.map((q) => q.group)).size, 6);
});

test('pickQuestions: questions without group are unaffected', () => {
  const pool = Array.from({ length: 20 }, (_, i) => ({ id: 'n' + i, level: 1, type: 'input', answer: 'x', prompt: 'p' }));
  eq(pickQuestions(pool, { n: NQ, rng: createRng(1) }).length, NQ);
});

test('optionChoices: typed question with "(a / b)" whose answers are among the options becomes buttons', () => {
  const q = (prompt, answer) => ({ id: 'x', type: 'input', prompt, answer });
  eq(optionChoices(q('Look at ___ cat! (this / these)', 'this')), ['this', 'these']);
  eq(optionChoices(q('___ you ever seen it? (have / had)', 'Had')), ['have', 'had']);
  eq(optionChoices(q('She has ___ friends. (a few / a little / many / much)', ['a few'])), ['a few', 'a little', 'many', 'much']);
  eq(optionChoices(q('Some walk and ___ come by bus. (others / other)', ['others', 'the others'])), null, 'an accepted answer outside the options');
  eq(optionChoices(q('I ___ it. (already / start)', 'have already seen')), null, 'hint only');
  eq(optionChoices(q('Yesterday, I ___ . (to go)', 'went')), null, 'single hint');
  eq(optionChoices(q('Pick (a / b / c / d / e)', 'a')), null, 'more than 4');
  eq(optionChoices(q('Pick (a / )', 'a')), null, 'empty option');
  eq(optionChoices(q('No parenthesis ___', 'a')), null);
  eq(optionChoices({ id: 'm', type: 'mcq', prompt: 'x (a / b)', answer: 'a', choices: ['a', 'b'] }), null, 'mcq untouched');
});
