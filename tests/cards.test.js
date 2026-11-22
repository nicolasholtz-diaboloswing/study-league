// Checks on the real card file: data/cards.json (nothing is mocked).
import { test, eq, assert } from './runner.js';
import { RARITIES, RARITY_ODDS, openPack } from '../js/core/rewards.js';
import { createRng } from '../js/core/rng.js';
import { flag, nationLabel } from '../js/ui/art.js';

const cards = (await (await fetch('../data/cards.json')).json()).cards;
const POS = ['GK', 'DEF', 'MID', 'FWD'];
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';
const report = (errors) => assert(errors.length === 0, `${errors.length} problem(s):\n  ` + errors.slice(0, 40).join('\n  '));

test('cards.json: ids are unique p001, p002... without gaps; the 72 French cards keep their ids', () => {
  const errors = [];
  cards.forEach((c, i) => { if (c.id !== 'p' + String(i + 1).padStart(3, '0')) errors.push(`#${i}: id ${c.id}`); });
  report(errors);
  eq(new Set(cards.map((c) => c.id)).size, cards.length);
  eq([cards[0].name, cards[3].name, cards[71].name, cards[71].nation], ['Zinedine Zidane', 'Kylian Mbappé', 'Théo Hernandez', 'France']);
  eq(cards.slice(0, 72).every((c) => c.nation === 'France'), true);
});

test('cards.json: required fields, known position, rarity and nation, rating in the band of the rarity', () => {
  const BAND = { common: [60, 75], rare: [76, 83], epic: [83, 89], legend: [89, 96] };
  const errors = [];
  for (const c of cards) {
    const w = `${c.id} ${c.name}`;
    if (!nonEmpty(c.name) || !nonEmpty(c.era) || !nonEmpty(c.flag)) errors.push(`${w}: name, era or flag missing`);
    if (!POS.includes(c.pos)) errors.push(`${w}: pos ${c.pos}`);
    if (!RARITIES.includes(c.rarity)) errors.push(`${w}: rarity ${c.rarity}`);
    else if (!(c.rating >= BAND[c.rarity][0] && c.rating <= BAND[c.rarity][1])) errors.push(`${w}: rating ${c.rating} outside ${c.rarity}`);
    if (!nonEmpty(c.nation) || flag(c.nation).includes('>?<')) errors.push(`${w}: nation "${c.nation}" has no flag in art.js`);
    else if (nationLabel(c.nation) === c.nation && !['France', 'Portugal'].includes(c.nation)) errors.push(`${w}: nation "${c.nation}" has no French label`);
    if (Object.keys(c).sort().join() !== 'era,flag,id,name,nation,pos,rarity,rating') errors.push(`${w}: unexpected keys ${Object.keys(c)}`);
  }
  report(errors);
  eq(new Set(cards.map((c) => c.name)).size, cards.length, 'a player appears once');
});

test('cards.json: every selection has 10 to 12 cards (France 72), at least a legend, two epics and four rares', () => {
  const by = {};
  for (const c of cards) (by[c.nation] ||= []).push(c);
  const errors = [];
  for (const [n, list] of Object.entries(by)) {
    if (n === 'France') { eq(list.length, 72); continue; }
    const k = (r) => list.filter((c) => c.rarity === r).length;
    if (list.length < 10 || list.length > 12) errors.push(`${n}: ${list.length} cards`);
    if (k('legend') < 1 || k('epic') < 2 || k('rare') < 4 || k('common') < 3) errors.push(`${n}: rarities ${RARITIES.map(k)}`);
  }
  report(errors);
  assert(Object.keys(by).length >= 10);
});

test('cards.json: packs from the real deck follow the rarity odds', () => {
  const rng = createRng(77);
  const N = 30000;
  const counts = Object.fromEntries(RARITIES.map((r) => [r, 0]));
  for (const p of openPack(cards, rng, {}, N)) counts[p.card.rarity]++;
  for (const r of RARITIES) assert(Math.abs(counts[r] / N - RARITY_ODDS[r]) < 0.015, `${r}: ${counts[r] / N}`);
});
