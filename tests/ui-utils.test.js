import { test, eq } from './runner.js';
import { streakInfo, rivalryLine, overtaken, nextPackLevel } from '../js/ui/shell-utils.js';
import { dayKey } from '../js/core/stats.js';

const DAY = 86400000;
const NOW = new Date(2025, 5, 10, 12, 0).getTime();
const st = (lastDay, current) => ({ streak: { current, best: current, lastDay } });

test('streakInfo: played today, streak alive but not played today, no streak', () => {
  const today = dayKey(NOW);
  eq(streakInfo(st(today, 3), NOW), { days: 3, text: 'Reviens demain pour continuer !', urgent: false });
  const y = streakInfo(st(dayKey(NOW - DAY), 3), NOW);
  eq([y.days, y.text, y.urgent], [3, 'Joue aujourd\'hui pour garder ta série de 3 jours !', true]);
  eq(streakInfo(st(dayKey(NOW - DAY), 1), NOW).text, 'Joue aujourd\'hui pour garder ta série de 1 jour !');
  // the day after: the "played today" state becomes the urgent one
  eq(streakInfo(st(today, 3), NOW + DAY).urgent, true);
  eq(streakInfo(st(dayKey(NOW - 3 * DAY), 5), NOW), { days: 0, text: 'Joue un match pour lancer ta série', urgent: false });
  eq(streakInfo(st(null, 0), NOW).text, 'Joue un match pour lancer ta série');
});

test('rivalryLine: closest above, else closest below, nothing when alone, ties', () => {
  const board = [
    { uid: 'me', displayName: 'Léo', xp: 500 },
    { uid: 'a', displayName: 'Max', xp: 530 },
    { uid: 'b', displayName: 'Zoé', xp: 800 },
    { uid: 'c', displayName: 'Tom', xp: 380 },
  ];
  eq(rivalryLine(board, 'me', 500).text, 'Max est devant : il te manque 30 XP pour le dépasser');
  eq(rivalryLine(board, 'me', 900).text, 'Tu es devant Zoé de 100 XP');
  eq(rivalryLine([board[0]], 'me', 500), null);
  eq(rivalryLine(undefined, 'me', 500), null);
  eq(rivalryLine([board[0], { uid: 'd', username: 'bob', xp: 500 }], 'me', 500).text, 'Tu es à égalité avec bob');
});

test('overtaken: a rival that was ahead before the match and is behind after it', () => {
  const board = [{ uid: 'me', xp: 520 }, { uid: 'a', displayName: 'Max', xp: 530 }, { uid: 'b', displayName: 'Zoé', xp: 800 }];
  eq(overtaken(board, 'me', 500, 560), 'Max');
  eq(overtaken(board, 'me', 500, 520), null);
  eq(overtaken(board, 'me', 540, 560), null);
});

test('nextPackLevel: next multiple of 5', () => {
  eq([1, 4, 5, 7, 9, 10].map(nextPackLevel), [5, 5, 10, 10, 10, 15]);
});
