// Study League: boot, session, hash router, app chrome (top bar + navigation), toasts, error screens.
import { store } from './store/index.js';
import { createRng, randomSeed } from './core/rng.js';
import { loadCatalog } from './core/questions.js';
import { newPlayerState, ensureSeason } from './core/state.js';
import * as C from './ui/components.js';
import * as A from './ui/art.js';
import { myClub, levelBar, lsSet } from './ui/shell-utils.js';
import { settlePendingForfeit } from './ui/flow.js';
import { APP_VERSION } from './config.js';

const fetchJson = (p) => fetch(p).then((r) => {
  if (!r.ok) throw new Error(`Impossible de charger ${p}`);
  return r.json();
});

/** Route table: hash name -> view module (loaded on demand, so a missing module only breaks its own screen). */
const ROUTES = {
  login: './ui/views/login.js',
  home: './ui/views/home.js',
  play: './ui/views/play.js',
  match: './ui/views/match.js',
  result: './ui/views/result.js',
  league: './ui/views/league.js',
  training: './ui/views/training.js',
  more: './ui/views/more.js',
  cards: './ui/views/cards.js',
  badges: './ui/views/badges.js',
  rivals: './ui/views/rivals.js',
  coach: './ui/views/coach.js',
  profile: './ui/views/profile.js',
  help: './ui/views/help.js',
};
const COACH_ROUTES = new Set(['coach', 'more', 'help']);
/** Which nav tab is lit for routes that are not tabs themselves. */
const TAB_OF = { play: 'home', match: 'home', result: 'home', badges: 'more', profile: 'more', help: 'more' };

const $ = (id) => document.getElementById(id);
const viewEl = $('view');

const ctx = {
  store, user: null, state: null, catalog: null, clubs: [], cards: [],
  rng: createRng(randomSeed()),
  now: () => Date.now(),
  /** Save the whole state. Never throws: a failure shows a toast and returns false; the next save retries (it always writes everything). */
  async save() {
    if (!ctx.state) return true;
    try {
      await store.saveState(ctx.state);
    } catch (e) {
      console.warn('save failed', e);
      C.showToast('Sauvegarde impossible — vérifie ta connexion', 'bad', { ms: 5000 });
      return false;
    }
    refreshChrome();
    return true;
  },
  /** Replace the contents of ctx.state in place (views keep their reference). */
  setState(next) {
    for (const k of Object.keys(ctx.state || {})) delete ctx.state[k];
    ctx.state = Object.assign(ctx.state || {}, next);
    return ctx.state;
  },
  navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  },
  toast(message, kind = 'info', opt = {}) {
    C.showToast(message, kind, opt);
  },
  refreshChrome,
  /** A view can block leaving (e.g. a match in progress): fn(targetHash) returns true to block the navigation. */
  setLeaveGuard(fn) { leaveGuard = fn || null; },
  async startSession(user, { welcome = false } = {}) {
    if (!(await enterSession(user))) { refreshChrome(); await route(); return; }
    if (welcome && !isCoach(user)) lsSet(`studyleague.welcome.${user.uid}`, '1');
    refreshChrome();
    ctx.navigate(isCoach(user) ? '#/coach' : (await settleForfeit()) ? '#/result' : '#/home');
  },
  /** The account exists but is not on the family list yet (cloud): show the calm "not authorised" screen. */
  async blockAccount(user) {
    blocked = user || { username: '?' };
    ctx.user = null;
    ctx.state = null;
    refreshChrome();
    await route();
  },
  async signOut() {
    blocked = null;
    try { await store.signOut(); } catch { /* ignore */ }
    ctx.user = null;
    ctx.state = null;
    leaveGuard = null;
    refreshChrome();
    ctx.navigate('#/login');
  },
};

/** A league match left by a reload or a closed page is a forfeit defeat, settled once when the session starts. */
async function settleForfeit() {
  try { return !!ctx.state && await settlePendingForfeit(ctx); } catch (e) { console.warn('forfeit failed', e); return false; }
}

/** A coach, or a parent whose coach document is not created yet (cloud). */
const isCoach = (u) => !!u && (u.role === 'coach' || !!u.coachPending);

let leaveGuard = null;
let blocked = null; // user whose account is not authorised yet (cloud, family list)
let currentHash = null;
let cleanup = null;
let routeToken = 0;

/* ---------------- chrome ---------------- */
const NAV_ICON_COACH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';

