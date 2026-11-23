// Figures for questions: a spec (plain data, never SVG or HTML) -> an SVG string drawn by code.
// Nothing here touches the DOM. renderFigure() returns '' for an unknown or invalid spec; validateFigure() lists the problems.
// Colours and strokes come from the CSS classes of css/components.css (.fg ...), which use the tokens of css/tokens.css.
// Every figure is drawn in a 320-unit wide viewBox (200 high at most), text 14 to 16 units: readable on a 360 px phone.
//
// A question carries `"figure": { "type": "...", ...parameters }`. Coordinates are maths coordinates (y up) unless said otherwise.
// Text labels are plain strings (escaped here), 24 characters at most; vertex and point names 3 characters at most.
// `hl` (1..6) picks a highlight colour: 1 gold, 2 blue, 3 green, 4 pink, 5 violet, 6 orange.
//
// numberline  { min, max, step, labelEvery?=1, labels?:[values], points?:[{ x, name?, label?:true, hl? }] }
//             graduations every `step` from min to max (at most 40, whole number of steps); numbers under every `labelEvery`-th
//             graduation, or only under the values listed in `labels`; a point is a dot with its name above and, with label:true,
//             its abscissa below.
// plane       { xmin, xmax, ymin, ymax, labelEvery?,   (numbers on the lower and left edges of the grid) points?:[{ name, x, y, label?:true, pos?:'n|s|e|w|ne|nw|se|sw', hl? }],
//               lines?:[[nameA, nameB]], polygon?:[names] }       whole numbers, xmin <= 0 <= xmax, same for y; orthonormal grid.
// secant      { angle:35..145, tilt?:0..12, parallelMarks?:bool, lines?:true, marks?:[{ at:'P ne', text, hl? }] }
//             two lines (d) and (d') cut by a secant (s) at P (upper line) and Q (lower line); `angle` is the angle between the
//             first line and the secant (north-east at P). `at` = intersection P|Q + quadrant ne|nw|se|sw. tilt: the lower line
//             is not parallel to the upper one (rotated by `tilt` degrees).
// triangle    { vertices:[[x,y]x3], names?:[3], angles?:[3 of null|''|text], sides?:[3 of null|text], ticks?:[3 of 0..3],
//               rightAt?:[vertex indexes], height?:{ from, to?, label?, foot? }, fill?:false }
//             `sides[i]` and `ticks[i]` belong to the edge from vertex i to vertex i+1. angles: null = nothing, '' = arc only.
//             height: dashed altitude from vertex `from` to the line of edge `to` (default: the opposite edge; for a quad, the edge two places on).
// quad        { vertices:[[x,y]x4], names?, angles?, sides?, ticks?, rightAt?, height?, par?:[[edge,edge],..],
//               diagonals?:bool, center?:name, diagTicks?:[n,n], diagRight?:bool, diagLabels?:[2 of null|text] }
//             par: each group of edges gets 1, 2, ... chevrons (parallel sides). diagTicks: equal marks on the halves of AC and BD.
// symmetry    { mode:'axial'|'central', cols, rows, shape:[[x,y]..], names?:[..], image?:bool, imageNames?:[..],
//               axis?:{ p:[x,y], q:[x,y], name? }, center?:{ p:[x,y], name? }, points?:[{ p:[x,y], name }] }
//             square grid of cols x rows cells, nodes (0..cols, 0..rows); the image is computed by the renderer.
// bar         { cats:[text], values:[n>=0], ymax, ystep, xTitle?, yTitle?, show?:'all'|[indexes], highlight?:[indexes] }
// line        { x:{ min, max, step, title? } | { cats:[text], title? }, y:{ min, max, step, title? },
//               series:[{ pts:[[x,y]..], join?:true, dots?:true, labels?:'all'|[indexes], hl? }], guides?:[[x,y]..] }
//             a proportionality graph is a line series through (0 ; 0); with cats, x = 0..n-1 is the category index.
// pie         { parts:[{ v>0, name?, text? }] (2..7) }   sectors start at the top and go clockwise; `text` (a percentage, '?')
//             is written inside the sector, `name` outside.
// solid       { kind:'block', l, w, h, labels?:{ l?, w?, h? }, names?:[8], hidden?:true }   cavalier perspective, l = front width,
//               w = depth, h = height (numbers > 0, they only set the proportions); names: A..D bottom (front-left, front-right,
//               back-right, back-left), E..H top above them.
//             { kind:'cubes', heights:[[n..]..] }  stack of unit cubes, heights[row][col] in 0..5, row 0 = front row; a column behind
//               a taller one is refused (its cubes would be hidden).
import { esc } from './art.js';

const W = 320;
const HMAX = 200;
const LABEL = 'Figure de la question';

/* ---------- small helpers ---------- */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const isText = (v) => typeof v === 'string' && v.length <= 24;
const isName = (v) => typeof v === 'string' && v.length >= 1 && v.length <= 3;
const r1 = (v) => Math.round(v * 10) / 10;
const pt = (x, y) => `${r1(x)},${r1(y)}`;
const pts = (a) => a.map((p) => pt(p[0], p[1])).join(' ');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const K = (hl, d = 1) => (isInt(hl) && hl >= 1 && hl <= 6 ? hl : d);
/** A number as French text: decimal comma, real minus sign. */
export const fmt = (v) => {
  const s = String(Math.round(v * 1e6) / 1e6).replace('.', ',');
  return s === '-0' ? '0' : s.replace('-', '−');
};
const norm = (a) => { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d; };
const unit = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };

const svg = (h, body) => `<svg class="fg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Math.round(h)}" role="img" aria-label="${LABEL}" focusable="false">${body}</svg>`;
/** cls: t (default 15 px), tt (14 px tick labels), plus k1..k6 (colour) or td (dim). anchor: start|middle|end. dy: baseline shift. */
const txt = (x, y, s, cls = '', anchor = 'middle', dy = 5) => `<text class="${cls}" x="${r1(x)}" y="${r1(y + dy)}" text-anchor="${anchor}">${esc(s)}</text>`;
const dot = (x, y, hl, r = 5) => `<circle class="dot k${K(hl)}" cx="${r1(x)}" cy="${r1(y)}" r="${r}"/>`;
const line = (a, b, cls = 'ln') => `<line class="${cls}" x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}"/>`;
/** SVG arc from screen angle a1 to a2 (the short way), radius r around c. */
function arc(c, a1, a2, r, cls = 'kk k1') {
  const d = norm(a2 - a1);
  const p1 = [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)];
  const p2 = [c[0] + r * Math.cos(a1 + d), c[1] + r * Math.sin(a1 + d)];
  return `<path class="${cls}" d="M${pt(...p1)}A${r},${r} 0 0 ${d > 0 ? 1 : 0} ${pt(...p2)}"/>`;
}
/** Right-angle square at corner c, along unit vectors u and v (screen). */
const rightMark = (c, u, v, s = 10) => `<polyline class="thin" points="${pts([[c[0] + u[0] * s, c[1] + u[1] * s], [c[0] + (u[0] + v[0]) * s, c[1] + (u[1] + v[1]) * s], [c[0] + v[0] * s, c[1] + v[1] * s]])}"/>`;
/** n small ticks across the segment a-b (equal-length coding). */
function ticks(a, b, n) {
  if (!n) return '';
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const u = unit(b[0] - a[0], b[1] - a[1]);
  const v = [-u[1], u[0]];
  let out = '';
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 5;
    const c = [m[0] + u[0] * o, m[1] + u[1] * o];
    out += line([c[0] - v[0] * 6, c[1] - v[1] * 6], [c[0] + v[0] * 6, c[1] + v[1] * 6], 'thin');
  }
  return out;
}
/** n chevrons (parallel coding) on segment a-b, pointing along a -> b. */
function chevrons(a, b, n, at = 0.5) {
  const u = unit(b[0] - a[0], b[1] - a[1]);
  const v = [-u[1], u[0]];
  const m = [a[0] + (b[0] - a[0]) * at, a[1] + (b[1] - a[1]) * at];
  let out = '';
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 7;
    const c = [m[0] + u[0] * o, m[1] + u[1] * o];
    out += `<polyline class="thin" points="${pts([[c[0] - u[0] * 5 + v[0] * 5, c[1] - u[1] * 5 + v[1] * 5], c, [c[0] - u[0] * 5 - v[0] * 5, c[1] - u[1] * 5 - v[1] * 5]])}"/>`;
  }
  return out;
}

/* ---------- validation helpers ---------- */
const listOf = (a, n, f) => Array.isArray(a) && a.length === n && a.every(f);
const point2 = (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]) && Math.abs(p[0]) <= 1000 && Math.abs(p[1]) <= 1000;
const optional = (v, f) => v === undefined || f(v);
const idx = (v, n) => isInt(v) && v >= 0 && v < n;

/* ======================= number line ======================= */
const NUMBERLINE = {
  validate(s, e) {
    if (!isNum(s.min) || !isNum(s.max) || !isNum(s.step) || s.step <= 0 || s.max <= s.min) return e.push('min, max, step');
    const n = (s.max - s.min) / s.step;
    if (Math.abs(n - Math.round(n)) > 1e-9 || n < 1 || n > 40) e.push('(max - min) / step must be a whole number from 1 to 40');
    const le = s.labelEvery ?? 1;
    if (!isInt(le) || le < 1) e.push('labelEvery');
    else if (s.labels === undefined && 272 / (n / le) < 8 * Math.max(...Array.from({ length: Math.floor(n / le) + 1 }, (_, i) => fmt(s.min + i * le * s.step).length)) + 6) e.push('labels too close');
    if (!optional(s.labels, (l) => Array.isArray(l) && l.length <= 40 && l.every((x) => isNum(x) && x >= s.min && x <= s.max))) e.push('labels');
    if (!optional(s.points, (l) => Array.isArray(l) && l.length <= 8 && l.every((p) => p && isNum(p.x) && p.x >= s.min && p.x <= s.max && optional(p.name, isName)))) e.push('points');
  },
  draw(s) {
    const n = Math.round((s.max - s.min) / s.step);
    const x0 = 24, dx = 272 / n, y = 52, le = s.labelEvery ?? 1;
    const X = (v) => x0 + ((v - s.min) / s.step) * dx;
    let g = `<line class="ax" x1="12" y1="${y}" x2="302" y2="${y}"/><polygon class="axf" points="308,${y} 299,${y - 4.5} 299,${y + 4.5}"/>`;
    for (let i = 0; i <= n; i++) {
      const v = s.min + i * s.step;
      const lab = s.labels ? s.labels.some((l) => Math.abs(l - v) < 1e-9) : i % le === 0;
      g += `<line class="ax" x1="${r1(X(v))}" y1="${y - (lab ? 9 : 5)}" x2="${r1(X(v))}" y2="${y + (lab ? 9 : 5)}"/>`;
      if (lab) g += txt(X(v), y + 25, fmt(v), 'tt');
    }
    for (const p of s.points || []) {
      g += dot(X(p.x), y, p.hl);
      if (p.name) g += txt(X(p.x), y - 20, p.name, `t k${K(p.hl)}`);
      if (p.label) g += txt(X(p.x), y + 47, fmt(p.x), `tt k${K(p.hl)}`);
    }
    return svg(108, g);
  },
};

