// XP and levels, coins, card packs, badges.
import { PACK_SIZE, TRAINING_XP_FACTOR } from '../config.js';
import { listTopics } from './questions.js';
import { topicStars, uniqueCards } from './stats.js';

// ---------- XP & levels ----------

export const OUTCOME_XP = { W: 50, D: 20, L: 10 };
export const OUTCOME_COINS = { W: 30, D: 15, L: 5 };
export const PERFECT_COINS = 10;
export const COACH_PICK_COIN_FACTOR = 1.5;

/** Total XP needed to reach `level` (level 1 = 0 XP): 0, 100, 250, 450, 700, ... */
export function xpToReach(level) {
  return 25 * (level - 1) * (level + 2);
}

export function levelForXp(xp) {
  if (typeof xp !== 'number' || !Number.isFinite(xp) || xp < 0) return 1;
  xp = Math.min(xp, 1e9);
  let level = 1;
  while (xpToReach(level + 1) <= xp) level++;
  return level;
}

/** { level, xp, levelStart, nextLevelAt, progress (0..1 inside the level) } */
export function levelInfo(xp) {
  xp = typeof xp === 'number' && Number.isFinite(xp) && xp >= 0 ? Math.min(xp, 1e9) : 0;
  const level = levelForXp(xp);
  const levelStart = xpToReach(level);
  const nextLevelAt = xpToReach(level + 1);
  return { level, xp, levelStart, nextLevelAt, progress: (xp - levelStart) / (nextLevelAt - levelStart) };
}

/**
 * XP of a result: { base (10/correct), speed (sum of per-answer bonuses), outcome (50/20/10), total }.
 * Training counts 50 % (total rounded down).
 */
export function matchXp(result) {
  const base = result.correct * 10;
  const speed = result.speedBonus;
  const outcome = OUTCOME_XP[result.outcome];
  let total = base + speed + outcome;
  if (result.mode === 'training') total = Math.floor(total * TRAINING_XP_FACTOR);
  return { base, speed, outcome, total };
}

export const MIN_CORRECT_FOR_LOSS_COINS = 5;

/** Coins of a result: { base, perfect, coachPick (bonus part), total }. Training earns none; a league defeat with fewer than 5 correct answers earns none. */
export function matchCoins(result) {
  if (result.mode !== 'league') return { base: 0, perfect: 0, coachPick: 0, total: 0 };
  if (result.outcome === 'L' && result.correct < MIN_CORRECT_FOR_LOSS_COINS) return { base: 0, perfect: 0, coachPick: 0, total: 0 };
  const base = OUTCOME_COINS[result.outcome];
  const perfect = result.perfect ? PERFECT_COINS : 0;
  const sub = base + perfect;
  const total = result.coachPick ? Math.round(sub * COACH_PICK_COIN_FACTOR) : sub;
  return { base, perfect, coachPick: total - sub, total };
}

// ---------- cards ----------

export const RARITY_ODDS = { common: 0.6, rare: 0.28, epic: 0.1, legend: 0.02 };
export const RARITIES = ['common', 'rare', 'epic', 'legend'];

/**
 * Open a pack. cards: array from data/cards.json. collection: state.cards (id -> count), used for isNew.
 * Rarity is drawn per card from RARITY_ODDS (rarities with no cards are skipped), then a random card of it.
 * Returns [{ card, isNew }] (isNew false for a second copy inside the same pack).
 */
export function openPack(cards, rng, collection = {}, size = PACK_SIZE) {
  const byRarity = {};
  for (const c of cards) (byRarity[c.rarity] ||= []).push(c);
  const rarities = RARITIES.filter((r) => byRarity[r]?.length);
  const have = new Set(Object.keys(collection).filter((id) => collection[id] > 0));
  const out = [];
  for (let i = 0; i < size; i++) {
    const rarity = rng.weighted(rarities, (r) => RARITY_ODDS[r]);
    const card = rng.pick(byRarity[rarity]);
    out.push({ card: { ...card }, isNew: !have.has(card.id) });
    have.add(card.id);
  }
  return out;
}

// ---------- badges ----------

