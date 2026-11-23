// The match: scoreboard, attack meter, question card with timer, feedback, goal scenes.
import * as C from '../components.js';
import * as E from '../effects.js';
import { currentQuestion, currentMinute, currentTimeLimitMs, answerQuestion, timeoutQuestion } from '../../core/match.js';
import { optionChoices, acceptedAnswers, normalizeAnswer } from '../../core/questions.js';
import { flow, finishMatch, dropPendingMatch } from '../flow.js';
import { ruleFor, remainingText, MISSED_CHANCE } from '../rules.js';

const KEY_INDEX = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'ù', 'î', 'ô', 'œ'];
const SMALL_HEIGHT = 560; // visual viewport height under which a typed question gets the compact layout

export default {
  title: 'Match',
  async mount(el, ctx) {
    const c = flow.current;
    if (!c || c.match.finished || c.applied) {
      ctx.toast('Ce match n\'existe plus. Lance-en un nouveau !', 'info');
      ctx.navigate('#/home');
      return;
    }
    const { match, me, opp } = c;
    const ranked = c.mode !== 'training'; // league or cup: timed, kick-off marker, leaving = forfeit
    const n = match.goalEvery; // correct answers per goal in this match
    const total = match.questions.length;
    const topicAccents = !!c.topic.accents; // subject flagged "accents" in the catalog (an event mix tags each question instead)
    let phase = 'idle'; // idle | asking | feedback | celebrating | leaving | done
    let q = null;
    let uiChoices = null; // answer buttons: the mcq choices, or the options of a typed "(a / b)" question
    let limitMs = null;
    let acc = 0; // ms spent on the current question before the last pause
    let t0 = 0; // performance.now() when the clock last started (0 = stopped)
    let interval = 0;
    let nextAllowedAt = 0;
    let destroyed = false;
    let pausedByModal = false;
    let attackStep = 0;

    el.innerHTML = `<div class="page page--narrow match">
      <div id="m-sb"></div>
      <div id="m-meter" class="match__meter"></div>
      <div id="m-q"></div>
      <div id="m-next" class="match__next"></div>
      <div class="match__quit">${C.button({ label: ranked ? 'Quitter le match' : 'Quitter l\'entraînement', variant: 'ghost', size: 'sm', cls: 'match__quitbtn', attrs: { 'data-action': 'quit' } })}</div>
      <p class="match__keys" aria-hidden="true">Clavier : A B C D · Entrée</p>
    </div>`;
    const $match = el.querySelector('.match');
    const $sb = el.querySelector('#m-sb');
    const $meter = el.querySelector('#m-meter');
    const $q = el.querySelector('#m-q');
    const $next = el.querySelector('#m-next');

    const scoreboard = (minute, goalSide) => C.scoreboard({
      home: me, away: opp, homeScore: match.goalsFor, awayScore: match.goalsAgainst, minute,
      status: c.cup ? c.cup.name : ranked ? 'Championnat' : 'Entraînement', goalSide,
    });

    /* ---- clock (counts only while a question is waiting for an answer) ---- */
    const elapsed = () => acc + (t0 ? performance.now() - t0 : 0);
    function startClock() {
      if (t0 || !limitMs) { if (!limitMs) t0 = performance.now(); return; }
      t0 = performance.now();
      clearInterval(interval);
      interval = setInterval(tick, 200);
    }
    function pauseClock() {
      if (t0) { acc += performance.now() - t0; t0 = 0; }
      clearInterval(interval);
    }
    function tick() {
      if (phase !== 'asking') return;
      const remaining = limitMs - elapsed();
      C.updateTimer($q, Math.max(0, remaining) / 1000, limitMs / 1000);
      if (remaining <= 0) submit(null, -1);
    }
    const onVisibility = () => {
      if (phase !== 'asking') return;
      if (document.hidden) pauseClock(); else if (!pausedByModal) startClock();
    };
    document.addEventListener('visibilitychange', onVisibility);

    /* ---- small screens: the answer form must stay visible above the keyboard ---- */
    const vv = window.visualViewport;
    const phone = () => window.matchMedia?.('(max-width: 600px)').matches;
    const typedNow = () => phase === 'asking' && q && !uiChoices;
    const input = () => $q.querySelector('input[name=answer]');
    function centerForm() {
      const f = $q.querySelector('[data-answer-form]');
      if (!f) return;
      const r = f.getBoundingClientRect();
      const vh = vv ? vv.height : window.innerHeight;
      const room = vh - r.height;
      // already comfortably inside the visible area: leave the page where it is
      if (r.top >= 8 && r.bottom <= vh - 8 && room > 0 && (r.top + r.bottom) / 2 < vh * 0.75) return;
      f.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
    function setTyping(on) { $match.classList.toggle('is-typing', !!on); }
    const onFocusIn = (e) => {
      if (!e.target.matches?.('input[name=answer]') || !phone()) return;
      setTyping(true);
      centerForm();
      setTimeout(() => { if (typedNow() && document.activeElement === input()) centerForm(); }, 350); // the keyboard opens after the focus
    };
    const onViewport = () => {
      if (!typedNow()) return;
      if ((vv ? vv.height : window.innerHeight) < SMALL_HEIGHT && phone()) setTyping(true);
      if (document.activeElement === input()) centerForm();
    };
    el.addEventListener('focusin', onFocusIn);
    vv?.addEventListener('resize', onViewport);

    /* ---- rendering ---- */
    /** The question card, with the model-sentence label (verbs) and the accent keys (French, typed). */
    function renderCard(o) {
      const question = o.question;
      $q.innerHTML = C.questionCard({
        number: o.number, total, prompt: question.prompt, type: uiChoices ? 'mcq' : 'input', choices: uiChoices || undefined, topic: question.tag || c.topic.name, level: question.level, figure: question.figure,
        status: o.status, note: o.note, selected: o.selected, correctAnswer: o.correctAnswer, explanation: o.explanation, inputValue: o.inputValue || '',
        timer: limitMs ? C.timer({ remaining: o.remaining, total: limitMs / 1000 }) : '',
      });
      if (question.label) $q.querySelector('.qcard__prompt')?.insertAdjacentHTML('beforebegin', `<span class="qcard__label">${C.esc(question.label)}</span>`);
      if ((question.accents ?? topicAccents) && !uiChoices && (o.status || 'idle') === 'idle') {
        $q.querySelector('[data-answer-form]')?.insertAdjacentHTML('afterend', `<div class="accents" role="group" aria-label="Lettres avec accent">${ACCENTS.map((a) => `<button type="button" class="accent-key" data-accent="${a}" aria-label="${a}" tabindex="-1">${a}</button>`).join('')}</div>`);
      }
    }
    /** For a typed question shown as buttons: the listed option that is the answer (so it can be marked). */
    const optionAnswer = (question, opts) => opts.find((o) => acceptedAnswers(question).some((a) => normalizeAnswer(a) === normalizeAnswer(o)));

    /* ---- questions ---- */
    function showQuestion() {
      q = currentQuestion(match);
      uiChoices = q.type === 'mcq' ? q.choices : optionChoices(q);
      limitMs = currentTimeLimitMs(match);
      acc = 0; t0 = 0;
      phase = 'asking';
      setTyping(false);
      $match.classList.toggle('has-figure', !!q.figure); // a figure takes room: the scoreboard gets compact on a phone (css/views.css)
      $sb.innerHTML = scoreboard(currentMinute(match));
      $meter.innerHTML = C.attackMeter(attackStep, { live: true, n });
      $next.innerHTML = '';
      renderCard({ question: q, number: match.index + 1, status: 'idle', remaining: limitMs ? limitMs / 1000 : 0 });
      const field = input();
      if (field) field.focus({ preventScroll: true });
      startClock();
    }

    function submit(given, selected) {
      if (phase !== 'asking') return;
      phase = 'feedback';
      pauseClock();
      setTyping(false);
      const ms = Math.round(elapsed());
      const number = match.index + 1;
      const question = q;
      const fb = given === null ? timeoutQuestion(match) : answerQuestion(match, given, ms);
      attackStep = fb.attack.charge;
      const status = fb.correct ? 'correct' : fb.timedOut ? 'timeout' : 'wrong';
      const marked = uiChoices && question.type === 'input' ? optionAnswer(question, uiChoices) : fb.correctAnswer;
      const note = fb.correct ? (fb.goalFor ? '' : remainingText(fb.attack.charge, n)) : (fb.goalAgainst ? '' : MISSED_CHANCE);
      renderCard({
        question, number, status, selected, correctAnswer: marked ?? fb.correctAnswer, explanation: fb.explanation, inputValue: given || '', note,
        remaining: limitMs ? Math.max(0, limitMs - ms) / 1000 : 0,
      });
      $sb.innerHTML = scoreboard(fb.minute, fb.goalFor ? 'home' : fb.goalAgainst ? 'away' : undefined);
      $meter.innerHTML = C.attackMeter(fb.goalFor ? fb.attack.max : fb.attack.charge, { live: true, n });
      afterAnswer(fb);
    }

    async function afterAnswer(fb) {
      if (fb.goalFor || fb.goalAgainst) {
        phase = 'celebrating';
        const score = `${fb.score.for} – ${fb.score.against}`;
        await (fb.goalFor
          ? E.goalCelebration({ sub: score, kit: me.colors })
          : E.goalCelebration({ side: 'away', sub: 'Raté : l\'adversaire en profite !', score, kit: opp.colors }));
        if (destroyed) return;
        $meter.innerHTML = C.attackMeter(fb.attack.charge, { live: true, n });
      }
      if (phase === 'leaving' || phase === 'done') return;
      phase = 'feedback';
      nextAllowedAt = performance.now() + 350;
      if (q?.figure) $q.querySelector('.qcard__feedback')?.scrollIntoView({ block: 'nearest' }); // the figure pushes the verdict down: bring it above the sticky button
      const last = fb.finished;
      $next.innerHTML = C.button({ label: last ? 'Voir le résultat' : 'Question suivante', size: 'lg', block: true, variant: 'primary', attrs: { 'data-action': 'next' } });
      // keyboard focus goes straight to the button; no scrolling, so the scoreboard stays in view (the button is sticky)
      $next.querySelector('[data-action=next]').focus({ preventScroll: true });
    }

    async function next() {
      if (phase !== 'feedback') return;
      if (match.finished) {
        phase = 'done';
        $next.querySelector('button')?.setAttribute('disabled', '');
        ctx.setLeaveGuard(null);
        await finishMatch(ctx);
        ctx.navigate('#/result');
        return;
      }
      showQuestion();
    }

    /* ---- leaving ---- */
    function pausedByDialog(on) {
      if (on) { pausedByModal = true; if (phase === 'asking') pauseClock(); }
      else { pausedByModal = false; if (phase === 'asking' && !document.hidden) startClock(); }
    }
    const mo = new MutationObserver(() => {
      if (pausedByModal && !document.querySelector('[data-modal]')) pausedByDialog(false);
    });
    mo.observe(document.getElementById('modal-root'), { childList: true });

    function askLeave(target) {
      if (phase === 'leaving' || phase === 'done') return;
      if (match.finished) { // nothing left to play: just record the result
        phase = 'done';
        ctx.setLeaveGuard(null);
        finishMatch(ctx).then(() => ctx.navigate('#/result'));
        return;
      }
      const answered = match.index;
      const noEffect = !ranked || answered === 0;
      pausedByDialog(true);
      const m = C.showModal(C.modal({
        id: 'leave',
        title: ranked ? 'Quitter le match ?' : 'Quitter l\'entraînement ?',
        body: noEffect
          ? '<p>Tu n\'as encore rien perdu. Si tu pars, rien n\'est enregistré.</p>'
          : `<p>Si tu pars maintenant, le match est perdu${c.cup ? ' et tu es éliminé de la coupe' : ''}. Les questions qui restent comptent comme fausses.</p>`,
        actions: [
          C.button({ label: 'Rester', variant: 'primary', attrs: { 'data-modal-close': '' } }),
          C.button({ label: 'Partir', variant: 'danger', attrs: { 'data-leave': '' } }),
        ],
      }));
      m.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-leave]')) return;
        phase = 'leaving';
        ctx.setLeaveGuard(null);
        C.closeModal();
        if (noEffect) {
          flow.current = null;
          if (ranked) await dropPendingMatch(ctx);
          ctx.navigate(target && target !== '#/match' ? target : (ranked ? '#/home' : '#/training'));
        } else {
          await finishMatch(ctx, { forfeit: true });
          ctx.navigate('#/result');
        }
      });
    }
    ctx.setLeaveGuard((target) => { askLeave(target); return true; });

    /* ---- input ---- */
    const onClick = (e) => {
      const ch = e.target.closest('[data-choice]');
      if (ch && phase === 'asking') { const i = Number(ch.dataset.choice); submit(uiChoices[i], i); return; }
      const accent = e.target.closest('[data-accent]');
      if (accent && phase === 'asking') {
        const field = input();
        if (!field) return;
        const s = field.selectionStart ?? field.value.length;
        field.setRangeText(accent.dataset.accent, s, field.selectionEnd ?? s, 'end');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.focus({ preventScroll: true });
        return;
      }
      const act = e.target.closest('[data-action]')?.dataset.action;
      if (act === 'next') next();
      else if (act === 'quit') askLeave(null);
    };
    // the accent keys must not take the focus (the keyboard would close)
    const onMouseDown = (e) => { if (e.target.closest('[data-accent]')) e.preventDefault(); };
    const onSubmit = (e) => {
      if (!e.target.matches('[data-answer-form]')) return;
      e.preventDefault();
      if (phase !== 'asking') return;
      const v = e.target.elements.answer.value;
      if (!v.trim()) { e.target.elements.answer.focus(); return; }
      submit(v, -1);
    };
    const onKey = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[data-modal]')) return;
      if (phase === 'asking' && uiChoices) {
        const i = KEY_INDEX[e.key.toLowerCase()];
        if (i != null && i < uiChoices.length) { e.preventDefault(); submit(uiChoices[i], i); }
      } else if (phase === 'feedback' && e.key === 'Enter') {
        e.preventDefault();
        if (performance.now() >= nextAllowedAt) next();
      }
    };
    el.addEventListener('click', onClick);
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', onKey);

    /* ---- the very first match: the rule is explained once, the clock starts when the overlay is closed ---- */
    let introObserver = null;
    if (!ctx.state?.matches?.length) {
      $sb.innerHTML = scoreboard(0);
      const m = C.showModal(C.modal({
        id: 'intro',
        title: 'Comment marquer ?',
        body: `<div class="intro"><div class="intro__meter">${C.attackMeter(0)}</div>
          <p class="intro__goal">${C.esc(ruleFor(n, { concedeAll: match.concedeAll }).intro)}</p><p class="intro__miss">${C.esc(ruleFor(n, { concedeAll: match.concedeAll }).introMiss)}</p></div>`,
        actions: [C.button({ label: "C'est parti !", variant: 'gold', size: 'lg', block: true, attrs: { 'data-modal-close': '', 'data-intro-go': '' } })],
      }));
      m.querySelector('[data-intro-go]')?.focus();
      introObserver = new MutationObserver(() => {
        if (document.querySelector('[data-modal]')) return;
        introObserver.disconnect();
        introObserver = null;
        if (!destroyed && phase === 'idle') showQuestion();
      });
      introObserver.observe(document.getElementById('modal-root'), { childList: true });
    } else showQuestion();

    return () => {
      destroyed = true;
      introObserver?.disconnect();
      clearInterval(interval);
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('keydown', onKey);
      vv?.removeEventListener('resize', onViewport);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('click', onClick);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('submit', onSubmit);
      // an unfinished match left by any other way: a started league match is a forfeit (once), an untouched one costs nothing
      if (flow.current === c && !c.applied && !match.finished) {
        if (ranked && ctx.state && match.index > 0) finishMatch(ctx, { forfeit: true });
        else {
          flow.current = null;
          if (ranked && ctx.state) dropPendingMatch(ctx);
        }
      }
      document.getElementById('overlay')?.replaceChildren();
    };
  },
};