/* ======================= coordinate plane ======================= */
const POS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };
const PLANE = {
  validate(s, e) {
    for (const k of ['xmin', 'xmax', 'ymin', 'ymax']) if (!isInt(s[k]) || Math.abs(s[k]) > 20) return e.push(k);
    if (s.xmin > 0 || s.xmax < 0 || s.ymin > 0 || s.ymax < 0 || s.xmax - s.xmin < 2 || s.ymax - s.ymin < 2) return e.push('the axes must cross inside the plane');
    if (s.xmax - s.xmin > 16 || s.ymax - s.ymin > 16) return e.push('plane too large');
    if (!optional(s.labelEvery, (v) => isInt(v) && v >= 1)) e.push('labelEvery');
    const names = new Set();
    if (!optional(s.points, (l) => Array.isArray(l) && l.length <= 10 && l.every((p) => p && isName(p.name) && isNum(p.x) && isNum(p.y) && p.x >= s.xmin && p.x <= s.xmax && p.y >= s.ymin && p.y <= s.ymax && optional(p.pos, (q) => q in POS) && !!names.add(p.name)))) e.push('points');
    if (!optional(s.lines, (l) => Array.isArray(l) && l.length <= 12 && l.every((p) => listOf(p, 2, (n) => names.has(n))))) e.push('lines');
    if (!optional(s.polygon, (l) => Array.isArray(l) && l.length >= 3 && l.length <= 10 && l.every((n) => names.has(n)))) e.push('polygon');
  },
  draw(s) {
    const H = HMAX;
    const dx = s.xmax - s.xmin, dy = s.ymax - s.ymin;
    const mL = 32, mR = 22, mT = 20, mB = 24; // room for the y numbers, the axis arrows and the x numbers
    const u = Math.floor(Math.min((W - mL - mR) / dx, (H - mT - mB) / dy));
    const ox = mL + (W - mL - mR - dx * u) / 2 - s.xmin * u, oy = mT + (H - mT - mB - dy * u) / 2 + s.ymax * u;
    const X = (x) => ox + x * u, Y = (y) => oy - y * u;
    const le = s.labelEvery ?? (u >= 18 ? 1 : 2);
    let g = '';
    for (let x = s.xmin; x <= s.xmax; x++) g += line([X(x), Y(s.ymin)], [X(x), Y(s.ymax)], 'grid');
    for (let y = s.ymin; y <= s.ymax; y++) g += line([X(s.xmin), Y(y)], [X(s.xmax), Y(y)], 'grid');
    g += line([X(s.xmin), Y(0)], [X(s.xmax) + 8, Y(0)], 'ax') + line([X(0), Y(s.ymin)], [X(0), Y(s.ymax) - 8], 'ax');
    g += `<polygon class="axf" points="${pts([[X(s.xmax) + 14, Y(0)], [X(s.xmax) + 6, Y(0) - 4], [X(s.xmax) + 6, Y(0) + 4]])}"/><polygon class="axf" points="${pts([[X(0), Y(s.ymax) - 14], [X(0) - 4, Y(s.ymax) - 6], [X(0) + 4, Y(s.ymax) - 6]])}"/>`;
    // graduation numbers on the lower and left edges of the grid, so they never collide near the origin
    for (let x = s.xmin; x <= s.xmax; x++) if (x % le === 0) g += txt(X(x), Y(s.ymin) + 15, fmt(x), 'tt');
    for (let y = s.ymin; y <= s.ymax; y++) if (y % le === 0) g += txt(X(s.xmin) - 6, Y(y), fmt(y), 'tt', 'end', 5);
    const by = Object.fromEntries((s.points || []).map((p) => [p.name, [X(p.x), Y(p.y)]]));
    if (s.polygon) g += `<polygon class="kf k2" points="${pts(s.polygon.map((n) => by[n]))}"/>`;
    for (const [a, b] of s.lines || []) g += line(by[a], by[b], 'kk k2');
    for (const p of s.points || []) {
      g += dot(X(p.x), Y(p.y), p.hl, 4.5);
      const d = POS[p.pos || 'ne'];
      const label = p.label ? `${p.name}(${fmt(p.x)} ; ${fmt(p.y)})` : p.name;
      const anchor = d[0] > 0 ? 'start' : d[0] < 0 ? 'end' : 'middle';
      g += txt(X(p.x) + d[0] * 8, Y(p.y) + d[1] * 11, label, `t k${K(p.hl)}`, anchor);
    }
    return svg(H, g);
  },
};

/* ======================= two lines and a secant ======================= */
const QUAD = ['ne', 'nw', 'se', 'sw'];
const SECANT = {
  validate(s, e) {
    if (!isNum(s.angle) || s.angle < 35 || s.angle > 145) e.push('angle 35..145');
    if (!optional(s.tilt, (v) => isNum(v) && v >= 0 && v <= 12)) e.push('tilt 0..12');
    if (!optional(s.marks, (l) => Array.isArray(l) && l.length <= 8 && l.every((m) => m && typeof m.at === 'string' && /^[PQ] (ne|nw|se|sw)$/.test(m.at) && isText(m.text)))) e.push('marks');
  },
  draw(s) {
    const H = 200, y1 = 56, y2 = 144;
    const th = (s.angle * Math.PI) / 180, tau = ((s.tilt || 0) * Math.PI) / 180;
    const cot = Math.cos(th) / Math.sin(th);
    const P = [160 + 44 * cot, y1], Q = [160 - 44 * cot, y2];
    const yAt = (c, ang, x) => c[1] - (x - c[0]) * Math.tan(ang); // line through c with visual slope angle ang
    const up = [Math.cos(th), -Math.sin(th)];
    const top = (y1 - 28) / Math.sin(th), bot = (180 - y2) / Math.sin(th);
    let g = line([14, y1], [306, y1]) + line([14, yAt(Q, tau, 14)], [306, yAt(Q, tau, 306)]);
    g += line([P[0] + up[0] * top, P[1] + up[1] * top], [Q[0] - up[0] * bot, Q[1] - up[1] * bot], 'ln k2');
    if (s.parallelMarks) g += chevrons([14, y1], [306, y1], 1, 0.9) + chevrons([14, yAt(Q, tau, 14)], [306, yAt(Q, tau, 306)], 1, 0.9);
    if (s.lines !== false) {
      g += txt(8, y1 - 10, '(d)', 't td', 'start') + txt(8, yAt(Q, tau, 36) - 10, "(d′)", 't td', 'start');
      g += txt(P[0] + up[0] * top, P[1] + up[1] * top - 11, '(s)', 't td');
    }
    g += dot(P[0], P[1], 2, 3.5) + dot(Q[0], Q[1], 2, 3.5);
    for (const m of s.marks || []) {
      const [who, q] = m.at.split(' ');
      const c = who === 'P' ? P : Q;
      const east = who === 'P' ? 0 : -tau, west = east + Math.PI, upA = -th, downA = Math.PI - th;
      const [a1, a2] = { ne: [east, upA], nw: [upA, west], se: [east, downA], sw: [downA, west] }[q];
      const d = norm(a2 - a1), mid = a1 + d / 2, hl = K(m.hl);
      const R = 22;
      g += arc(c, a1, a2, R, `kk k${hl}`);
      g += txt(c[0] + (R + 18 + (Math.abs(d) < 0.8 ? 6 : 0)) * Math.cos(mid), c[1] + (R + 18 + (Math.abs(d) < 0.8 ? 6 : 0)) * Math.sin(mid), m.text, `t k${hl}`);
    }
    return svg(H, g);
  },
};

