// Home: the club, one big "Jouer le match" button, the next fixture, progress, level, streak, coins, coach's pick, rivalry, table snippet.
import * as C from '../components.js';
import * as A from '../art.js';
import { PACK_COST, MATCH_QUESTIONS, MATCH_MINUTES } from '../../config.js';
import { nextFixture, divisionName, seasonLength } from '../../core/league.js';
import { RULE } from '../rules.js';
import { listTopics } from '../../core/questions.js';
import { weakestTopic, topicStars } from '../../core/stats.js';
import { myClub, levelBar, tableRows, ordinal, lsGet, lsDel, subjectIcon, streakInfo, nextPackLevel, rivalryLine, esc } from '../shell-utils.js';

const WELCOME = [
  { icon: '❓', title: 'Réponds aux questions', text: `Un match, c'est ${MATCH_QUESTIONS} questions. Réponds juste et vite pour gagner de l'XP.` },
  { icon: '⚽', title: 'Marque des buts', text: `${RULE.line}. Une erreur, et l'adversaire peut marquer !` },
  { icon: '🏆', title: 'Monte et gagne des cartes', text: 'Bats les autres clubs pour monter de division. Tu gagnes des pièces pour ouvrir des paquets de cartes.' },
];

function showWelcome(ctx) {
  let i = 0;
  const show = () => {
    const s = WELCOME[i];
    const last = i === WELCOME.length - 1;
    const m = C.showModal(C.modal({
      id: 'welcome',
      title: i === 0 ? `Bienvenue, ${ctx.state.profile.displayName} !` : s.title,
      body: `<div class="welcome"><div class="welcome__icon" aria-hidden="true">${s.icon}</div>
        ${i === 0 ? `<h3 class="welcome__h">${C.esc(s.title)}</h3>` : ''}
        <p>${C.esc(s.text)}</p>
        <div class="steps" aria-label="Étape ${i + 1} sur 3">${WELCOME.map((_, k) => `<i class="${k === i ? 'is-now' : k < i ? 'is-done' : ''}"></i>`).join('')}</div></div>`,
      actions: [
        ...(last ? [] : [C.button({ label: 'Passer', variant: 'ghost', attrs: { 'data-skip': '' } })]),
        C.button({ label: last ? 'C\'est parti !' : 'Suivant', variant: 'gold', size: 'lg', attrs: { 'data-next': '' } }),
      ],
    }));
    m.querySelector('[data-next]').focus();
    m.addEventListener('click', (e) => {
      if (e.target.closest('[data-skip]')) { C.closeModal(); return; }
      if (!e.target.closest('[data-next]')) return;
      if (last) { C.closeModal(); return; }
      i += 1; show();
    });
  };
  show();
}

