// Sign in / sign up on one screen: two tabs; sign-up is a friendly 4-step flow for players, 1 step for parents.
import * as C from '../components.js';
import * as A from '../art.js';
import { mode, findLocalProgress, importLocalProgress } from '../../store/index.js';
import { validateUsername, validatePassword } from '../../store/common.js';
import { newPlayerState, ensureSeason } from '../../core/state.js';

const KIT_MAIN = ['#1e40af', '#b91c1c', '#15803d', '#6d28d9', '#c2410c', '#0e7490', '#111827', '#be185d'];
const KIT_SECOND = ['#fbbf24', '#f8fafc', '#111827', '#3ddc84', '#4cc2ff', '#ff5a6a', '#fde047', '#b36bff'];
const CRESTS = ['shield', 'round', 'diamond', 'stripes'];
const STEPS = 4;
const NAME_LIMIT = 40, CLUB_LIMIT = 24; // same limits as firestore.rules (displayName <= 40, club <= 24)

export default {
  title: 'Connexion',
  async mount(el, ctx) {
    let tab = 'in'; // 'in' | 'up'
    let coachMode = false;
    let step = 1;
    let busy = false;
    let error = '';
    let errorField = '';
    const su = { username: '', password: '', displayName: '', club: '', c1: KIT_MAIN[0], c2: KIT_SECOND[0], crest: 'shield', squad: '', coachName: '' };
    let siUser = '';

    // from step 2 on the header shrinks (small ball, no tagline) so the next button stays on screen
    const shell = (inner) => {
      const compact = tab === 'up' && (coachMode || step >= 2);
      return `<div class="page page--narrow login ${compact ? 'login--compact' : ''}">
      <header class="login__hero">
        <div class="login__ball">${A.football(compact ? 36 : 64)}</div>
        <h1 class="login__title">Study League</h1>
        <p class="login__tag">Réponds aux questions, marque des buts, monte au classement !</p>
      </header>
      ${C.tabs([{ id: 'in', label: 'Se connecter' }, { id: 'up', label: 'Créer mon compte' }], tab)}
      ${tab === 'up' && !coachMode && step === 1 ? C.button({ label: 'Je suis un parent', variant: 'secondary', block: true, icon: '👪', cls: 'login__parent', attrs: { 'data-action': 'coach' } }) : ''}
      <div class="panel login__panel">${inner}</div>
    </div>`;
    };

    const errorHtml = () => (error && !errorField ? `<p class="form-error" role="alert">${C.esc(error)}</p>` : '');

    function signInHtml() {
      return `<form data-form="in" class="stack" novalidate>
        <h2 class="login__h">Content de te revoir !</h2>
        ${C.field({ label: 'Ton identifiant', name: 'username', value: siUser, autocomplete: 'username', required: true, attrs: { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' } })}
        ${C.field({ label: 'Ton mot de passe', name: 'password', type: 'password', autocomplete: 'current-password', required: true })}
        ${errorHtml()}
        ${C.button({ label: busy ? 'Un instant…' : 'Jouer', type: 'submit', size: 'lg', block: true, icon: '⚽', disabled: busy })}
      </form>`;
    }

    function dots() {
      return `<div class="steps" aria-label="Étape ${step} sur ${STEPS}">${Array.from({ length: STEPS }, (_, i) => `<i class="${i + 1 === step ? 'is-now' : i + 1 < step ? 'is-done' : ''}"></i>`).join('')}</div>`;
    }

    function preview() {
      const club = { name: su.club || 'Ton club', short: (su.club || 'CLB').replace(/[^A-Za-zÀ-ÿ0-9]/g, '').slice(0, 3).toUpperCase() || 'CLB', colors: [su.c1, su.c2], crest: su.crest };
      return `<div class="kitpreview" data-preview>
        <div class="kitpreview__kit">${A.kit(su.c1, su.c2, { size: 84, pattern: 'hoops', number: 10 })}</div>
        <div class="kitpreview__club">${A.crest(club, 56)}<b class="display">${C.esc(club.name)}</b></div>
      </div>`;
    }

    function signUpHtml() {
      if (coachMode) {
        return `<form data-form="coach" class="stack" novalidate>
          <h2 class="login__h">Compte parent</h2>
          <p class="text-dim">Tu pourras suivre ce que font les joueurs : matchs, réussite, points faibles.</p>
          ${C.field({ label: 'Identifiant', name: 'username', value: su.username, hint: '3 à 16 caractères : lettres, chiffres ou _', error: errorField === 'username' ? error : '', autocomplete: 'username', required: true, attrs: { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' } })}
          ${C.field({ label: 'Mot de passe', name: 'password', type: 'password', value: su.password, hint: 'Au moins 6 caractères', error: errorField === 'password' ? error : '', autocomplete: 'new-password', required: true })}
          ${C.field({ label: 'Ton nom', name: 'coachName', value: su.coachName, error: errorField === 'coachName' ? error : '', placeholder: 'Papa, Maman…', required: true, attrs: { maxlength: NAME_LIMIT } })}
          ${errorHtml()}
          ${C.button({ label: busy ? 'Un instant…' : 'Créer le compte parent', type: 'submit', size: 'lg', block: true, disabled: busy })}
          <button type="button" class="linkbtn" data-action="player">← Je suis un joueur</button>
        </form>`;
      }
      let body = '';
      let next = 'Suivant';
      if (step === 1) {
        body = `<h2 class="login__h">1. Ton compte</h2>
          ${C.field({ label: 'Ton identifiant', name: 'username', value: su.username, hint: 'C\'est ton nom pour te connecter : 3 à 16 caractères, lettres, chiffres ou _', error: errorField === 'username' ? error : '', autocomplete: 'username', required: true, attrs: { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' } })}
          ${C.field({ label: 'Ton mot de passe', name: 'password', type: 'password', value: su.password, hint: 'Au moins 6 caractères. Retiens-le bien !', error: errorField === 'password' ? error : '', autocomplete: 'new-password', required: true })}`;
      } else if (step === 2) {
        body = `<h2 class="login__h">2. Toi et ton club</h2>
          ${C.field({ label: 'Ton prénom ou ton surnom', name: 'displayName', value: su.displayName, error: errorField === 'displayName' ? error : '', placeholder: 'Léo', required: true, attrs: { maxlength: 20 } })}
          ${C.field({ label: 'Le nom de ton club', name: 'club', value: su.club, error: errorField === 'club' ? error : '', placeholder: 'FC Les Tigres', required: true, attrs: { maxlength: 24 } })}`;
      } else if (step === 3) {
        body = `<h2 class="login__h">3. Ton maillot</h2>
          ${preview()}
          ${C.colorPicker({ label: 'Couleur principale', name: 'c1', colors: KIT_MAIN, value: su.c1 })}
          ${C.colorPicker({ label: 'Deuxième couleur', name: 'c2', colors: KIT_SECOND, value: su.c2 })}
          <fieldset class="field"><legend class="field__label">Ton écusson</legend><div class="crestpick">${CRESTS.map((c) => `<label class="crestpick__opt"><input type="radio" name="crest" value="${c}" ${c === su.crest ? 'checked' : ''}><span class="crestpick__box">${A.crest({ name: su.club || 'Club', short: 'CLB', colors: [su.c1, su.c2], crest: c }, 52)}</span></label>`).join('')}</div></fieldset>`;
      } else {
        body = `<h2 class="login__h">4. Ton équipe</h2>
          ${C.choiceGroup({ label: 'Choisis ton équipe', name: 'squad', value: su.squad, options: [
            { value: 'u10', label: 'Académie', desc: '8 à 10 ans', icon: '⭐' },
            { value: 'u13', label: 'Pro', desc: '11 ans et plus', icon: '🛡️' },
          ] })}`;
        next = busy ? 'Un instant…' : 'Créer !';
      }
      const blocked = busy || (step === STEPS && !su.squad); // no squad is pre-selected: the last button waits for a choice
      return `<form data-form="up" class="stack" novalidate>
        ${dots()}
        ${body}
        ${errorHtml()}
        <div class="row row--between login__nav">
          ${step > 1 ? C.button({ label: 'Retour', variant: 'ghost', attrs: { 'data-action': 'back' } }) : '<span></span>'}
          ${C.button({ label: next, type: 'submit', size: 'lg', icon: step === STEPS ? '⚽' : '', disabled: blocked })}
        </div>
      </form>`;
    }

    function render(focusName) {
      el.innerHTML = shell(tab === 'in' ? signInHtml() : signUpHtml());
      const target = focusName ? el.querySelector(`[name="${focusName}"]`) : el.querySelector('form input:not([type=radio])');
      if (target && !('ontouchstart' in window)) target.focus({ preventScroll: true });
    }

    /** Read the visible form fields into `su` / `siUser`. */
    function collect() {
      const f = el.querySelector('form');
      if (!f) return;
      const v = (n) => f.elements[n]?.value;
      if (f.dataset.form === 'in') { siUser = v('username') ?? siUser; return; }
      for (const k of ['username', 'password', 'displayName', 'club', 'coachName']) if (v(k) != null) su[k] = v(k).trim();
      if (v('password') != null) su.password = f.elements.password.value; // passwords are not trimmed
      for (const k of ['c1', 'c2', 'crest', 'squad']) {
        const chosen = f.querySelector(`input[name="${k}"]:checked`);
        if (chosen) su[k] = chosen.value;
      }
    }

    function fail(message, field = '') {
      error = message;
      errorField = field;
      busy = false;
      render(field || undefined);
    }

    function checkStep() {
      try {
        if (coachMode || step === 1) {
          validateUsername(su.username);
        }
      } catch (e) { fail(e.message, 'username'); return false; }
      try {
        if (coachMode || step === 1) validatePassword(su.password);
      } catch (e) { fail(e.message, 'password'); return false; }
      if (coachMode && su.coachName.length < 1) { fail('Écris ton nom.', 'coachName'); return false; }
      if (coachMode && su.coachName.length > NAME_LIMIT) { fail(`Ton nom doit faire ${NAME_LIMIT} caractères au plus.`, 'coachName'); return false; }
      if (!coachMode && step === STEPS && !su.squad) { fail('Choisis ton équipe.'); return false; }
      if (!coachMode && step === 2) {
        if (su.displayName.length < 1) { fail('Écris ton prénom ou un surnom.', 'displayName'); return false; }
        if (su.displayName.length > NAME_LIMIT) { fail(`Ton prénom doit faire ${NAME_LIMIT} caractères au plus.`, 'displayName'); return false; }
        if (su.club.length < 2) { fail('Donne un nom à ton club (2 lettres au moins).', 'club'); return false; }
        if (su.club.length > CLUB_LIMIT) { fail(`Le nom du club doit faire ${CLUB_LIMIT} caractères au plus.`, 'club'); return false; }
      }
      return true;
    }

    async function offerImport(user) {
      if (mode !== 'cloud') return;
      let found = null;
      try { found = await findLocalProgress(user.username); } catch { return; }
      if (!found) return;
      const yes = await new Promise((resolve) => {
        const m = C.showModal(C.modal({
          title: 'On reprend ta progression ?',
          body: '<p>On a trouvé une partie de ce nom sur cet appareil. Tu veux la reprendre dans ton nouveau compte ?</p>',
          actions: [C.button({ label: 'Non merci', variant: 'ghost', attrs: { 'data-no': '' } }), C.button({ label: 'Oui, reprendre', variant: 'gold', attrs: { 'data-yes': '' } })],
        }));
        m.addEventListener('click', (e) => {
          if (e.target.closest('[data-yes]')) { resolve(true); C.closeModal(); }
          else if (e.target.closest('[data-no],[data-modal-close]')) resolve(false);
        });
      });
      if (yes) {
        try { await importLocalProgress(); ctx.toast('Ta progression est reprise !', 'ok'); } catch (e) { ctx.toast(e.message || 'La reprise n\'a pas marché.', 'bad'); }
      }
    }

    async function doSignIn(f) {
      const username = f.elements.username.value;
      const password = f.elements.password.value;
      siUser = username;
      if (!username.trim() || !password) { fail('Écris ton identifiant et ton mot de passe.'); return; }
      busy = true; error = ''; errorField = '';
      render();
      try {
        const user = await ctx.store.signIn({ username, password });
        await ctx.startSession(user);
      } catch (e) {
        siUser = username;
        fail(e.message || 'Connexion impossible.');
      }
    }

    async function doSignUp() {
      busy = true; error = ''; errorField = '';
      render();
      try {
        const now = ctx.now();
        let user;
        if (coachMode) {
          const state = newPlayerState({ username: su.username.toLowerCase(), displayName: su.coachName, role: 'coach', now });
          user = await ctx.store.signUp({ username: su.username, password: su.password, role: 'coach', state });
          await ctx.startSession(user);
          if (user.coachPending) ctx.toast('Compte créé. Il reste une étape pour voir les joueurs (voir l\'aide).', 'info', { ms: 6000 });
          return;
        }
        let state = newPlayerState({ username: su.username.toLowerCase(), displayName: su.displayName, squad: su.squad, club: su.club, colors: [su.c1, su.c2], now });
        state.profile.crest = su.crest;
        state = ensureSeason(state, ctx.clubs, ctx.rng);
        user = await ctx.store.signUp({ username: su.username, password: su.password, role: 'player', state });
        await offerImport(user);
        await ctx.startSession(user, { welcome: true });
      } catch (e) {
        if (e.code === 'not-authorized') { await ctx.blockAccount(ctx.store.currentUser()); return; }
        if (e.code === 'username-taken' || e.code === 'bad-username') { step = 1; fail(e.message, 'username'); }
        else if (e.code === 'weak-password') { step = 1; fail(e.message, 'password'); }
        else fail(e.message || 'Inscription impossible.');
      }
    }

    /* ---- events ---- */
    const onClick = (e) => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) { collect(); tab = tabBtn.dataset.tab; error = ''; errorField = ''; render(); return; }
      const act = e.target.closest('[data-action]')?.dataset.action;
      if (act === 'back') { collect(); step = Math.max(1, step - 1); error = ''; errorField = ''; render(); }
      else if (act === 'coach') { collect(); coachMode = true; error = ''; errorField = ''; render(); }
      else if (act === 'player') { collect(); coachMode = false; step = 1; error = ''; errorField = ''; render(); }
    };
    const onSubmit = async (e) => {
      const f = e.target.closest('form');
      if (!f) return;
      e.preventDefault();
      if (busy) return;
      if (f.dataset.form === 'in') { await doSignIn(f); return; }
      collect();
      error = ''; errorField = '';
      if (!checkStep()) return;
      if (coachMode || step === STEPS) { await doSignUp(); return; }
      step += 1;
      render();
    };
    const onChange = (e) => {
      if (tab === 'up' && !coachMode && step === STEPS && e.target.name === 'squad') {
        collect();
        const go = el.querySelector('form button[type=submit]');
        if (go && !busy) go.disabled = false;
        return;
      }
      if (tab !== 'up' || coachMode || step !== 3) return;
      if (!['c1', 'c2', 'crest'].includes(e.target.name)) return;
      collect();
      // live kit preview + crest options without rebuilding the form (keeps focus)
      el.querySelector('[data-preview]').outerHTML = preview();
      el.querySelectorAll('.crestpick__opt').forEach((o) => {
        const c = o.querySelector('input').value;
        o.querySelector('.crestpick__box').innerHTML = A.crest({ name: su.club || 'Club', short: 'CLB', colors: [su.c1, su.c2], crest: c }, 52);
      });
    };
    const onInput = (e) => {
      if (tab === 'up' && !coachMode && step === 2 && e.target.name === 'club') su.club = e.target.value.trim();
    };
    el.addEventListener('click', onClick);
    el.addEventListener('submit', onSubmit);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    render();
    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('submit', onSubmit);
      el.removeEventListener('change', onChange);
      el.removeEventListener('input', onInput);
    };
  },
};
