// League: full table, fixtures, division ladder, past seasons with trophies.
import * as C from '../components.js';
import * as A from '../art.js';
import { DIVISIONS, seasonLength, PLAYER_CLUB_ID, clubOf, fixturesOf, nextFixture, divisionName } from '../../core/league.js';
import { cupPlans, NEXT_EDITION_TEXT } from '../../core/cups.js';
import { tableRows, ordinal, esc } from '../shell-utils.js';

export default {
  title: 'Championnat',
  async mount(el, ctx) {
    const st = ctx.state;
    const season = st.league.season;
    const rows = tableRows(season);
    const me = rows.find((r) => r.isYou);
    const next = nextFixture(season);
    const fixtures = fixturesOf(season, PLAYER_CLUB_ID);

    const fixtureHtml = fixtures.map((f) => {
      const home = clubOf(season, f.home);
      const away = clubOf(season, f.away);
      const youSide = f.home === PLAYER_CLUB_ID ? 'home' : 'away';
      const played = f.hg != null;
      let result;
      if (played) {
        const gf = youSide === 'home' ? f.hg : f.ag;
        const ga = youSide === 'home' ? f.ag : f.hg;
        result = gf > ga ? 'W' : gf === ga ? 'D' : 'L';
      }
      const isNext = !played && next && f.md === next.matchday;
      return C.fixtureRow({
        matchday: f.md + 1, home, away, homeScore: f.hg, awayScore: f.ag, youSide, result,
        status: played ? 'played' : isNext ? 'next' : 'upcoming', href: isNext ? '#/play' : undefined,
      });
    }).join('');

    const ladder = [...DIVISIONS].reverse().map((d) => {
      const here = d.index === season.division;
      const done = d.index < season.division;
      return `<li class="ladder__row ${here ? 'is-here' : done ? 'is-done' : ''}">
        <span class="ladder__n num">${d.index + 1}</span><span class="ladder__name">${esc(d.name)}</span>
        ${here ? C.pill('Tu es ici', 'gold') : done ? '<span class="text-faint text-sm">Déjà passé ✓</span>' : ''}</li>`;
    }).join('');

    const history = [...st.league.history].reverse();
    // the four cups: locked ones show how to unlock them, the others the round to play and a play button
    const plural = (n, one, many) => (n > 1 ? many : one);
    const cupHtml = cupPlans(st, ctx.now(), { clubs: ctx.clubs, cards: ctx.cards, clubName: st.profile.club }).map((p) => {
      const { cup } = p;
      const rec = p.record;
      const doneUpTo = p.status === 'ready' ? p.round : p.status === 'waiting' && rec?.status === 'won' ? cup.rounds.length : rec?.round ?? 0;
      const rounds = `<ol class="cup__rounds" aria-label="Tours">${cup.rounds.map((r, i) => `<li class="cup__round ${i < doneUpTo ? 'is-done' : i === p.round && p.status === 'ready' ? 'is-now' : ''}">${esc(r)}</li>`).join('')}</ol>`;
      let text;
      let action = '';
      if (p.status === 'locked') text = `<span aria-hidden="true">🔒</span> ${esc(cup.unlockText)}`;
      else if (p.status === 'waiting') text = rec.status === 'won' ? `Coupe gagnée ! ${NEXT_EDITION_TEXT}.` : `Éliminé en ${esc(cup.rounds[rec.round].toLowerCase())}. ${NEXT_EDITION_TEXT}.`;
      else {
        text = `Édition ${p.edition} · ${esc(p.roundName)}${p.opponent ? ` contre ${esc(p.opponent.name)}` : ''}`;
        action = C.button({ label: p.round === 0 && !(rec && rec.status === 'active') ? 'Jouer' : 'Jouer le tour', size: 'sm', href: `#/play?cup=${encodeURIComponent(cup.id)}` });
      }
      const rule = `${cup.goalEvery} ${plural(cup.goalEvery, 'bonne réponse', 'bonnes réponses')} = 1 but${cup.concedeAll ? ' · chaque erreur = un but pour l\'adversaire' : ''}`;
      return `<div class="panel cup cup--${p.status}">
        <span class="cup__icon" aria-hidden="true">${cup.icon}</span>
        <div class="cup__body"><b>${esc(cup.name)}</b> ${p.trophies ? C.pill(`${p.trophies} trophée${p.trophies > 1 ? 's' : ''}`, 'gold') : ''}
          <div class="text-dim text-sm">${text}</div>
          ${p.status === 'locked' ? '' : `${rounds}<div class="text-faint text-sm">${esc(rule)}</div>`}</div>
        ${action}</div>`;
    }).join('');

    const historyHtml = history.length
      ? `<div class="stack stack--sm">${history.map((h) => `<div class="panel past ${h.champion ? 'panel--gold' : ''}">
          <span class="past__trophy">${A.trophy(44, { color: h.champion ? 'gold' : 'locked' })}</span>
          <div class="grow"><b>Saison ${h.season} · ${esc(divisionName(h.division))}</b>
            <div class="text-dim text-sm">${ordinal(h.position)} · ${h.points} points · ${h.gf} buts marqués</div></div>
          ${h.champion ? C.pill('Champion', 'gold') : h.promoted ? C.pill('Montée', 'ok') : ''}</div>`).join('')}</div>`
      : '<p class="text-dim">Ta première saison est en cours. Les trophées de tes saisons apparaîtront ici.</p>';

    el.innerHTML = `<div class="page">
      ${C.pageHead('Championnat', { kicker: `Saison ${season.number} · ${divisionName(season.division)}`, sub: `Tu es ${ordinal(me.pos)}. Les 2 premiers montent de division. ${next ? `Journée ${next.matchday + 1} sur ${seasonLength(season)} à venir.` : ''}` })}
      ${next ? C.button({ label: `Jouer la journée ${next.matchday + 1}`, size: 'lg', block: true, href: '#/play', icon: '⚽', cls: 'league__play' }) : ''}
      <div class="grid grid--split">
        ${C.section('Classement', C.leagueTable({ rows }))}
        ${C.section('Tes matchs', `<div class="stack stack--sm">${fixtureHtml}</div>`)}
      </div>
      ${C.section('Coupes', `<div class="stack stack--sm">${cupHtml}</div><p class="text-dim text-sm">Les coupes se jouent à côté du championnat : élimination directe, une nouvelle édition le lendemain. Chaque match gagné te donne une carte de club ou de pays.</p>`)}
      <div class="grid grid--split-even grid--split">
        ${C.section('Les divisions', `<ol class="ladder">${ladder}</ol><p class="text-dim text-sm">Finis dans les 2 premiers pour monter.</p>`)}
        ${C.section('Tes saisons', historyHtml)}
      </div>
    </div>`;
  },
};
