import { test, eq, assert } from './runner.js';
import { createRng } from '../js/core/rng.js';
import {
  EVENTS, activeEvent, trainingOptions, eventToAnnounce, eventShares, pickEventQuestions, shouldAnnounceEvent, markEventAnnounced, eventTopic, isEventTopicId, eventOfTopicId,
} from '../js/core/events.js';

const EV = EVENTS[0];
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

test('events: the first event is the U13 ECE Event (u13, hg + en + svt, 23/11/2026 to 02/12/2026 inclusive)', () => {
  eq(EV, { id: 'u13-ece-2026-11', name: 'U13 ECE Event', squad: 'u13', subjects: ['hg', 'en', 'svt'], start: '2026-11-23', end: '2026-12-02' });
  eq(eventTopic(EV).id, 'event:u13-ece-2026-11');
  eq([eventTopic(EV).subjectId, eventTopic(EV).accents, eventTopic(EV).name], ['event', false, 'U13 ECE Event']);
});

test('activeEvent: window boundaries in local time (first and last day included, day before and after excluded)', () => {
  eq(activeEvent('u13', at(2026, 11, 22, 23, 59)), null);
  eq(activeEvent('u13', at(2026, 11, 23, 0, 0))?.id, EV.id);
  eq(activeEvent('u13', at(2026, 11, 23, 8, 30))?.id, EV.id);
  eq(activeEvent('u13', at(2026, 11, 30))?.id, EV.id);
  eq(activeEvent('u13', at(2026, 12, 2, 23, 59))?.id, EV.id);
  eq(activeEvent('u13', at(2026, 12, 3, 0, 0)), null);
  eq(activeEvent('u13', at(2027, 11, 25)), null, 'same days next year');
});

test('activeEvent: u10 (and any other squad) is never concerned', () => {
  eq(activeEvent('u10', at(2026, 11, 25)), null);
  eq(activeEvent(null, at(2026, 11, 25)), null);
  eq(activeEvent(undefined, at(2026, 11, 25)), null);
  eq(activeEvent('u13', at(2026, 11, 25))?.name, 'U13 ECE Event');
});

test('eventShares: equal shares (5/5/5 for 15), remainder to the first subjects (10 over 3: 4/3/3)', () => {
  eq(eventShares(['hg', 'en', 'svt'], 15), { hg: 5, en: 5, svt: 5 });
  eq(eventShares(['hg', 'en', 'svt'], 10), { hg: 4, en: 3, svt: 3 });
  eq(eventShares(['svt', 'hg', 'en'], 10), { svt: 4, hg: 3, en: 3 });
  eq(eventShares(['a', 'b', 'c'], 11), { a: 4, b: 4, c: 3 });
  eq(Object.values(eventShares(['a', 'b'], 7)).reduce((x, y) => x + y, 0), 7);
});

/** Pools like the flow builds them: all the u13 topics of a subject, tagged, English far bigger than the others. */
function pools(sizes = { hg: 60, en: 400, svt: 50 }) {
  const out = {};
  for (const [sid, n] of Object.entries(sizes)) {
    out[sid] = Array.from({ length: n }, (_, i) => ({ id: `${sid}-${i}`, topicId: `${sid}-t${i % 4}`, level: (i % 3) + 1, type: 'mcq', prompt: 'P', choices: ['a', 'b'], answer: 'a' }));
  }
  return out;
}
const bySubject = (qs) => Object.fromEntries(Object.entries(qs.reduce((m, q) => { const k = q.id.split('-')[0]; m[k] = (m[k] || 0) + 1; return m; }, {})).sort());

test('pickEventQuestions: 15 questions are 5 / 5 / 5 whatever the size of the pools, no duplicate, all topics reachable', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const qs = pickEventQuestions(EV, pools(), { n: 15, history: {}, division: 2, rng: createRng(seed) });
    eq(qs.length, 15);
    eq(bySubject(qs), { en: 5, hg: 5, svt: 5 }, `seed ${seed}`);
    eq(new Set(qs.map((q) => q.id)).size, 15);
  }
  const topics = new Set();
  for (let seed = 1; seed <= 30; seed++) for (const q of pickEventQuestions(EV, pools(), { n: 15, rng: createRng(seed) })) topics.add(q.topicId);
  assert(topics.size >= 10, `questions come from across the topics: ${topics.size}`);
});

test('pickEventQuestions: 10 questions are split as evenly as possible (4/3/3), the order is shuffled, not grouped by subject', () => {
  let grouped = 0;
  const extras = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const qs = pickEventQuestions(EV, pools(), { n: 10, rng: createRng(seed) });
    const c = bySubject(qs);
    eq(Object.values(c).sort(), [3, 3, 4], `seed ${seed}`);
    extras.add(Object.keys(c).find((k) => c[k] === 4));
    const runs = qs.filter((q, i) => i === 0 || q.id.split('-')[0] !== qs[i - 1].id.split('-')[0]).length;
    if (runs <= 3) grouped++;
  }
  eq(grouped, 0, 'never three blocks');
  assert(extras.size >= 2, 'the extra question does not always go to the same subject');
});

