// Rivals: podium, ranked rows, sort tabs and head-to-head.
import * as C from '../components.js';
import * as A from '../art.js';
import { levelInfo } from '../../core/rewards.js';
import { divisionName } from '../../core/league.js';
import { leaderboardSummary, summaryWeekXp } from '../../core/stats.js';
import { clubFrom, listen } from './_meta.js';

const pct = (a) => Math.round((Number(a) || 0) * 100);
/** Finite number from a stored value (another user's document), else 0. */
const nb = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const NUM_FIELDS = ['xp', 'wins', 'draws', 'losses', 'accuracy', 'bestWinStreak', 'cards', 'titles', 'division', 'matches'];
/** One leaderboard row with every field coerced, or null when the row is not an object. */
function cleanRow(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const r = { ...s, uid: String(s.uid ?? ''), displayName: String(s.displayName ?? ''), club: String(s.club ?? '') };
  for (const k of NUM_FIELDS) r[k] = nb(s[k]);
  return r;
}
const num = (n) => Number(n || 0).toLocaleString('fr-FR').replace(/\s/g, ' ');

const SORTS = [
  { id: 'xp', label: 'XP', get: (r) => r.xp, fmt: (v) => num(v), unit: 'XP', gap: 'XP' },
  { id: 'week', label: 'Semaine', get: (r) => r.weekXp, fmt: (v) => num(v), unit: 'XP', gap: 'XP cette semaine' },
  { id: 'wins', label: 'Victoires', get: (r) => r.wins, fmt: (v) => v, unit: 'victoires', gap: 'victoires' },
  { id: 'acc', label: 'Réussite', get: (r) => pct(r.accuracy), fmt: (v) => `${v} %`, unit: 'réussite', gap: 'points de réussite' },
  { id: 'streak', label: 'Série', get: (r) => r.bestWinStreak, fmt: (v) => v, unit: 'meilleure série', gap: 'victoires d\'affilée' },
  { id: 'cards', label: 'Cartes', get: (r) => r.cards, fmt: (v) => v, unit: 'cartes', gap: 'cartes' },
];

const H2H = [
  { label: 'Niveau', get: (r) => r.level },
  { label: 'XP', get: (r) => r.xp, format: num },
  { label: 'XP de la semaine', get: (r) => r.weekXp, format: num },
  { label: 'Victoires', get: (r) => r.wins },
  { label: 'Défaites', get: (r) => r.losses, higherIsBetter: false },
  { label: 'Réussite', get: (r) => pct(r.accuracy), format: (v) => `${v} %` },
  { label: 'Meilleure série', get: (r) => r.bestWinStreak },
  { label: 'Cartes', get: (r) => r.cards },
  { label: 'Titres', get: (r) => r.titles },
];

