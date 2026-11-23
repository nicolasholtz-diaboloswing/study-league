// Time-limited events: a window of local days during which a squad's matches draw a mixed set of subjects.
// Pure: every function takes `now` (ms) as a parameter. Dates are local calendar days ('YYYY-MM-DD', see dayKey).
import { dayKey } from './stats.js';
import { pickQuestions, listTopics } from './questions.js';

/**
 * { id, name, squad, subjects: [subject ids], start, end } (start and end are inclusive local dates).
 * While an event is active, the matches of its squad skip the subject/topic choice (see eventTopic).
 */
export const EVENTS = [
  { id: 'u13-ece-2026-11', name: 'U13 ECE Event', squad: 'u13', subjects: ['hg', 'en', 'svt'], start: '2026-11-23', end: '2026-12-02' },
];

/** Topic id prefix of an event mix: the match record carries topicId 'event:<id>' and subjectId 'event'. */
export const EVENT_TOPIC_PREFIX = 'event:';
export const EVENT_SUBJECT_ID = 'event';

/** The event active for this squad on the local day of `now`, or null (u10 and any squad without an event: null). */
export function activeEvent(squad, now) {
  const day = dayKey(now);
  return EVENTS.find((e) => e.squad === squad && day >= e.start && day <= e.end) || null;
}

/** True for the sentinel topic id of an event mix ('event:<id>'). */
export const isEventTopicId = (id) => typeof id === 'string' && id.startsWith(EVENT_TOPIC_PREFIX);

/** The event of a sentinel topic id, or null. */
export const eventOfTopicId = (id) => (isEventTopicId(id) ? EVENTS.find((e) => EVENT_TOPIC_PREFIX + e.id === id) || null : null);

/** The sentinel topic standing for an event in the match flow (same shape as a listTopics entry). */
export function eventTopic(event) {
  return { id: EVENT_TOPIC_PREFIX + event.id, name: event.name, subjectId: EVENT_SUBJECT_ID, subjectName: event.name, icon: '🎓', accents: false, event };
}

/**
 * The topics an event mix draws from: every topic of the squad in the event's subjects, the compulsory ones plus the optional
 * ones the player switched on (`active` = state.optionalTopics; an optional topic that is off stays out of the mix).
 */
export const eventTopics = (catalog, squad, event, active) => listTopics(catalog, squad, null, active).filter((t) => event.subjects.includes(t.subjectId));

/**
 * Questions per subject for `n` questions: equal shares, the remainder (n not a multiple of the number of subjects) given to
 * the first subjects of `order`. 15 over 3 subjects: 5/5/5; 10 over 3: 4/3/3 in some order.
 * Returns { [subjectId]: count } for the ids of `order`.
 */
export function eventShares(order, n) {
  const k = order.length;
  const base = Math.floor(n / k);
  const extra = n - base * k;
  return Object.fromEntries(order.map((id, i) => [id, base + (i < extra ? 1 : 0)]));
}

/**
 * The mixed question set of an event.
 *  poolsBySubject: { subjectId: questions of ALL the squad's topics of that subject, each with topicId, and tagged by the caller }
 *  opts: { n, history, division, rng } as for pickQuestions.
 * Each subject gets its equal share through pickQuestions (same priorities: unseen, then missed, then least recent); a
 * subject too small for its share is topped up from the others. The result is shuffled.
 */
export function pickEventQuestions(event, poolsBySubject, { n, history = {}, division = null, rng }) {
  const subjects = event.subjects.filter((id) => poolsBySubject[id]?.length);
  if (!subjects.length) return [];
  const order = rng.shuffle(subjects); // who gets the remainder varies from one match to the next
  const shares = eventShares(order, n);
  const chosen = [];
  for (const id of order) chosen.push(...pickQuestions(poolsBySubject[id], { n: shares[id], history, division, rng }));
  if (chosen.length < n) {
    const taken = new Set(chosen.map((q) => q.id));
    const rest = subjects.flatMap((id) => poolsBySubject[id]).filter((q) => !taken.has(q.id));
    chosen.push(...pickQuestions(rest, { n: n - chosen.length, history, division, rng }));
  }
  return rng.shuffle(chosen);
}

// ---------- training ----------

/**
 * What the training screen offers a squad at `now`: { event, modes }. modes is ['classic'] outside an event; during an event it is
 * ['event', 'classic']: « Entraînement de l'évènement » (the mixed set, see eventTopic) or « Entraînement classique » (free choice
 * of subject and topic). League and cup matches stay event-only (no such choice).
 */
export function trainingOptions(squad, now) {
  const event = activeEvent(squad, now);
  return { event, modes: event ? ['event', 'classic'] : ['classic'] };
}

// ---------- announcement pop-up (at most once per local day) ----------

/** state.eventSeen: { [eventId]: 'YYYY-MM-DD' } (top level of the state: firestore.rules restricts the keys of `profile`). */
export function shouldAnnounceEvent(state, event, now) {
  return !!event && state?.eventSeen?.[event.id] !== dayKey(now);
}

/**
 * The event to announce to this player now, or null: an event is active for the squad and its pop-up was not shown today. Used by the
 * home screen and, as a fallback, before any match (league, cup, event training, classic training).
 */
export function eventToAnnounce(state, squad, now) {
  const event = activeEvent(squad, now);
  return shouldAnnounceEvent(state, event, now) ? event : null;
}

/** State remembering that the pop-up of `event` was shown today. */
export function markEventAnnounced(state, event, now) {
  return { ...state, eventSeen: { ...(state.eventSeen || {}), [event.id]: dayKey(now) } };
}
