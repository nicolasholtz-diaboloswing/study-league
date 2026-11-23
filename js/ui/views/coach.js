// Parent dashboard: a summary card per child (this week), then the detail of the selected child.
import * as C from '../components.js';
import { coachReport, dayKey } from '../../core/stats.js';
import { computeTable, divisionName } from '../../core/league.js';
import { levelInfo } from '../../core/rewards.js';
import { EVENTS, EVENT_TOPIC_PREFIX } from '../../core/events.js';
import { allTopics, topicAvailable, isActivated } from '../../core/questions.js';
import { listen, fmtDate, fmtHour, fmtDuration, relTime, SQUADS } from './_meta.js';

const e = C.esc;
const pct = (x) => Math.round((Number(x) || 0) * 100);
/** Number from a stored value (another user's document), escaped for HTML. */
const n = (v) => e(Number.isFinite(Number(v)) ? Number(v) : 0);
const OUTCOMES = ['W', 'D', 'L'];
const WEEKDAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const okPlayer = (p) => !!p && typeof p === 'object' && !!p.state && typeof p.state === 'object' && !!p.state.profile && typeof p.state.profile === 'object';
const squadOf = (st) => SQUADS[st.profile.squad] || SQUADS.u13;
const plural = (k, one, many) => (k > 1 ? many : one);

