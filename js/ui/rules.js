// The scoring rule in the child's words, generated from config so that changing GOAL_EVERY_N_CORRECT changes every text.
import { GOAL_EVERY_N_CORRECT as N } from '../config.js';

const plural = (n, one, many) => (n > 1 ? many : one);

export const RULE = {
  /** « 2 bonnes réponses = 1 but » */
  line: `${N} ${plural(N, 'bonne réponse', 'bonnes réponses')} = 1 but`,
  miss: 'Une erreur = une occasion pour l\'adversaire',
  intro: `Réponds juste ${N} ${plural(N, 'fois', 'fois')} → BUT !`,
  introMiss: 'Une erreur → l\'adversaire peut marquer',
};

/** Mode expert (u13): same goals for, but every error is a goal for the opponent. */
export const RULE_EXPERT = {
  line: RULE.line,
  miss: "Chaque erreur = un but pour l'adversaire",
  intro: RULE.intro,
  introMiss: "Une erreur → l'adversaire marque !",
};

/** The rule texts of a difficulty ('normal' | 'expert'). */
export const ruleFor = (difficulty) => (difficulty === 'expert' ? RULE_EXPERT : RULE);

/** Live countdown under the attack meter. filled = correct answers since the last goal (0..N-1). */
export function meterText(filled) {
  const left = Math.max(1, N - Math.max(0, filled));
  const ready = left === 1;
  const long = ready ? 'Encore 1 bonne réponse : tu peux marquer !' : `Encore ${left} bonnes réponses pour marquer`;
  const short = ready ? 'Encore 1 : tu peux marquer !' : `Encore ${left} pour marquer`;
  return { long, short, ready };
}

/** Line added to « Bravo ! » when a correct answer did not score: filled = meter after the answer. */
export function remainingText(filled) {
  const left = N - filled;
  return left > 1 ? `Plus que ${left} bonnes réponses pour marquer` : 'Plus que 1 !';
}

export const MISSED_CHANCE = 'L\'adversaire a raté son occasion. Ouf !';
