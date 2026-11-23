// Training: pick any topic (grouped by subject), then a short pre-screen. No timer, no league effect.
import * as C from '../components.js';
import { MATCH_QUESTIONS } from '../../config.js';
import { listSubjects, listTopics } from '../../core/questions.js';
import { topicMastery } from '../../core/stats.js';
import { trainingOptions, eventTopic, isEventTopicId, eventToAnnounce, markEventAnnounced } from '../../core/events.js';
import { prepareMatch } from '../flow.js';
import { eventBanner, announceEvent, eventSubjectNames } from './play.js';
import { subjectLabel, subjectIcon, groupTopics } from '../shell-utils.js';

export default {
  title: 'Entraînement',
  async mount(el, ctx, params) {
    const st = ctx.state;
    const squad = st.profile.squad;
    const subjects = listSubjects(ctx.catalog, squad, st.optionalTopics);
    const allTopics = listTopics(ctx.catalog, squad, null, st.optionalTopics);
    // during an event the child first chooses: the event mix or the classic training (free choice of topic)
    const { event, modes } = trainingOptions(squad, ctx.now());
    let mode = modes.length === 1 ? 'classic' : params.topic ? (isEventTopicId(params.topic) ? 'event' : 'classic') : null;
    let topic = mode === 'event' ? eventTopic(event) : params.topic && mode === 'classic' ? allTopics.find((t) => t.id === params.topic) || null : null;
    const switchMode = () => (modes.length > 1 ? C.button({ label: "Changer de mode d'entraînement", variant: 'ghost', attrs: { 'data-action': 'modes' } }) : '');
    let busy = false;

    const meta = (t) => {
      const m = topicMastery(st, t.id);
      return m.totalAnswered === 0 ? 'Pas encore joué' : `${Math.round(m.accuracy * 100)} % de réussite`;
    };

    function viewModes() {
      return `<div class="page page--narrow">
        ${C.pageHead('Entraînement', { kicker: "Terrain d'entraînement", sub: 'Pas de chrono, pas de pression. Ça ne change pas ton classement.' })}
        ${eventBanner(event)}
        <div class="grid grid--2">
          ${C.topicTile({ name: "Entraînement de l'évènement", icon: '🎓', meta: 'Histoire-géo, anglais et SVT mélangés', attrs: { 'data-mode': 'event' } })}
          ${C.topicTile({ name: 'Entraînement classique', icon: '⚽', meta: 'Tu choisis la matière et le thème', attrs: { 'data-mode': 'classic' } })}
        </div></div>`;
    }

    function viewPicker() {
      return `<div class="page">
        ${C.pageHead('Entraînement', { kicker: 'Terrain d\'entraînement', sub: 'Pas de chrono, pas de pression. Ça ne change pas ton classement. Choisis un thème pour progresser.' })}
        ${switchMode()}
        ${subjects.map((s) => {
          const grid = (ts) => `<div class="grid grid--3">${ts.map((t) => C.topicTile({
            name: t.name, icon: subjectIcon(s.id, s.icon), stars: topicMastery(st, t.id).stars, meta: meta(t), attrs: { 'data-topic': t.id },
          })).join('')}</div>`;
          // a section of the subject (topic `group` in the catalog) gets a sub-heading; topics without one come last
          return C.section(subjectLabel(s), groupTopics(s.topics).map((sec) => (sec.group ? `<h3 class="topic-group">${C.esc(sec.group)}</h3>` : '') + grid(sec.topics)).join(''));
        }).join('')}
      </div>`;
    }

    function viewPre() {
      const m = topicMastery(st, topic.id);
      return `<div class="page page--narrow">
        ${C.pageHead('Entraînement', { kicker: 'Terrain d\'entraînement' })}
        ${topic.event ? eventBanner(event) : ''}
        <section class="panel panel--pitch stack">
          <div class="prematch__topic"><span aria-hidden="true">${subjectIcon(topic.subjectId, topic.icon)}</span> <b>${C.esc(topic.name)}</b> ${topic.event ? '' : C.stars(m.stars)}</div>
          ${topic.event ? '<p class="text-center text-dim text-sm">Questions mélangées : histoire-géo, anglais et SVT, à parts égales.</p>' : ''}
          <ul class="checklist">
            <li>${MATCH_QUESTIONS} questions, sans chrono : prends ton temps.</li>
            <li>Ça ne change pas le championnat.</li>
            <li>Tu gagnes de l'XP (moitié moins), mais pas de pièces.</li>
            <li>Tes étoiles de maîtrise progressent.</li>
          </ul>
          ${C.button({ label: busy ? 'On prépare le terrain…' : 'C\'est parti !', size: 'lg', block: true, icon: '⚽', disabled: busy, attrs: { 'data-action': 'go' } })}
        </section>
        ${topic.event ? switchMode() : C.button({ label: 'Choisir un autre thème', variant: 'ghost', attrs: { 'data-action': 'back' } })}
      </div>`;
    }

    function render() {
      el.innerHTML = !mode ? viewModes() : topic ? viewPre() : viewPicker();
      el.querySelector('[data-action="go"]')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }

    const onClick = async (e) => {
      const md = e.target.closest('[data-mode]');
      if (md) { mode = md.dataset.mode; topic = mode === 'event' ? eventTopic(event) : null; render(); return; }
      const top = e.target.closest('[data-topic]');
      if (top) { topic = allTopics.find((t) => t.id === top.dataset.topic); render(); return; }
      const act = e.target.closest('[data-action]')?.dataset.action;
      if (act === 'modes') { mode = null; topic = null; render(); }
      else if (act === 'back') { topic = null; render(); }
      else if (act === 'go' && !busy) {
        busy = true;
        try {
          // fallback: the event pop-up when it was not shown today (event training and classic training alike), confirmed before navigating
          const ev = eventToAnnounce(ctx.state, squad, ctx.now());
          if (ev) {
            await announceEvent(ev, eventSubjectNames(ev, ctx));
            ctx.setState(markEventAnnounced(ctx.state, ev, ctx.now()));
            await ctx.save();
          }
          render();
          await prepareMatch(ctx, { mode: 'training', topic });
          ctx.navigate('#/match');
        } catch (err) {
          busy = false;
          ctx.toast(err.message || 'Impossible de préparer l\'entraînement.', 'bad');
          render();
        }
      }
    };
    el.addEventListener('click', onClick);
    render();
    return () => el.removeEventListener('click', onClick);
  },
};
