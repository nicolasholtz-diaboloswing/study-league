// Question loading, verb expansion, selection and answer checking. Pure: fetching is injected.
import { MATCH_QUESTIONS } from '../config.js';
import { createRng } from './rng.js';

// Probability weights for question level 1/2/3, per division index 0..4.
export const LEVEL_WEIGHTS = [
  [0.6, 0.3, 0.1],
  [0.45, 0.35, 0.2],
  [0.3, 0.4, 0.3],
  [0.2, 0.4, 0.4],
  [0.1, 0.4, 0.5],
];

const toArray = (v) => (Array.isArray(v) ? v : [v]);

// ---------- answers ----------

/** trim, lowercase, collapse spaces, unify apostrophes. Accents are kept (NFC). */
export function normalizeAnswer(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[‘’‛ʼ´`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** All accepted forms of a question's answer, as an array of strings. */
export function acceptedAnswers(q) {
  return toArray(q.answer).map(String);
}

/** Canonical numeric form of a typed answer ("−8,5" -> "-8.5", "4 752" -> "4752", "+3" -> "3"), or null if not purely numeric. */
export function numericKey(s) {
  const c = String(s)
    .replace(/[−–]/g, '-')
    .replace(/\s/g, '') // \s covers no-break and thin spaces
    .replace(',', '.')
    .replace(/^\+/, '');
  return /^-?\d+(\.\d+)?$/.test(c) ? c : null;
}

/** The answer as shown to the player: accepted forms joined with " / ", keeping one form per group of numeric typing variants. */
export function displayAnswer(q) {
  const seen = new Set();
  return acceptedAnswers(q)
    .filter((a) => {
      const k = numericKey(a);
      if (k === null) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(' / ');
}

/** u10 typing tolerance: "ê" and "e" are the same letter (only ê: every other accent still counts). */
const foldCircumflexE = (s) => s.replace(/ê/g, 'e');

/**
 * `given` is the player's string (a choice for mcq, typed text for input).
 * opts.squad: 'u10' treats "ê" and "e" as the same letter in typed answers; any other value (and no option) is strict.
 */
export function checkAnswer(q, given, { squad = null } = {}) {
  if (given == null) return false;
  const loose = squad === 'u10';
  const prep = (s) => (loose ? foldCircumflexE(normalizeAnswer(s)) : normalizeAnswer(s));
  const g = prep(given);
  if (g === '') return false;
  return acceptedAnswers(q).some((a) => prep(a) === g);
}

// ---------- catalog ----------

/** Load data/subjects.json. fetchJson(path) must resolve to parsed JSON. */
export async function loadCatalog(fetchJson) {
  const data = await fetchJson('data/subjects.json');
  return { subjects: data.subjects || [] };
}

/** True when `active` (state.optionalTopics, { [topicId]: ms of the last activation }) has a valid entry for the topic id: a positive number. */
export const isActivated = (active, topicId) => typeof active?.[topicId] === 'number' && Number.isFinite(active[topicId]) && active[topicId] > 0;

/**
 * Whether a topic is offered given the optional topics a player switched on (`active` = state.optionalTopics).
 * A topic without `optional: true` is compulsory (always offered); an optional one only when it is activated.
 */
export const topicAvailable = (topic, active) => !topic.optional || isActivated(active, topic.id);

/** Every topic of the catalog, flattened like listTopics but with no squad or optional filter (for looking a name up from an id). */
export function allTopics(catalog) {
  return (catalog.subjects || []).flatMap((s) => (s.topics || []).map((t) => ({ ...t, subjectId: s.id, subjectName: s.name, icon: s.icon, accents: !!s.accents })));
}

/** One topic by id, wherever it is (any squad, optional or not, switched on or not), or null. */
export const findTopic = (catalog, id) => allTopics(catalog).find((t) => t.id === id) || null;

/**
 * Topics offered to a squad, flattened. Optional subjectId filter.
 * `active` is the player's state.optionalTopics: optional topics not switched on in it are left out (none switched on when omitted).
 * Each: { id, name, file, squads, subjectId, subjectName, icon, accents } (accents: the subject shows accent keys; `group`, `forms`, `optional` are optional topic fields)
 */
export function listTopics(catalog, squad, subjectId = null, active = null) {
  return allTopics(catalog).filter((t) => (!subjectId || t.subjectId === subjectId)
    && !(squad && t.squads && !t.squads.includes(squad)) && topicAvailable(t, active));
}

/** Subjects that have at least one topic for the squad (compulsory ones and the switched-on optional ones in `active`): [{id, name, icon, topics:[...]}] */
export function listSubjects(catalog, squad, active = null) {
  return (catalog.subjects || [])
    .map((s) => ({ id: s.id, name: s.name, icon: s.icon, topics: listTopics(catalog, squad, s.id, active) }))
    .filter((s) => s.topics.length > 0);
}

/**
 * The optional topics offered to a squad (switched on or not), grouped by subject, in catalog order:
 * [{ id, name, icon, topics: [listTopics-like entries] }]. A subject with no optional topic for the squad is not listed (nothing for u10).
 */
export function listOptionalTopics(catalog, squad) {
  return (catalog.subjects || [])
    .map((s) => ({ id: s.id, name: s.name, icon: s.icon, topics: allTopics({ subjects: [s] }).filter((t) => t.optional && (!squad || !t.squads || t.squads.includes(squad))) }))
    .filter((s) => s.topics.length > 0);
}

// ---------- verbs ----------

function regularPast(base) {
  if (/e$/.test(base)) return base + 'd';
  if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ied';
  return base + 'ed';
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function thirdPerson(base) {
  if (base === 'be') return 'is';
  if (base === 'have') return 'has';
  if (/(s|sh|ch|x|z|o)$/.test(base)) return base + 'es';
  if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ies';
  return base + 's';
}

function ingForm(base) {
  if (/ie$/.test(base)) return base.slice(0, -2) + 'ying';
  if (/[^aeiou]e$/.test(base) && base !== 'be') return base.slice(0, -1) + 'ing';
  if (base.length <= 4 && /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(base)) return base + base.slice(-1) + 'ing';
  return base + 'ing';
}

/**
 * Expand a `"kind":"verbs"` file into 2 questions per verb about the past simple:
 *   <topic>-<verb>-past (input, "Yesterday, I ___ . (to go)"), <topic>-<verb>-form (mcq).
 * With `forms` containing 'pp', a third question per verb asks the past participle: <topic>-<verb>-pp (input,
 * "I have ___ . (to go)"), and the correction of the three becomes "base → past → pp" (several forms joined by " / ").
 * Ids and distractors are stable (derived from the id). The `pp` field is never offered in the choices of the mcq:
 * a form that is only a past participle is never proposed there.
 */
export function expandVerbs(file, topicId = file.topic, forms = ['past']) {
  const withPp = toArray(forms).includes('pp');
  const verbs = file.verbs || [];
  const used = new Map();
  const infos = verbs.map((v) => {
    let key = slug(v.base);
    const n = (used.get(key) || 0) + 1;
    used.set(key, n);
    if (n > 1) key += '-' + n;
    return { v, key, past: toArray(v.past).map(String), pp: toArray(v.pp ?? []).map(String) };
  });
  // forms that are a past participle somewhere and a past simple nowhere
  const allPast = new Set(infos.flatMap((i) => i.past.map(normalizeAnswer)));
  const ppOnly = new Set(infos.flatMap((i) => i.pp.map(normalizeAnswer)).filter((f) => !allPast.has(f)));
  const out = [];
  for (const info of infos) {
    const { v, key, past, pp } = info;
    const level = v.level || 1;
    const askPp = withPp && pp.length > 0;
    const explain = `${v.base} → ${past.join(' / ')}${askPp ? ` → ${pp.join(' / ')}` : ''}`;
    const sentence = `Yesterday, I ___ . (to ${v.base})`;
    out.push({
      id: `${topicId}-${key}-past`, topicId, level, type: 'input', group: key, label: 'Past simple',
      prompt: sentence, answer: past.length === 1 ? past[0] : past, explain,
    });
    const id = `${topicId}-${key}-form`;
    const rng = createRng(id);
    const banned = new Set([...past, ...pp].map(normalizeAnswer)); // accepted past forms and this verb's own participles
    const wrong = [];
    const add = (f) => {
      const n = normalizeAnswer(f);
      if (!n || banned.has(n) || ppOnly.has(n) || wrong.some((w) => normalizeAnswer(w) === n)) return;
      wrong.push(f);
    };
    add(regularPast(v.base));
    rng.shuffle([v.base, thirdPerson(v.base), ingForm(v.base)]).forEach((f) => { if (wrong.length < 3) add(f); });
    // last resorts: past simple of a verb unrelated in sound (other first letter and ending)
    const pool = [];
    for (const o of infos) {
      if (o === info || o.v.base[0] === v.base[0]) continue;
      pool.push(...o.past.filter((f) => f[0] !== v.base[0] && f.slice(-2) !== past[0].slice(-2)));
    }
    rng.shuffle(pool).forEach((f) => { if (wrong.length < 3) add(f); });
    const choices = rng.shuffle([past[0], ...wrong.slice(0, 3)]);
    out.push({
      id, topicId, level, type: 'mcq', group: key, label: 'Past simple',
      prompt: `Which one is correct?  ${sentence}`,
      choices, answer: past[0], explain,
    });
    if (askPp) {
      out.push({
        id: `${topicId}-${key}-pp`, topicId, level, type: 'input', group: key, label: 'Past participle',
        prompt: `I have ___ . (to ${v.base})`, answer: pp.length === 1 ? pp[0] : pp, explain,
      });
    }
  }
  return out;
}

// ---------- typed questions shown as buttons ----------

/**
 * A typed question whose prompt ends with "(a / b)" (2 to 4 slash-separated options) and whose accepted answers are all
 * exactly one of those options is really a choice: returns the options in the listed order, else null.
 * "(already / start)" or "(to go)" are only hints (the answer is not one of the options) and return null.
 */
export function optionChoices(q) {
  if (!q || q.type !== 'input') return null;
  const m = /\(([^()]*)\)\s*$/.exec(String(q.prompt ?? ''));
  if (!m) return null;
  const opts = m[1].split('/').map((s) => s.trim());
  if (opts.length < 2 || opts.length > 4 || opts.some((o) => !o)) return null;
  const norm = opts.map(normalizeAnswer);
  if (new Set(norm).size !== norm.length) return null;
  const acc = acceptedAnswers(q);
  if (!acc.length || !acc.every((a) => norm.includes(normalizeAnswer(a)))) return null;
  return opts;
}

/**
 * Questions of a parsed topic file, each tagged with topicId. A question may carry an optional `figure` (data describing a drawing,
 * see js/ui/figures.js): it is passed through untouched; the engine never reads it.
 */
export function questionsFromFile(file, topicId = file.topic, forms) {
  const qs = file.kind === 'verbs' ? expandVerbs(file, topicId, forms) : (file.questions || []).map((q) => ({ ...q }));
  return qs.map((q) => ({ ...q, topicId, level: q.level || 1 }));
}

/** topic = an entry from listTopics (needs .id and .file; .forms is passed to the verb expansion). */
export async function loadTopicQuestions(fetchJson, topic) {
  const file = await fetchJson(topic.file);
  return questionsFromFile(file, topic.id, topic.forms);
}

// ---------- selection ----------

/**
 * Pick questions for ONE topic's pool.
 *  pool: questions of the topic (with topicId, level)
 *  opts.n: count (default MATCH_QUESTIONS)
 *  opts.history: state.questions (id -> {seen, lastAt, lastCorrect})
 *  opts.division: 0..4 shifts the level mix; null/undefined = flat mix (training)
 *  opts.rng: seeded rng
 * Order of preference, across all levels: never seen, then last answered wrong, then least recently
 * seen (questions answered in the same match share a lastAt). The level mix only decides among the
 * questions of the best remaining tier, so a question is never repeated while an unseen one remains.
 * Never repeats an id inside a match. Questions sharing a `group` (the generated verb questions carry their verb) are
 * not both chosen while another question is available. Returns copies in random order; mcq choices are shuffled.
 */
export function pickQuestions(pool, { n = MATCH_QUESTIONS, history = {}, division = null, rng }) {
  const seen = new Set();
  const uniq = pool.filter((q) => !seen.has(q.id) && seen.add(q.id));
  const weights = division == null ? [1, 1, 1] : LEVEL_WEIGHTS[Math.max(0, Math.min(4, division))];
  const rank = (q) => {
    const h = history[q.id];
    if (!h || !h.seen) return [0, 0];
    return [h.lastCorrect === false ? 1 : 2, h.lastAt || 0];
  };
  const cmp = (ra, rb) => ra[0] - rb[0] || ra[1] - rb[1];
  const buckets = { 1: [], 2: [], 3: [] };
  for (const q of uniq) buckets[Math.max(1, Math.min(3, q.level || 1))].push(q);
  for (const l of [1, 2, 3]) buckets[l] = rng.shuffle(buckets[l]).sort((a, b) => cmp(rank(a), rank(b)));
  const chosen = [];
  const deferred = []; // same group as an already chosen question: only used when nothing else is left
  while (chosen.length < n) {
    const nonEmpty = [1, 2, 3].filter((l) => buckets[l].length > 0);
    if (!nonEmpty.length) break;
    let best = rank(buckets[nonEmpty[0]][0]);
    for (const l of nonEmpty) if (cmp(rank(buckets[l][0]), best) < 0) best = rank(buckets[l][0]);
    const open = nonEmpty.filter((l) => cmp(rank(buckets[l][0]), best) === 0);
    const level = rng.weighted(open, (l) => weights[l - 1] || 0.0001);
    const picked = buckets[level].shift();
    chosen.push(picked);
    if (picked.group != null) {
      for (const l of [1, 2, 3]) {
        buckets[l] = buckets[l].filter((q) => { if (q.group !== picked.group) return true; deferred.push(q); return false; });
      }
    }
  }
  if (chosen.length < n) {
    deferred.sort((a, b) => cmp(rank(a), rank(b)));
    for (const q of deferred) {
      if (chosen.length >= n) break;
      chosen.push(q);
    }
  }
  return rng.shuffle(chosen).map((q) => {
    const c = { ...q };
    if (q.choices) c.choices = rng.shuffle(q.choices);
    return c;
  });
}
