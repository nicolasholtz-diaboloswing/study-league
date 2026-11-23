// Match set-up for a league or cup match: subject -> topic -> pre-match screen -> kick-off.
// While an event is active for the squad (u13 ECE Event), the subject/topic choice is skipped: the questions are a mix.
import * as C from '../components.js';
import * as A from '../art.js';
import { LEAGUE_QUESTIONS, LEAGUE_MINUTES } from '../../config.js';
import { nextFixture, divisionName, seasonLength, goalEveryOf } from '../../core/league.js';
import { listSubjects, listTopics } from '../../core/questions.js';
import { weakestTopic, topicMastery } from '../../core/stats.js';
import { cupById, cupPlan } from '../../core/cups.js';
import { activeEvent, eventTopic, eventToAnnounce, markEventAnnounced } from '../../core/events.js';
import { ruleFor } from '../rules.js';
import { prepareMatch } from '../flow.js';
import { myClub, subjectLabel, subjectIcon, groupTopics } from '../shell-utils.js';
import { fmtDate } from './_meta.js';

/** « 2 décembre »-style end date of an event ('YYYY-MM-DD'). */
const eventEnd = (event) => { const [y, m, d] = event.end.split('-').map(Number); return fmtDate(new Date(y, m - 1, d).getTime(), false); };

/** Small banner for the pre-match screen while an event runs. */
export const eventBanner = (event) => `<p class="event-banner"><span aria-hidden="true">🎓</span> <b>${C.esc(event.name)}</b> · jusqu'au ${C.esc(eventEnd(event))}</p>`;

/** The event pop-up; resolves when the child closes it (route changes close modals, so it must be confirmed before navigating). */
export function announceEvent(event, subjectNames) {
  return new Promise((resolve) => {
    const m = C.showModal(C.modal({
      id: 'event',
      title: event.name,
      body: `<div class="event-pop"><div class="event-pop__icon" aria-hidden="true">🎓</div>
        <p><b>Évènement jusqu'au ${C.esc(eventEnd(event))} !</b></p>
        <p>Pendant l'évènement, les matchs mélangent les questions de ces matières : ${C.esc(subjectNames.join(', '))}, à parts égales. Plus besoin de choisir la matière.</p></div>`,
      actions: [C.button({ label: 'C\'est parti !', variant: 'gold', size: 'lg', block: true, attrs: { 'data-modal-close': '', 'data-event-go': '' } })],
    }));
    m.querySelector('[data-event-go]')?.focus();
    const obs = new MutationObserver(() => {
      if (document.querySelector('[data-modal]')) return;
      obs.disconnect();
      resolve();
    });
    obs.observe(document.getElementById('modal-root'), { childList: true });
  });
}

/** Names of the subjects of an event for this player's squad, e.g. ['Histoire-Géo', 'Anglais', 'SVT']. */
export const eventSubjectNames = (event, ctx) => event.subjects.map((id) => listSubjects(ctx.catalog, ctx.state.profile.squad, ctx.state.optionalTopics).find((s) => s.id === id)).filter(Boolean).map(subjectLabel);