test('pickEventQuestions: keeps the pickQuestions priorities inside each subject (unseen first, then missed)', () => {
  const p = pools({ hg: 10, en: 10, svt: 10 });
  const history = {};
  for (const sid of ['hg', 'en', 'svt']) p[sid].forEach((q, i) => { if (i < 5) history[q.id] = { seen: 1, lastAt: 1000, lastCorrect: i !== 0 }; });
  const qs = pickEventQuestions(EV, p, { n: 15, history, rng: createRng(3) });
  eq(qs.length, 15);
  assert(qs.every((q) => !history[q.id]), 'five unseen per subject exist: no seen question is repeated');
});

test('pickEventQuestions: a subject too small for its share is topped up from the others; no subject, no question', () => {
  const qs = pickEventQuestions(EV, pools({ hg: 2, en: 100, svt: 100 }), { n: 15, rng: createRng(2) });
  eq(qs.length, 15);
  eq(bySubject(qs).hg, 2);
  eq(new Set(qs.map((q) => q.id)).size, 15);
  eq(pickEventQuestions(EV, {}, { n: 15, rng: createRng(1) }), []);
  const two = bySubject(pickEventQuestions(EV, pools({ hg: 20, en: 20, svt: 0 }), { n: 15, rng: createRng(1) }));
  eq([two.svt, Object.values(two).sort()], [undefined, [7, 8]], 'an empty subject is skipped, the shares are split between the others');
});

test('event announcement: at most once per local day, remembered at the top level of the state (not in profile)', () => {
  const st = { username: 'kid', profile: { displayName: 'K', squad: 'u13' } };
  const day1 = at(2026, 11, 23, 9);
  eq(shouldAnnounceEvent(st, EV, day1), true);
  const seen = markEventAnnounced(st, EV, day1);
  eq(st.eventSeen, undefined, 'input untouched');
  eq(seen.eventSeen, { [EV.id]: '2026-11-23' });
  eq(seen.profile, st.profile);
  eq([shouldAnnounceEvent(seen, EV, at(2026, 11, 23, 23, 30)), shouldAnnounceEvent(seen, EV, at(2026, 11, 24, 0, 5))], [false, true]);
  eq(shouldAnnounceEvent(seen, null, day1), false);
  eq(markEventAnnounced(seen, EV, at(2026, 11, 24, 8)).eventSeen[EV.id], '2026-11-24');
});

test('event topic ids: the sentinel is recognised and resolves to its event', () => {
  eq([isEventTopicId('event:u13-ece-2026-11'), isEventTopicId('en-det'), isEventTopicId(null), isEventTopicId(undefined)], [true, false, false, false]);
  eq(eventOfTopicId('event:u13-ece-2026-11')?.name, 'U13 ECE Event');
  eq([eventOfTopicId('event:unknown'), eventOfTopicId('en-det')], [null, null]);
});

test('trainingOptions: during an event a u13 chooses between the event training and the classic one; otherwise only the classic one', () => {
  const inside = trainingOptions('u13', at(2026, 11, 25));
  eq([inside.event?.id, inside.modes], [EV.id, ['event', 'classic']]);
  eq(trainingOptions('u13', at(2026, 12, 3)), { event: null, modes: ['classic'] });
  eq(trainingOptions('u13', at(2026, 11, 22, 23, 59)).modes, ['classic']);
  eq(trainingOptions('u10', at(2026, 11, 25)), { event: null, modes: ['classic'] });
  eq(trainingOptions('u13', at(2026, 11, 23, 0, 0)).modes, ['event', 'classic']);
  eq(trainingOptions('u13', at(2026, 12, 2, 23, 59)).modes, ['event', 'classic']);
});

test('eventToAnnounce: the pop-up is due for a u13 in the window until it is marked seen that day; never for a u10 or outside the window', () => {
  const st = { username: 'kid', profile: { squad: 'u13' } };
  const now = at(2026, 11, 25, 9);
  eq(eventToAnnounce(st, 'u13', now)?.id, EV.id);
  const seen = markEventAnnounced(st, EV, now);
  eq(eventToAnnounce(seen, 'u13', at(2026, 11, 25, 22)), null, 'once per day, whatever the screen (home, league, cup, training)');
  eq(eventToAnnounce(seen, 'u13', at(2026, 11, 26, 8))?.id, EV.id, 'again the next day');
  eq([eventToAnnounce(st, 'u10', now), eventToAnnounce(st, 'u13', at(2026, 12, 3, 9))], [null, null]);
});
