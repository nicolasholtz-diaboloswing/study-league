// Match set-up for the league match: subject -> topic -> pre-match screen -> kick-off.
import * as C from '../components.js';
import * as A from '../art.js';
import { MATCH_QUESTIONS, MATCH_MINUTES } from '../../config.js';
import { nextFixture, divisionName, seasonLength } from '../../core/league.js';
import { listSubjects, listTopics } from '../../core/questions.js';
import { weakestTopic, topicMastery } from '../../core/stats.js';
import { RULE } from '../rules.js';
import { prepareMatch } from '../flow.js';
import { myClub, subjectLabel, subjectIcon } from '../shell-utils.js';

export default {
  title: 'Jouer',
  async mount(el, ctx, params) {
    const st = ctx.state;
    const squad = st.profile.squad;
    const subjects = listSubjects(ctx.catalog, squad);
    const allTopics = listTopics(ctx.catalog, squad);
    const pick = weakestTopic(st, allTopics);
    const season = st.league.season;
    const fx = nextFixture(season);
    const me = myClub(st);
    let subject = subjects.length === 1 ? subjects[0] : null;
    let topic = params.topic ? allTopics.find((t) => t.id === params.topic) || null : null;
    if (topic) subject = subjects.find((s) => s.id === topic.subjectId) || subject;
    // a subject with a single topic for this squad: no topic screen, straight to the pre-match screen
    const single = (s) => !!s && s.topics.length === 1;
    if (!topic && single(subject)) topic = subject.topics[0];
    let busy = false;

    const mastery = (t) => topicMastery(st, t.id);
    const meta = (t) => {
      const m = mastery(t);
      return m.totalAnswered === 0 ? 'Pas encore joué' : `${Math.round(m.accuracy * 100)} % de réussite`;
    };

    function viewSubject() {
      return `<div class="page page--narrow">
        ${C.pageHead('Quelle matière ?', { kicker: `Journée ${fx.matchday + 1} sur ${seasonLength(season)}`, sub: 'Choisis ce que tu veux réviser pour ce match.' })}
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
        <div class="grid grid--2">${subject.topics.map((t) => C.topicTile({
          name: t.name, icon: subjectIcon(subject.id, subject.icon), stars: mastery(t).stars, meta: meta(t), coachPick: !!pick && pick.id === t.id, attrs: { 'data-topic': t.id },
        })).join('')}</div>
        ${subjects.length > 1 ? C.button({ label: 'Changer de matière', variant: 'ghost', attrs: { 'data-action': 'subjects' } }) : ''}
      </div>`;
    }

    function viewPrematch() {
      const isPick = !!pick && pick.id === topic.id;
      return `<div class="page page--narrow prematch">
        ${C.pageHead('Avant le match', { kicker: `${divisionName(season.division)} · journée ${fx.matchday + 1} sur ${seasonLength(season)}` })}
        <section class="panel panel--gold stack">
          <div class="fixture-card">
            <div class="fixture-card__team">${A.crest(me, 72)}<b>${C.esc(me.name)}</b></div>
            <div class="fixture-card__vs"><span class="display">VS</span></div>
            <div class="fixture-card__team">${A.crest(fx.opponent, 72)}<b>${C.esc(fx.opponent.name)}</b></div>
          </div>
          <div class="prematch__topic"><span aria-hidden="true">${subjectIcon(topic.subjectId, topic.icon)}</span> <b>${C.esc(topic.name)}</b> ${isPick ? C.pill('Choix du coach · +50 % de pièces', 'gold') : ''}</div>
          <p class="text-center text-dim">${MATCH_QUESTIONS} questions · environ ${MATCH_MINUTES} minutes</p>
          <div class="prematch__rule"><b>${C.esc(RULE.line)} <span aria-hidden="true">⚽</span></b><small>${C.esc(RULE.miss)}</small></div>
        </section>
        ${single(subject) ? (subjects.length > 1 ? C.button({ label: 'Changer de matière', variant: 'ghost', attrs: { 'data-action': 'subjects' } }) : '')
          : C.button({ label: 'Changer de thème', variant: 'ghost', attrs: { 'data-action': 'topics' } })}
        <div class="kickoff-bar">${C.button({ label: busy ? 'On prépare le terrain…' : 'Coup d\'envoi !', size: 'lg', block: true, icon: '⚽', disabled: busy, attrs: { 'data-action': 'kickoff' } })}</div>
      </div>`;
    }

    function render() {
      el.innerHTML = !subject ? viewSubject() : !topic ? viewTopic() : viewPrematch();
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
        busy = true; render();
        try {
          await prepareMatch(ctx, { mode: 'league', topic, coachPick: !!pick && pick.id === topic.id });
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
