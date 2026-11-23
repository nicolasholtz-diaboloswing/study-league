// The scoring rule in the child's words, generated from the number of correct answers per goal of the match
// (DIVISIONS[].goalEvery for the league, CUPS[].goalEvery for a cup, GOAL_EVERY_N_CORRECT for training).
import { GOAL_EVERY_N_CORRECT } from '../config.js';

const plural = (n, one, many) => (n > 1 ? many : one);

/**
 * The rule texts for a match: n = correct answers per goal; concedeAll = every error is a goal for the opponent (Coupe du monde).
 * { line: « 3 bonnes réponses = 1 but », miss, intro, introMiss }
 */
export function ruleFor(n = GOAL_EVERY_N_CORRECT, { concedeAll = false } = {}) {
  return {
    line: `${n} ${plural(n, 'bonne réponse', 'bonnes réponses')} = 1 but`,
    miss: concedeAll ? 'Chaque erreur = un but pour l\'adversaire' : 'Une erreur = une occasion pour l\'adversaire',
    intro: `Réponds juste ${n} fois → BUT !`,
    introMiss: concedeAll ? 'Une erreur → l\'adversaire marque !' : 'Une erreur → l\'adversaire peut marquer',
  };
}

/** Live countdown under the attack meter. filled = correct answers since the last goal (0..n-1). */
export function meterText(filled, n = GOAL_EVERY_N_CORRECT) {
  const left = Math.max(1, n - Math.max(0, filled));
  const ready = left === 1;
  const long = ready ? 'Encore 1 bonne réponse : tu peux marquer !' : `Encore ${left} bonnes réponses pour marquer`;
  const short = ready ? 'Encore 1 : tu peux marquer !' : `Encore ${left} pour marquer`;
  return { long, short, ready };
}

/** Line added to « Bravo ! » when a correct answer did not score: filled = meter after the answer. */
export function remainingText(filled, n = GOAL_EVERY_N_CORRECT) {
  const left = n - filled;
  return left > 1 ? `Plus que ${left} bonnes réponses pour marquer` : 'Plus que 1 !';
}

export const MISSED_CHANCE = 'L\'adversaire a raté son occasion. Ouf !';
