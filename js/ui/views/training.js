// Training: pick any topic (grouped by subject), then a short pre-screen. No timer, no league effect.
import * as C from '../components.js';
import { MATCH_QUESTIONS } from '../../config.js';
import { listSubjects, listTopics } from '../../core/questions.js';
import { topicMastery } from '../../core/stats.js';
import { prepareMatch } from '../flow.js';
import { subjectLabel, subjectIcon } from '../shell-utils.js';

export default {
  title: 'Entraînement',
  async mount(el, ctx, params) {
    const st = ctx.state;
    const squad = st.profile.squad;
    const subjects = listSubjects(ctx.catalog, squad);
    const allTopics = listTopics(ctx.catalog, squad);
    let topic = params.topic ? allTopics.find((t) => t.id === params.topic) || null : null;
    let busy = false;

    const meta = (t) => {
      const m = topicMastery(st, t.id);
      return m.totalAnswered === 0 ? 'Pas encore joué' : `${Math.round(m.accuracy * 100)} % de réussite`;
    };

    function viewPicker() {
      return `<div class="page">
        ${C.pageHead('Entraînement', { kicker: 'Terrain d\'entraînement', sub: 'Pas de chrono, pas de pression. Ça ne change pas ton classement. Choisis un thème pour progresser.' })}
        ${subjects.map((s) => C.section(subjectLabel(s), `<div class="grid grid--3">${s.topics.map((t) => C.topicTile({
          name: t.name, icon: subjectIcon(s.id, s.icon), stars: topicMastery(st, t.id).stars, meta: meta(t), attrs: { 'data-topic': t.id },
        })).join('')}</div>`)).join('')}
      </div>`;
    }

    function viewPre() {
      const m = topicMastery(st, topic.id);
      return `<div class="page page--narrow">
        ${C.pageHead('Entraînement', { kicker: 'Terrain d\'entraînement' })}
        <section class="panel panel--pitch stack">
          <div class="prematch__topic"><span aria-hidden="true">${subjectIcon(topic.subjectId, topic.icon)}</span> <b>${C.esc(topic.name)}</b> ${C.stars(m.stars)}</div>
          <ul class="checklist">
            <li>${MATCH_QUESTIONS} questions, sans chrono : prends ton temps.</li>
            <li>Ça ne change pas le championnat.</li>
            <li>Tu gagnes de l'XP (moitié moins), mais pas de pièces.</li>
            <li>Tes étoiles de maîtrise progressent.</li>
          </ul>
          ${C.button({ label: busy ? 'On prépare le terrain…' : 'C\'est parti !', size: 'lg', block: true, icon: '⚽', disabled: busy, attrs: { 'data-action': 'go' } })}
        </section>
        ${C.button({ label: 'Choisir un autre thème', variant: 'ghost', attrs: { 'data-action': 'back' } })}
      </div>`;
    }

    function render() {
      el.innerHTML = topic ? viewPre() : viewPicker();
      el.querySelector('[data-action="go"]')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }

    const onClick = async (e) => {
      const top = e.target.closest('[data-topic]');
      if (top) { topic = allTopics.find((t) => t.id === top.dataset.topic); render(); return; }
      const act = e.target.closest('[data-action]')?.dataset.action;
      if (act === 'back') { topic = null; render(); }
      else if (act === 'go' && !busy) {
        busy = true; render();
        try {
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
