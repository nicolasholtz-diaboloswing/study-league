// Study League effects: goal celebration, confetti, pack-opening card flip, count-up. No libraries.
// All of them respect prefers-reduced-motion (shorter / static) and never block: they return Promises.
import { card, cardBack, esc, football, shade, safeColor } from './art.js';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const layer = () => document.getElementById('overlay') || document.body;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Animated goal scene (pure SVG + CSS, about 2.2 s, starts when inserted in the DOM): a small player in the given kit
 * runs up, shoots, the ball flies into the net and the net ripples. Returns an HTML string.
 * `conceded: true` mirrors it (the goal is on our side, the shooter is the opponent) and mutes the colours: no celebration.
 * @param {{kit?:[string,string], conceded?:boolean}} [o] kit = [shirt colour, shorts/trim colour]
 */
export function goalScene({ kit = ['#1e40af', '#fbbf24'], conceded = false } = {}) {
  const c1 = safeColor(kit?.[0], '#1e40af'), c2 = safeColor(kit?.[1], '#fbbf24');
  const skin = '#e8b48c', sock = shade(c1, -0.1);
  const net = [...Array(8)].map((_, i) => `<path d="M${240 + i * 6.5} 66 V140"/>`).join('') + [...Array(7)].map((_, i) => `<path d="M236 ${74 + i * 10} H286"/>`).join('');
  const limb = (cls, x, y, w, h, fill) => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="${fill}"/>`;
  return `<svg class="gscene ${conceded ? 'gscene--against' : ''}" viewBox="0 0 300 170" role="img" aria-label="${conceded ? 'But encaissé' : 'But marqué'}" focusable="false">
    <defs><linearGradient id="gs-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14803f"/><stop offset="1" stop-color="#0b4a28"/></linearGradient></defs>
    <rect x="0" y="140" width="300" height="30" fill="url(#gs-grass)"/>
    <path d="M0 140 H300" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
    <g class="gscene__net" stroke="#fff" stroke-opacity=".5" stroke-width="1" fill="none">${net}</g>
    <path d="M236 140 V64 H288" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <g class="gscene__player"><g transform="translate(34 140)">
      ${limb('gscene__leg gscene__leg--a', -3.5, -38, 7, 36, skin)}${limb('gscene__arm gscene__arm--a', -2.5, -68, 5, 26, skin)}
      <rect x="-3.5" y="-9" width="7" height="9" rx="2" fill="${sock}"/>
      <g class="gscene__kickleg">${limb('gscene__leg gscene__leg--b', -3.5, -38, 7, 36, skin)}<rect x="-3.5" y="-9" width="7" height="9" rx="2" fill="${sock}"/><rect x="-4" y="-3" width="11" height="4" rx="2" fill="#111"/></g>
      <rect x="-8" y="-46" width="16" height="12" rx="3" fill="${c2}"/>
      <path d="M-8.5 -70 H8.5 L7.5 -45 H-7.5 Z" fill="${c1}"/><path d="M-8.5 -70 H8.5 V-66 H-8.5 Z" fill="${c2}"/>
      ${limb('gscene__arm gscene__arm--b', -2.5, -68, 5, 26, skin)}
      <circle cx="0" cy="-79" r="9" fill="${skin}"/><path d="M-9 -80 C-9 -91 9 -91 9 -80 C5 -85 -5 -85 -9 -80Z" fill="#2c1b10"/>
    </g></g>
    <g class="gscene__ball"><circle cx="150" cy="134" r="6" fill="#fff" stroke="#1a2442" stroke-width="1.5"/><path d="M150 130 l3.5 2.6 -1.3 4 h-4.4 l-1.3 -4z" fill="#1a2442"/></g>
  </svg>`;
}

/** Show the goal scene alone in the overlay layer (e.g. a quiet "conceded" moment). Resolves when it ends. */
export async function playGoalScene(o = {}) {
  const el = document.createElement('div');
  el.className = `goalfx goalfx--scene ${o.conceded ? 'goalfx--against' : ''}`;
  el.innerHTML = `<div class="goalfx__scene">${goalScene(o)}</div>`;
  layer().appendChild(el);
  await wait(reduced() ? 900 : 2800);
  el.classList.add('is-out');
  await wait(reduced() ? 0 : 320);
  el.remove();
}

/**
 * Full-screen "BUT !" overlay. Pass `kit` ([c1, c2]) to add the goal scene above the text. Resolves when it has faded out (or when tapped).
 * Lasts about 2.2 s, shows "Touche pour continuer", and can be skipped by a tap or Enter / Space / Escape.
 * @param {{text?:string, sub?:string, score?:string, ms?:number, side?:'home'|'away', kit?:[string,string]}} [o] side 'away' = goal against (red tint, "Aïe !"); score = small extra line
 */
export async function goalCelebration(o = {}) {
  const against = o.side === 'away';
  const text = o.text || (against ? 'Aïe !' : 'BUT !');
  const ms = reduced() ? 1200 : o.ms || (o.kit ? 2200 : 1900);
  const el = document.createElement('div');
  el.className = `goalfx ${against ? 'goalfx--against' : ''}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="goalfx__rays" aria-hidden="true"></div>
    ${o.kit ? `<div class="goalfx__scene">${goalScene({ kit: o.kit, conceded: against })}</div>` : `<div class="goalfx__ball" aria-hidden="true">${football(84)}</div>`}
    <div class="goalfx__text">${esc(text)}</div>${o.sub ? `<div class="goalfx__sub">${esc(o.sub)}</div>` : ''}${o.score ? `<div class="goalfx__score num">${esc(o.score)}</div>` : ''}
    <div class="goalfx__hint" aria-hidden="true">Touche pour continuer</div>`;
  layer().appendChild(el);
  let done;
  const finished = new Promise((r) => { done = r; });
  const onKey = (e) => { if (['Enter', ' ', 'Escape'].includes(e.key)) close(); };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    if (!el.isConnected || el.classList.contains('is-out')) return;
    el.classList.add('is-out');
    setTimeout(() => { el.remove(); done(); }, reduced() ? 0 : 320);
  };
  el.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  if (!against) confetti({ count: 70, origin: { x: 0.5, y: 0.45 }, ms: 1800 });
  setTimeout(close, ms);
  return finished;
}

/**
 * Short "NIVEAU 9 !" flash (about 1.5 s, tap or key to skip; no animation under reduced motion). Resolves when gone.
 * @param {number} level
 */
export async function levelUpFlash(level) {
  const el = document.createElement('div');
  el.className = 'lvlfx';
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="lvlfx__star" aria-hidden="true">⭐</div><div class="lvlfx__text display">Niveau ${esc(level)} !</div><div class="goalfx__hint" aria-hidden="true">Touche pour continuer</div>`;
  layer().appendChild(el);
  let done;
  const finished = new Promise((r) => { done = r; });
  const onKey = (e) => { if (['Enter', ' ', 'Escape'].includes(e.key)) close(); };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    if (!el.isConnected || el.classList.contains('is-out')) return;
    el.classList.add('is-out');
    setTimeout(() => { el.remove(); done(); }, reduced() ? 0 : 250);
  };
  el.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  if (!reduced()) confetti({ count: 60, origin: { x: 0.5, y: 0.4 }, ms: 1400 });
  setTimeout(close, reduced() ? 1200 : 1500);
  return finished;
}