/** env for badge predicates: { catalog (subjects.json content), totalCards (size of the deck) }. */
function subjectMastered(state, env) {
  if (!env?.catalog) return false;
  const squad = state.profile.squad;
  return env.catalog.subjects.some((s) => {
    const topics = listTopics(env.catalog, squad, s.id);
    return topics.length > 0 && topics.every((t) => topicStars(state, t.id) === 3);
  });
}

const b = (id, name, desc, icon, check) => ({ id, name, desc, icon, check });

export const BADGES = [
  b('first-match', 'Coup d\'envoi', 'Joue ton premier match', '⚽', (s) => s.totals.matches >= 1),
  b('first-win', 'Première victoire', 'Gagne un match de championnat', '🏆', (s) => s.totals.wins >= 1),
  b('streak-3', 'En confiance', 'Gagne 3 matchs de championnat de suite', '🔥', (s) => s.totals.bestWinStreak >= 3),
  b('streak-5', 'Inarrêtable', 'Gagne 5 matchs de championnat de suite', '⚡', (s) => s.totals.bestWinStreak >= 5),
  b('streak-10', 'Invincible', 'Gagne 10 matchs de championnat de suite', '👑', (s) => s.totals.bestWinStreak >= 10),
  b('hat-trick', 'Triplé', 'Marque 3 buts ou plus dans un match de championnat', '🎩', (s) => s.totals.hatTricks >= 1),
  b('clean-sheet', 'Cage inviolée', 'Termine un match de championnat sans encaisser de but', '🧤', (s) => s.totals.cleanSheets >= 1),
  b('perfect', 'Match parfait', 'Réponds juste à toutes les questions d\'un match', '💯', (s) => s.totals.perfect >= 1),
  b('matches-10', 'Habitué', 'Joue 10 matchs', '🎽', (s) => s.totals.matches >= 10),
  b('matches-50', 'Vétéran', 'Joue 50 matchs', '🥈', (s) => s.totals.matches >= 50),
  b('matches-100', 'Centenaire', 'Joue 100 matchs', '🥇', (s) => s.totals.matches >= 100),
  b('promotion', 'Montée', 'Monte dans la division supérieure', '📈', (s) => s.totals.promotions >= 1),
  b('title', 'Champion', 'Remporte un titre de champion', '🏅', (s) => s.totals.titles >= 1),
  b('topic-master', 'Maître du thème', 'Obtiens 3 étoiles sur un thème', '⭐', (s) => Object.keys(s.topics).some((id) => topicStars(s, id) === 3)),
  b('subject-master', 'Maître de la matière', 'Obtiens 3 étoiles sur tous les thèmes d\'une matière', '🎓', (s, env) => subjectMastered(s, env)),
  b('day-streak-3', 'Trois jours de suite', 'Joue 3 jours de suite', '📅', (s) => s.streak.best >= 3),
  b('day-streak-7', 'Semaine complète', 'Joue 7 jours de suite', '🗓️', (s) => s.streak.best >= 7),
  b('cards-10', 'Collectionneur', 'Collectionne 10 cartes différentes', '🃏', (s) => uniqueCards(s) >= 10),
  b('cards-36', 'Demi-album', 'Collectionne 36 cartes différentes', '📒', (s) => uniqueCards(s) >= 36),
  b('cards-all', 'Album complet', 'Complète l\'album (72 cartes)', '📚', (s, env) => uniqueCards(s) >= Math.min(72, env?.totalCards || 72)),
  b('first-legend', 'Carte légendaire', 'Tire une carte légendaire', '💎', (s) => s.totals.legends >= 1),
  b('correct-100', 'Précis', 'Donne 100 bonnes réponses', '🎯', (s) => s.totals.correct >= 100),
  b('correct-500', 'Cerveau', 'Donne 500 bonnes réponses', '🧠', (s) => s.totals.correct >= 500),
  b('correct-1000', 'Génie', 'Donne 1000 bonnes réponses', '🚀', (s) => s.totals.correct >= 1000),
];

export function badgeById(id) {
  return BADGES.find((x) => x.id === id) || null;
}

/** Badge definitions (without predicate) for display. */
export function badgeInfo(badge) {
  return { id: badge.id, name: badge.name, desc: badge.desc, icon: badge.icon };
}

/** Badges whose predicate is true and that are not yet in state.badges. Returns the full definitions. */
export function evaluateBadges(state, env = {}) {
  return BADGES.filter((x) => !state.badges[x.id] && x.check(state, env));
}
