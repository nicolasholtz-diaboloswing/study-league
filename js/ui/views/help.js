// « Comment jouer » in six short illustrated steps.
import * as C from '../components.js';
import * as A from '../art.js';
import { ruleFor } from '../rules.js';
import { minuteOf } from '../../core/match.js';
import { DIVISIONS, goalEveryOf } from '../../core/league.js';
import { PACKS, PACK_COST, PACK_SIZE, LEAGUE_QUESTIONS } from '../../config.js';

export default {
  title: 'Comment jouer',
  async mount(el, ctx) {
    const legend = ctx.cards.find((c) => c.rarity === 'legend') || ctx.cards[0];
    const rare = ctx.cards.find((c) => c.rarity === 'rare') || ctx.cards[1];
    const goalEvery = goalEveryOf(ctx.state?.league?.season?.division ?? 0); // the rule of the player's division
    const rule = ruleFor(goalEvery);
    const minutes = [minuteOf(0, LEAGUE_QUESTIONS), minuteOf(1, LEAGUE_QUESTIONS), minuteOf(2, LEAGUE_QUESTIONS), '…', minuteOf(LEAGUE_QUESTIONS - 1, LEAGUE_QUESTIONS)].map((m) => (m === '…' ? m : `${m}'`));
    const steps = [
      { t: 'Choisis une matière', p: 'Puis choisis le thème que tu veux travailler.',
        art: `<div class="how__tiles"><span class="how__tile">${A.football(34)}<b>Anglais</b></span><span class="how__tile">${A.football(34)}<b>Français</b></span></div>` },
      { t: `Réponds à ${LEAGUE_QUESTIONS} questions`, p: 'Chaque question est une minute du match. Tu as un peu de temps pour répondre.',
        art: `<div class="how__mins">${minutes.map((m) => `<span class="how__min">${m}</span>`).join('')}</div>` },
      { t: rule.line, p: `${rule.intro} ${rule.miss}. Plus tu montes de division, plus il faut de bonnes réponses pour un but.`,
        art: C.attackMeter(goalEvery, { n: goalEvery }) },
      { t: 'Gagne des points au classement', p: 'Chaque bonne réponse et chaque victoire te donnent de l\'XP. Dépasse ton frère !',
        art: `<div class="how__xp"><span class="pill pill--info">Niveau 4</span><div class="cprog__track" style="width:100%"><span style="width:60%"></span></div><span class="pill pill--gold">+ 150 XP</span></div>` },
      { t: 'Monte de division', p: 'Finis dans les deux premiers pour monter, de District jusqu\'à la Ligue 1.',
        art: `<div class="how__divs">${DIVISIONS.map((d, i) => `<span class="how__div" style="--h:${28 + i * 14}px"><i>${i + 1}</i><b>${d.name}</b></span>`).join('')}</div>` },
      { t: 'Gagne des pièces, ouvre des paquets, bats ton frère', p: `Les matchs rapportent des pièces. ${PACKS.small.cost} pièces = 1 carte, ${PACK_COST} pièces = ${PACK_SIZE} cartes. Seul le paquet de ${PACK_SIZE} cartes peut contenir une légende, et ses cartes sont plus fortes. Complète ton album, sélection après sélection !`,
        art: `<div class="how__packs">${A.cardBack({ size: 'sm' })}${A.card(rare, { size: 'sm' })}${A.card(legend, { size: 'sm' })}</div>` },
    ];
    el.innerHTML = `<div class="page page--narrow">${C.pageHead('Comment jouer', { kicker: 'Aide', sub: `Six étapes, et tu sais tout.` })}
      <ol class="how">${steps.map((s, i) => `<li class="how__step panel"><span class="how__n display">${i + 1}</span><div class="how__text"><h2>${s.t}</h2><p>${s.p}</p></div><div class="how__art">${s.art}</div></li>`).join('')}</ol>
      <div class="stack stack--sm">${C.button({ label: 'Jouer un match', variant: 'gold', size: 'lg', block: true, icon: '⚽', href: '#/play' })}${C.button({ label: 'Aller m\'entraîner', variant: 'secondary', block: true, href: '#/training' })}</div></div>`;
  },
};
