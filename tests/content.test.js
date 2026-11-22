// Checks on the real content: data/subjects.json and every file it references (nothing is mocked).
import { test, assert } from './runner.js';
import { normalizeAnswer, acceptedAnswers, questionsFromFile } from '../js/core/questions.js';

const KEYS = ['id', 'level', 'type', 'prompt', 'choices', 'answer', 'explain'];
const DECIMAL = /^-?\d+[,.]\d+$/;

const catalog = await (await fetch('../data/subjects.json')).json();
const subjects = catalog.subjects || [];
const topics = subjects.flatMap((s) => (s.topics || []).map((t) => ({ ...t, subjectId: s.id })));

// each file once; null when it cannot be read
const files = new Map();
for (const f of new Set(topics.map((t) => t.file))) {
  try {
    const res = await fetch('../' + f);
    files.set(f, res.ok ? await res.json() : null);
  } catch { files.set(f, null); }
}

const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';
const report = (errors) => assert(errors.length === 0, `${errors.length} problem(s) : ` + errors.slice(0, 60).join(' ; ') + (errors.length > 60 ? ' ; ...' : ''));

test('content: subject and topic ids are unique, topics have a name, a file and squads', () => {
  const errors = [];
  const seen = new Set();
  for (const s of subjects) {
    if (seen.has('s:' + s.id)) errors.push(`subject id twice: ${s.id}`);
    seen.add('s:' + s.id);
    if (!nonEmpty(s.name) || !nonEmpty(s.icon)) errors.push(`subject ${s.id}: name or icon missing`);
  }
  for (const t of topics) {
    if (seen.has('t:' + t.id)) errors.push(`topic id twice: ${t.id}`);
    seen.add('t:' + t.id);
    if (!nonEmpty(t.name) || !nonEmpty(t.file)) errors.push(`topic ${t.id}: name or file missing`);
    if (!Array.isArray(t.squads) || !t.squads.length || t.squads.some((q) => !['u10', 'u13'].includes(q))) errors.push(`topic ${t.id}: bad squads`);
    if (t.group !== undefined && !nonEmpty(t.group)) errors.push(`topic ${t.id}: empty group`);
  }
  report(errors);
});

test('content: every file of the catalog exists and its topic id is one of the topics using it', () => {
  const errors = [];
  for (const [f, file] of files) {
    if (!file) { errors.push(`${f}: missing or unreadable (used by ${topics.filter((t) => t.file === f).map((t) => t.id).join(', ')})`); continue; }
    const users = topics.filter((t) => t.file === f).map((t) => t.id);
    if (!users.includes(file.topic)) errors.push(`${f}: topic "${file.topic}" is not one of ${users.join(', ')}`);
  }
  report(errors);
});

test('content: standard files: keys, level, type, prompt, explanation, choices and answers', () => {
  const errors = [];
  for (const [f, file] of files) {
    if (!file || file.kind === 'verbs') continue;
    if (!Array.isArray(file.questions) || !file.questions.length) { errors.push(`${f}: no questions`); continue; }
    for (const q of file.questions) {
      const w = `${f} ${q.id}`;
      for (const k of Object.keys(q)) if (!KEYS.includes(k)) errors.push(`${w}: unknown key "${k}"`);
      if (!nonEmpty(q.id)) errors.push(`${f}: question without id`);
      if (![1, 2, 3].includes(q.level)) errors.push(`${w}: level ${JSON.stringify(q.level)}`);
      if (!nonEmpty(q.prompt)) errors.push(`${w}: empty prompt`);
      if (!nonEmpty(q.explain)) errors.push(`${w}: empty explanation`);
      if (q.type === 'mcq') {
        const norm = Array.isArray(q.choices) ? q.choices.map(normalizeAnswer) : [];
        if (norm.length !== 4 || norm.some((c) => !c)) errors.push(`${w}: mcq needs exactly 4 non-empty choices`);
        else if (new Set(norm).size !== 4) errors.push(`${w}: duplicate choices ${JSON.stringify(q.choices)}`);
        if (typeof q.answer !== 'string' || !norm.includes(normalizeAnswer(q.answer))) errors.push(`${w}: answer ${JSON.stringify(q.answer)} is not one of the choices`);
      } else if (q.type === 'input') {
        if (q.choices !== undefined) errors.push(`${w}: input question with choices`);
        const acc = q.answer === undefined ? [] : acceptedAnswers(q);
        const norm = acc.map(normalizeAnswer);
        if (!acc.length || norm.some((a) => !a)) errors.push(`${w}: input needs at least one non-empty accepted answer`);
        for (const a of norm) {
          if (!DECIMAL.test(a)) continue;
          const twin = a.includes(',') ? a.replace(',', '.') : a.replace('.', ',');
          if (!norm.includes(twin)) errors.push(`${w}: decimal "${a}" without its twin "${twin}"`);
        }
      } else errors.push(`${w}: type ${JSON.stringify(q.type)}`);
    }
  }
  report(errors);
});

test('content: verb files have a base, a past and a participle for each verb', () => {
  const errors = [];
  for (const [f, file] of files) {
    if (!file || file.kind !== 'verbs') continue;
    if (!Array.isArray(file.verbs) || !file.verbs.length) errors.push(`${f}: no verbs`);
    for (const v of file.verbs || []) {
      const forms = (x) => (x === undefined ? [] : [].concat(x));
      if (!nonEmpty(v.base)) errors.push(`${f}: verb without base`);
      for (const k of ['past', 'pp']) if (!forms(v[k]).length || forms(v[k]).some((x) => !nonEmpty(x))) errors.push(`${f} ${v.base}: bad ${k}`);
      if (v.level !== undefined && ![1, 2, 3].includes(v.level)) errors.push(`${f} ${v.base}: level ${v.level}`);
    }
  }
  report(errors);
});

test('content: question ids are unique across the whole catalog (verb files expanded with the forms of each topic)', () => {
  const errors = [];
  const owner = new Map();
  for (const t of topics) {
    const file = files.get(t.file);
    if (!file) continue;
    for (const q of questionsFromFile(file, t.id, t.forms)) {
      if (owner.has(q.id)) errors.push(`${q.id}: in ${owner.get(q.id)} and ${t.id}`);
      else owner.set(q.id, t.id);
      if (q.type === 'mcq') { // generated mcq: same rules as the written ones
        const norm = q.choices.map(normalizeAnswer);
        if (new Set(norm).size !== 4 || !norm.includes(normalizeAnswer(q.answer))) errors.push(`${q.id}: bad generated choices ${JSON.stringify(q.choices)}`);
      } else if (!acceptedAnswers(q).length) errors.push(`${q.id}: no answer`);
    }
  }
  report(errors);
});