export default {
  title: 'Accueil',
  async mount(el, ctx) {
    const st = ctx.state;
    const season = st.league.season;
    const me = myClub(st);
    const fx = nextFixture(season);
    const rows = tableRows(season);
    const mePos = rows.find((r) => r.isYou).pos;
    const start = Math.max(0, Math.min(mePos - 2, rows.length - 4));
    const snippet = rows.slice(start, start + 4);

    const topics = listTopics(ctx.catalog, st.profile.squad);
    const pick = weakestTopic(st, topics);
    const streak = streakInfo(st, ctx.now());
    const lvl = levelBar(st.xp);
    const toGo = Math.max(0, lvl.next - lvl.xp);
    const pct = lvl.next > 0 ? Math.min(100, Math.round((lvl.xp / lvl.next) * 100)) : 0;
    const canBuy = st.coins >= PACK_COST;

    const fixture = fx ? `<div class="fixture-card">
        <div class="fixture-card__team">${A.crest(me, 72)}<b>${C.esc(me.name)}</b></div>
        <div class="fixture-card__vs"><span class="display">VS</span></div>
        <div class="fixture-card__team">${A.crest(fx.opponent, 72)}<b>${C.esc(fx.opponent.name)}</b></div>
      </div>` : '';

    el.innerHTML = `<div class="page home">
      <section class="panel panel--pitch home__club">
        <div class="home__crest">${A.crest(me, 84)}</div>
        <div>
          <p class="page-head__kicker">Salut ${C.esc(st.profile.displayName)} !</p>
          <h1 class="home__name">${C.esc(me.name)}</h1>
          <p class="home__div">${C.pill(divisionName(season.division), 'gold')} <span class="text-dim">${ordinal(mePos)} sur ${rows.length}</span></p>
        </div>
      </section>

      <div class="home__top">
        <section class="panel panel--gold home__next">
          <p class="home__kicker">Prochain match${fx ? ` · journée ${fx.matchday + 1} sur ${seasonLength(season)}` : ''}</p>
          ${fixture}
          ${C.button({ label: 'Jouer le match', size: 'lg', block: true, icon: '⚽', href: '#/play', cls: 'home__play' })}
          <div class="home__progress" aria-label="Progression">
            <p><b>Niveau ${lvl.level}</b> · encore ${toGo} XP</p>
            <div class="minibar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
            <p class="text-dim text-sm">${st.freePacks > 0 ? 'Tu as un paquet à ouvrir !' : `Paquet offert au niveau ${nextPackLevel(lvl.level)}`}</p>
          </div>
          <p class="text-center text-dim text-sm">${MATCH_QUESTIONS} questions · environ ${MATCH_MINUTES} minutes</p>
        </section>

        <div class="home__stats stack">
          <div class="home__levelpanel">${C.section('Ton niveau', `<div class="panel">${C.xpBar(lvl)}</div>`)}</div>
          <div class="grid grid--2">
            <div class="${streak.urgent ? 'streak-urgent' : ''}">${C.statTile({ label: streak.days > 1 ? 'jours de suite' : 'jour de suite', value: streak.days, icon: '🔥', tone: streak.days > 0 ? 'gold' : 'default', sub: streak.text })}</div>
            ${C.statTile({ label: 'pièces', value: st.coins, icon: '🪙', tone: 'gold', sub: canBuy ? 'Assez pour un paquet !' : `Encore ${PACK_COST - st.coins} pour un paquet` })}
          </div>
          ${canBuy ? C.button({ label: 'Ouvrir un paquet de cartes', variant: 'secondary', block: true, icon: '🃏', href: '#/cards' }) : ''}
        </div>
      </div>

      <div id="h-rival"></div>

      ${st.freePacks > 0 ? `<a class="panel panel--gold home__gift" href="#/cards"><span class="home__gift__icon" aria-hidden="true">🎁</span><span><b>Tu as ${st.freePacks > 1 ? st.freePacks + ' paquets offerts' : 'un paquet offert'} !</b><br><span class="text-dim">Touche ici pour l'ouvrir.</span></span></a>` : ''}

      <div class="grid grid--split">
        <div class="stack">
          ${pick ? C.section('Choix du coach', `<div class="home__pick">${C.topicTile({
            name: pick.name, icon: subjectIcon(pick.subjectId, pick.icon), stars: topicStars(st, pick.id), coachPick: true,
            meta: `${pick.subjectId === 'en' ? 'Anglais' : pick.subjectName} · ton point à travailler`, href: `#/play?topic=${encodeURIComponent(pick.id)}`,
          })}<p class="text-dim text-sm">Joue ce thème : tu gagnes 50 % de pièces en plus.</p></div>`) : ''}
        </div>
        <div class="stack">
          ${C.section('Classement', `${C.leagueTable({ rows: snippet, compact: true })}`, { link: { href: '#/league', label: 'Tout voir' } })}
        </div>
      </div>
    </div>`;

    let gone = false;
    // rivalry: one line from the leaderboard; nothing when it fails or when the player is alone
    Promise.resolve().then(() => ctx.store.listLeaderboard()).then((board) => {
      if (gone) return;
      const line = rivalryLine(board, ctx.user?.uid, st.xp);
      const slot = el.querySelector('#h-rival');
      if (line && slot) slot.innerHTML = `<a class="rival-line" href="#/rivals"><span aria-hidden="true">⚡</span><span>${esc(line.text)}</span></a>`;
    }).catch(() => {});

    const key = `studyleague.welcome.${ctx.user.uid}`;
    if (lsGet(key)) {
      lsDel(key);
      showWelcome(ctx);
    }
    return () => { gone = true; };
  },
};