export default {
  title: 'Rivaux',
  async mount(el, ctx, params = {}) {
    el.innerHTML = '<div class="page"><p class="text-dim">Chargement du classement…</p></div>';
    const now = ctx.now();
    let raw;
    try { raw = await ctx.store.listLeaderboard(); } catch {
      el.innerHTML = `<div class="page page--narrow">${C.emptyState({ icon: '📡', title: 'Classement indisponible', text: 'Vérifie ta connexion et réessaie.', action: C.button({ label: 'Réessayer', variant: 'secondary', attrs: { 'data-act': 'retry' } }) })}</div>`;
      const stopRetry = listen(el, 'click', (ev) => { if (ev.target.closest('[data-act="retry"]')) ctx.navigate('#/rivals'); });
      return stopRetry;
    }
    const myUid = ctx.user?.uid;
    const isPlayer = ctx.user?.role === 'player' && ctx.state;
    // a malformed row is skipped, never thrown on
    const toRow = (s) => {
      try {
        const r = cleanRow(s);
        return r ? [{ ...r, weekXp: nb(summaryWeekXp(r, now)), level: levelInfo(r.xp).level }] : [];
      } catch { return []; }
    };
    const rows = (Array.isArray(raw) ? raw : []).flatMap(toRow);
    if (isPlayer && !rows.some((r) => r.uid === myUid)) {
      try { rows.push(...toRow({ uid: myUid, ...leaderboardSummary(ctx.state, now) })); } catch { /* own state unreadable: no own row */ }
    }
    let sortId = 'xp';
    let vs = params.vs || null;

    const sorted = () => {
      const sd = SORTS.find((x) => x.id === sortId);
      return [...rows].sort((a, b) => sd.get(b) - sd.get(a) || b.xp - a.xp || String(a.displayName).localeCompare(String(b.displayName)));
    };
    const clubOf = (r) => clubFrom(r.club, r.colors);
    const sub = (r) => `Niv. ${r.level} · ${divisionName(r.division)}`;
    const href = (r) => `#/rivals?vs=${encodeURIComponent(r.uid)}`;

    // ---------- header line that makes you want to win ----------
    const taunt = (list, sd) => {
      if (!isPlayer || list.length < 2) return '';
      const me = list.findIndex((r) => r.uid === myUid);
      if (me < 0) return '';
      if (me === 0) {
        const d = sd.get(list[0]) - sd.get(list[1]);
        return d > 0
          ? `<div class="taunt taunt--lead"><b>Tu es en tête !</b> ${num(d)} ${sd.gap} d'avance sur ${C.esc(list[1].displayName)}. Ne le laisse pas revenir.</div>`
          : `<div class="taunt"><b>Égalité en tête</b> avec ${C.esc(list[1].displayName)}. Un point de plus et tu passes devant !</div>`;
      }
      const d = sd.get(list[me - 1]) - sd.get(list[me]);
      return `<div class="taunt taunt--chase"><b>${C.esc(list[me - 1].displayName)} est devant.</b> ${d > 0 ? `Il te manque ${num(d)} ${sd.gap} pour le dépasser.` : 'Presque égalité, un effort et tu passes !'}</div>`;
    };

    // ---------- podium ----------
    const slot = (r, rank, sd) => {
      const you = r.uid === myUid;
      const inner = `<span class="podium__medal" aria-hidden="true">${['', '🥇', '🥈', '🥉'][rank]}</span>
        <span class="podium__crest">${A.crest(clubOf(r), rank === 1 ? 72 : 56)}</span>
        <span class="podium__name">${C.esc(r.displayName)}${you ? ' <em class="lt__you">TOI</em>' : ''}</span>
        <span class="podium__club">${C.esc(r.club)}</span>
        <span class="podium__val num">${C.esc(sd.fmt(sd.get(r)))}</span><span class="podium__unit">${C.esc(sd.unit)}</span>
        <span class="podium__sub">${C.esc(sub(r))}</span>
        <span class="podium__block"><b class="num">${rank}</b></span>`;
      const cls = `podium__slot podium__slot--${rank} ${you ? 'is-you' : ''}`;
      return isPlayer ? `<a class="${cls}" href="${href(r)}" aria-label="Face à face avec ${C.esc(r.displayName)}">${inner}</a>` : `<div class="${cls}">${inner}</div>`;
    };

    const board = () => {
      const sd = SORTS.find((x) => x.id === sortId);
      const list = sorted();
      const top = list.slice(0, 3), rest = list.slice(3);
      const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
      const podium = `<div class="podium podium--${top.length}">${order.map((i) => slot(top[i], i + 1, sd)).join('')}</div>`;
      const restRows = rest.map((r, i) => {
        const club = { ...clubOf(r), name: `${r.club} · ${sub(r)}` };
        return C.leaderboardRow({ rank: i + 4, name: r.displayName, club, value: sd.fmt(sd.get(r)), label: sd.unit, isYou: r.uid === myUid, href: isPlayer ? href(r) : undefined });
      }).join('');
      const duelBtn = isPlayer && list.length >= 2 && list.length <= 3
        ? `<div class="duel-cta">${list.filter((r) => r.uid !== myUid).map((r) => C.button({ label: `Face à face avec ${r.displayName}`, variant: 'gold', size: 'lg', block: true, icon: '⚔️', href: href(r) })).join('')}</div>` : '';
      return `${taunt(list, sd)}${podium}${restRows ? `<div class="stack stack--sm">${restRows}</div>` : ''}${duelBtn}`;
    };

    const renderList = () => {
      if (rows.length < 2) {
        el.innerHTML = `<div class="page page--narrow">${C.pageHead('Rivaux', { kicker: 'Classement' })}
          ${C.emptyState({ icon: '⚔️', title: 'Invite ton frère à créer son club !', text: 'Le classement se remplit dès qu\'un deuxième joueur a son club. Qui sera le premier ?' })}
          ${rows.length ? `<div class="stack stack--sm">${C.leaderboardRow({ rank: 1, name: rows[0].displayName, club: clubOf(rows[0]), value: num(rows[0].xp), label: 'XP', isYou: rows[0].uid === myUid })}</div>` : ''}</div>`;
        return;
      }
      el.innerHTML = `<div class="page rivals">${C.pageHead('Rivaux', { kicker: 'Qui est le meilleur ?', sub: 'Touche un joueur pour te comparer à lui.' })}
        ${C.tabs(SORTS.map(({ id, label }) => ({ id, label })), sortId, { scroll: true, attrs: { 'aria-label': 'Trier le classement' } })}
        <div class="stack" id="board">${board()}</div></div>`;
    };

    // ---------- head-to-head ----------
    const renderH2h = () => {
      const me = rows.find((r) => r.uid === myUid), rv = rows.find((r) => r.uid === vs);
      if (!me || !rv || me === rv) { vs = null; renderList(); return; }
      let a = 0, b = 0;
      const lines = H2H.map((h) => {
        const x = h.get(me), y = h.get(rv);
        if (x !== y) { if ((x > y) === (h.higherIsBetter !== false)) a++; else b++; }
        return { label: h.label, me: x, rival: y, higherIsBetter: h.higherIsBetter, format: h.format };
      });
      const verdict = a > b ? `Tu mènes ${a}–${b}` : b > a ? `${C.esc(rv.displayName)} mène ${b}–${a}` : `Égalité ${a}–${b}`;
      const tone = a > b ? 'lead' : b > a ? 'chase' : '';
      const line = a > b ? 'Continue comme ça !' : b > a ? 'À toi de jouer pour le rattraper.' : 'Le prochain match fera la différence.';
      el.innerHTML = `<div class="page page--narrow rivals">
        <div class="row row--between row--center"><button class="btn btn--ghost btn--sm" type="button" data-act="back"><span class="btn__icon" aria-hidden="true">←</span><span class="btn__label">Classement</span></button></div>
        ${C.pageHead('Face à face', { kicker: 'Toi contre ' + rv.displayName })}
        <div class="verdict verdict--${tone}"><span class="verdict__big display">${verdict}</span><span class="verdict__sub">${line}</span></div>
        ${C.panel(C.h2h({ me: { name: me.displayName, club: clubOf(me) }, rival: { name: rv.displayName, club: clubOf(rv) }, rows: lines }), { cls: 'h2h-panel' })}
        <p class="text-dim text-sm text-center">${C.esc(me.displayName)} : ${C.esc(sub(me))} &nbsp;|&nbsp; ${C.esc(rv.displayName)} : ${C.esc(sub(rv))}</p></div>`;
    };

    const render = () => { if (vs) renderH2h(); else renderList(); };

    const stop = listen(el, 'click', (ev) => {
      const tab = ev.target.closest('[data-tab]');
      if (tab) {
        sortId = tab.dataset.tab;
        el.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === tab)));
        el.querySelector('#board').innerHTML = board();
        return;
      }
      if (ev.target.closest('[data-act="back"]')) { vs = null; render(); window.scrollTo(0, 0); return; }
      const a = ev.target.closest('a[href^="#/rivals?vs="]');
      if (a) {
        ev.preventDefault();
        const uid = decodeURIComponent(a.getAttribute('href').split('vs=')[1]);
        if (uid === myUid) { ctx.navigate('#/profile'); return; }
        vs = uid; render(); window.scrollTo(0, 0);
      }
    });
    render();
    return stop;
  },
};
