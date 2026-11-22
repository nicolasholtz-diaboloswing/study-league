// Result screen: shows the already-applied match (the match view applies it once, then navigates here).
import * as C from '../components.js';
import * as E from '../effects.js';
import { divisionName, seasonLength } from '../../core/league.js';
import { listTopics } from '../../core/questions.js';
import { minCorrectForLossCoins } from '../../core/rewards.js';
import { flow } from '../flow.js';
import { ordinal, esc, rivalryLine, overtaken } from '../shell-utils.js';

const OUTCOME = {
  W: { title: 'Victoire !', cls: 'is-win' },
  D: { title: 'Match nul', cls: 'is-draw' },
  L: { title: 'Défaite', cls: 'is-loss' },
};

export default {
  title: 'Résultat',
  async mount(el, ctx) {
    const r = flow.last;
    if (!r) { ctx.navigate('#/home'); return; }
    const { result, events, me, opp, review } = r;
    const league = r.mode === 'league';
    const topicNames = Object.fromEntries(listTopics(ctx.catalog, ctx.state.profile.squad).map((t) => [t.id, t.name]));
    const ev = (t) => events.filter((e) => e.type === t);
    const xp = ev('xp')[0];
    const coins = ev('coins')[0];
    const levelUp = ev('level-up')[0];
    const badges = ev('badge');
    const packs = ev('free-pack').length;
    const mastery = ev('mastery');
    const streak = ev('streak')[0];
    const md = ev('matchday')[0];
    const seasonEnd = ev('season-end')[0];
    const o = OUTCOME[result.outcome];
    const win = result.outcome === 'W';
    const goodTraining = !league && result.accuracy >= 0.7;
    const reloadForfeit = r.forfeit && r.forfeitReason === 'reload';

    const headline = league
      ? `<div class="result__outcome ${o.cls} ${reloadForfeit ? "result__outcome--long" : ""}"><h1 class="display">${reloadForfeit ? 'Match abandonné : défaite par forfait' : r.forfeit ? 'Match abandonné' : o.title}</h1>
          <p>${reloadForfeit ? 'La page a été fermée ou rechargée pendant le match.' : r.forfeit ? 'Tu as quitté le match : la fin compte comme perdue.'
            : win ? `Tu bats ${esc(opp.name)} !` : result.outcome === 'D' ? 'Un point chacun.' : 'Tu te rattrapes au prochain match !'}</p></div>`
      : `<div class="result__outcome ${goodTraining ? 'is-win' : 'is-draw'}"><h1 class="display">${goodTraining ? 'Bien joué !' : 'Entraînement terminé'}</h1>
          <p>${goodTraining ? 'Tu maîtrises de mieux en mieux ce thème.' : 'Continue : chaque entraînement te fait progresser.'}</p></div>`;

    const score = league
      ? C.scoreboard({ home: me, away: opp, homeScore: result.goalsFor, awayScore: result.goalsAgainst, minute: 90, status: 'Fin du match' })
      : '';

    const rewards = [];
    rewards.push(`<div class="reward-row"><span class="reward-row__label">XP gagnés</span><b class="reward-row__val num text-gold">+<span data-count="${xp.total}">0</span></b>
      <span class="reward-row__sub">${league ? `Réponses ${xp.base} · Rapidité ${xp.speed} · Résultat ${xp.outcome}` : 'Moitié moins qu\'en championnat'}</span></div>`);
    if (league && coins) {
      const noCoins = result.outcome === 'L' && result.correct < minCorrectForLossCoins(result.total);
      rewards.push(`<div class="reward-row"><span class="reward-row__label">Pièces</span><b class="reward-row__val num text-gold">+<span data-count="${coins.total}">0</span></b>
        <span class="reward-row__sub">${noCoins ? `Défaite avec moins de ${minCorrectForLossCoins(result.total)} bonnes réponses : pas de pièces` : `${coins.perfect ? 'Match parfait : +' + coins.perfect + ' · ' : ''}${coins.coachPick ? `Choix du coach : +${coins.coachPick}` : 'Joue le Choix du coach pour 50 % en plus'}`}</span></div>`);
    }

    const extras = [];
    if (levelUp) extras.push(`<div class="panel panel--gold result__big"><span class="result__big-icon" aria-hidden="true">⭐</span><div><b class="display">Niveau ${levelUp.to} !</b><br><span class="text-dim">Tu passes au niveau supérieur.</span></div></div>`);
    if (seasonEnd) {
      const s = seasonEnd.summary;
      const text = seasonEnd.champion
        ? (seasonEnd.promoted ? `Tu es premier, tu montes en ${divisionName(seasonEnd.nextDivision)}. Le trophée est à toi !` : `Tu es premier de ${divisionName(s.division)}. Le trophée est à toi !`)
        : seasonEnd.promoted ? `Tu finis ${ordinal(s.position)} : tu montes en ${divisionName(seasonEnd.nextDivision)} !`
          : `Tu finis ${ordinal(s.position)}. Les deux premiers montent : tu restes en ${divisionName(s.division)} pour une nouvelle saison.`;
      extras.push(seasonEnd.promoted || seasonEnd.champion
        ? C.rewardBanner({ title: seasonEnd.champion ? `Champion de ${divisionName(s.division)} !` : 'Montée !', text })
        : `<div class="panel result__big"><span class="result__big-icon" aria-hidden="true">📅</span><div><b class="display">Saison terminée</b><br><span class="text-dim">${esc(text)}</span></div></div>`);
    } else if (md) {
      const second = md.table?.[1];
      const mine = md.table?.find((row) => row.isPlayer);
      const gap = md.position > 2 && second && mine ? Math.max(1, second.pts - mine.pts) : 0;
      extras.push(`<div class="panel result__big"><span class="result__big-icon" aria-hidden="true">📊</span><div><b class="display">Tu es ${ordinal(md.position)} au classement</b><br><span class="text-dim">${divisionName(ctx.state.league.season.division)}, ${md.matchday + 1} journée${md.matchday ? 's' : ''} jouée${md.matchday ? 's' : ''} sur ${seasonLength(ctx.state.league.season)}.</span>
        ${gap ? `<br><span class="result__gap">Il te manque ${gap} point${gap > 1 ? 's' : ''} pour être 2e (zone de montée).</span>` : ''}</div></div>`);
    }
    for (const m of mastery) extras.push(`<div class="panel result__big"><span class="result__big-icon" aria-hidden="true">🌟</span><div><b class="display">${esc(topicNames[m.topicId] || 'Thème')} : ${m.to} étoile${m.to > 1 ? 's' : ''} !</b><br><span class="text-dim">Tu progresses dans ce thème.</span></div></div>`);
    if (streak) extras.push(`<div class="panel result__big"><span class="result__big-icon" aria-hidden="true">🔥</span><div><b class="display">${streak.days} jour${streak.days > 1 ? 's' : ''} de suite !</b><br><span class="text-dim">Reviens demain pour continuer ta série.</span></div></div>`);
    if (packs) extras.push(`<a class="panel panel--gold result__big" href="#/cards"><span class="result__big-icon" aria-hidden="true">🎁</span><div><b class="display">${packs > 1 ? packs + ' paquets offerts' : 'Un paquet offert'} !</b><br><span class="text-dim">Touche ici pour l'ouvrir.</span></div></a>`);

    const badgeHtml = badges.length
      ? C.section('Nouvelles médailles', `<div class="grid grid--3">${badges.map((b) => C.badgeMedal({ icon: b.badge.icon, name: b.badge.name, desc: b.badge.desc, unlocked: true })).join('')}</div>`)
      : '';

    const actions = league
      ? `${C.button({ label: 'Voir le classement', size: 'lg', block: true, href: '#/league', icon: '📊' })}
         ${C.button({ label: 'Rejouer', variant: 'secondary', block: true, href: `#/play?topic=${encodeURIComponent(result.topicId)}` })}`
      : `${C.button({ label: 'Rejouer ce thème', size: 'lg', block: true, href: `#/training?topic=${encodeURIComponent(result.topicId)}`, icon: '⚽' })}
         ${C.button({ label: 'Autres thèmes', variant: 'secondary', block: true, href: '#/training' })}`;

    const reviewHtml = review.length
      ? C.section(`À revoir (${review.length})`, `<div class="stack stack--sm">${review.map((a) => `<article class="panel review">
          <p class="review__q">${esc(a.prompt)}</p>
          <p class="review__a">${a.timedOut ? '<span class="text-bad">Temps écoulé</span>' : a.given ? `Ta réponse : <span class="text-bad">${esc(a.given)}</span>` : ''}</p>
          <p>La bonne réponse : <b class="text-ok">${esc(a.answer)}</b></p>
          ${a.explain ? `<p class="text-dim text-sm">${esc(a.explain)}</p>` : ''}</article>`).join('')}</div>`)
      : r.forfeit && !result.answers.length ? '' : C.panel('<p class="text-center"><b>Sans faute !</b> Rien à revoir.</p>', { tone: 'pitch' });

    el.innerHTML = `<div class="page page--narrow result">
      ${score}
      ${league && result.difficulty === 'expert' ? `<p class="text-center">${C.pill('Mode expert', 'gold')}</p>` : ''}
      ${headline}
      <div class="grid grid--2">
        ${C.statTile({ label: 'bonnes réponses', value: `${result.correct} / ${result.total}`, tone: result.perfect ? 'gold' : 'ok', icon: '✅' })}
        ${league ? C.statTile({ label: 'buts marqués', value: result.goalsFor, icon: '⚽' }) : C.statTile({ label: 'de réussite', value: `${Math.round(result.accuracy * 100)} %`, icon: '🎯' })}
      </div>
      <section class="panel panel--gold rewards">${rewards.join('')}</section>
      <div id="r-rival" class="result__rival"></div>
      ${extras.join('')}
      ${badgeHtml}
      <div class="result__actions stack stack--sm">${actions}</div>
      ${reviewHtml}
    </div>`;

    let gone = false;
    // count-ups, then the party (after the level-up flash, when there is one)
    const party = () => {
      if (gone) return;
      el.querySelectorAll('[data-count]').forEach((n) => E.countUp(n, Number(n.dataset.count), { ms: 1100 }));
      if ((league && win && !r.forfeit) || seasonEnd?.champion || seasonEnd?.promoted) E.confetti({ count: seasonEnd?.champion ? 220 : 140 });
      el.querySelector('.result__actions a')?.focus({ preventScroll: true });
    };
    window.scrollTo(0, 0);
    if (levelUp) E.levelUpFlash(levelUp.to).then(party); else party();

    // rivalry line (silent when the leaderboard is unavailable or when the player is alone)
    {
      Promise.resolve().then(() => ctx.store.listLeaderboard()).then((board) => {
        if (gone) return;
        const line = rivalryLine(board, ctx.user?.uid, ctx.state.xp);
        if (!line) return;
        const passed = overtaken(board, ctx.user?.uid, ctx.state.xp - xp.total, ctx.state.xp);
        const slot = el.querySelector('#r-rival');
        if (!slot) return;
        slot.innerHTML = `<a class="rival-line" href="#/rivals"><span aria-hidden="true">⚡</span><span>${esc(line.text)}</span></a>${passed ? `<p class="rival-pass">Tu viens de dépasser ${esc(passed)} !</p>` : ''}`;
      }).catch(() => {});
    }

    return () => { gone = true; document.getElementById('overlay')?.replaceChildren(); };
  },
};