/* ======================= polygons: triangle and quadrilateral ======================= */
function polyValidate(n) {
  return (s, e) => {
    if (!listOf(s.vertices, n, point2)) return e.push(`${n} vertices`);
    let area = 0;
    for (let i = 0; i < n; i++) { const a = s.vertices[i], b = s.vertices[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    if (Math.abs(area) < 1e-6) e.push('flat polygon');
    if (!optional(s.names, (l) => listOf(l, n, isName))) e.push('names');
    if (!optional(s.angles, (l) => listOf(l, n, (v) => v === null || isText(v)))) e.push('angles');
    if (!optional(s.sides, (l) => listOf(l, n, (v) => v === null || isText(v)))) e.push('sides');
    if (!optional(s.ticks, (l) => listOf(l, n, (v) => isInt(v) && v >= 0 && v <= 3))) e.push('ticks');
    if (!optional(s.rightAt, (l) => Array.isArray(l) && l.every((i) => idx(i, n)))) e.push('rightAt');
    if (!optional(s.height, (h) => h && idx(h.from, n) && optional(h.to, (t) => idx(t, n) && t !== h.from && (t + 1) % n !== h.from) && optional(h.label, isText) && optional(h.foot, isName))) e.push('height');
    if (n === 4) {
      if (!optional(s.par, (l) => Array.isArray(l) && l.length <= 2 && l.every((gr) => Array.isArray(gr) && gr.length === 2 && gr.every((i) => idx(i, 4))))) e.push('par');
      if (!optional(s.center, isName)) e.push('center');
      if (!optional(s.diagTicks, (l) => listOf(l, 2, (v) => isInt(v) && v >= 0 && v <= 3))) e.push('diagTicks');
      if (!optional(s.diagLabels, (l) => listOf(l, 2, (v) => v === null || isText(v)))) e.push('diagLabels');
    }
  };
}
function polyDraw(s) {
  const n = s.vertices.length;
  const V = s.vertices.map(([x, y]) => [x, -y]);
  const hs = s.height;
  // foot of the height, and the intersection of the diagonals, are part of the figure
  let foot = null, hTo = null;
  if (hs) {
    hTo = hs.to ?? (n === 3 ? (hs.from + 1) % 3 : (hs.from + 2) % 4);
    const a = V[hTo], b = V[(hTo + 1) % n], p = V[hs.from];
    const u = unit(b[0] - a[0], b[1] - a[1]);
    const t = (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
    foot = [a[0] + u[0] * t, a[1] + u[1] * t];
  }
  const all = foot ? [...V, foot] : V;
  const minx = Math.min(...all.map((p) => p[0])), maxx = Math.max(...all.map((p) => p[0]));
  const miny = Math.min(...all.map((p) => p[1])), maxy = Math.max(...all.map((p) => p[1]));
  const mx = 50, my = 40;
  const k = Math.min((W - 2 * mx) / (maxx - minx || 1), (HMAX - 2 * my) / (maxy - miny || 1));
  const H = clamp((maxy - miny) * k + 2 * my, 120, HMAX);
  const tx = (W - (maxx - minx) * k) / 2 - minx * k, ty = (H - (maxy - miny) * k) / 2 - miny * k;
  const S = V.map((p) => [p[0] * k + tx, p[1] * k + ty]);
  const F = foot ? [foot[0] * k + tx, foot[1] * k + ty] : null;
  const cen = [S.reduce((a, p) => a + p[0], 0) / n, S.reduce((a, p) => a + p[1], 0) / n];
  const out = (p, d) => { const u = unit(p[0] - cen[0], p[1] - cen[1]); return [p[0] + u[0] * d, p[1] + u[1] * d]; };
  let g = s.fill === false ? '' : `<polygon class="kf k2" points="${pts(S)}"/>`;
  g += `<polygon class="ln" points="${pts(S)}"/>`;
  // equal sides, lengths
  for (let i = 0; i < n; i++) {
    const a = S[i], b = S[(i + 1) % n];
    if (s.ticks) g += ticks(a, b, s.ticks[i]);
    if (s.sides?.[i]) {
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const u = unit(b[0] - a[0], b[1] - a[1]);
      let v = [-u[1], u[0]];
      if ((m[0] - cen[0]) * v[0] + (m[1] - cen[1]) * v[1] < 0) v = [-v[0], -v[1]];
      const off = 9 + Math.abs(v[0]) * 3.8 * s.sides[i].length + Math.abs(v[1]) * 9;
      g += txt(m[0] + v[0] * off, m[1] + v[1] * off, s.sides[i], 'tt k1');
    }
  }
  for (const [gi, grp] of (s.par || []).entries()) for (const i of grp) g += chevrons(S[i], S[(i + 1) % n], gi + 1);
  // angles
  for (let i = 0; i < n; i++) {
    const c = S[i], p = S[(i + n - 1) % n], q = S[(i + 1) % n];
    const right = (s.rightAt || []).includes(i);
    const a1 = Math.atan2(p[1] - c[1], p[0] - c[0]), a2 = Math.atan2(q[1] - c[1], q[0] - c[0]);
    if (right) { g += rightMark(c, unit(p[0] - c[0], p[1] - c[1]), unit(q[0] - c[0], q[1] - c[1]), 11); continue; }
    const a = s.angles?.[i];
    if (a === null || a === undefined) continue;
    const d = norm(a2 - a1), mid = a1 + d / 2;
    g += arc(c, a1, a2, 20, 'kk k4');
    if (a !== '') { const rr = Math.abs(d) < 0.9 ? 44 : 36; g += txt(c[0] + rr * Math.cos(mid), c[1] + rr * Math.sin(mid), a, 'tt k4'); }
  }
  // diagonals
  if (n === 4 && s.diagonals) {
    const [A, B, C, D] = S;
    const den = (A[0] - C[0]) * (B[1] - D[1]) - (A[1] - C[1]) * (B[0] - D[0]);
    g += line(A, C, 'dg') + line(B, D, 'dg');
    if (Math.abs(den) > 1e-6) {
      const t = ((A[0] - B[0]) * (B[1] - D[1]) - (A[1] - B[1]) * (B[0] - D[0])) / den;
      const O = [A[0] + (C[0] - A[0]) * t, A[1] + (C[1] - A[1]) * t];
      if (s.diagTicks) {
        g += ticks(A, O, s.diagTicks[0]) + ticks(O, C, s.diagTicks[0]) + ticks(B, O, s.diagTicks[1]) + ticks(O, D, s.diagTicks[1]);
      }
      if (s.diagRight) g += rightMark(O, unit(A[0] - O[0], A[1] - O[1]), unit(B[0] - O[0], B[1] - O[1]), 8);
      if (s.center) g += dot(O[0], O[1], 1, 3.5) + txt(O[0] + 12, O[1] + 12, s.center, 't k1');
      for (const [di, [a, b]] of [[A, C], [B, D]].entries()) {
        const lab = s.diagLabels?.[di];
        if (!lab) continue;
        const m = [a[0] + (b[0] - a[0]) * 0.27, a[1] + (b[1] - a[1]) * 0.27];
        const u = unit(b[0] - a[0], b[1] - a[1]);
        const sg = di === 0 ? 1 : -1;
        g += txt(m[0] - u[1] * 13 * sg, m[1] + u[0] * 13 * sg, lab, 'tt k3');
      }
    }
  }
  // height
  if (hs) {
    const p = S[hs.from], a = S[hTo], b = S[(hTo + 1) % n];
    const u = unit(b[0] - a[0], b[1] - a[1]);
    const t = (F[0] - a[0]) * u[0] + (F[1] - a[1]) * u[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (t < 0) g += line(F, a, 'dg'); else if (t > L) g += line(b, F, 'dg');
    g += line(p, F, 'dg k1');
    const toP = unit(p[0] - F[0], p[1] - F[1]);
    g += rightMark(F, toP, t > L / 2 ? [-u[0], -u[1]] : u, 9);
    if (hs.label) {
      const m = [(p[0] + F[0]) / 2, (p[1] + F[1]) / 2];
      const side = (m[0] - cen[0]) * -toP[1] + (m[1] - cen[1]) * toP[0] > 0 ? 1 : -1;
      const dir = t < 0 || t > L ? -1 : 1; // inside the triangle, except when the foot is outside it
      g += txt(m[0] + toP[1] * 15 * side * dir, m[1] - toP[0] * 15 * side * dir, hs.label, 'tt k1');
    }
    if (hs.foot) g += txt(F[0] + (F[0] - cen[0] > 0 ? 12 : -12), F[1] + 12, hs.foot, 't');
  }
  for (let i = 0; i < n; i++) if (s.names?.[i]) { const o = out(S[i], 15); g += txt(o[0], o[1], s.names[i], 't tn'); }
  return svg(H, g);
}
const TRIANGLE = { validate: polyValidate(3), draw: polyDraw };
const QUADRILATERAL = { validate: polyValidate(4), draw: polyDraw };

/* ======================= symmetry on a grid ======================= */
const SYMMETRY = {
  validate(s, e) {
    if (s.mode !== 'axial' && s.mode !== 'central') return e.push('mode');
    if (!isInt(s.cols) || !isInt(s.rows) || s.cols < 3 || s.rows < 3 || s.cols > 14 || s.rows > 9) return e.push('cols 3..14, rows 3..9');
    const inGrid = (p) => point2(p) && isInt(p[0]) && isInt(p[1]) && p[0] >= 0 && p[0] <= s.cols && p[1] >= 0 && p[1] <= s.rows;
    if (!Array.isArray(s.shape) || s.shape.length < 2 || s.shape.length > 8 || !s.shape.every(inGrid)) e.push('shape');
    if (!optional(s.names, (l) => listOf(l, s.shape.length, isName))) e.push('names');
    if (!optional(s.imageNames, (l) => listOf(l, s.shape.length, isName))) e.push('imageNames');
    if (s.mode === 'axial') {
      if (!s.axis || !inGrid(s.axis.p) || !inGrid(s.axis.q) || (s.axis.p[0] === s.axis.q[0] && s.axis.p[1] === s.axis.q[1]) || !optional(s.axis.name, isText)) return e.push('axis');
    } else if (!s.center || !inGrid(s.center.p) || !optional(s.center.name, isName)) return e.push('center');
    if (!optional(s.points, (l) => Array.isArray(l) && l.length <= 8 && l.every((q) => q && inGrid(q.p) && isName(q.name)))) e.push('points');
  },
  draw(s) {
    const H = HMAX;
    const u = Math.min((W - 24) / s.cols, (H - 20) / s.rows);
    const ox = (W - s.cols * u) / 2, oy = (H - s.rows * u) / 2 + s.rows * u;
    const P = (p) => [ox + p[0] * u, oy - p[1] * u];
    let g = '';
    for (let x = 0; x <= s.cols; x++) g += line(P([x, 0]), P([x, s.rows]), 'grid');
    for (let y = 0; y <= s.rows; y++) g += line(P([0, y]), P([s.cols, y]), 'grid');
    let refl;
    if (s.mode === 'axial') {
      const [p, q] = [s.axis.p, s.axis.q];
      const d = unit(q[0] - p[0], q[1] - p[1]);
      refl = (a) => { const t = (a[0] - p[0]) * d[0] + (a[1] - p[1]) * d[1]; const f = [p[0] + d[0] * t, p[1] + d[1] * t]; return [2 * f[0] - a[0], 2 * f[1] - a[1]]; };
      // clip the axis to the grid
      const ends = [];
      for (const [bound, ax] of [[0, 0], [s.cols, 0], [0, 1], [s.rows, 1]]) {
        if (Math.abs(d[ax]) < 1e-9) continue;
        const t = (bound - p[ax]) / d[ax];
        const c = [p[0] + d[0] * t, p[1] + d[1] * t];
        if (c[0] >= -1e-9 && c[0] <= s.cols + 1e-9 && c[1] >= -1e-9 && c[1] <= s.rows + 1e-9) ends.push([t, c]);
      }
      ends.sort((a, b) => a[0] - b[0]);
      if (ends.length >= 2) {
        const a = P(ends[0][1]), b = P(ends[ends.length - 1][1]);
        g += line(a, b, 'kk k1 dash');
        if (s.axis.name) { const o = [b[0] + (b[0] > W / 2 ? -4 : 4), b[1] + (b[1] < 30 ? 16 : -10)]; g += txt(o[0], o[1], s.axis.name, 't k1', o[0] > W / 2 ? 'end' : 'start'); }
      }
    } else {
      const c = s.center.p;
      refl = (a) => [2 * c[0] - a[0], 2 * c[1] - a[1]];
    }
    const poly = (list, hl, names) => {
      const sp = list.map(P);
      let o = `<polygon class="kf k${hl}" points="${pts(sp)}"/>`;
      const cx = sp.reduce((a, q) => a + q[0], 0) / sp.length, cy = sp.reduce((a, q) => a + q[1], 0) / sp.length;
      sp.forEach((q, i) => { o += dot(q[0], q[1], hl, 3); if (names?.[i]) { const d = unit(q[0] - cx, q[1] - cy); o += txt(q[0] + d[0] * 13, q[1] + d[1] * 13, names[i], `t k${hl}`); } });
      return o;
    };
    g += poly(s.shape, 2, s.names);
    if (s.image) g += poly(s.shape.map(refl), 3, s.imageNames || s.names?.map((n) => (n.length < 3 ? n + '′' : n)));
    if (s.mode === 'central') {
      const c = P(s.center.p);
      g += dot(c[0], c[1], 1, 4.5);
      if (s.center.name) g += txt(c[0] + 9, c[1] - 10, s.center.name, 't k1', 'start');
    }
    for (const q of s.points || []) { const c = P(q.p); g += dot(c[0], c[1], 1, 4) + txt(c[0] + 8, c[1] - 9, q.name, 't k1', 'start'); }
    return svg(H, g);
  },
};

/* ======================= charts ======================= */
const PL = { l: 52, r: 16, t: 30, b: 46 };
/** Frame of a chart: grid, y graduations and titles. Returns { g, X0, X1, Y0 (top), Y1 (bottom), Y(v) }. */
function frame(H, y, xTitle, yTitle) {
  const X0 = PL.l, X1 = W - PL.r, Y0 = PL.t, Y1 = H - PL.b;
  const Y = (v) => Y1 - ((v - y.min) / (y.max - y.min)) * (Y1 - Y0);
  let g = '';
  const every = Math.max(1, Math.ceil(15 / ((Y1 - Y0) * y.step / (y.max - y.min)))); // number every k-th graduation when they are too close
  for (let i = 0, v = y.min; v <= y.max + 1e-9; i++, v = y.min + i * y.step) {
    const yy = Y(v);
    g += line([X0, yy], [X1, yy], 'grid') + line([X0 - 4, yy], [X0, yy], 'ax') + (i % every === 0 ? txt(X0 - 8, yy, fmt(v), 'tt', 'end') : '');
  }
  g += line([X0, Y1], [X1 + 6, Y1], 'ax') + line([X0, Y1 + 0], [X0, Y0 - 8], 'ax');
  g += `<polygon class="axf" points="${pts([[X1 + 12, Y1], [X1 + 4, Y1 - 4], [X1 + 4, Y1 + 4]])}"/><polygon class="axf" points="${pts([[X0, Y0 - 14], [X0 - 4, Y0 - 6], [X0 + 4, Y0 - 6]])}"/>`;
  if (yTitle) g += txt(6, 12, yTitle, 'tt td', 'start', 0);
  if (xTitle) g += txt((X0 + X1) / 2, H - 6, xTitle, 'tt td', 'middle', 0);
  return { g, X0, X1, Y0, Y1, Y };
}
const axisOk = (a) => a && isNum(a.min) && isNum(a.max) && isNum(a.step) && a.step > 0 && a.max > a.min && Math.abs((a.max - a.min) / a.step - Math.round((a.max - a.min) / a.step)) < 1e-9 && (a.max - a.min) / a.step <= 12 && optional(a.title, isText);
const showIdx = (sel, i) => sel === 'all' || (Array.isArray(sel) && sel.includes(i));

const BAR = {
  validate(s, e) {
    const n = Array.isArray(s.cats) ? s.cats.length : 0;
    if (n < 2 || n > 8 || !s.cats.every(isText)) return e.push('cats 2..8');
    const maxLen = Math.max(3, Math.floor((W - PL.l - PL.r) / n / 7.4));
    if (s.cats.some((c) => c.length > maxLen)) e.push(`category names of ${maxLen} characters at most`);
    if (!listOf(s.values, n, (v) => isNum(v) && v >= 0)) e.push('values');
    if (!axisOk({ min: 0, max: s.ymax, step: s.ystep })) e.push('ymax, ystep');
    else if (Array.isArray(s.values) && s.values.some((v) => v > s.ymax)) e.push('value above ymax');
    if (!optional(s.xTitle, isText) || !optional(s.yTitle, isText)) e.push('titles');
    if (!optional(s.show, (v) => v === 'all' || (Array.isArray(v) && v.every((i) => idx(i, n))))) e.push('show');
    if (!optional(s.highlight, (v) => Array.isArray(v) && v.every((i) => idx(i, n)))) e.push('highlight');
  },
  draw(s) {
    const H = HMAX, n = s.cats.length;
    const f = frame(H, { min: 0, max: s.ymax, step: s.ystep }, s.xTitle, s.yTitle);
    const bw = (f.X1 - f.X0) / n;
    let g = f.g;
    s.cats.forEach((c, i) => {
      const x = f.X0 + i * bw, top = f.Y(s.values[i]), hl = s.highlight?.includes(i) ? 1 : 2;
      if (s.values[i] > 0) g += `<rect class="bar k${hl}" x="${r1(x + bw * 0.16)}" y="${r1(top)}" width="${r1(bw * 0.68)}" height="${r1(f.Y1 - top)}"/>`;
      g += txt(x + bw / 2, f.Y1 + 17, c, 'tt');
      if (showIdx(s.show, i)) g += txt(x + bw / 2, top - 9, fmt(s.values[i]), 'tt');
    });
    return svg(H, g);
  },
};

const LINE = {
  validate(s, e) {
    const cats = s.x && Array.isArray(s.x.cats);
    if (cats) { if (s.x.cats.length < 2 || s.x.cats.length > 10 || !s.x.cats.every(isText) || !optional(s.x.title, isText)) return e.push('x.cats'); } else if (!axisOk(s.x)) return e.push('x axis');
    if (!axisOk(s.y)) return e.push('y axis');
    const xmin = cats ? 0 : s.x.min, xmax = cats ? s.x.cats.length - 1 : s.x.max;
    const inside = (p) => point2(p) && p[0] >= xmin && p[0] <= xmax && p[1] >= s.y.min && p[1] <= s.y.max;
    if (!Array.isArray(s.series) || s.series.length < 1 || s.series.length > 3 || !s.series.every((r) => r && Array.isArray(r.pts) && r.pts.length >= 1 && r.pts.length <= 16 && r.pts.every(inside))) e.push('series');
    if (!optional(s.guides, (l) => Array.isArray(l) && l.length <= 4 && l.every(inside))) e.push('guides');
  },
  draw(s) {
    const H = HMAX, cats = Array.isArray(s.x.cats);
    const f = frame(H, s.y, s.x.title, s.y.title);
    const xmin = cats ? 0 : s.x.min, xmax = cats ? s.x.cats.length - 1 : s.x.max;
    const pad = cats ? 0.4 : 0;
    const X = (v) => f.X0 + ((v - xmin + pad) / (xmax - xmin + 2 * pad)) * (f.X1 - f.X0);
    let g = f.g;
    if (cats) s.x.cats.forEach((c, i) => { g += line([X(i), f.Y0], [X(i), f.Y1], 'grid') + txt(X(i), f.Y1 + 17, c, 'tt'); });
    else for (let v = xmin; v <= xmax + 1e-9; v += s.x.step) g += line([X(v), f.Y0], [X(v), f.Y1], 'grid') + line([X(v), f.Y1], [X(v), f.Y1 + 4], 'ax') + txt(X(v), f.Y1 + 17, fmt(v), 'tt');
    for (const [gx, gy] of s.guides || []) g += line([X(gx), f.Y(gy)], [X(gx), f.Y1], 'dg k1') + line([f.X0, f.Y(gy)], [X(gx), f.Y(gy)], 'dg k1');
    for (const r of s.series) {
      const hl = K(r.hl, 2), P = r.pts.map(([x, y]) => [X(x), f.Y(y)]);
      if (r.join !== false && P.length > 1) g += `<polyline class="kk k${hl} wide" points="${pts(P)}"/>`;
      if (r.dots !== false) P.forEach((p) => { g += dot(p[0], p[1], hl, 4); });
      if (r.labels) P.forEach((p, i) => { if (showIdx(r.labels, i)) g += txt(p[0], p[1] - 14, fmt(r.pts[i][1]), 'tt'); });
    }
    return svg(H, g);
  },
};

/* ======================= pie chart ======================= */
const PIE = {
  validate(s, e) {
    if (!Array.isArray(s.parts) || s.parts.length < 2 || s.parts.length > 7 || !s.parts.every((p) => p && isNum(p.v) && p.v > 0 && optional(p.name, isText) && optional(p.text, isText))) e.push('parts');
  },
  draw(s) {
    const H = HMAX, c = [W / 2, 102], R = 62;
    const total = s.parts.reduce((a, p) => a + p.v, 0);
    let a = -Math.PI / 2, g = '';
    const lab = [];
    s.parts.forEach((p, i) => {
      const share = p.v / total, b = a + share * 2 * Math.PI, mid = (a + b) / 2;
      const P1 = [c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)], P2 = [c[0] + R * Math.cos(b), c[1] + R * Math.sin(b)];
      g += `<path class="sector k${(i % 6) + 1}" d="M${pt(...c)}L${pt(...P1)}A${R},${R} 0 ${share > 0.5 ? 1 : 0} 1 ${pt(...P2)}Z"/>`;
      const small = share < 0.12;
      if (p.text && !small) g += txt(c[0] + R * 0.62 * Math.cos(mid), c[1] + R * 0.62 * Math.sin(mid), p.text, 't tp');
      const outside = [p.name, small ? p.text : ''].filter(Boolean).join(' ');
      if (outside) lab.push([mid, outside]);
      a = b;
    });
    for (const [mid, t] of lab) {
      const cs = Math.cos(mid), sn = Math.sin(mid);
      g += txt(c[0] + (R + 9) * cs, c[1] + (R + 9) * sn, t, 't', cs > 0.25 ? 'start' : cs < -0.25 ? 'end' : 'middle', sn > 0.3 ? 12 : sn < -0.3 ? -4 : 5);
    }
    return svg(H, g);
  },
};

/* ======================= solids ======================= */
const SOLID = {
  validate(s, e) {
    if (s.kind === 'block') {
      if (![s.l, s.w, s.h].every((v) => isNum(v) && v > 0 && v <= 1000)) return e.push('l, w, h');
      if (Math.max(s.l, s.w, s.h) / Math.min(s.l, s.w, s.h) > 6) e.push('too elongated');
      if (!optional(s.labels, (o) => o && typeof o === 'object' && Object.keys(o).every((k) => ['l', 'w', 'h'].includes(k) && isText(o[k])))) e.push('labels');
      if (!optional(s.names, (l) => listOf(l, 8, isName))) e.push('names');
    } else if (s.kind === 'cubes') {
      const h = s.heights;
      if (!Array.isArray(h) || h.length < 1 || h.length > 4 || !h.every((r) => Array.isArray(r) && r.length === h[0].length && r.length >= 1 && r.length <= 5 && r.every((v) => isInt(v) && v >= 0 && v <= 5))) return e.push('heights');
      if (!h.some((r) => r.some((v) => v > 0))) e.push('empty stack');
      if (h.some((r, i) => i > 0 && r.some((v, c) => v > 0 && v < h[i - 1][c]))) e.push('a column is hidden behind a taller one in front of it');
    } else e.push('kind');
  },
  draw(s) {
    return s.kind === 'block' ? drawBlock(s) : drawCubes(s);
  },
};
function drawBlock(s) {
  const c = 0.42;
  const k = Math.min(210 / (s.l + c * s.w), 112 / (s.h + c * s.w));
  const l = s.l * k, h = s.h * k, d = c * s.w * k;
  const H = clamp(h + d + 74, 120, HMAX);
  const x0 = (W - l - d) / 2, yb = (H + h + d) / 2 - 6; // front-bottom-left corner
  const A = [x0, yb], B = [x0 + l, yb], E = [x0, yb - h], F = [x0 + l, yb - h];
  const C = [B[0] + d, B[1] - d], D = [A[0] + d, A[1] - d], G = [F[0] + d, F[1] - d], Hh = [E[0] + d, E[1] - d];
  let g = `<polygon class="kf k2" points="${pts([E, F, G, Hh])}"/><polygon class="kf k2 side" points="${pts([B, C, G, F])}"/><polygon class="kf k2 front" points="${pts([A, B, F, E])}"/>`;
  g += `<polygon class="ln" points="${pts([A, B, F, E])}"/><polyline class="ln" points="${pts([E, Hh, G, F])}"/><polyline class="ln" points="${pts([B, C, G])}"/>`;
  if (s.hidden !== false) g += `<polyline class="dg" points="${pts([A, D, C])}"/>${line(D, Hh, 'dg')}`;
  if (s.labels?.l) g += txt((A[0] + B[0]) / 2, yb + 16, s.labels.l, 't k1');
  if (s.labels?.h) g += txt(A[0] - 8, (A[1] + E[1]) / 2, s.labels.h, 't k1', 'end');
  if (s.labels?.w) g += txt((B[0] + C[0]) / 2 + 9, (B[1] + C[1]) / 2 + 12, s.labels.w, 't k1', 'start');
  if (s.names) {
    const pos = [[A, -1, 1], [B, 1, 1], [C, 1, 0], [D, -1, 0], [E, -1, -1], [F, 1, -1], [G, 1, -1], [Hh, -1, -1]];
    pos.forEach(([p, ox, oy], i) => { g += txt(p[0] + ox * 11, p[1] + oy * 11 + (oy === 0 ? -8 : 0), s.names[i], 't tn'); });
  }
  return svg(H, g);
}
function drawCubes(s) {
  const rows = s.heights.length, cols = s.heights[0].length, zmax = Math.max(...s.heights.flat());
  const f = 0.45;
  const sz = Math.min(240 / (cols + f * rows), 150 / (zmax + f * rows), 44);
  const dx = f * sz, dy = f * sz;
  const wpx = cols * sz + rows * dx, hpx = zmax * sz + rows * dy;
  const H = clamp(hpx + 40, 100, HMAX);
  const X0 = (W - wpx) / 2, Y0 = (H + hpx) / 2 - rows * dy + dy; // ground line of the front row
  let g = '';
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      for (let z = 0; z < s.heights[r][c]; z++) {
        const x = X0 + c * sz + r * dx, y = Y0 - r * dy - (z + 1) * sz;
        g += `<polygon class="cube top" points="${pts([[x, y], [x + dx, y - dy], [x + sz + dx, y - dy], [x + sz, y]])}"/>`;
        g += `<polygon class="cube side" points="${pts([[x + sz, y], [x + sz + dx, y - dy], [x + sz + dx, y - dy + sz], [x + sz, y + sz]])}"/>`;
        g += `<rect class="cube front" x="${r1(x)}" y="${r1(y)}" width="${r1(sz)}" height="${r1(sz)}"/>`;
      }
    }
  }
  return svg(H, g);
}

const TYPES = { numberline: NUMBERLINE, plane: PLANE, secant: SECANT, triangle: TRIANGLE, quad: QUADRILATERAL, symmetry: SYMMETRY, bar: BAR, line: LINE, pie: PIE, solid: SOLID };

/** Names of the figure types. */
export const FIGURE_TYPES = Object.keys(TYPES);

/** Problems found in a figure spec, as short messages ([] when the spec is valid). Never throws. */
export function validateFigure(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['figure is not an object'];
  const t = Object.hasOwn(TYPES, spec.type) ? TYPES[spec.type] : null;
  if (!t) return [`unknown figure type ${JSON.stringify(spec.type)}`];
  const errors = [];
  try { t.validate(spec, errors); } catch (e) { errors.push('malformed: ' + e.message); }
  return errors;
}

/** The figure as an SVG string, or '' when the spec is unknown or invalid. */
export function renderFigure(spec) {
  try {
    if (validateFigure(spec).length) return '';
    return TYPES[spec.type].draw(spec);
  } catch { return ''; }
}