const COLORS = ['#fbbf24', '#ffd95e', '#3ddc84', '#4cc2ff', '#ff5a6a', '#ffffff', '#b36bff'];
/**
 * Confetti burst on a full-screen canvas. Resolves when finished. Skipped under reduced motion.
 * @param {{count?:number, origin?:{x:number,y:number}, ms?:number, colors?:string[]}} [o] origin in 0..1 viewport fractions
 */
export function confetti(o = {}) {
  if (reduced()) return Promise.resolve();
  const { count = 160, origin = { x: 0.5, y: 0.35 }, ms = 2600, colors = COLORS } = o;
  const cv = document.createElement('canvas');
  cv.className = 'confetti-canvas';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  layer().appendChild(cv);
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => {
    const a = (-Math.PI / 2) + (Math.random() - 0.5) * 2.2, v = 6 + Math.random() * 11;
    return { x: origin.x * innerWidth, y: origin.y * innerHeight, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, c: colors[Math.floor(Math.random() * colors.length)] };
  });
  return new Promise((resolve) => {
    const t0 = performance.now();
    (function frame(t) {
      const k = t - t0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const fade = k > ms - 600 ? Math.max(0, (ms - k) / 600) : 1;
      for (const p of parts) {
        p.vy += 0.28; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.globalAlpha = fade; ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      if (k < ms) requestAnimationFrame(frame); else { cv.remove(); resolve(); }
    })(t0);
  });
}

/**
 * Pack opening: renders face-down cards into `container`; each tap (or Enter) flips the next one.
 * Epic / legend cards get a glow, legend also fires confetti. Resolves when every card is revealed.
 * @param {HTMLElement} container  @param {object[]} cards (card objects from data/cards.json)
 * @param {{auto?:boolean, onReveal?:(card:object, index:number)=>void}} [o] auto=true reveals one by one on a timer
 */
export function revealPack(container, cards, o = {}) {
  container.classList.add('pack');
  container.innerHTML = cards.map((c, i) => `<button type="button" class="flip" data-i="${i}" aria-label="Retourner la carte ${i + 1}">
    <span class="flip__inner"><span class="flip__face flip__back">${cardBack()}</span><span class="flip__face flip__front">${card(c)}</span></span></button>`).join('');
  const els = [...container.querySelectorAll('.flip')];
  let next = 0;
  return new Promise((resolve) => {
    const flip = (i) => {
      const el = els[i]; if (!el || el.classList.contains('is-flipped')) return;
      el.classList.add('is-flipped'); el.disabled = true;
      const c = cards[i];
      el.classList.add(`flip--${c.rarity}`);
      if (c.rarity === 'legend') confetti({ count: 200, origin: { x: 0.5, y: 0.4 }, ms: 3200 });
      else if (c.rarity === 'epic') confetti({ count: 70, origin: { x: 0.5, y: 0.4 }, ms: 2000, colors: ['#b36bff', '#ffffff', '#4cc2ff'] });
      o.onReveal?.(c, i);
      next = i + 1;
      if (next >= cards.length) setTimeout(resolve, reduced() ? 0 : 700);
    };
    els.forEach((el, i) => {
      el.addEventListener('click', () => { if (i === next || o.free) flip(i); else flip(next); });
    });
    els[0]?.focus({ preventScroll: true });
    if (o.auto) (async () => { for (let i = 0; i < cards.length; i++) { await wait(reduced() ? 150 : 900); flip(i); } })();
  });
}

/**
 * Animate a number inside `el` from `from` to `to`.
 * @param {HTMLElement} el @param {number} to @param {{from?:number, ms?:number, format?:(n:number)=>string}} [o]
 */
export function countUp(el, to, o = {}) {
  const { from = 0, ms = 900, format = (n) => String(Math.round(n)) } = o;
  if (reduced() || from === to) { el.textContent = format(to); return Promise.resolve(); }
  return new Promise((resolve) => {
    const t0 = performance.now();
    (function frame(t) {
      const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
      el.textContent = format(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(frame); else resolve();
    })(t0);
  });
}
