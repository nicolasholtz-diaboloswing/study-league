import { test, eq, assert, near } from './runner.js';
import {
  dayKey, lastDays, topicMastery, weakestTopic, updateStreak, dayStreak, weeklyXp, leaderboardSummary,
  summaryWeekXp, coachReport,
} from '../js/core/stats.js';
import { newPlayerState } from '../js/core/state.js';

const DAY = 86400000;
const T0 = new Date(2025, 0, 15, 12, 0).getTime();
const blank = () => newPlayerState({ username: 'kid', displayName: 'Kid', squad: 'u13', club: 'My FC', now: T0 });
const withRecent = (s, id, recent) => { s.topics[id] = { recent, answered: recent.length, correct: recent.filter(Boolean).length, lastAt: 0 }; return s; };
const arr = (ones, zeros) => [...Array(zeros).fill(0), ...Array(ones).fill(1)];

test('stats: dayKey and lastDays', () => {
  eq(dayKey(T0), '2025-01-15');
  eq(lastDays(T0, 3), ['2025-01-13', '2025-01-14', '2025-01-15']);
  eq(lastDays(new Date(2025, 2, 2, 12).getTime(), 2), ['2025-03-01', '2025-03-02']);
});

test('stats: mastery stars need 10 answers and use thresholds 50/70/90', () => {
  const s = blank();
  eq(topicMastery(s, 'x').stars, 0);
  withRecent(s, 'a', Array(9).fill(1));
  eq(topicMastery(s, 'a').stars, 0);
  eq(topicMastery(withRecent(s, 'b', arr(5, 5)), 'b').stars, 1);
  eq(topicMastery(withRecent(s, 'c', arr(7, 3)), 'c').stars, 2);
  eq(topicMastery(withRecent(s, 'd', arr(9, 1)), 'd').stars, 3);
  eq(topicMastery(withRecent(s, 'e', arr(4, 6)), 'e').stars, 0);
  eq(topicMastery(withRecent(s, 'f', arr(6, 4)), 'f').stars, 1);
  eq(topicMastery(withRecent(s, 'g', arr(14, 6)), 'g').stars, 2);
});

test('stats: mastery only looks at the last 20 answers', () => {
  const s = withRecent(blank(), 'a', [...Array(30).fill(0), ...Array(20).fill(1)]);
  const m = topicMastery(s, 'a');
  eq([m.answered, m.accuracy, m.stars], [20, 1, 3]);
});

test('stats: weakestTopic picks lowest accuracy; unplayed beats a good topic, loses to a bad one', () => {
  const topics = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const s = blank();
  eq(weakestTopic(s, topics).id, 'a');                       // nothing played: first
  withRecent(s, 'a', arr(9, 1)); withRecent(s, 'b', arr(8, 2));
  eq(weakestTopic(s, topics).id, 'c');                       // c unplayed (0.5) < 0.8
  withRecent(s, 'c', arr(9, 1));
  eq(weakestTopic(s, topics).id, 'b');
  withRecent(s, 'a', arr(2, 8));
  eq(weakestTopic(s, topics).id, 'a');
  eq(weakestTopic(s, []), null);
});

test('stats: day streak counts consecutive calendar days', () => {
  let st = updateStreak(null, T0);
  eq(st, { current: 1, best: 1, lastDay: '2025-01-15' });
  st = updateStreak(st, T0 + 3600000);               // same day
  eq(st.current, 1);
  st = updateStreak(st, T0 + DAY);
  st = updateStreak(st, T0 + 2 * DAY);
  eq([st.current, st.best], [3, 3]);
  st = updateStreak(st, T0 + 4 * DAY);               // gap
  eq([st.current, st.best], [1, 3]);
  const s = blank(); s.streak = st;
  eq(dayStreak(s, T0 + 4 * DAY), 1);
  eq(dayStreak(s, T0 + 5 * DAY), 1);                 // yesterday still counts
  eq(dayStreak(s, T0 + 6 * DAY), 0);
});

test('stats: weekly XP sums the last 7 days only', () => {
  const s = blank();
  s.activity[dayKey(T0)] = { xp: 100 };
  s.activity[dayKey(T0 - 6 * DAY)] = { xp: 50 };
  s.activity[dayKey(T0 - 7 * DAY)] = { xp: 999 };
  eq(weeklyXp(s, T0), 150);
});

test('stats: leaderboard summary is public data only and week XP can be re-derived', () => {
  const s = blank();
  s.xp = 300; s.totals.wins = 4; s.totals.matches = 6; s.totals.correct = 30; s.totals.answered = 40; s.totals.bestWinStreak = 3;
  s.cards = { p1: 2, p2: 1 };
  s.activity[dayKey(T0)] = { xp: 120 };
  const sum = leaderboardSummary(s, T0);
  eq([sum.username, sum.displayName, sum.club, sum.xp, sum.weekXp, sum.wins, sum.cards, sum.bestWinStreak], ['kid', 'Kid', 'My FC', 300, 120, 4, 2, 3]);
  near(sum.accuracy, 0.75, 1e-9);
  assert(!('questions' in sum) && !('topics' in sum) && !('matches' in sum && Array.isArray(sum.matches)));
  eq(summaryWeekXp(sum, T0 + 2 * DAY), 120);
  eq(summaryWeekXp(sum, T0 + 8 * DAY), 0);
});

test('stats: coach report has 14 activity days, 10 most missed, topic accuracy', () => {
  const s = blank();
  s.activity[dayKey(T0)] = { matches: 2, xp: 200, answered: 20, correct: 15, ms: 60000 };
  for (let i = 0; i < 15; i++) s.questions['q' + i] = { seen: 5, correct: 5 - (i + 1), wrong: i + 1, lastAt: 0, lastCorrect: false, topicId: 't', p: 'P' + i, a: 'A' + i };
  s.questions.ok = { seen: 3, correct: 3, wrong: 0, lastAt: 0, lastCorrect: true, topicId: 't' };
  withRecent(s, 't', arr(8, 2));
  s.matches = Array.from({ length: 30 }, (_, i) => ({ at: i }));
  const r = coachReport(s, T0);
  eq(r.activity.length, 14);
  eq(r.activity[13], { day: '2025-01-15', matches: 2, xp: 200, answered: 20, correct: 15, ms: 60000 });
  eq(r.activity[0].matches, 0);
  eq(r.mostMissed.length, 10);
  eq(r.mostMissed[0], { id: 'q14', topicId: 't', prompt: 'P14', answer: 'A14', wrong: 15, seen: 5 });
  eq(r.topics[0].topicId, 't');
  near(r.topics[0].accuracy, 0.8, 1e-9);
  eq(r.recentMatches.length, 20);
  eq(r.recentMatches[0].at, 29);
});