export default {
  title: 'Jouer',
  async mount(el, ctx, params) {
    const st = ctx.state;
    const squad = st.profile.squad;
    const now = ctx.now();
    const event = activeEvent(squad, now);
    const subjects = listSubjects(ctx.catalog, squad, st.optionalTopics);
    const allTopics = listTopics(ctx.catalog, squad, null, st.optionalTopics);
    const season = st.league.season;
    const me = myClub(st);
    const cup = params.cup ? cupById(params.cup) : null;
    const plan = cup ? cupPlan(st, cup, now, { clubs: ctx.clubs, cards: ctx.cards, clubName: st.profile.club }) : null;
    if (params.cup && (!cup || plan.status !== 'ready')) {
      ctx.toast(plan?.status === 'waiting' ? 'Cette coupe revient demain.' : 'Cette coupe n\'est pas encore ouverte.', 'info');
      ctx.navigate('#/league');
      return;
    }
    const fx = cup ? null : nextFixture(season);
    const opponent = cup ? plan.opponent : fx.opponent;
    const goalEvery = cup ? cup.goalEvery : goalEveryOf(season.division);
    const rule = ruleFor(goalEvery, { concedeAll: !!cup?.concedeAll });
    // the coach's pick is suspended during the event
    const pick = event ? null : weakestTopic(st, allTopics);
    let subject = subjects.length === 1 ? subjects[0] : null;
    let topic = params.topic ? allTopics.find((t) => t.id === params.topic) || null : null;
    if (topic) subject = subjects.find((s) => s.id === topic.subjectId) || subject;
    if (event) topic = eventTopic(event); // no subject or topic to choose: the questions are a mix
    // a subject with a single topic for this squad: no topic screen, straight to the pre-match screen
    const single = (s) => !!s && s.topics.length === 1;
    if (!topic && single(subject)) topic = subject.topics[0];
    let busy = false;
    const subjectNames = event ? eventSubjectNames(event, ctx) : [];
    const kicker = cup
      ? `${cup.name} · ${plan.roundName}`
      : `${divisionName(season.division)} · journée ${fx.matchday + 1} sur ${seasonLength(season)}`;

    const mastery = (t) => topicMastery(st, t.id);
    const meta = (t) => {
      const m = mastery(t);
      return m.totalAnswered === 0 ? 'Pas encore joué' : `${Math.round(m.accuracy * 100)} % de réussite`;
    };

    function viewSubject() {
      return `<div class="page page--narrow">
        ${C.pageHead('Quelle matière ?', { kicker, sub: 'Choisis ce que tu veux réviser pour ce match.' })}
        <div class="grid grid--2">${subjects.map((s) => {
          const avg = Math.floor(s.topics.reduce((a, t) => a + mastery(t).stars, 0) / s.topics.length);
          const hasPick = pick && s.topics.some((t) => t.id === pick.id);
          return C.topicTile({ name: subjectLabel(s), icon: subjectIcon(s.id, s.icon), stars: avg, meta: `${s.topics.length} thème${s.topics.length > 1 ? 's' : ''}${hasPick ? ' · Choix du coach ici' : ''}`, attrs: { 'data-subject': s.id }, coachPick: false });
        }).join('')}</div>
      </div>`;
    }

    function viewTopic() {
      return `<div class="page page--narrow">
        ${C.pageHead('Quel thème ?', { kicker: subjectLabel(subject), sub: 'Le « Choix du coach » est ton point faible : il rapporte 50 % de pièces en plus.' })}
        ${groupTopics(subject.topics).map((sec) => {
          const grid = `<div class="grid grid--2">${sec.topics.map((t) => C.topicTile({
            name: t.name, icon: subjectIcon(subject.id, subject.icon), stars: mastery(t).stars, meta: meta(t), coachPick: !!pick && pick.id === t.id, attrs: { 'data-topic': t.id },
          })).join('')}</div>`;
          return sec.group ? C.section(sec.group, grid) : grid;
        }).join('')}
        ${subjects.length > 1 ? C.button({ label: 'Changer de matière', variant: 'ghost', attrs: { 'data-action': 'subjects' } }) : ''}
      </div>`;
    }

    function viewPrematch() {
      const isPick = !!pick && pick.id === topic.id;
      const cupNote = cup
        ? `<p class="text-center text-dim text-sm">Élimination directe. Match nul : tirs au but, tu passes si tu as plus de bonnes réponses que d'erreurs.</p>`
        : '';
      const back = event ? '' : single(subject) ? (subjects.length > 1 ? C.button({ label: 'Changer de matière', variant: 'ghost', attrs: { 'data-action': 'subjects' } }) : '')
        : C.button({ label: 'Changer de thème', variant: 'ghost', attrs: { 'data-action': 'topics' } });
      return `<div class="page page--narrow prematch">
        ${C.pageHead('Avant le match', { kicker })}
        ${event ? eventBanner(event) : ''}
        <section class="panel panel--gold stack">
          <div class="fixture-card">
            <div class="fixture-card__team">${A.crest(me, 72)}<b>${C.esc(me.name)}</b></div>
            <div class="fixture-card__vs"><span class="display">VS</span></div>
            <div class="fixture-card__team">${A.crest(opponent, 72)}<b>${C.esc(opponent.name)}</b></div>
          </div>
          <div class="prematch__topic"><span aria-hidden="true">${subjectIcon(topic.subjectId, topic.icon)}</span> <b>${C.esc(topic.name)}</b> ${isPick ? C.pill('Choix du coach · +50 % de pièces', 'gold') : ''}</div>
          ${event ? `<p class="text-center text-dim text-sm">Questions mélangées : ${C.esc(subjectNames.join(', '))}</p>` : ''}
          <p class="text-center text-dim">${LEAGUE_QUESTIONS} questions · environ ${LEAGUE_MINUTES} minutes</p>
          <div class="prematch__rule"><b>${C.esc(rule.line)} <span aria-hidden="true">⚽</span></b><small>${C.esc(rule.miss)}</small></div>
          ${cupNote}
        </section>
        ${back}
        <div class="kickoff-bar">${C.button({ label: busy ? 'On prépare le terrain…' : 'Coup d\'envoi !', size: 'lg', block: true, icon: '⚽', disabled: busy, attrs: { 'data-action': 'kickoff' } })}</div>
      </div>`;
    }

    function render() {
      el.innerHTML = !topic ? (!subject ? viewSubject() : viewTopic()) : viewPrematch();
      el.querySelector('[data-action="kickoff"]')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }

    const onClick = async (e) => {
      const sub = e.target.closest('[data-subject]');
      if (sub) {
        subject = subjects.find((s) => s.id === sub.dataset.subject);
        if (single(subject)) topic = subject.topics[0];
        render();
        return;
      }
      const top = e.target.closest('[data-topic]');
      if (top) { topic = allTopics.find((t) => t.id === top.dataset.topic); render(); return; }
      const act = e.target.closest('[data-action]')?.dataset.action;
      if (act === 'subjects') { subject = null; topic = null; render(); }
      else if (act === 'topics') { topic = null; render(); }
      else if (act === 'kickoff' && !busy) {
        busy = true;
        try {
          // fallback: the event pop-up comes first when it was not shown today (league and cup alike); it is confirmed before leaving this screen
          if (eventToAnnounce(ctx.state, squad, ctx.now())) {
            await announceEvent(event, subjectNames);
            ctx.setState(markEventAnnounced(ctx.state, event, ctx.now()));
            await ctx.save();
          }
          render();
          await prepareMatch(ctx, { mode: cup ? 'cup' : 'league', cupId: cup?.id, topic, coachPick: !!pick && pick.id === topic.id });
          ctx.navigate('#/match');
        } catch (err) {
          busy = false;
          ctx.toast(err.message || 'Impossible de préparer le match.', 'bad');
          render();
        }
      }
    };
    el.addEventListener('click', onClick);
    render();
    return () => el.removeEventListener('click', onClick);
  },
};
