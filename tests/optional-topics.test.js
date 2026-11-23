// Optional topics: a topic with `optional: true` is offered only once the child switched it on (state.optionalTopics, ms of the last activation).
import { test, eq, assert } from './runner.js';
import { listTopics, listSubjects, listOptionalTopics, allTopics, findTopic, topicAvailable, isActivated, loadCatalog } from '../js/core/questions.js';
import { EVENTS, eventTopics } from '../js/core/events.js';
import { newPlayerState, migrateState, setOptionalTopic } from '../js/core/state.js';

const topic = (id, squads, optional) => ({ id, name: id, file: `data/${id}.json`, squads, ...(optional ? { optional: true } : {}) });
const cat = {
  subjects: [
    { id: 'en', name: 'English', icon: 'E', topics: [topic('en-a', ['u13']), topic('en-x', ['u13'], true), topic('en-y', ['u10', 'u13'], true)] },
    { id: 'fr', name: 'Francais', icon: 'F', accents: true, topics: [topic('fr-x', ['u13'], true), topic('fr-z', ['u13'], true)] },
    { id: 'hg', name: 'HG', icon: 'H', topics: [topic('hg-a', ['u13'])] },
  ],
};
const ids = (ts) => ts.map((t) => t.id);
const T = 1700000000000;

test('isActivated / topicAvailable: a compulsory topic is always on, an optional one only with a positive number entry', () => {
  assert(topicAvailable({ id: 'a' }, null));
  assert(topicAvailable({ id: 'a' }, { b: T }));
  assert(!topicAvailable({ id: 'a', optional: true }, null));
  assert(!topicAvailable({ id: 'a', optional: true }, {}));
  assert(!topicAvailable({ id: 'a', optional: true }, { a: true }), 'a leftover true is not an activation');
  assert(!topicAvailable({ id: 'a', optional: true }, { a: 0 }));
  assert(!topicAvailable({ id: 'a', optional: true }, { a: -5 }));
  assert(!topicAvailable({ id: 'a', optional: true }, { a: '1700' }));
  assert(topicAvailable({ id: 'a', optional: true }, { a: T }));
  assert(isActivated({ a: 1 }, 'a'));
  assert(!isActivated(undefined, 'a'));
});

test('listTopics: optional topics are hidden by default and when not activated', () => {
  eq(ids(listTopics(cat, 'u13')), ['en-a', 'hg-a']);
  eq(ids(listTopics(cat, 'u13', null, {})), ['en-a', 'hg-a']);
  eq(ids(listTopics(cat, 'u13', 'fr')), []);
});

test('listTopics: each topic is switched on on its own, in catalog order', () => {
  eq(ids(listTopics(cat, 'u13', null, { 'en-x': T })), ['en-a', 'en-x', 'hg-a']);
  eq(ids(listTopics(cat, 'u13', null, { 'fr-z': T })), ['en-a', 'fr-z', 'hg-a']);
  eq(ids(listTopics(cat, 'u13', 'en', { 'en-x': T, 'en-y': T })), ['en-a', 'en-x', 'en-y']);
  eq(ids(listTopics(cat, 'u13', null, { 'en-x': T, 'fr-x': T, 'fr-z': T, 'en-y': T })), ['en-a', 'en-x', 'en-y', 'fr-x', 'fr-z', 'hg-a']);
  assert(listTopics(cat, 'u13', null, { 'en-x': T }).every((t) => t.subjectId && t.subjectName));
});

test('listTopics: the squad filter still applies to an activated topic', () => {
  eq(ids(listTopics(cat, 'u10', null, { 'en-x': T, 'en-y': T })), ['en-y'], 'en-x is u13 only');
  eq(ids(listTopics(cat, 'u10', null, {})), []);
});

test('listSubjects: a subject whose only topics are optional appears once one is activated', () => {
  eq(listSubjects(cat, 'u13').map((s) => s.id), ['en', 'hg']);
  eq(listSubjects(cat, 'u13', { 'fr-x': T }).map((s) => s.id), ['en', 'fr', 'hg']);
  eq(ids(listSubjects(cat, 'u13', { 'fr-x': T }).find((s) => s.id === 'fr').topics), ['fr-x']);
});

test('findTopic / allTopics: names resolve whatever the squad and the activation (switched off after play)', () => {
  eq(findTopic(cat, 'en-x')?.name, 'en-x');
  eq(findTopic(cat, 'fr-z')?.subjectName, 'Francais');
  eq(findTopic(cat, 'nope'), null);
  eq(ids(allTopics(cat)), ['en-a', 'en-x', 'en-y', 'fr-x', 'fr-z', 'hg-a']);
  eq(findTopic(cat, 'fr-x').accents, true);
});

test('listOptionalTopics: the optional topics of the squad grouped by subject, switched on or not', () => {
  eq(listOptionalTopics(cat, 'u13').map((s) => [s.id, s.name, s.icon, ids(s.topics)]), [['en', 'English', 'E', ['en-x', 'en-y']], ['fr', 'Francais', 'F', ['fr-x', 'fr-z']]]);
  eq(listOptionalTopics(cat, 'u10').map((s) => [s.id, ids(s.topics)]), [['en', ['en-y']]]);
  eq(listOptionalTopics({ subjects: [{ id: 'a', name: 'A', icon: 'a', topics: [topic('a-1', ['u13'])] }] }, 'u13'), []);
});

test('loadCatalog returns the subjects only', async () => {
  eq(await loadCatalog(async () => ({ subjects: [] })), { subjects: [] });
});

