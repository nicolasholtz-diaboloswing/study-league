// Figures of questions: spec -> SVG string (js/ui/figures.js), the spec validation and the question card.
import { test, assert, eq } from './runner.js';
import { renderFigure, validateFigure, FIGURE_TYPES } from '../js/ui/figures.js';
import { questionCard } from '../js/ui/components.js';

const SPECS = {
  numberline: { type: 'numberline', min: -2, max: 2, step: 0.5, labelEvery: 2, points: [{ x: -1.5, name: 'A', label: true }, { x: 1, name: 'B' }] },
  plane: { type: 'plane', xmin: -4, xmax: 4, ymin: -3, ymax: 3, points: [{ name: 'A', x: 2, y: 1, label: true }, { name: 'B', x: -3, y: -2 }, { name: 'C', x: 1, y: -2 }], polygon: ['A', 'B', 'C'] },
  secant: { type: 'secant', angle: 50, parallelMarks: true, marks: [{ at: 'P ne', text: '50°' }, { at: 'Q sw', text: 'x' }] },
  triangle: { type: 'triangle', vertices: [[0, 3], [-2, 0], [2, 0]], names: ['A', 'B', 'C'], angles: ['40°', null, '?'], sides: [null, '4 cm', null], ticks: [1, 0, 1], height: { from: 0, label: '3 cm', foot: 'H' } },
  quad: { type: 'quad', vertices: [[0, 0], [6, 0], [8, 3], [2, 3]], names: ['A', 'B', 'C', 'D'], par: [[0, 2], [1, 3]], sides: ['6 cm', null, null, null], diagonals: true, center: 'O', diagTicks: [1, 2], diagLabels: ['8 cm', null] },
  symmetry: { type: 'symmetry', mode: 'axial', cols: 8, rows: 6, shape: [[1, 1], [3, 1], [2, 3]], names: ['A', 'B', 'C'], axis: { p: [4, 0], q: [4, 6], name: '(d)' }, image: true },
  bar: { type: 'bar', cats: ['Lun', 'Mar', 'Mer'], values: [2, 4, 3], ymax: 5, ystep: 1, xTitle: 'Jour', yTitle: 'Buts', show: 'all' },
  line: { type: 'line', x: { min: 0, max: 4, step: 1, title: 'Masse (kg)' }, y: { min: 0, max: 12, step: 3, title: 'Prix (€)' }, series: [{ pts: [[0, 0], [2, 6], [4, 12]] }], guides: [[2, 6]] },
  pie: { type: 'pie', parts: [{ v: 1, name: 'Foot', text: '50 %' }, { v: 1, name: 'Judo', text: '?' }] },
  solid: { type: 'solid', kind: 'block', l: 5, w: 3, h: 4, labels: { l: '5 cm', w: '3 cm', h: '4 cm' } },
};
// the visible text each spec must put in the drawing
const WORDS = {
  numberline: ['−1,5', '−2', 'A', 'B'], plane: ['A(2 ; 1)', 'B', 'C'], secant: ['50°', 'x', '(d)'], triangle: ['40°', '?', '4 cm', '3 cm', 'H'],
  quad: ['6 cm', '8 cm', 'O', 'D'], symmetry: ['A', 'B′', '(d)'], bar: ['Lun', 'Mer', 'Buts', 'Jour'], line: ['Masse (kg)', 'Prix (€)'], pie: ['Foot', '50 %', 'Judo'],
  solid: ['5 cm', '3 cm', '4 cm'],
};

test('figures: every type renders an accessible SVG with its labels', () => {
  assert(FIGURE_TYPES.every((t) => SPECS[t]) && Object.keys(SPECS).length === FIGURE_TYPES.length, 'a figure type has no test spec');
  for (const [t, spec] of Object.entries(SPECS)) {
    eq(validateFigure(spec), [], t);
    const out = renderFigure(spec);
    assert(out.startsWith('<svg') && out.endsWith('</svg>'), `${t}: not an SVG`);
    assert(out.includes('role="img"') && out.includes('aria-label="Figure de la question"') && out.includes('viewBox="0 0 320 '), `${t}: role, label or viewBox`);
    for (const w of WORDS[t]) assert(out.includes(`>${w}</text>`), `${t}: label ${w} missing`);
    assert(!/NaN|Infinity|undefined/.test(out), `${t}: bad number in the drawing`);
  }
  const cubes = renderFigure({ type: 'solid', kind: 'cubes', heights: [[2, 1], [2, 2]] });
  assert(cubes.startsWith('<svg') && (cubes.match(/class="cube front"/g) || []).length === 7, 'cube stack: one front face per cube');
});

