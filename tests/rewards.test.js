import { test, eq, assert, near } from './runner.js';
import { createRng } from '../js/core/rng.js';
import {
  xpToReach, levelForXp, levelInfo, matchXp, matchCoins, openPack, pickCupCard, isPlayerCard, RARITY_ODDS, PACK_ODDS, BADGES, evaluateBadges,
} from '../js/core/rewards.js';
import { newPlayerState } from '../js/core/state.js';
import { CARDS, SUBJECTS, ALL_CARDS, NATION_CARDS, CLUB_CARDS } from './fixtures.js';

const res = (o = {}) => ({
  mode: 'league', outcome: 'W', correct: 10, total: 10, perfect: true, speedBonus: 20, coachPick: false, ...o,
});

test('rewards: levels grow with growing thresholds', () => {
  eq([1, 2, 3, 4, 5].map(xpToReach), [0, 100, 250, 450, 700]);
  eq([0, 99, 100, 249, 250, 700].map(levelForXp), [1, 1, 2, 2, 3, 5]);
  const li = levelInfo(175);
  eq([li.level, li.levelStart, li.nextLevelAt], [2, 100, 250]);
  near(li.progress, 0.5, 1e-9);
  for (let l = 2; l < 30; l++) assert(xpToReach(l + 1) - xpToReach(l) > xpToReach(l) - xpToReach(l - 1));
});

test('rewards: matchXp = 10/correct + speed + outcome bonus; training halves', () => {
  const x = matchXp(res());
  eq([x.base, x.speed, x.outcome, x.total], [100, 20, 50, 170]);
  eq(matchXp(res({ outcome: 'D', correct: 5, speedBonus: 3 })).total, 5 * 10 + 3 + 20);
  eq(matchXp(res({ outcome: 'L', correct: 0, speedBonus: 0 })).total, 10);
  eq(matchXp(res({ mode: 'training' })).total, 85);
});

test('rewards: coins win 30, draw 15, loss 5, +10 perfect, coach pick +50%, training none', () => {
  eq(matchCoins(res({ perfect: false })).total, 30);
  eq(matchCoins(res({ outcome: 'D', perfect: false })).total, 15);
  eq(matchCoins(res({ outcome: 'L', perfect: false })).total, 5);
  eq(matchCoins(res()).total, 40);
  const cp = matchCoins(res({ coachPick: true }));
  eq([cp.total, cp.coachPick], [60, 20]);
  eq(matchCoins(res({ mode: 'training' })).total, 0);
});

test('rewards: pack opening gives 3 cards, marks new vs duplicate', () => {
  const rng = createRng(3);
  const pack = openPack(CARDS, rng, {});
  eq(pack.length, 3);
  assert(pack.every((p) => CARDS.some((c) => c.id === p.card.id)));
  const owned = Object.fromEntries(CARDS.map((c) => [c.id, 1]));
  assert(openPack(CARDS, rng, owned).every((p) => !p.isNew));
  const twice = openPack([CARDS[0]], rng, {}, 3);
  eq(twice.map((p) => p.isNew), [true, false, false]);
});

test('rewards: big pack odds are 55/28/13/4', () => {
  eq(RARITY_ODDS, { common: 0.55, rare: 0.28, epic: 0.13, legend: 0.04 });
  eq(PACK_ODDS.big, RARITY_ODDS);
  const rng = createRng(2024);
  const N = 30000;
  const counts = { common: 0, rare: 0, epic: 0, legend: 0 };
  for (const p of openPack(CARDS, rng, {}, N)) counts[p.card.rarity]++;
  near(counts.common / N, 0.55, 0.015, 'common');
  near(counts.rare / N, 0.28, 0.015, 'rare');
  near(counts.epic / N, 0.13, 0.01, 'epic');
  near(counts.legend / N, 0.04, 0.006, 'legend');
});

test('rewards: small pack odds are 70/24/6/0 and never give a legend', () => {
  eq(PACK_ODDS.small, { common: 0.7, rare: 0.24, epic: 0.06, legend: 0 });
  const rng = createRng(11);
  const N = 30000;
  const counts = { common: 0, rare: 0, epic: 0, legend: 0 };
  for (const p of openPack(CARDS, rng, {}, N, PACK_ODDS.small)) counts[p.card.rarity]++;
  eq(counts.legend, 0);
  near(counts.common / N, 0.7, 0.015, 'common');
  near(counts.rare / N, 0.24, 0.015, 'rare');
  near(counts.epic / N, 0.06, 0.01, 'epic');
});

test('rewards: a rarity with no cards is skipped', () => {
  const noLegend = CARDS.filter((c) => c.rarity !== 'legend');
  for (const p of openPack(noLegend, createRng(1), {}, 500)) assert(p.card.rarity !== 'legend');
});

