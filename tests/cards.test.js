// Checks on the real card file: data/cards.json (nothing is mocked).
import { test, eq, assert } from './runner.js';
import { RARITIES, RARITY_ODDS, openPack } from '../js/core/rewards.js';
import { createRng } from '../js/core/rng.js';
import { flag, hasFlag, hasNationLabel, safeCrest } from '../js/ui/art.js';

const all = (await (await fetch('../data/cards.json')).json()).cards;
const kindOf = (c) => c.kind || 'player';
const players = all.filter((c) => kindOf(c) === 'player');
const nations = all.filter((c) => c.kind === 'nation');
const clubs = all.filter((c) => c.kind === 'club');
const POS = ['GK', 'DEF', 'MID', 'FWD'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';
const report = (errors) => assert(errors.length === 0, `${errors.length} problem(s):\n  ` + errors.slice(0, 40).join('\n  '));
const keys = (c) => Object.keys(c).sort().join();

test('cards.json: every card has a known kind, and ids are contiguous per kind (pNNN, nNNN, kNNN)', () => {
  const errors = [];
  all.forEach((c) => { if (c.kind !== undefined && !['player', 'nation', 'club'].includes(c.kind)) errors.push(`${c.id}: kind ${c.kind}`); });
  players.forEach((c, i) => { if (c.id !== 'p' + String(i + 1).padStart(3, '0')) errors.push(`player #${i}: id ${c.id}`); });
  nations.forEach((c, i) => { if (c.id !== 'n' + String(i + 1).padStart(3, '0')) errors.push(`nation #${i}: id ${c.id}`); });
  clubs.forEach((c, i) => { if (c.id !== 'k' + String(i + 1).padStart(3, '0')) errors.push(`club #${i}: id ${c.id}`); });
  report(errors);
  eq(new Set(all.map((c) => c.id)).size, all.length);
  eq(all.slice(0, players.length).every((c) => kindOf(c) === 'player'), true, 'players come first');
  assert(players.length >= 191 + 80 && nations.length >= 20 && clubs.length >= 20, `${players.length} players, ${nations.length} nations, ${clubs.length} clubs`);
  // existing ids are never renumbered
  eq([players[0].name, players[3].name, players[71].name, players[71].nation], ['Zinedine Zidane', 'Kylian Mbappé', 'Théo Hernandez', 'France']);
  eq(players.slice(0, 72).every((c) => c.nation === 'France'), true);
});

test('cards.json: every card has a name and a known rarity; no duplicate name within a kind', () => {
  const errors = [];
  for (const c of all) {
    if (!nonEmpty(c.name)) errors.push(`${c.id}: name missing`);
    if (!RARITIES.includes(c.rarity)) errors.push(`${c.id} ${c.name}: rarity ${c.rarity}`);
  }
  for (const list of [players, nations, clubs]) eq(new Set(list.map((c) => c.name)).size, list.length, 'a card appears once');
  report(errors);
});

test('cards.json: player cards: exact keys, known position, rating in the band of the rarity, flag and French label', () => {
  const BAND = { common: [60, 75], rare: [76, 83], epic: [83, 89], legend: [89, 96] };
  const errors = [];
  for (const c of players) {
    const w = `${c.id} ${c.name}`;
    if (!nonEmpty(c.era) || !nonEmpty(c.flag)) errors.push(`${w}: era or flag missing`);
    if (!POS.includes(c.pos)) errors.push(`${w}: pos ${c.pos}`);
    if (RARITIES.includes(c.rarity) && !(c.rating >= BAND[c.rarity][0] && c.rating <= BAND[c.rarity][1])) errors.push(`${w}: rating ${c.rating} outside ${c.rarity}`);
    if (!/^\d{4}$/.test(c.era)) errors.push(`${w}: era ${c.era}`);
    if (!nonEmpty(c.nation) || !hasFlag(c.nation) || flag(c.nation).includes('>?<')) errors.push(`${w}: nation "${c.nation}" has no flag in art.js`);
    else if (!hasNationLabel(c.nation)) errors.push(`${w}: nation "${c.nation}" has no French label`);
    if (keys(c) !== 'era,flag,id,name,nation,pos,rarity,rating') errors.push(`${w}: unexpected keys ${Object.keys(c)}`);
  }
  report(errors);
});

test('cards.json: every selection has at least 3 player cards and a legend or an epic or a rare (France 72)', () => {
  const by = {};
  for (const c of players) (by[c.nation] ||= []).push(c);
  const errors = [];
  for (const [n, list] of Object.entries(by)) {
    if (n === 'France') { eq(list.length, 72); continue; }
    if (list.length < 3) errors.push(`${n}: ${list.length} cards`);
    if (!list.some((c) => c.rarity !== 'common')) errors.push(`${n}: only commons`);
  }
  report(errors);
  assert(Object.keys(by).length >= 20, `${Object.keys(by).length} selections`);
  // the original eleven selections keep their depth (at least a legend, two epics, four rares, three commons)
  for (const n of ['Argentina', 'England', 'Spain', 'Portugal', 'Brazil', 'Germany', 'Italy', 'Netherlands', 'Belgium', 'Morocco']) {
    const k = (r) => by[n].filter((c) => c.rarity === r).length;
    assert(by[n].length >= 10 && k('legend') >= 1 && k('epic') >= 2 && k('rare') >= 4 && k('common') >= 3, `${n}: ${RARITIES.map(k)}`);
  }
});

test('cards.json: nation cards: exact keys, one per selection, flag and French label', () => {
  const errors = [];
  for (const c of nations) {
    const w = `${c.id} ${c.name}`;
    if (keys(c) !== 'id,kind,name,nation,rarity') errors.push(`${w}: unexpected keys ${Object.keys(c)}`);
    if (!hasFlag(c.nation) || flag(c.nation).includes('>?<')) errors.push(`${w}: nation "${c.nation}" has no flag in art.js`);
    if (!hasNationLabel(c.nation)) errors.push(`${w}: nation "${c.nation}" has no French label`);
  }
  report(errors);
  eq(new Set(nations.map((c) => c.nation)).size, nations.length, 'one card per nation');
  for (const n of new Set(players.map((c) => c.nation))) assert(nations.some((c) => c.nation === n), `no nation card for ${n}`);
});

test('cards.json: club cards: exact keys, 3-letter code, valid crest style, two hex colours, country', () => {
  const errors = [];
  for (const c of clubs) {
    const w = `${c.id} ${c.name}`;
    if (keys(c) !== 'colors,country,crest,id,kind,name,rarity,short') errors.push(`${w}: unexpected keys ${Object.keys(c)}`);
    if (!/^[A-Z]{2,3}$/.test(c.short)) errors.push(`${w}: short ${c.short}`);
    if (!['shield', 'round', 'diamond', 'stripes'].includes(c.crest) || safeCrest(c.crest) !== c.crest) errors.push(`${w}: crest ${c.crest}`);
    if (!Array.isArray(c.colors) || c.colors.length !== 2 || !c.colors.every((x) => HEX.test(x))) errors.push(`${w}: colors ${JSON.stringify(c.colors)}`);
    if (!nonEmpty(c.country)) errors.push(`${w}: country missing`);
  }
  report(errors);
});

test('cards.json: packs from the real deck (players only) follow the rarity odds', () => {
  const rng = createRng(77);
  const N = 30000;
  const counts = Object.fromEntries(RARITIES.map((r) => [r, 0]));
  for (const p of openPack(players, rng, {}, N)) counts[p.card.rarity]++;
  for (const r of RARITIES) assert(Math.abs(counts[r] / N - RARITY_ODDS[r]) < 0.015, `${r}: ${counts[r] / N}`);
});