function refreshChrome(routeName = currentRouteName()) {
  const coach = isCoach(ctx.user);
  const nav = $('nav');
  nav.querySelector('[data-route="coach"]')?.remove();
  if (coach) {
    nav.insertAdjacentHTML('afterbegin', `<a class="nav__link" href="#/coach" data-route="coach">${NAV_ICON_COACH}<span class="nav__label">Parent</span></a>`);
  }
  // long labels get a short form on narrow phones (swapped by CSS)
  for (const [route, full, short] of [['training', 'Entraînement', 'Entraîn.'], ['league', 'Championnat', 'Ligue']]) {
    const label = nav.querySelector(`[data-route="${route}"] .nav__label`);
    if (label && !label.querySelector('.nav__short')) label.innerHTML = `<span class="nav__full">${full}</span><span class="nav__short" aria-hidden="true">${short}</span>`;
  }
  nav.querySelectorAll('.nav__link').forEach((a) => {
    const r = a.dataset.route;
    a.hidden = coach ? !(r === 'coach' || r === 'more') : false;
    if (r === (TAB_OF[routeName] || routeName)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('top-version').textContent = `v${APP_VERSION}`;
  const st = ctx.state;
  const home = $('topbar').querySelector('.topbar__club');
  if (st) {
    $('top-crest').innerHTML = A.crest(myClub(st), 38);
    $('top-club').textContent = st.profile.club || 'Study League';
    $('top-level').innerHTML = C.xpBar({ ...levelBar(st.xp), compact: true });
    $('top-coins-n').textContent = String(st.coins);
    $('top-level').hidden = false;
    $('top-coins').hidden = false;
    home.setAttribute('href', '#/home');
  } else {
    $('top-crest').innerHTML = A.football(34);
    $('top-club').textContent = ctx.user ? 'Espace parent' : 'Study League';
    $('top-level').innerHTML = '';
    $('top-level').hidden = true;
    $('top-coins').hidden = true;
    home.setAttribute('href', coach ? '#/coach' : '#/home');
  }
}

function currentRouteName() {
  return parseHash().name;
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, qs = ''] = raw.split('?');
  return { name: name || '', params: Object.fromEntries(new URLSearchParams(qs)) };
}

/* ---------------- errors ---------------- */
function showError(el, title, text) {
  el.innerHTML = `<div class="page page--narrow">${C.emptyState({
    icon: '😕', title, text,
    action: C.button({ label: 'Retour à l\'accueil', href: isCoach(ctx.user) ? '#/coach' : '#/home', variant: 'primary' }),
  })}</div>`;
}

/** Calm screen for an account that is not on the family list. Returns the listener cleanup. */
function renderBlocked() {
  const name = String(blocked?.username ?? '');
  document.body.classList.add('no-shell');
  viewEl.innerHTML = `<div class="page page--narrow">${C.emptyState({
    icon: '🔒', title: 'Compte pas encore autorisé',
    text: `Ton compte "${name}" n'est pas encore autorisé. Demande à ton parent de l'ajouter à la liste de la famille.`,
    action: `<div class="stack stack--sm">${C.button({ label: 'Réessayer', attrs: { 'data-act': 'retry-auth' } })}${C.button({ label: 'Se déconnecter', variant: 'ghost', attrs: { 'data-act': 'logout' } })}</div>`,
  })}</div>`;
  const ac = new AbortController();
  viewEl.addEventListener('click', async (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'logout') { await ctx.signOut(); return; }
    if (act !== 'retry-auth') return;
    const user = blocked;
    blocked = null;
    try {
      if (await enterSession(user)) { refreshChrome(); ctx.navigate(isCoach(user) ? '#/coach' : (await settleForfeit()) ? '#/result' : '#/home'); return; }
    } catch (e) {
      console.warn('retry failed', e);
      blocked = user;
      C.showToast(e?.message || 'Impossible de vérifier ton compte. Réessaie.', 'bad');
    }
    await route();
  }, { signal: ac.signal });
  return () => ac.abort();
}

/* ---------------- router ---------------- */
async function route() {
  let { name, params } = parseHash();
  const signedIn = !!ctx.user;
  const coach = isCoach(ctx.user);

  // Redirects (done with replace so the back button does not loop)
  let target = null;
  if (!signedIn) { if (name !== 'login') target = '#/login'; }
  else if (!name || name === 'login' || !Object.hasOwn(ROUTES, name)) target = coach ? '#/coach' : '#/home';
  else if (coach && !COACH_ROUTES.has(name)) target = '#/coach';
  else if (!coach && name === 'coach') target = '#/home';
  if (target) {
    history.replaceState(null, '', target);
    ({ name, params } = parseHash());
  }

  const hash = location.hash;
  if (leaveGuard && currentHash && hash !== currentHash && leaveGuard(hash)) {
    history.replaceState(null, '', currentHash); // undo the move; the guard asks the user (replaceState fires no hashchange)
    return;
  }
  leaveGuard = null;
  currentHash = hash;

  const token = ++routeToken;
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  C.closeModal();
  document.body.classList.toggle('no-shell', name === 'login');
  document.body.classList.toggle('in-match', name === 'match');
  refreshChrome(name);
  viewEl.innerHTML = '';
  window.scrollTo(0, 0);

  if (blocked) { cleanup = renderBlocked(); return; }

  let mod;
  try {
    mod = (await import(ROUTES[name])).default;
  } catch (e) {
    if (token !== routeToken) return;
    console.warn('view load failed', name, e);
    showError(viewEl, 'Cet écran n\'est pas encore prêt', 'Reviens à l\'accueil, ce sera bientôt réparé.');
    return;
  }
  if (token !== routeToken) return;
  try {
    document.title = `${mod.title || 'Study League'} · Study League`;
    const out = await mod.mount(viewEl, ctx, params);
    if (token !== routeToken) { if (typeof out === 'function') out(); return; }
    if (typeof out === 'function') cleanup = out;
    if (!document.activeElement || document.activeElement === document.body) viewEl.focus({ preventScroll: true });
  } catch (e) {
    if (token !== routeToken) return;
    console.warn('view failed', name, e);
    showError(viewEl, 'Oups, quelque chose s\'est mal passé', e?.message && /[à-ÿ]/i.test(e.message) ? e.message : 'Retourne à l\'accueil et réessaie.');
  }
}

/* ---------------- boot ---------------- */
/** Load the player's state for a signed-in user (no navigation). */
async function restoreSession(user) {
  ctx.user = user;
  ctx.rng = createRng(randomSeed());
  if (isCoach(user)) { ctx.state = null; return; }
  let st = await store.loadState();
  let dirty = false;
  if (!st) { st = newPlayerState({ username: user.username, displayName: user.username, now: ctx.now() }); dirty = true; }
  if (!st.league.season) { st = ensureSeason(st, ctx.clubs, ctx.rng); dirty = true; }
  ctx.state = st;
  if (store.pendingSave?.()) dirty = true; // a sign-up state that could not be written yet
  if (dirty) {
    try { await store.saveState(st); } catch (e) {
      if (e?.code === 'not-authorized') throw e;
      console.warn('first save failed', e);
      C.showToast('Sauvegarde impossible — vérifie ta connexion', 'bad', { ms: 5000 });
    }
  }
}

/** restoreSession, but an account that is not on the family list ends on the "not authorised" screen: returns false then. */
async function enterSession(user) {
  try {
    await restoreSession(user);
    blocked = null;
    return true;
  } catch (e) {
    if (e?.code !== 'not-authorized') throw e;
    ctx.user = null;
    ctx.state = null;
    blocked = user;
    return false;
  }
}

let toastedError = false;
function globalFail(e) {
  console.warn('global error', e);
  if (toastedError) return;
  toastedError = true;
  setTimeout(() => { toastedError = false; }, 4000);
  C.showToast('Oups, un petit souci. Réessaie !', 'bad');
}
window.addEventListener('error', (e) => globalFail(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => { e.preventDefault(); globalFail(e.reason); });

async function boot() {
  try {
    const [catalog, clubsData, cardsData] = await Promise.all([loadCatalog(fetchJson), fetchJson('data/clubs.json'), fetchJson('data/cards.json')]);
    ctx.catalog = catalog;
    ctx.clubs = clubsData.clubs;
    ctx.cards = cardsData.cards;
  } catch (e) {
    document.body.classList.add('no-shell');
    viewEl.innerHTML = `<div class="page page--narrow">${C.emptyState({
      icon: '📡', title: 'Impossible de démarrer', text: 'Vérifie ta connexion internet, puis réessaie.',
      action: C.button({ label: 'Réessayer', attrs: { 'data-act': 'reload' } }),
    })}</div>`;
    viewEl.querySelector('[data-act="reload"]')?.addEventListener('click', () => location.reload());
    return;
  }
  try {
    const user = await store.init();
    if (user && await enterSession(user) && !isCoach(user) && await settleForfeit()) history.replaceState(null, '', '#/result');
  } catch (e) {
    console.warn('session restore failed', e);
    ctx.user = null;
    ctx.state = null;
  }
  window.addEventListener('hashchange', route);
  await route();
}

boot();
