// League: full table, fixtures, division ladder, past seasons with trophies.
import * as C from '../components.js';
import * as A from '../art.js';
import { DIVISIONS, MATCHDAYS, PLAYER_CLUB_ID, clubOf, fixturesOf, nextFixture, divisionName } from '../../core/league.js';
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
    const historyHtml = history.length
      ? `<div class="stack stack--sm">${history.map((h) => `<div class="panel past ${h.champion ? 'panel--gold' : ''}">
          <span class="past__trophy">${A.trophy(44, { color: h.champion ? 'gold' : 'locked' })}</span>
          <div class="grow"><b>Saison ${h.season} · ${esc(divisionName(h.division))}</b>
            <div class="text-dim text-sm">${ordinal(h.position)} · ${h.points} points · ${h.gf} buts marqués</div></div>
          ${h.champion ? C.pill('Champion', 'gold') : h.promoted ? C.pill('Montée', 'ok') : ''}</div>`).join('')}</div>`
      : '<p class="text-dim">Ta première saison est en cours. Les trophées de tes saisons apparaîtront ici.</p>';

    el.innerHTML = `<div class="page">
      ${C.pageHead('Championnat', { kicker: `Saison ${season.number} · ${divisionName(season.division)}`, sub: `Tu es ${ordinal(me.pos)}. Les 2 premiers montent de division. ${next ? `Journée ${next.matchday + 1} sur ${MATCHDAYS} à venir.` : ''}` })}
      ${next ? C.button({ label: `Jouer la journée ${next.matchday + 1}`, size: 'lg', block: true, href: '#/play', icon: '⚽', cls: 'league__play' }) : ''}
      <div class="grid grid--split">
        ${C.section('Classement', C.leagueTable({ rows }))}
        ${C.section('Tes matchs', `<div class="stack stack--sm">${fixtureHtml}</div>`)}
      </div>
      <div class="grid grid--split-even grid--split">
        ${C.section('Les divisions', `<ol class="ladder">${ladder}</ol><p class="text-dim text-sm">Finis dans les 2 premiers pour monter.</p>`)}
        ${C.section('Tes saisons', historyHtml)}
      </div>
    </div>`;
  },
};