test('eventTopics: the event mix takes an optional topic only when it is activated, within the event subjects', () => {
  const ev = { id: 'e', name: 'E', squad: 'u13', subjects: ['hg', 'en'] };
  eq(ids(eventTopics(cat, 'u13', ev, undefined)), ['en-a', 'hg-a']);
  eq(ids(eventTopics(cat, 'u13', ev, {})), ['en-a', 'hg-a']);
  eq(ids(eventTopics(cat, 'u13', ev, { 'en-y': T })), ['en-a', 'en-y', 'hg-a']);
  eq(ids(eventTopics(cat, 'u13', ev, { 'en-x': T, 'fr-x': T })), ['en-a', 'en-x', 'hg-a'], 'fr-x is activated but fr is not an event subject');
  eq(ids(eventTopics(cat, 'u10', ev, { 'en-x': T, 'en-y': T })), ['en-y']);
});

// ---------- the real catalog ----------

const real = await loadCatalog(async (p) => (await fetch('../' + p)).json());
const OPTIONAL = ['en-questions-negatives', 'en-modals', 'en-comparatives', 'en-future', 'en-relative-clauses', 'en-conditionals',
  'fr-gn-phrase-discours', 'fr-accords-attribut-sujet', 'maths-triangles', 'maths-proportionnalite', 'maths-solides-mesures'];

test('real catalog: 11 u13 topics are optional, none for u10, nothing mentions packs', () => {
  eq(allTopics(real).filter((t) => t.optional).map((t) => t.id).sort(), [...OPTIONAL].sort());
  eq(listOptionalTopics(real, 'u13').map((s) => s.id), ['en', 'fr', 'maths']);
  eq(listOptionalTopics(real, 'u10'), []);
  assert(!('packs' in real) && allTopics(real).every((t) => !('pack' in t)));
});

test('real catalog: optional topics are hidden by default and one switched on appears alone', () => {
  const off = ids(listTopics(real, 'u13', null, {}));
  assert(OPTIONAL.every((id) => !off.includes(id)), 'hidden while off');
  const one = ids(listTopics(real, 'u13', null, { 'maths-triangles': T }));
  eq(one.length, off.length + 1);
  assert(one.includes('maths-triangles'));
  assert(OPTIONAL.filter((id) => id !== 'maths-triangles').every((id) => !one.includes(id)), 'the other ten stay hidden');
  eq(listTopics(real, 'u10', null, { 'maths-triangles': T }).length, listTopics(real, 'u10').length, 'u10 sees no difference');
  assert(OPTIONAL.every((id) => findTopic(real, id)?.name), 'names resolve while off');
});

test('real catalog: the active event mix gets an optional English topic only when that topic is activated', () => {
  const ev = EVENTS[0];
  eq(ids(eventTopics(real, 'u13', ev, {})).filter((id) => OPTIONAL.includes(id)), []);
  eq(ids(eventTopics(real, 'u13', ev, { 'en-modals': T })).filter((id) => OPTIONAL.includes(id)), ['en-modals']);
  eq(ids(eventTopics(real, 'u13', ev, { 'maths-triangles': T, 'fr-gn-phrase-discours': T })).filter((id) => OPTIONAL.includes(id)), [], 'fr and maths are not event subjects');
});

// ---------- state ----------

test('state: a new player has no optional topic on; the field is at the top level, not in profile', () => {
  const s = newPlayerState({ username: 'kid', displayName: 'Kid', squad: 'u13', now: 1 });
  eq(s.optionalTopics, {});
  assert(!('optionalTopics' in s.profile));
});

test('state: migrateState fills {}, keeps positive-number entries, drops leftovers (true, junk, packs)', () => {
  const base = { username: 'old', profile: { displayName: 'Old' } };
  eq(migrateState(base).optionalTopics, {});
  eq(migrateState({ ...base, optionalTopics: { a: T, b: true, c: 0, d: -1, e: 'x', f: null, g: T + 1 } }).optionalTopics, { a: T, g: T + 1 });
  eq(migrateState({ ...base, optionalTopics: [1] }).optionalTopics, {});
  eq(migrateState({ ...base, optionalTopics: 'x' }).optionalTopics, {});
  eq('packs' in migrateState({ ...base, packs: { lot2: true } }), false, 'leftover packs dropped');
});

test('state: setOptionalTopic stores the activation time, re-activation updates it, off removes the key; round trip keeps it', () => {
  const s = newPlayerState({ username: 'kid', displayName: 'Kid', squad: 'u13', now: 1 });
  const on = setOptionalTopic(s, 'maths-triangles', true, T);
  eq(on.optionalTopics, { 'maths-triangles': T });
  eq(s.optionalTopics, {}, 'input untouched');
  const again = setOptionalTopic(on, 'maths-triangles', true, T + 5000);
  eq(again.optionalTopics['maths-triangles'], T + 5000, 're-activation stores the new time');
  eq(on.optionalTopics['maths-triangles'], T, 'input untouched');
  const two = setOptionalTopic(again, 'en-modals', true, T + 9000);
  eq(two.optionalTopics, { 'maths-triangles': T + 5000, 'en-modals': T + 9000 });
  eq(setOptionalTopic(two, 'maths-triangles', false, T + 10000).optionalTopics, { 'en-modals': T + 9000 });
  const back = migrateState(JSON.parse(JSON.stringify(two)));
  eq(back.optionalTopics, two.optionalTopics);
  eq(ids(listTopics(real, 'u13', null, back.optionalTopics)).filter((id) => OPTIONAL.includes(id)).sort(), ['en-modals', 'maths-triangles']);
  const coach = { role: 'coach', username: 'dad', profile: {} };
  eq(setOptionalTopic(coach, 'en-modals', true, T), coach);
});
