// All badges as medals: unlocked first (with date), locked ones show the goal and the progress.
import * as C from '../components.js';
import { BADGES, badgeInfo } from '../../core/rewards.js';
import { uniqueCards } from '../../core/stats.js';
import { fmtDate } from './_meta.js';

const TIER = {
  'first-match': 'bronze', 'first-win': 'bronze', 'streak-3': 'bronze', 'hat-trick': 'bronze', 'clean-sheet': 'bronze',
  'matches-10': 'bronze', 'day-streak-3': 'bronze', 'cards-10': 'bronze', 'correct-100': 'bronze',
  'streak-5': 'silver', 'perfect': 'silver', 'matches-50': 'silver', 'promotion': 'silver', 'topic-master': 'silver',
  'day-streak-7': 'silver', 'cards-36': 'silver', 'first-legend': 'silver', 'correct-500': 'silver',
};

/** Progress {cur, goal, unit} for the badges that count something, else null. */
function progressOf(id, s, totalCards) {
  const t = s.totals;
  const map = {
    'streak-3': [t.bestWinStreak, 3, 'victoires d\'affilée'],
    'streak-5': [t.bestWinStreak, 5, 'victoires d\'affilée'],
    'streak-10': [t.bestWinStreak, 10, 'victoires d\'affilée'],
    'matches-10': [t.matches, 10, 'matchs'],
    'matches-50': [t.matches, 50, 'matchs'],
    'matches-100': [t.matches, 100, 'matchs'],
    'day-streak-3': [s.streak.best, 3, 'jours d\'affilée'],
    'day-streak-7': [s.streak.best, 7, 'jours d\'affilée'],
    'cards-10': [uniqueCards(s), 10, 'cartes'],
    'cards-36': [uniqueCards(s), 36, 'cartes'],
    'cards-all': [uniqueCards(s), Math.min(72, totalCards), 'cartes'],
    'correct-100': [t.correct, 100, 'bonnes réponses'],
    'correct-500': [t.correct, 500, 'bonnes réponses'],
    'correct-1000': [t.correct, 1000, 'bonnes réponses'],
  };
  const m = map[id];
  return m ? { cur: Math.min(m[0] || 0, m[1]), goal: m[1], unit: m[2] } : null;
}

export default {
  title: 'Médailles',
  async mount(el, ctx) {
    const s = ctx.state;
    if (!s) {
      el.innerHTML = `<div class="page page--narrow">${C.emptyState({ icon: '🏅', title: 'Les médailles sont pour les joueurs' })}</div>`;
      return;
    }
    const all = BADGES.map(badgeInfo);
    const done = all.filter((b) => s.badges[b.id]).sort((a, b) => s.badges[b.id] - s.badges[a.id]);
    const todo = all.filter((b) => !s.badges[b.id]);
    const cell = (b) => {
      const ok = !!s.badges[b.id];
      let foot;
      if (ok) foot = `<span class="bdg__date">Gagnée le ${fmtDate(s.badges[b.id])}</span>`;
      else {
        const p = progressOf(b.id, s, ctx.cards.length);
        foot = p ? `<span class="bdg__prog"><span class="bdg__track"><i style="width:${(p.cur / p.goal * 100).toFixed(0)}%"></i></span><span class="bdg__txt num">${p.cur}/${p.goal} ${C.esc(p.unit)}</span></span>` : '<span class="bdg__goal">À gagner</span>';
      }
      return `<div class="bdg">${C.badgeMedal({ icon: b.icon, name: b.name, desc: b.desc, unlocked: ok, tier: TIER[b.id] || 'gold' })}${foot}</div>`;
    };
    el.innerHTML = `<div class="page">${C.pageHead('Mes médailles', { kicker: 'Palmarès', sub: `${done.length} sur ${all.length} gagnées` })}
      <div class="panel cprog"><div class="cprog__track" role="progressbar" aria-valuemin="0" aria-valuemax="${all.length}" aria-valuenow="${done.length}" aria-label="Médailles gagnées"><span style="width:${(done.length / all.length * 100).toFixed(1)}%"></span></div>
      <p class="text-dim text-sm">${done.length === all.length ? 'Toutes les médailles ! Bravo champion.' : `Encore ${all.length - done.length} à aller chercher.`}</p></div>
      ${done.length ? C.section(`Gagnées (${done.length})`, `<div class="grid grid--3 bdg-grid">${done.map(cell).join('')}</div>`) : ''}
      ${todo.length ? C.section(`À gagner (${todo.length})`, `<div class="grid grid--3 bdg-grid">${todo.map(cell).join('')}</div>`) : ''}</div>`;
  },
};