function explainPending(user) {
  return `<div class="page page--narrow">${C.pageHead('Espace parent', { kicker: 'Parent' })}
    ${C.panel(`<div class="stack">
      <h2 class="coach__h">Votre compte n'est pas encore déclaré comme compte parent</h2>
      <p>Le compte « ${e(user.username)} » existe, mais Firebase ne sait pas encore que c'est un compte parent. Il faut le déclarer une fois, à la main, dans la console Firebase (Firestore Database) :</p>
      <ol class="coach__steps">
        <li>Vérifiez que la collection <b>members</b> contient un document dont l'ID est exactement <b>${e(String(user.username).toLowerCase())}@study-league.app</b> (avec un champ <code>ok</code> = <code>true</code>). Sans lui, le compte parent n'est pas autorisé du tout.</li>
        <li>Créez une collection nommée exactement <b>coaches</b> (c'est son nom technique, il ne change pas).</li>
        <li>Comme <b>ID du document</b>, collez l'identifiant (uid) ci-dessous. Ajoutez un champ au choix (par exemple <code>note</code> = <code>parent</code>), puis <b>Enregistrer</b>.</li>
        <li>Revenez ici, déconnectez-vous, reconnectez-vous : l'Espace parent s'affiche.</li>
      </ol>
      <div class="coach__uid"><span class="text-dim text-sm">Votre identifiant (uid) à copier</span>
        <div class="row row--center"><code id="coach-uid" class="grow">${e(user.uid)}</code>${C.button({ label: 'Copier', variant: 'secondary', size: 'sm', attrs: { 'data-act': 'copy' } })}</div></div>
      <p class="text-dim text-sm">Détails : fichier docs/FIREBASE_SETUP.md.</p></div>`, { tone: 'gold' })}</div>`;
}

export default {
  title: 'Espace parent',
  async mount(el, ctx) {
    const user = ctx.user;
    if (user?.coachPending) {
      el.innerHTML = explainPending(user);
      return listen(el, 'click', async (ev) => {
        if (!ev.target.closest('[data-act="copy"]')) return;
        try { await navigator.clipboard.writeText(user.uid); ctx.toast('Identifiant copié', 'ok'); } catch {
          const r = document.createRange(); r.selectNodeContents(el.querySelector('#coach-uid'));
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
          ctx.toast('Sélectionné : faites Ctrl+C', 'info');
        }
      });
    }
    if (!user || user.role !== 'coach') {
      el.innerHTML = `<div class="page page--narrow">${C.emptyState({ icon: '🔒', title: 'Réservé au parent', text: 'Cet écran est réservé au compte parent.', action: C.button({ label: 'Retour à l\'accueil', variant: 'secondary', href: '#/home' }) })}</div>`;
      return;
    }
    el.innerHTML = '<div class="page"><p class="text-dim">Chargement…</p></div>';
    let players;
    try { players = await ctx.store.listPlayerStates(); } catch (err) {
      el.innerHTML = `<div class="page page--narrow">${C.emptyState({ icon: '📡', title: 'Impossible de lire les joueurs', text: err?.message || 'Réessayez dans un instant.' })}</div>`;
      return;
    }
    players = (Array.isArray(players) ? players : []).filter(okPlayer);
    if (!players.length) {
      el.innerHTML = `<div class="page page--narrow">${C.pageHead('Espace parent', { kicker: 'Parent' })}${C.emptyState({ icon: '👪', title: 'Aucun joueur pour l\'instant', text: 'Dès qu\'un enfant crée son compte et joue, ses progrès apparaissent ici.' })}</div>`;
      return;
    }
    players.sort((a, b) => String(a.state.profile.displayName).localeCompare(String(b.state.profile.displayName)));
    const now = ctx.now();
    const topicName = {};
    for (const s of ctx.catalog.subjects) for (const t of s.topics) topicName[t.id] = t.name;
    for (const ev of EVENTS) topicName[EVENT_TOPIC_PREFIX + ev.id] = ev.name; // matches of an event mix carry the sentinel topic id
    let current = players[0].uid;
    try { const saved = sessionStorage.getItem('sl.coach.pick'); if (saved && players.some((p) => p.uid === saved)) current = saved; } catch { /* no storage */ }

    /** The topic (« thème ») with the lowest recent accuracy among those already played. */
    const weakestOf = (rep) => {
      let w = null;
      for (const t of rep.topics) {
        if (!(t.totalAnswered > 0) || !topicName[t.topicId]) continue;
        if (!w || t.accuracy < w.accuracy) w = { name: topicName[t.topicId], accuracy: t.accuracy };
      }
      return w;
    };

    /** Totals of the last 7 days (today included). */
    const weekOf = (st, rep) => {
      const days = rep.activity.slice(-7);
      const keys = new Set(days.map((d) => d.day));
      const sum = (k) => days.reduce((s, d) => s + (Number(d[k]) || 0), 0);
      const res = { W: 0, D: 0, L: 0 };
      for (const m of Array.isArray(st.matches) ? st.matches : []) if (m && keys.has(dayKey(m.at)) && OUTCOMES.includes(m.outcome)) res[m.outcome]++;
      const answered = sum('answered');
      return { matches: sum('matches'), ms: sum('ms'), answered, acc: answered ? sum('correct') / answered : null, ...res };
    };

    // ---------- top: one summary card per child ----------
    const summary = (p) => {
      const st = p.state;
      const head = `<span class="psum__head"><span class="psum__name">${e(st.profile.displayName)}</span><span class="psum__club">${e(st.profile.club)} · ${e(squadOf(st))}</span></span>`;
      let rep, wk;
      try { rep = coachReport(st, now); wk = weekOf(st, rep); } catch {
        return `<button type="button" class="psum" data-pick="${e(p.uid)}" aria-pressed="${p.uid === current}">${head}<span class="text-dim">Données illisibles.</span></button>`;
      }
      const w = weakestOf(rep);
      const work = w
        ? `<span class="psum__work"><span class="psum__k">À travailler</span><b>${e(w.name)}</b> <span class="text-dim">(${pct(w.accuracy)} % de réussite)</span></span>`
        : '<span class="psum__work"><span class="psum__k">À travailler</span><span class="text-dim">Pas encore de thème joué.</span></span>';
      const stat = (v, l) => `<span class="psum__stat"><b class="num">${v}</b><small>${l}</small></span>`;
      return `<button type="button" class="psum" data-pick="${e(p.uid)}" aria-pressed="${p.uid === current}" aria-label="Voir le détail de ${e(st.profile.displayName)}">
        ${head}
        <span class="psum__week">Cette semaine</span>
        <span class="psum__stats">
          ${stat(n(wk.matches), plural(wk.matches, 'match joué', 'matchs joués'))}
          ${stat(e(fmtDuration(wk.ms)), 'de jeu')}
          ${stat(`${n(wk.W)}<i>V</i> ${n(wk.D)}<i>N</i> ${n(wk.L)}<i>D</i>`, 'victoires, nuls, défaites')}
          ${stat(wk.acc == null ? '—' : `${pct(wk.acc)} %`, 'de bonnes réponses')}
        </span>
        ${work}
        <span class="psum__last">Dernière activité : ${e(relTime(rep.lastActive, now))}</span></button>`;
    };

    // ---------- detail: themes by subject, weakest first ----------
    const themesSection = (rep, state) => {
      const known = new Map(rep.topics.map((t) => [t.topicId, t]));
      const squad = state.profile.squad;
      const subjects = Array.isArray(ctx.catalog?.subjects) ? ctx.catalog.subjects : [];
      const out = [];
      for (const subj of subjects) {
        // an optional topic the child did not switch on is not listed, unless it was already played
        const topics = subj.topics.filter((t) => known.has(t.id) || ((t.squads || []).includes(squad) && topicAvailable(t, state.optionalTopics)));
        if (!topics.length) continue;
        const played = topics.filter((t) => known.get(t.id)?.totalAnswered > 0).map((t) => ({ t, m: known.get(t.id) })).sort((a, b) => a.m.accuracy - b.m.accuracy);
        const unplayed = topics.filter((t) => !(known.get(t.id)?.totalAnswered > 0));
        out.push(`<div class="coach__subj"><h3 class="coach__h3"><span aria-hidden="true">${e(subj.icon || '')}</span> ${e(subj.name)}</h3>
          ${played.map(({ t, m }) => C.masteryBar({ label: t.name, pct: pct(m.accuracy), stars: m.stars, meta: `${Number(m.totalAnswered) || 0} réponse${plural(m.totalAnswered, '', 's')}` })).join('')}
          ${unplayed.map((t) => `<div class="coach__todo"><span>${e(t.name)}</span><span class="text-faint">pas encore joué</span></div>`).join('')}</div>`);
      }
      return `${out.join('') || '<p class="text-dim">Aucun thème joué pour l\'instant.</p>'}<p class="text-faint text-sm">Maîtrise : réussite sur les 20 dernières réponses du thème. Étoiles à partir de 10 réponses (1 étoile dès 50 %, 2 dès 70 %, 3 dès 90 %).</p>`;
    };

    // ---------- optional topics the child switched on, read-only: only the child can change them (Firestore rules) ----------
    const optionalSection = (state) => {
      if (!allTopics(ctx.catalog).some((t) => t.optional && (t.squads || []).includes(state.profile.squad))) return '';
      // another user's document: only a positive number counts as an activation; most recent first
      const on = allTopics(ctx.catalog).filter((t) => t.optional && isActivated(state.optionalTopics, t.id)).sort((a, b) => state.optionalTopics[b.id] - state.optionalTopics[a.id]);
      return C.section('Thèmes en option', `${on.length ? `<div class="stack stack--sm">${on.map((t) => `<div class="coach__todo"><span>${e(t.name)} <span class="text-faint">· ${e(t.subjectName)}</span></span><span class="text-faint">activé le ${e(fmtDate(state.optionalTopics[t.id]))} à ${e(fmtHour(state.optionalTopics[t.id]))}</span></div>`).join('')}</div>` : '<p class="text-dim">Aucun thème en option activé.</p>'}<p class="text-faint text-sm">L'enfant les active lui-même depuis son profil.</p>`);
    };

    const player = (p) => {
      const st = p.state, rep = coachReport(st, now);
      const season = st.league?.season;
      let rank = '—';
      if (season) {
        const row = computeTable(season).find((r) => r.isPlayer);
        rank = season.matchday > 0 && row ? `${Number(row.position) || 0}${row.position === 1 ? 'er' : 'e'} sur 8` : 'Saison pas commencée';
      }
      const lvl = levelInfo(st.xp).level;
      const week = rep.activity.slice(-7);
      const today = week[week.length - 1].day;
      const days = week.map((d) => { const [y, m, dd] = d.day.split('-').map(Number); return { label: WEEKDAY[new Date(y, m - 1, dd).getDay()], value: d.matches, highlight: d.day === today }; });
      const active = week.filter((d) => d.matches > 0).length;
      const modeLabel = (m) => (m.mode === 'training' ? 'Entraînement' : m.mode === 'cup' ? 'Coupe' : 'Championnat');
      const recent = rep.recentMatches.filter((m) => m && typeof m === 'object').map((m) => { const oc = OUTCOMES.includes(m.outcome) ? m.outcome : 'L'; return `<div class="cm cm--${oc}">
          <span class="cm__date">${e(fmtDate(m.at, false))}</span>
          <span class="cm__what"><b>${e(topicName[m.topicId] || m.topicId)}</b></span>
          <span class="cm__sub">${modeLabel(m)}${m.mode === 'training' ? '' : ' · contre ' + e(m.opponent)}</span>
          <span class="cm__score num">${n(m.goalsFor)}–${n(m.goalsAgainst)}</span>
          <span class="cm__end"><span class="cm__ok num">${n(m.correct)}/${n(m.total)}</span>${C.pill({ W: 'Victoire', D: 'Nul', L: 'Défaite' }[oc], { W: 'ok', D: 'neutral', L: 'bad' }[oc])}</span></div>`; }).join('');
      const missed = rep.mostMissed.filter((q) => q && typeof q === 'object').map((q, i) => `<li class="miss"><span class="miss__n num">${i + 1}</span><div class="miss__body"><p class="miss__q">${e(q.prompt)}</p><p class="miss__a">Bonne réponse : <b>${e(q.answer)}</b></p><p class="miss__m">${e(topicName[q.topicId] || '')}</p></div><span class="miss__x"><b class="num">${n(q.wrong)}</b> ratée${q.wrong > 1 ? 's' : ''}<small>sur ${n(q.seen)} vue${q.seen > 1 ? 's' : ''}</small></span></li>`).join('');
      return `<div class="stack stack--lg">
        <div class="grid grid--3 coach__tiles">
          ${C.statTile({ label: 'Réussite globale', value: `${pct(rep.accuracy)} %`, tone: rep.accuracy >= 0.7 ? 'ok' : rep.accuracy >= 0.5 ? 'default' : 'bad' })}
          ${C.statTile({ label: 'Matchs en tout', value: rep.matches, sub: `${rep.wins} V · ${rep.draws} N · ${rep.losses} D` })}
          ${C.statTile({ label: 'Temps de jeu total', value: fmtDuration(rep.timePlayedMs) })}
          ${C.statTile({ label: 'Division', value: season ? divisionName(season.division) : '—', sub: rank })}
          ${C.statTile({ label: 'Niveau', value: lvl, sub: `${st.xp} XP`, tone: 'gold' })}
        </div>
        ${C.section('Les 7 derniers jours', `${C.barChart({ data: days, height: 110, unit: 'matchs' })}<p class="text-dim text-sm">Matchs par jour, championnat et entraînement. Aujourd'hui : barre dorée. ${active} jour${plural(active, '', 's')} joué${plural(active, '', 's')} sur 7.</p>`)}
        ${C.section('Thèmes, les plus fragiles d\'abord', `<div class="stack">${themesSection(rep, st)}</div>`)}
        ${optionalSection(st)}
        ${C.section('Questions les plus ratées', missed ? `<ol class="miss-list">${missed}</ol>` : '<p class="text-dim">Aucune erreur enregistrée pour l\'instant.</p>')}
        ${C.section('20 derniers matchs', recent ? `<div class="cm-list">${recent}</div>` : '<p class="text-dim">Aucun match joué.</p>')}</div>`;
    };

    const render = () => {
      const p = players.find((x) => x.uid === current) || players[0];
      const st = p.state;
      let body;
      try { body = player(p); } catch (err) {
        console.warn('coach: unreadable player', p.uid, err);
        body = '<p class="text-dim">Les données de ce joueur sont illisibles.</p>';
      }
      el.innerHTML = `<div class="page coach">${C.pageHead('Espace parent', { kicker: 'Parent', sub: 'Ce que chaque enfant a fait cette semaine, et ce qui lui pose problème.' })}
        <div class="psum-grid psum-grid--${Math.min(players.length, 3)}">${players.map(summary).join('')}</div>
        <h2 class="coach__name">${e(st.profile.displayName)} <small class="text-dim">${e(st.profile.club)} · ${e(squadOf(st))}</small></h2>
        ${body}</div>`;
    };

    const stop = listen(el, 'click', (ev) => {
      const pick = ev.target.closest('[data-pick]');
      if (!pick) return;
      current = pick.dataset.pick;
      try { sessionStorage.setItem('sl.coach.pick', current); } catch { /* ignore */ }
      render();
      el.querySelector('.coach__name')?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    render();
    return stop;
  },
};
