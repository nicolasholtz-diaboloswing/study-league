// The player's card: identity, career totals, trophy cabinet, and editing of name, club and kit.
import * as C from '../components.js';
import * as A from '../art.js';
import { divisionName } from '../../core/league.js';
import { levelInfo } from '../../core/rewards.js';
import { overallAccuracy, dayStreak } from '../../core/stats.js';
import { listOptionalTopics, isActivated } from '../../core/questions.js';
import { setOptionalTopic } from '../../core/state.js';
import { subjectLabel, subjectIcon } from '../shell-utils.js';
import { clubFrom, fmtDate, fmtDuration, listen, shortOf, SQUADS } from './_meta.js';

const e = C.esc;
const PALETTE = ['#1e40af', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#111827', '#f3f4f6', '#fbbf24', '#ea580c', '#84cc16'];
const NAME_MAX = 20, CLUB_MAX = 24;
const counter = (v, max) => `${String(v ?? '').length} / ${max} caractères`;

export default {
  title: 'Mon profil',
  async mount(el, ctx) {
    const s = ctx.state;
    if (!s) {
      const u = ctx.user;
      el.innerHTML = `<div class="page page--narrow">${C.pageHead(u?.username || 'Profil', { kicker: 'Compte parent' })}${C.emptyState({ icon: '👪', title: 'Compte parent', text: 'Un compte parent n\'a pas de club. Ouvre l\'Espace parent pour suivre les enfants.', action: C.button({ label: 'Voir les enfants', href: '#/coach' }) })}</div>`;
      return;
    }
    const now = ctx.now();
    const p = s.profile;
    const draft = { displayName: p.displayName, club: p.club, c1: p.colors[0], c2: p.colors[1] };
    const pal = (c) => (PALETTE.includes(c) ? PALETTE : [c, ...PALETTE]);

    const preview = () => {
      const club = clubFrom(draft.club || 'Mon club', [draft.c1, draft.c2]);
      return `<div class="pf-prev__crest">${A.crest(club, 84)}</div><div class="pf-prev__kit">${A.kit(draft.c1, draft.c2, { size: 92, pattern: 'hoops', number: 10 })}</div>`;
    };

    const t = s.totals;
    const lvl = levelInfo(s.xp);
    const trophies = (s.league?.history || []).filter((h) => h.champion);
    const history = (s.league?.history || []).slice().reverse();
    const season = s.league?.season;
    const optional = listOptionalTopics(ctx.catalog, p.squad); // none for a squad without optional topics (u10)
    const tile = (label, value, sub, tone) => C.statTile({ label, value, sub, tone });

    el.innerHTML = `<div class="page profile">
      <div class="pf-card panel panel--pitch">
        <div class="pf-card__art" id="pf-art">${preview()}</div>
        <div class="pf-card__id">
          <span class="page-head__kicker">${e(SQUADS[p.squad] || '')}</span>
          <h1 id="pf-name">${e(p.displayName)}</h1>
          <p class="pf-card__club" id="pf-club">${e(p.club)}</p>
          <p class="text-dim text-sm">Niveau <b class="num">${lvl.level}</b> · ${season ? divisionName(season.division) : 'District'} · membre depuis le ${fmtDate(s.createdAt)}</p>
        </div>
      </div>

      ${C.section('Ma carrière', `<div class="grid grid--3">
        ${tile('Matchs', t.matches)}
        ${tile('Victoires', t.wins, `${t.draws} nul${t.draws > 1 ? 's' : ''} · ${t.losses} défaite${t.losses > 1 ? 's' : ''}`, 'ok')}
        ${tile('Buts', `${t.goalsFor}–${t.goalsAgainst}`, 'marqués – encaissés')}
        ${tile('Réussite', `${Math.round(overallAccuracy(s) * 100)} %`, `${t.correct} bonnes réponses`)}
        ${tile('Temps de jeu', fmtDuration(t.timePlayedMs))}
        ${tile('Meilleure série', t.bestWinStreak, 'victoires d\'affilée', 'gold')}
        ${tile('Série de jours', dayStreak(s, now), `record : ${s.streak.best}`, 'gold')}
        ${tile('Matchs parfaits', t.perfect)}
      </div>`)}

      ${C.section('Salle des trophées', trophies.length
        ? `<div class="trophies">${trophies.map((h) => `<div class="trophy-cell">${A.trophy(72)}<b>Saison ${h.season}</b><span>${divisionName(h.division)}</span><small>${fmtDate(h.at, false)}</small></div>`).join('')}</div>`
        : `<div class="trophies trophies--empty">${A.trophy(72, { color: 'locked' })}<p class="text-dim">Pas encore de trophée. Termine premier d'une division pour gagner le tien !</p></div>`)}
      ${history.length ? C.section('Mes saisons', `<div class="season-list">${history.slice(0, 8).map((h) => `<div class="season-row"><span class="num">Saison ${h.season}</span><span>${divisionName(h.division)}</span><span>${h.position}${h.position === 1 ? 'er' : 'e'} · ${h.points} pts</span>${h.champion ? C.pill('Champion', 'gold') : h.promoted ? C.pill('Montée', 'ok') : ''}</div>`).join('')}</div>`) : ''}

      ${C.section('Mon club', `<form id="pf-form" class="stack" autocomplete="off" novalidate>
        ${C.field({ label: 'Ton prénom ou surnom', name: 'displayName', value: p.displayName, hint: counter(p.displayName, NAME_MAX), attrs: { maxlength: NAME_MAX } })}
        ${C.field({ label: 'Nom de ton club', name: 'club', value: p.club, hint: counter(p.club, CLUB_MAX), attrs: { maxlength: CLUB_MAX } })}
        ${C.colorPicker({ label: 'Couleur du maillot', name: 'c1', colors: pal(p.colors[0]), value: p.colors[0] })}
        ${C.colorPicker({ label: 'Couleur des détails', name: 'c2', colors: pal(p.colors[1]), value: p.colors[1] })}
        <p class="field__msg text-bad" id="pf-err" role="alert" hidden></p>
        ${C.button({ label: 'Enregistrer', variant: 'gold', size: 'lg', block: true, type: 'submit', id: 'pf-save' })}
      </form>`)}
      ${optional.length ? C.section('Thèmes en option', `<p class="text-dim text-sm">Ces thèmes sont en plus du programme : active-les un par un, quand tu veux les réviser.</p>
        <div class="stack stack--sm" id="pf-optional">${optional.map((sub) => C.panel(`<h3 class="topic-group"><span aria-hidden="true">${subjectIcon(sub.id, sub.icon)}</span> ${e(subjectLabel(sub))}</h3>${sub.topics.map((t) => C.toggle({
          label: t.name, name: 'optional', checked: isActivated(s.optionalTopics, t.id), attrs: { 'data-optional': t.id },
        })).join('')}`)).join('')}</div>`) : ''}
    </div>`;

    const form = el.querySelector('#pf-form'), err = el.querySelector('#pf-err');
    const readDraft = () => {
      draft.displayName = form.elements.displayName.value;
      draft.club = form.elements.club.value;
      draft.c1 = form.elements.c1.value;
      draft.c2 = form.elements.c2.value;
    };
    const off1 = listen(form, 'input', () => {
      readDraft();
      el.querySelector('#pf-art').innerHTML = preview();
      err.hidden = true;
      const nm = el.querySelector('#f-displayName-m'), cl = el.querySelector('#f-club-m');
      if (nm) nm.textContent = counter(draft.displayName, NAME_MAX);
      if (cl) cl.textContent = counter(draft.club, CLUB_MAX);
    });
    let saving = false;
    const off2 = listen(form, 'submit', async (ev) => {
      ev.preventDefault();
      if (saving) return;
      readDraft();
      const name = draft.displayName.trim().replace(/\s+/g, ' '), club = draft.club.trim().replace(/\s+/g, ' ');
      if (!name || !club) { err.textContent = !name ? 'Écris ton prénom ou un surnom.' : 'Donne un nom à ton club.'; err.hidden = false; return; }
      saving = true;
      p.displayName = name.slice(0, NAME_MAX);
      p.club = club.slice(0, CLUB_MAX);
      p.colors = [draft.c1, draft.c2];
      const me = season?.clubs?.find((c) => c.isPlayer);
      if (me) { me.name = p.club; me.short = shortOf(p.club); me.colors = [...p.colors]; }
      try {
        // ctx.save() never throws: on failure it shows its own toast and returns false (the next save retries)
        const ok = await ctx.save();
        el.querySelector('#pf-name').textContent = p.displayName;
        el.querySelector('#pf-club').textContent = p.club;
        if (ok) ctx.toast('Club enregistré !', 'ok');
      } finally { saving = false; }
    });
    const optBox = el.querySelector('#pf-optional');
    const off3 = optBox ? listen(optBox, 'change', async (ev) => {
      const box = ev.target.closest('[data-optional]');
      if (!box) return;
      ctx.setState(setOptionalTopic(ctx.state, box.dataset.optional, box.checked, ctx.now()));
      const ok = await ctx.save(); // never throws: on failure it shows its own toast and the next save retries
      if (ok) ctx.toast(box.checked ? 'Thème ajouté : tu le trouves dans Jouer et Entraînement.' : 'Thème retiré de la liste. Tes étoiles sont gardées.', 'ok');
    }) : () => {};
    return () => { off1(); off2(); off3(); };
  },
};
