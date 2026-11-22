// Derived numbers: mastery, coach's pick, streaks, weekly XP, leaderboard summary, coach report.
// Pure functions over the player state (see docs/API.md for its shape).
import { MASTERY_WINDOW, MASTERY_MIN_ANSWERS } from '../config.js';

// ---------- days ----------

/** Local calendar day 'YYYY-MM-DD' of a timestamp (ms). */
export function dayKey(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The last n day keys ending today, oldest first. */
export function lastDays(now, n) {
  const d = new Date(now);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime()));
  return out;
}

// ---------- mastery ----------

/** Mastery of one topic: { answered (in window), accuracy (0..1), stars (0..3), totalAnswered, totalCorrect } */
export function topicMastery(state, topicId) {
  const t = state.topics?.[topicId];
  if (!t || !t.recent?.length) return { answered: 0, accuracy: 0, stars: 0, totalAnswered: 0, totalCorrect: 0 };
  const recent = t.recent.slice(-MASTERY_WINDOW);
  const accuracy = recent.reduce((s, x) => s + x, 0) / recent.length;
  let stars = 0;
  if (recent.length >= MASTERY_MIN_ANSWERS) stars = accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : accuracy >= 0.5 ? 1 : 0;
  return { answered: recent.length, accuracy, stars, totalAnswered: t.answered || 0, totalCorrect: t.correct || 0 };
}

export const topicStars = (state, topicId) => topicMastery(state, topicId).stars;

/**
 * Coach's pick among `topics` (array with .id, e.g. from listTopics): the topic with the lowest
 * recent accuracy; a topic with fewer than 5 recent answers counts as 0.5 (so unplayed topics
 * beat anything above 50 %). Ties: fewer answers first, then list order. null if no topics.
 */
export function weakestTopic(state, topics) {
  let best = null;
  let bestScore = Infinity;
  let bestAnswered = Infinity;
  for (const t of topics) {
    const m = topicMastery(state, t.id);
    const score = m.answered < 5 ? 0.5 : m.accuracy;
    if (score < bestScore || (score === bestScore && m.answered < bestAnswered)) {
      best = t; bestScore = score; bestAnswered = m.answered;
    }
  }
  return best;
}

// ---------- streak & weekly XP ----------

/** New streak object after a match played at `now`: { current, best, lastDay }. */
export function updateStreak(streak, now) {
  const today = dayKey(now);
  const s = { current: streak?.current || 0, best: streak?.best || 0, lastDay: streak?.lastDay || null };
  if (s.lastDay === today) return s;
  const yesterday = lastDays(now, 2)[0];
  s.current = s.lastDay === yesterday ? s.current + 1 : 1;
  s.best = Math.max(s.best, s.current);
  s.lastDay = today;
  return s;
}

/** Streak to display: current if played today or yesterday, else 0. */
export function dayStreak(state, now) {
  const s = state.streak;
  if (!s || !s.lastDay) return 0;
  const [yesterday, today] = lastDays(now, 2);
  return s.lastDay === today || s.lastDay === yesterday ? s.current : 0;
}

/** XP earned in the last 7 days (today included). */
export function weeklyXp(state, now) {
  return lastDays(now, 7).reduce((s, d) => s + (state.activity?.[d]?.xp || 0), 0);
}

// ---------- accuracy & cards ----------

export function overallAccuracy(state) {
  const t = state.totals;
  return t && t.answered ? t.correct / t.answered : 0;
}

export function uniqueCards(state) {
  return Object.keys(state.cards || {}).length;
}

export function totalCards(state) {
  return Object.values(state.cards || {}).reduce((s, n) => s + n, 0);
}

// ---------- leaderboard ----------

/**
 * Public summary of a player (what other players may see).
 * { username, displayName, club, colors, squad, xp, weekXp, xpByDay (last 7 days), wins, draws, losses,
 *   matches, accuracy, bestWinStreak, cards (unique), titles, updatedAt }
 */
export function leaderboardSummary(state, now) {
  const xpByDay = {};
  for (const d of lastDays(now, 7)) xpByDay[d] = state.activity?.[d]?.xp || 0;
  const t = state.totals;
  return {
    username: state.username,
    displayName: state.profile.displayName,
    club: state.profile.club,
    colors: state.profile.colors,
    squad: state.profile.squad,
    xp: state.xp,
    division: state.league?.season?.division ?? 0,
    weekXp: weeklyXp(state, now),
    xpByDay,
    wins: t.wins,
    draws: t.draws,
    losses: t.losses,
    matches: t.matches,
    accuracy: overallAccuracy(state),
    bestWinStreak: t.bestWinStreak,
    cards: uniqueCards(state),
    titles: t.titles,
    updatedAt: now,
  };
}

/** Weekly XP of a stored summary as of `now` (the stored weekXp goes stale when a player stops playing). */
export function summaryWeekXp(summary, now) {
  const by = summary.xpByDay && typeof summary.xpByDay === 'object' ? summary.xpByDay : {};
  return lastDays(now, 7).reduce((s, d) => s + (Number.isFinite(Number(by[d])) ? Number(by[d]) : 0), 0);
}

// ---------- coach ----------

/**
 * Coach report for one player state.
 * { username, displayName, club, squad, lastActive, timePlayedMs, matches, wins, draws, losses,
 *   accuracy, topics:[{topicId, accuracy, answered, stars, totalAnswered, totalCorrect}],
 *   recentMatches (last 20, newest first),
 *   activity:[{day, matches, xp, answered, correct, ms}] (14 days, oldest first),
 *   mostMissed:[{id, topicId, prompt, answer, wrong, seen}] (10 max, most wrong first) }
 */
export function coachReport(state, now) {
  const t = state.totals;
  const topics = Object.keys(state.topics || {}).map((topicId) => ({ topicId, ...topicMastery(state, topicId) }));
  const activity = lastDays(now, 14).map((day) => {
    const a = state.activity?.[day] || {};
    return { day, matches: a.matches || 0, xp: a.xp || 0, answered: a.answered || 0, correct: a.correct || 0, ms: a.ms || 0 };
  });
  const mostMissed = Object.entries(state.questions || {})
    .filter(([, q]) => q.wrong > 0 && q.p)
    .map(([id, q]) => ({ id, topicId: q.topicId, prompt: q.p, answer: q.a, wrong: q.wrong, seen: q.seen }))
    .sort((a, b) => b.wrong - a.wrong || b.wrong / b.seen - a.wrong / a.seen || a.id.localeCompare(b.id))
    .slice(0, 10);
  return {
    username: state.username,
    displayName: state.profile.displayName,
    club: state.profile.club,
    squad: state.profile.squad,
    lastActive: state.lastActive,
    timePlayedMs: t.timePlayedMs,
    matches: t.matches,
    wins: t.wins,
    draws: t.draws,
    losses: t.losses,
    accuracy: overallAccuracy(state),
    topics,
    recentMatches: (state.matches || []).slice(-20).reverse(),
    activity,
    mostMissed,
  };
}