const player = () => newPlayerState({ username: 'kid', displayName: 'Kid', squad: 'u13', club: 'My FC', now: 0 });

test('badges: 25 + one trophy per cup, unique ids, complete definitions', () => {
  eq(BADGES.length, 29);
  eq(new Set(BADGES.map((b) => b.id)).size, 29);
  for (const b of BADGES) assert(b.id && b.name && b.desc && b.icon && typeof b.check === 'function', b.id);
});

test('badges: fresh state earns none; thresholds trigger the right badges', () => {
  const s = player();
  eq(evaluateBadges(s).length, 0);
  s.totals.matches = 1; s.totals.wins = 1; s.totals.bestWinStreak = 5; s.totals.hatTricks = 1;
  s.totals.cleanSheets = 1; s.totals.perfect = 1; s.totals.correct = 120; s.totals.promotions = 1; s.totals.legends = 1;
  s.streak.best = 3;
  const ids = evaluateBadges(s).map((b) => b.id).sort();
  eq(ids, ['clean-sheet', 'correct-100', 'day-streak-3', 'first-legend', 'first-match', 'first-win', 'hat-trick', 'perfect', 'promotion', 'streak-3', 'streak-5'].sort());
  s.badges['first-win'] = 1;
  assert(!evaluateBadges(s).some((b) => b.id === 'first-win'), 'already earned is not repeated');
});

test('badges: unique cards, match counts, titles', () => {
  const s = player();
  for (let i = 0; i < 10; i++) s.cards['p' + i] = 1;
  s.totals.matches = 50; s.totals.titles = 1; s.totals.correct = 1000; s.totals.bestWinStreak = 10; s.streak.best = 7;
  const ids = evaluateBadges(s).map((b) => b.id);
  for (const id of ['cards-10', 'matches-10', 'matches-50', 'title', 'correct-500', 'correct-1000', 'streak-10', 'day-streak-7']) assert(ids.includes(id), id);
  assert(!ids.includes('cards-36') && !ids.includes('matches-100'));
  for (let i = 0; i < 36; i++) s.cards['p' + i] = 1;
  assert(evaluateBadges(s).some((b) => b.id === 'cards-36'));
  assert(!evaluateBadges(s, { totalCards: 72 }).some((b) => b.id === 'cards-all'));
  assert(evaluateBadges(s, { totalCards: 36 }).some((b) => b.id === 'cards-all'));
  assert(!evaluateBadges(s).some((b) => b.id === 'cards-all'), 'no deck size, no album badge');
  assert(!evaluateBadges(s, { totalCards: 191 }).some((b) => b.id === 'cards-100'));
  for (let i = 0; i < 100; i++) s.cards['p' + i] = 1;
  const ids100 = evaluateBadges(s, { totalCards: 191 }).map((b) => b.id);
  assert(ids100.includes('cards-100') && !ids100.includes('cards-all'), 'whole album is the whole deck, not 72');
});

test('badges: topic mastered and subject mastered (needs catalog)', () => {
  const s = player();
  s.topics['en-det'] = { recent: Array(20).fill(1), answered: 20, correct: 20, lastAt: 0 };
  let ids = evaluateBadges(s, { catalog: SUBJECTS }).map((b) => b.id);
  assert(ids.includes('topic-master'));
  assert(!ids.includes('subject-master'));
  s.topics['en-verbs'] = { recent: Array(20).fill(1), answered: 20, correct: 20, lastAt: 0 };
  s.topics['en-verbs-pp'] = { recent: Array(20).fill(1), answered: 20, correct: 20, lastAt: 0 };
  ids = evaluateBadges(s, { catalog: SUBJECTS }).map((b) => b.id);
  assert(ids.includes('subject-master'));
  assert(!evaluateBadges(s).some((b) => b.id === 'subject-master'), 'no catalog, no subject badge');
});

test('rewards: levelForXp / levelInfo tolerate hostile xp (no freeze, no NaN)', () => {
  for (const bad of [NaN, Infinity, -Infinity, 'abc', '500', -1, -1e9, null, undefined]) {
    eq(levelForXp(bad), 1, `levelForXp(${String(bad)})`);
    const li = levelInfo(bad);
    eq(li.level, 1);
    assert(Number.isFinite(li.progress) && li.progress >= 0 && li.progress <= 1, `progress ${li.progress}`);
  }
  const huge = levelForXp(1e20);
  assert(Number.isInteger(huge) && huge > 1000 && huge === levelForXp(1e9), `huge ${huge}`);
  assert(Number.isFinite(levelInfo(1e20).progress));
});