test('figures: an unknown or invalid spec renders nothing and never throws', () => {
  const bad = [undefined, null, 0, 'numberline', [], {}, { type: 'nope' }, { type: '__proto__' }, { type: 'constructor' }, { type: 'toString' },
    { type: 'numberline' }, { type: 'numberline', min: 0, max: 10, step: 0 }, { type: 'numberline', min: 0, max: 10, step: 0.3 }, { type: 'numberline', min: 5, max: 1, step: 1 },
    { ...SPECS.numberline, points: [{ x: 9, name: 'A' }] },
    { type: 'plane', xmin: 1, xmax: 5, ymin: -2, ymax: 2 }, { ...SPECS.plane, points: [{ name: 'A', x: 99, y: 0 }] }, { ...SPECS.plane, polygon: ['A', 'Z', 'B'] },
    { ...SPECS.secant, angle: 10 }, { ...SPECS.secant, marks: [{ at: 'R ne', text: 'x' }] },
    { ...SPECS.triangle, vertices: [[0, 0], [1, 1], [2, 2]] }, { ...SPECS.triangle, vertices: [[0, 0], [1, 1]] }, { ...SPECS.triangle, ticks: [1, 2, 9] },
    { ...SPECS.quad, vertices: SPECS.triangle.vertices }, { ...SPECS.quad, par: [[0, 7]] },
    { ...SPECS.symmetry, mode: 'x' }, { ...SPECS.symmetry, shape: [[1, 1], [99, 1]] }, { ...SPECS.symmetry, axis: { p: [1, 1], q: [1, 1] } },
    { ...SPECS.bar, values: [1, 2] }, { ...SPECS.bar, values: [1, 2, 9] }, { ...SPECS.bar, ystep: 0 },
    { ...SPECS.line, series: [] }, { ...SPECS.line, series: [{ pts: [[9, 9]] }] },
    { type: 'pie', parts: [{ v: 1 }] }, { type: 'pie', parts: [{ v: -1 }, { v: 2 }] },
    { type: 'solid', kind: 'block', l: 0, w: 1, h: 1 }, { type: 'solid', kind: 'ball' }, { type: 'solid', kind: 'cubes', heights: [[2, 2], [1, 1]] }, { type: 'solid', kind: 'cubes', heights: [] }];
  for (const spec of bad) {
    assert(validateFigure(spec).length > 0, `accepted: ${JSON.stringify(spec)}`);
    eq(renderFigure(spec), '', JSON.stringify(spec));
  }
});

test('figures: every text label is escaped', () => {
  const evil = '<i>&"\'';
  const out = renderFigure({ ...SPECS.bar, cats: ['<b>', 'a&b', '"x"'], xTitle: evil, yTitle: evil });
  assert(out.startsWith('<svg'), 'valid spec expected');
  assert(!out.includes('<b>') && !out.includes('<i>') && !out.includes('a&b'), 'raw markup in the SVG');
  assert(out.includes('&lt;b&gt;') && out.includes('a&amp;b') && out.includes('&lt;i&gt;&amp;&quot;&#39;'), 'labels not escaped');
  const tri = renderFigure({ ...SPECS.triangle, names: ['<a>', 'B', 'C'], sides: ['"><x', null, null] });
  assert(tri.includes('&lt;a&gt;') && !tri.includes('<a>') && !tri.includes('<x'), 'triangle labels not escaped');
});

test('figures: the question card shows the figure between the header and the prompt, and nothing without one', () => {
  const base = { number: 1, total: 10, prompt: 'Lis le graphique.', type: 'input', topic: 'Maths', level: 1 };
  const withFig = questionCard({ ...base, figure: SPECS.bar });
  const i = withFig.indexOf('<header class="qcard__head">'), f = withFig.indexOf('class="qcard__figure"'), p = withFig.indexOf('class="qcard__prompt"');
  assert(i >= 0 && i < f && f < p, 'figure not between header and prompt');
  assert(questionCard({ ...base, figure: SPECS.bar, status: 'correct', explanation: 'Parce que.' }).includes('qcard__figure'), 'figure kept after the answer');
  const none = questionCard(base);
  eq(questionCard({ ...base, figure: undefined }), none);
  assert(!none.includes('qcard__figure') && !none.includes('<svg class="fg"'), 'no figure expected');
  eq(questionCard({ ...base, figure: { type: 'nope' } }), none, 'an invalid figure shows nothing');
});
