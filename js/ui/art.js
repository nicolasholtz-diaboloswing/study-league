// Generated SVG art for Study League. No image files.
// Every function returns an HTML/SVG string. Sizes are CSS pixels (width); height follows the aspect ratio.

let _uid = 0;
const uid = (p = 'a') => `${p}${++_uid}`;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- colour + seed helpers ---------- */
const HEX = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;
/** A colour only if it is a #rgb / #rrggbb string, else the default. Every colour that reaches SVG goes through this. */
export const safeColor = (c, d) => (typeof c === 'string' && HEX.test(c) ? c : d);
const CRESTS = ['shield', 'round', 'diamond', 'stripes'];
/** Whitelisted crest style (default shield). */
export const safeCrest = (c) => (CRESTS.includes(c) ? c : 'shield');
function hexToRgb(hex) {
  let h = String(hex || '#888888').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** Lighten (amt>0) or darken (amt<0) a hex colour. amt in -1..1. */
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  return toHex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p);
}
function lum(hex) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
/** Best text colour on `bg`, preferring `pref` when readable. */
export function inkOn(bg, pref) {
  if (pref && contrast(bg, pref) >= 3) return pref;
  return contrast(bg, '#ffffff') >= contrast(bg, '#0b1226') ? '#ffffff' : '#0b1226';
}
function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFor(seed) {
  let a = hashStr(seed) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

const svgOpen = (w, vb, h, label, cls = '') =>
  `<svg class="art ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" ${h ? `height="${h}"` : ''} role="img" aria-label="${esc(label)}" focusable="false">`;

/* ---------- Crest ---------- */
/**
 * Club crest.
 * @param {{name?:string, short?:string, colors?:string[], crest?:'shield'|'round'|'diamond'|'stripes'}} club
 * @param {number} [size=64] width in px
 */
export function crest(club = {}, size = 64) {
  const cols = Array.isArray(club.colors) ? club.colors : [];
  const c1 = safeColor(cols[0], '#1e40af'), c2 = safeColor(cols[1], '#fbbf24');
  const style = safeCrest(club.crest);
  const short = (club.short || (club.name || '?').slice(0, 3)).toUpperCase().slice(0, 3);
  const ink = inkOn(c1, c2);
  const id = uid('cr');
  const dark = shade(c1, -0.45);
  const font = `font-family="Barlow Condensed, Oswald, Arial Narrow, Impact, sans-serif" font-weight="800" text-anchor="middle"`;
  const shieldPath = 'M10 6 H54 V34 C54 48 44 56 32 61 C20 56 10 48 10 34 Z';
  let body = '';
  if (style === 'round') {
    body = `<circle cx="32" cy="32" r="28" fill="${c1}" stroke="${dark}" stroke-width="2"/>
      <circle cx="32" cy="32" r="28" fill="none" stroke="${c2}" stroke-width="4" stroke-dasharray="1 0"/>
      <circle cx="32" cy="32" r="21" fill="none" stroke="${c2}" stroke-width="1.4" opacity=".8"/>
      <path d="M13 24 Q32 8 51 24" fill="none" stroke="${c2}" stroke-width="2" opacity=".0"/>
      <text x="32" y="40" ${font} font-size="22" fill="${ink}">${esc(short)}</text>
      <path d="M26 17 l2.2 4.4 4.8.7 -3.5 3.4.8 4.8 -4.3-2.3 -4.3 2.3.8-4.8 -3.5-3.4 4.8-.7z" fill="${c2}" transform="translate(6.5 -9) scale(.8)" opacity="0"/>
      <circle cx="32" cy="14" r="2.2" fill="${c2}"/><circle cx="32" cy="50" r="2.2" fill="${c2}"/>`;
  } else if (style === 'diamond') {
    body = `<path d="M32 3 L61 32 L32 61 L3 32 Z" fill="${c1}" stroke="${c2}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M32 11 L53 32 L32 53 L11 32 Z" fill="none" stroke="${c2}" stroke-width="1.4" opacity=".75"/>
      <text x="32" y="38.5" ${font} font-size="19" fill="${ink}">${esc(short)}</text>
      <circle cx="32" cy="17" r="2.4" fill="${c2}"/>`;
  } else if (style === 'stripes') {
    body = `<defs><clipPath id="${id}"><path d="${shieldPath}"/></clipPath></defs>
      <g clip-path="url(#${id})">
        <rect x="0" y="0" width="64" height="64" fill="${c1}"/>
        <rect x="14" y="0" width="9" height="64" fill="${c2}"/><rect x="29" y="0" width="9" height="64" fill="${c2}"/><rect x="44" y="0" width="9" height="64" fill="${c2}"/>
        <rect x="6" y="24" width="52" height="15" fill="${dark}" opacity=".92"/>
      </g>
      <path d="${shieldPath}" fill="none" stroke="${dark}" stroke-width="2.4" stroke-linejoin="round"/>
      <text x="32" y="36.2" ${font} font-size="14" fill="#fff" letter-spacing=".5">${esc(short)}</text>`;
  } else {
    body = `<defs><clipPath id="${id}"><path d="${shieldPath}"/></clipPath></defs>
      <path d="${shieldPath}" fill="${c1}"/>
      <g clip-path="url(#${id})"><rect x="0" y="0" width="64" height="17" fill="${c2}"/>
        <path d="M10 40 L32 29 L54 40 L54 46 L32 35 L10 46 Z" fill="${c2}" opacity=".0"/></g>
      <path d="${shieldPath}" fill="none" stroke="${c2}" stroke-width="3" stroke-linejoin="round"/>
      <path d="${shieldPath}" fill="none" stroke="${dark}" stroke-width=".8" stroke-linejoin="round" transform="translate(0 0)"/>
      <text x="32" y="43" ${font} font-size="20" fill="${ink}">${esc(short)}</text>
      <circle cx="32" cy="11" r="3" fill="${c1}" stroke="${shade(c2, -0.35)}" stroke-width="1"/>`;
  }
  return `${svgOpen(size, '0 0 64 64', size, 'Écusson ' + (club.name || ''), 'art-crest')}${body}</svg>`;
}

/* ---------- Kit / jersey ---------- */
/**
 * Football shirt from two colours.
 * @param {string} c1 main colour  @param {string} c2 trim colour
 * @param {{size?:number, pattern?:'plain'|'hoops'|'stripes'|'sash', number?:string|number}} [opt]
 */
export function kit(c1 = '#1e40af', c2 = '#fbbf24', opt = {}) {
  c1 = safeColor(c1, '#1e40af'); c2 = safeColor(c2, '#fbbf24');
  const { size = 96, pattern = 'plain', number } = opt;
  const id = uid('kt');
  const body = 'M30 10 L12 20 L2 42 L16 50 L24 38 L24 90 H76 V38 L84 50 L98 42 L88 20 L70 10 C66 18 58 22 50 22 C42 22 34 18 30 10 Z';
  let pat = '';
  if (pattern === 'hoops') pat = [34, 52, 70].map((y) => `<rect x="0" y="${y}" width="100" height="9" fill="${c2}"/>`).join('');
  if (pattern === 'stripes') pat = [30, 44, 58].map((x) => `<rect x="${x}" y="0" width="7" height="100" fill="${c2}"/>`).join('');
  if (pattern === 'sash') pat = `<path d="M24 30 L76 70 L76 84 L24 44 Z" fill="${c2}"/>`;
  const ink = inkOn(c1, c2);
  return `${svgOpen(size, '0 0 100 100', size, 'Maillot de foot', 'art-kit')}
    <defs><clipPath id="${id}"><path d="${body}"/></clipPath>
      <linearGradient id="${id}s" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>
    <path d="${body}" fill="${c1}"/>
    <g clip-path="url(#${id})">${pat}
      <rect x="2" y="36" width="22" height="9" fill="${c2}" transform="rotate(-26 13 40) translate(-3 -2)" opacity=".0"/>
      <path d="M2 42 L16 50 L12.5 56.5 L-1 48.5 Z" fill="${c2}"/><path d="M98 42 L84 50 L87.5 56.5 L101 48.5 Z" fill="${c2}"/>
      <rect x="0" y="0" width="100" height="100" fill="url(#${id}s)"/></g>
    <path d="M36 10 C40 20 45 24 50 24 C55 24 60 20 64 10 L70 10 C66 18 58 22 50 22 C42 22 34 18 30 10 Z" fill="${c2}"/>
    <path d="M42 10 C44 17 47 19 50 19 C53 19 56 17 58 10" fill="none" stroke="${shade(c2, -0.3)}" stroke-width="1.5" opacity=".0"/>
    ${number != null ? `<text x="50" y="66" text-anchor="middle" font-family="Barlow Condensed, Impact, sans-serif" font-weight="800" font-size="28" fill="${ink}">${esc(number)}</text>` : ''}
    <path d="${body}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
}

/* ---------- Flags (SVG: Windows has no flag emoji) ---------- */
const bands = (cols, vertical = true) => cols.map((c, i) => vertical
  ? `<rect x="${(30 / cols.length) * i}" y="0" width="${30 / cols.length + 0.2}" height="20" fill="${c}"/>`
  : `<rect x="0" y="${(20 / cols.length) * i}" width="30" height="${20 / cols.length + 0.2}" fill="${c}"/>`).join('');
const FLAGS = {
  Italy: bands(['#1f9d55', '#fff', '#d32f3a']),
  France: bands(['#2447b2', '#fff', '#e0343f']),
  Belgium: bands(['#1a1a1a', '#fcd116', '#e0343f']),
  Ireland: bands(['#169b62', '#fff', '#ff883e']),
  Germany: bands(['#111', '#dd2c2c', '#ffce00'], false),
  Netherlands: bands(['#ae1c28', '#fff', '#21468b'], false),
  Poland: bands(['#fff', '#dc143c'], false),
  Croatia: bands(['#e0343f', '#fff', '#1c4ba3'], false) + '<rect x="12" y="7" width="6" height="6" rx="1" fill="#e0343f" stroke="#1c4ba3" stroke-width="1"/>',
  Spain: '<rect width="30" height="20" fill="#c60b1e"/><rect y="5" width="30" height="10" fill="#ffc400"/>',
  Portugal: '<rect width="30" height="20" fill="#d1202f"/><rect width="12" height="20" fill="#0a8a3c"/><circle cx="12" cy="10" r="4" fill="#ffd400"/><circle cx="12" cy="10" r="2.2" fill="#d1202f"/>',
  Brazil: '<rect width="30" height="20" fill="#13a24a"/><path d="M15 2.5 L27 10 L15 17.5 L3 10 Z" fill="#ffd400"/><circle cx="15" cy="10" r="4.2" fill="#1f3b9d"/>',
  Argentina: '<rect width="30" height="20" fill="#7ec8f2"/><rect y="6.7" width="30" height="6.6" fill="#fff"/><circle cx="15" cy="10" r="1.8" fill="#f6b40e"/>',
  Uruguay: '<rect width="30" height="20" fill="#fff"/>' + [2.2, 6.6, 11, 15.4].map((y) => `<rect y="${y}" width="30" height="2.2" fill="#2d6fc0"/>`).join('') + '<rect width="11" height="11" fill="#fff"/><circle cx="5.5" cy="5.5" r="2.6" fill="#f6b40e"/>',
  England: '<rect width="30" height="20" fill="#fff"/><rect x="13" width="4" height="20" fill="#cf142b"/><rect y="8" width="30" height="4" fill="#cf142b"/>',
  Switzerland: '<rect width="30" height="20" fill="#da291c"/><rect x="13" y="4" width="4" height="12" fill="#fff"/><rect x="9" y="8" width="12" height="4" fill="#fff"/>',
  Sweden: '<rect width="30" height="20" fill="#1d6fb8"/><rect x="9" width="4" height="20" fill="#fcc400"/><rect y="8" width="30" height="4" fill="#fcc400"/>',
  Japan: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5" fill="#c8102e"/>',
  Nigeria: bands(['#0b8a43', '#fff', '#0b8a43']),
  Ghana: bands(['#ce1126', '#fcd116', '#006b3f'], false) + '<path d="M15 6.8 l1 2.9 3 0 -2.4 1.8 .9 2.9 -2.5-1.8 -2.5 1.8 .9-2.9 -2.4-1.8 3 0z" fill="#111"/>',
  Senegal: bands(['#00853f', '#fdef42', '#e31b23']) + '<path d="M15 6.8 l1 2.9 3 0 -2.4 1.8 .9 2.9 -2.5-1.8 -2.5 1.8 .9-2.9 -2.4-1.8 3 0z" fill="#00853f"/>',
  Morocco: '<rect width="30" height="20" fill="#c1272d"/><path d="M15 5.5 l1.3 3.9 4.1 0 -3.3 2.4 1.3 3.9 -3.4-2.4 -3.4 2.4 1.3-3.9 -3.3-2.4 4.1 0z" fill="none" stroke="#0b6b3a" stroke-width="1.1"/>',
  Mexico: bands(['#006847', '#fff', '#ce1126']) + '<circle cx="15" cy="10" r="2.4" fill="#9b7a3a" opacity=".85"/>',
};
const NATION_LABEL = {
  Argentina: 'Argentine', England: 'Angleterre', Spain: 'Espagne', Germany: 'Allemagne', Italy: 'Italie',
  Netherlands: 'Pays-Bas', Belgium: 'Belgique', Morocco: 'Maroc', Brazil: 'Brésil',
};
/** French name of a nation key (the keys of FLAGS and of the `nation` field of a card). */
export const nationLabel = (n) => NATION_LABEL[n] || n;
/** Small SVG flag for a nation name (falls back to a neutral flag). */
export function flag(nation, width = 24) {
  const inner = FLAGS[nation] || '<rect width="30" height="20" fill="#3a4a78"/><text x="15" y="14" text-anchor="middle" font-size="11" fill="#fff" font-family="sans-serif">?</text>';
  return `<svg class="art art-flag" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="${width}" height="${Math.round(width * 2 / 3)}" role="img" aria-label="${esc(nationLabel(nation))}" focusable="false"><rect width="30" height="20" rx="2.5" fill="#222"/><g clip-path="inset(0 round 2.5px)">${inner}</g><rect width="30" height="20" rx="2.5" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1"/></svg>`;
}

/* ---------- Player portrait ---------- */
const SKINS = ['#f7d9c0', '#eebd96', '#d79c70', '#b87a52', '#8a5636', '#5d3a24'];
const HAIRS = ['#16110d', '#2c1b10', '#5a3a1e', '#a8672a', '#d6ad55', '#8d929c', '#b4411c'];
const HAIR_STYLES = ['short', 'buzz', 'slick', 'curly', 'afro', 'long', 'mohawk', 'bun', 'bald', 'headband'];
const KIT_PALETTE = [['#1e40af', '#fbbf24'], ['#b91c1c', '#f8fafc'], ['#15803d', '#fde047'], ['#6d28d9', '#f8fafc'], ['#0e7490', '#f8fafc'], ['#c2410c', '#1e293b'], ['#be185d', '#f8fafc'], ['#111827', '#f59e0b']];

/**
 * Fictional player portrait, deterministic per seed (use the card id).
 * @param {string} seed  @param {{size?:number, kit?:[string,string]}} [opt]
 */
export function portrait(seed, opt = {}) {
  const { size = 120 } = opt;
  const r = rngFor('portrait:' + seed);
  const skin = pick(r, SKINS), hair = pick(r, HAIRS), style = pick(r, HAIR_STYLES);
  const [kr1, kr2] = opt.kit || pick(r, KIT_PALETTE);
  const k1 = safeColor(kr1, '#1e40af'), k2 = safeColor(kr2, '#fbbf24');
  const mouth = Math.floor(r() * 3), beard = r() < 0.28 ? (r() < 0.5 ? 'stubble' : 'beard') : '', brow = Math.floor(r() * 3);
  const eyeX = 7 + Math.floor(r() * 2);
  const skinD = shade(skin, -0.18), skinL = shade(skin, 0.18), hairD = shade(hair, -0.3), hairL = shade(hair, 0.22);
  const id = uid('pt');
  const back = {
    afro: `<circle cx="50" cy="35" r="28" fill="${hair}"/><circle cx="50" cy="35" r="28" fill="url(#${id}h)"/>`,
    long: `<path d="M27 46 C22 18 40 12 50 12 C62 12 78 18 73 46 L75 74 C66 70 66 62 66 56 L34 56 C34 62 34 70 25 74 Z" fill="${hair}"/>`,
  }[style] || '';
  const front = {
    short: `<path d="M31 42 C29 24 40 17 50 17 C62 17 72 25 69 42 C66 34 60 30 50 30 C40 30 34 34 31 42 Z" fill="${hair}"/>`,
    buzz: `<path d="M32 40 C31 26 40 20 50 20 C60 20 69 26 68 40 C65 32 58 29 50 29 C42 29 35 32 32 40Z" fill="${hair}" opacity=".6"/>`,
    slick: `<path d="M31 42 C27 22 44 13 57 17 C69 21 72 31 69 42 C66 32 58 27 46 28 C40 29 34 33 31 42Z" fill="${hair}"/><path d="M40 20 C48 18 58 20 62 25" stroke="${hairL}" stroke-width="1.6" fill="none" opacity=".7"/>`,
    curly: [[34, 31], [41, 23], [50, 20], [59, 23], [66, 31], [31, 41], [69, 41]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${y > 36 ? 5 : 8}" fill="${hair}"/>`).join(''),
    afro: `<path d="M33 36 C38 28 62 28 67 36 C62 32 38 32 33 36Z" fill="${hair}"/>`,
    long: `<path d="M31 42 C29 24 40 17 50 17 C62 17 72 25 69 42 C66 34 60 30 50 30 C40 30 34 34 31 42 Z" fill="${hair}"/>`,
    mohawk: `<path d="M32 38 C32 28 40 25 50 25 C60 25 68 28 68 38 C64 32 58 30 50 30 C42 30 36 32 32 38Z" fill="${hair}" opacity=".45"/><path d="M43 30 C42 13 58 13 57 30 Z" fill="${hair}"/>`,
    bun: `<path d="M31 42 C29 24 40 17 50 17 C62 17 72 25 69 42 C66 34 60 30 50 30 C40 30 34 34 31 42 Z" fill="${hair}"/><circle cx="50" cy="12" r="7" fill="${hair}"/>`,
    bald: `<ellipse cx="44" cy="27" rx="7" ry="3" fill="#fff" opacity=".22" transform="rotate(-25 44 27)"/>`,
    headband: `<path d="M31 42 C29 24 40 17 50 17 C62 17 72 25 69 42 C66 34 60 30 50 30 C40 30 34 34 31 42 Z" fill="${hair}"/><rect x="30.5" y="29" width="39" height="5.5" rx="2.5" fill="${k2}"/>`,
  }[style];
  const mouths = [
    `<path d="M43 57 Q50 63 57 57" fill="none" stroke="#7a2e2e" stroke-width="2" stroke-linecap="round"/>`,
    `<path d="M44 57.5 Q50 61 56 57.5" fill="none" stroke="#7a2e2e" stroke-width="2" stroke-linecap="round"/>`,
    `<path d="M43 56.5 Q50 65 57 56.5 Z" fill="#7a2e2e"/><path d="M44.5 57.3 H55.5" stroke="#fff" stroke-width="1.6"/>`,
  ];
  const brows = [`M38 38.5 L47 37.5 M53 37.5 L62 38.5`, `M38 37.5 Q42 35.5 47 37.5 M53 37.5 Q58 35.5 62 37.5`, `M38 36.5 L47 38.5 M53 38.5 L62 36.5`];
  const beardSvg = beard === 'beard'
    ? `<path d="M31 50 C31 68 40 72 50 72 C60 72 69 68 69 50 C66 58 60 60 50 60 C40 60 34 58 31 50Z" fill="${hairD}" opacity=".92"/>` + mouths[mouth].replace('#7a2e2e', '#3a1a1a')
    : beard === 'stubble' ? `<path d="M32 50 C33 66 41 70 50 70 C59 70 67 66 68 50 C65 56 60 58 50 58 C40 58 35 56 32 50Z" fill="${hairD}" opacity=".28"/>` : '';
  return `${svgOpen(size, '0 0 100 100', size, 'Portrait de joueur', 'art-portrait')}
    <defs>
      <radialGradient id="${id}g" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="${shade(k1, 0.15)}" stop-opacity=".9"/><stop offset="1" stop-color="#050b1c"/></radialGradient>
      <radialGradient id="${id}h" cx=".4" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>
      <linearGradient id="${id}j" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".25"/><stop offset=".5" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#${id}g)"/>
    <g opacity=".18" stroke="#fff" stroke-width=".8"><path d="M-10 100 L20 0 M10 100 L35 0 M90 100 L65 0 M110 100 L80 0"/></g>
    ${back}
    <path d="M6 100 C6 82 24 74 50 74 C76 74 94 82 94 100 Z" fill="${k1}"/>
    <path d="M6 100 C6 82 24 74 50 74 C76 74 94 82 94 100 Z" fill="url(#${id}j)"/>
    <path d="M36 75 L50 90 L64 75" fill="none" stroke="${k2}" stroke-width="4.5" stroke-linejoin="round"/>
    <rect x="42" y="58" width="16" height="22" rx="6" fill="${skinD}"/>
    <circle cx="31" cy="47" r="4.2" fill="${skin}"/><circle cx="69" cy="47" r="4.2" fill="${skin}"/>
    <ellipse cx="50" cy="44" rx="19" ry="22" fill="${skin}"/>
    <ellipse cx="42" cy="36" rx="9" ry="6" fill="${skinL}" opacity=".35"/>
    ${front}
    <g fill="#16120f"><circle cx="${50 - eyeX}" cy="46" r="2.3"/><circle cx="${50 + eyeX}" cy="46" r="2.3"/></g>
    <g fill="#fff"><circle cx="${50 - eyeX + .8}" cy="45.2" r=".8"/><circle cx="${50 + eyeX + .8}" cy="45.2" r=".8"/></g>
    <path d="${brows[brow]}" stroke="${hair === HAIRS[4] ? hairD : hairD}" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M50 47 Q47.5 53 50 54.5 Q52 54 52.5 53" fill="none" stroke="${skinD}" stroke-width="1.6" stroke-linecap="round"/>
    ${beard === 'beard' ? '' : mouths[mouth]}${beardSvg}
  </svg>`;
}

/** Dark silhouette for the "missing" state. */
function silhouette(size = 120) {
  return `${svgOpen(size, '0 0 100 100', size, 'Joueur manquant', 'art-portrait')}
    <rect width="100" height="100" fill="#0a1432"/>
    <path d="M6 100 C6 82 24 74 50 74 C76 74 94 82 94 100 Z" fill="#16264f"/>
    <rect x="42" y="58" width="16" height="22" rx="6" fill="#16264f"/>
    <ellipse cx="50" cy="44" rx="19" ry="22" fill="#16264f"/></svg>`;
}

/* ---------- Collectible cards ---------- */
const RARITY_LABEL = { common: 'Commune', rare: 'Rare', epic: 'Épique', legend: 'Légende' };
export const rarityLabel = (r) => RARITY_LABEL[r] || r;

/**
 * Collectible player card (HTML). Scales to its container width (aspect 5:7).
 * @param {{id:string,name:string,pos:string,nation:string,rating:number,rarity:'common'|'rare'|'epic'|'legend'}} c
 * @param {{count?:number, size?:'sm'|'md'|'lg'|'fluid', tag?:string}} [opt] count>1 shows a "×n" badge
 */
export function card(c, opt = {}) {
  const { count = 1, size = 'fluid' } = opt;
  const rarity = Object.hasOwn(RARITY_LABEL, c.rarity) ? c.rarity : 'common';
  return `<div class="pcard pcard--${rarity} pcard--${size}" data-card="${esc(c.id)}" role="group" aria-label="${esc(`${c.name}, ${c.pos}, note ${c.rating}, ${RARITY_LABEL[rarity]}`)}">
    <div class="pcard__frame">
      <div class="pcard__shine" aria-hidden="true"></div>
      <div class="pcard__top"><span class="pcard__rating">${esc(c.rating)}</span><span class="pcard__pos">${esc(c.pos)}</span></div>
      <div class="pcard__art">${portrait(c.id, { size: 160 })}</div>
      <div class="pcard__name">${esc(c.name)}</div>
      <div class="pcard__foot">${flag(c.nation || 'France', 22)}<span class="pcard__nation">${esc(c.era || c.nation)}</span></div>
      ${rarity === 'legend' ? '<span class="pcard__spark pcard__spark--1" aria-hidden="true"></span><span class="pcard__spark pcard__spark--2" aria-hidden="true"></span><span class="pcard__spark pcard__spark--3" aria-hidden="true"></span>' : ''}
    </div>
    ${count > 1 ? `<span class="pcard__count" aria-label="${esc(count)} exemplaires">×${esc(count)}</span>` : ''}
  </div>`;
}

/** Carte face cachée back (pack opening). */
export function cardBack(opt = {}) {
  const { size = 'fluid' } = opt;
  return `<div class="pcard pcard--back pcard--${size}" aria-label="Carte face cachée">
    <div class="pcard__frame">
      <svg class="art pcard__back-art" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <g fill="none" stroke="#ffd95e" stroke-width="1.4" opacity=".75"><circle cx="50" cy="70" r="22"/><circle cx="50" cy="70" r="3"/><path d="M0 70 H100"/><rect x="12" y="14" width="76" height="112" rx="6" stroke-width="1"/><path d="M12 38 H30 V102 H12 M88 38 H70 V102 H88" /></g>
        <text x="50" y="74" text-anchor="middle" font-family="Barlow Condensed, Impact, sans-serif" font-weight="800" font-size="13" fill="#ffd95e" opacity=".0">SL</text>
      </svg>
      <div class="pcard__back-logo"><span>Study</span><span>League</span></div>
    </div></div>`;
}

/** Silhouette of a card not yet collected. `c` may be partial: only c.id and c.pos are shown. */
export function cardMissing(c = {}, opt = {}) {
  const { size = 'fluid' } = opt;
  return `<div class="pcard pcard--missing pcard--${size}" aria-label="Carte manquante${c.pos ? ', ' + esc(c.pos) : ''}">
    <div class="pcard__frame">
      <div class="pcard__top"><span class="pcard__rating">?</span><span class="pcard__pos">${esc(c.pos || '')}</span></div>
      <div class="pcard__art">${silhouette(160)}</div>
      <div class="pcard__name">???</div>
      <div class="pcard__foot"><span class="pcard__nation">#${esc(String(c.id || '').replace(/^p/, ''))}</span></div>
    </div></div>`;
}

/* ---------- Trophy + football ---------- */
/** Gold trophy cup. `opt.color` 'gold' (default) | 'silver' | 'bronze' | 'locked'. */
export function trophy(size = 96, opt = {}) {
  const pal = { gold: ['#fff1b0', '#fbbf24', '#b7791f'], silver: ['#f4f7ff', '#b7c3dc', '#6c7a99'], bronze: ['#ffd9b0', '#d28b4a', '#8a4f21'], locked: ['#3a4a78', '#26365f', '#17234a'] }[opt.color || 'gold'];
  const id = uid('tr');
  return `${svgOpen(size, '0 0 100 110', Math.round(size * 1.1), 'Trophée', 'art-trophy')}
    <defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${pal[2]}"/><stop offset=".35" stop-color="${pal[0]}"/><stop offset=".7" stop-color="${pal[1]}"/><stop offset="1" stop-color="${pal[2]}"/></linearGradient></defs>
    <path d="M26 20 C6 20 6 50 30 54" fill="none" stroke="url(#${id})" stroke-width="6" stroke-linecap="round"/>
    <path d="M74 20 C94 20 94 50 70 54" fill="none" stroke="url(#${id})" stroke-width="6" stroke-linecap="round"/>
    <path d="M24 12 H76 C76 44 66 62 50 66 C34 62 24 44 24 12 Z" fill="url(#${id})"/>
    <path d="M32 16 C32 40 40 54 48 58" fill="none" stroke="#fff" stroke-width="3" opacity=".45" stroke-linecap="round"/>
    <rect x="45" y="64" width="10" height="16" fill="url(#${id})"/>
    <path d="M36 80 H64 L68 90 H32 Z" fill="url(#${id})"/>
    <rect x="28" y="90" width="44" height="12" rx="3" fill="${pal[2]}"/><rect x="28" y="90" width="44" height="5" rx="2" fill="${pal[1]}" opacity=".6"/>
    <path d="M50 24 l3.4 7 7.6 1.1 -5.5 5.4 1.3 7.6 -6.8-3.6 -6.8 3.6 1.3-7.6 -5.5-5.4 7.6-1.1z" fill="${opt.color === 'locked' ? '#3a4a78' : '#fff8d6'}" opacity=".85"/></svg>`;
}

/** Classic football. */
export function football(size = 48) {
  const id = uid('fb');
  return `${svgOpen(size, '0 0 100 100', size, 'Ballon', 'art-ball')}
    <defs><radialGradient id="${id}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#e3e8f5"/><stop offset="1" stop-color="#9aa6c4"/></radialGradient></defs>
    <circle cx="50" cy="50" r="46" fill="url(#${id})" stroke="#1a2442" stroke-width="3"/>
    <path d="M50 30 L69 44 L62 66 H38 L31 44 Z" fill="#1a2442"/>
    <g stroke="#1a2442" stroke-width="3" fill="none" stroke-linecap="round"><path d="M50 30 V10 M69 44 L88 38 M62 66 L74 84 M38 66 L26 84 M31 44 L12 38"/></g>
    <g fill="#1a2442"><path d="M50 4 L62 10 L56 18 H44 L38 10Z"/><path d="M94 40 L90 54 L82 52 L80 40 L88 34Z" opacity=".9"/><path d="M6 40 L10 54 L18 52 L20 40 L12 34Z" opacity=".9"/><path d="M72 90 L58 94 L56 86 L66 80Z" opacity=".9"/><path d="M28 90 L42 94 L44 86 L34 80Z" opacity=".9"/></g></svg>`;
}