test('rewards: a league defeat with fewer than a third of the questions right earns no coins; a third earns them; draws unaffected', () => {
  eq(matchCoins(res({ outcome: 'L', correct: 3, total: 10, perfect: false })).total, 0);
  eq(matchCoins(res({ outcome: 'L', correct: 0, total: 10, perfect: false, coachPick: true })).total, 0);
  eq(matchCoins(res({ outcome: 'L', correct: 4, total: 10, perfect: false })).total, 5);
  eq(matchCoins(res({ outcome: 'L', correct: 4, total: 15, perfect: false })).total, 0, 'an old 15-question match: a third is 5');
  eq(matchCoins(res({ outcome: 'L', correct: 5, total: 15, perfect: false })).total, 5);
  eq(matchCoins(res({ outcome: 'D', correct: 2, perfect: false })).total, 15);
  eq(matchXp(res({ outcome: 'L', correct: 3, total: 10, perfect: false, speedBonus: 0 })).total, 3 * 10 + 10, 'xp unchanged');
});

test('openPack draws player cards only: nation and club cards never come out of a pack', () => {
  const rng = createRng(5);
  for (const odds of [PACK_ODDS.big, PACK_ODDS.small]) {
    for (const p of openPack(ALL_CARDS, rng, {}, 3000, odds)) assert(!p.card.kind || p.card.kind === 'player', `${p.card.id} is a ${p.card.kind}`);
  }
  assert(isPlayerCard({ rarity: 'rare' }) && isPlayerCard({ kind: 'player' }) && !isPlayerCard({ kind: 'nation' }) && !isPlayerCard({ kind: 'club' }));
  // a file with a single player and many countries: only the player
  const one = [CARDS[0], ...NATION_CARDS, ...CLUB_CARDS];
  assert(openPack(one, rng, {}, 200).every((p) => p.card.id === CARDS[0].id));
});

test('pickCupCard: a card of the kind not owned yet; a duplicate only once the set is complete', () => {
  const rng = createRng(9);
  const owned = {};
  const seen = new Set();
  for (let i = 0; i < NATION_CARDS.length; i++) {
    const w = pickCupCard(ALL_CARDS, rng, owned, 'nation');
    eq([w.card.kind, w.isNew], ['nation', true]);
    assert(!owned[w.card.id], 'not owned yet');
    owned[w.card.id] = 1; seen.add(w.card.id);
  }
  eq(seen.size, NATION_CARDS.length, 'the whole set, no duplicate on the way');
  const dup = pickCupCard(ALL_CARDS, rng, owned, 'nation');
  eq([dup.card.kind, dup.isNew], ['nation', false]);
  // clubs are independent of nations
  const club = pickCupCard(ALL_CARDS, rng, owned, 'club');
  eq([club.card.kind, club.isNew], ['club', true]);
  eq(pickCupCard(CARDS, rng, {}, 'nation'), null, 'no card of that kind in the file');
});

test('pickCupCard: the final gives the highest rarity still missing (the highest of the set once complete)', () => {
  const rng = createRng(4);
  const rank = ['common', 'rare', 'epic', 'legend'];
  const legend = NATION_CARDS.find((c) => c.rarity === 'legend');
  eq(pickCupCard(ALL_CARDS, rng, {}, 'nation', { final: true }).card.id, legend.id);
  const owned = { [legend.id]: 1 };
  const epic = NATION_CARDS.find((c) => c.rarity === 'epic');
  eq(pickCupCard(ALL_CARDS, rng, owned, 'nation', { final: true }).card.id, epic.id);
  for (let i = 0; i < 40; i++) {
    const w = pickCupCard(ALL_CARDS, createRng(i), owned, 'nation', { final: true });
    eq(w.card.rarity, 'epic');
  }
  const all = Object.fromEntries(NATION_CARDS.map((c) => [c.id, 1]));
  const done = pickCupCard(ALL_CARDS, rng, all, 'nation', { final: true });
  eq([done.card.rarity, done.isNew, rank.indexOf(done.card.rarity)], ['legend', false, 3]);
});

test('matchCoins: a cup match earns coins like a league match, training none', () => {
  eq(matchCoins(res({ mode: 'cup', perfect: false })).total, 30);
  eq(matchCoins(res({ mode: 'cup', outcome: 'L', correct: 3, total: 15, perfect: false })).total, 0);
  eq(matchCoins(res({ mode: 'training' })).total, 0);
});

test('badges: the album badge needs the whole deck, players, countries and clubs', () => {
  const s = player();
  const env = { totalCards: ALL_CARDS.length };
  for (const c of CARDS) s.cards[c.id] = 1;
  assert(!evaluateBadges(s, env).some((x) => x.id === 'cards-all'), 'players alone do not complete the album');
  for (const c of ALL_CARDS) s.cards[c.id] = 1;
  assert(evaluateBadges(s, env).some((x) => x.id === 'cards-all'));
});
