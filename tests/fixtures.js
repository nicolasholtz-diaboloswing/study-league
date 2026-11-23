// Small inline fixtures shared by the tests.

export const CLUBS = Array.from({ length: 16 }, (_, i) => ({
  id: 'c' + String(i + 1).padStart(2, '0'),
  name: `Club ${String.fromCharCode(65 + i)}`,
  short: 'C' + String.fromCharCode(65 + i),
  colors: ['#111111', '#eeeeee'],
  crest: ['shield', 'round', 'diamond', 'stripes'][i % 4],
}));

const rar = ['common', 'common', 'common', 'rare', 'rare', 'epic', 'legend'];
export const CARDS = Array.from({ length: 28 }, (_, i) => ({
  id: 'p' + String(i + 1).padStart(3, '0'),
  name: 'Player ' + (i + 1),
  pos: ['GK', 'DEF', 'MID', 'FWD'][i % 4],
  nation: 'Italy',
  flag: 'IT',
  rating: 60 + i,
  rarity: rar[i % rar.length],
}));

// Country and club cards (kind 'nation' / 'club'): won in cups only, never drawn from packs.
const nrar = ['common', 'common', 'rare', 'epic', 'legend'];
export const NATION_CARDS = ['France', 'Brésil', 'Argentine', 'Espagne', 'Italie', 'Portugal', 'Japon', 'Maroc'].map((name, i) => ({
  id: 'n' + String(i + 1).padStart(3, '0'), kind: 'nation', name, nation: name, rarity: nrar[i % nrar.length],
}));
export const CLUB_CARDS = ['Lyon', 'Marseille', 'Lille', 'Nice', 'Rennes', 'Lens'].map((name, i) => ({
  id: 'k' + String(i + 1).padStart(3, '0'), kind: 'club', name, short: name.slice(0, 3).toUpperCase(), colors: ['#111111', '#eeeeee'], crest: 'shield',
  country: 'France', rarity: nrar[i % nrar.length],
}));
/** The whole card file as the app loads it: players, countries and clubs. */
export const ALL_CARDS = [...CARDS, ...NATION_CARDS, ...CLUB_CARDS];

export const SUBJECTS = {
  subjects: [
    {
      id: 'en', name: 'English', icon: 'EN',
      topics: [
        { id: 'en-det', name: 'Determiners', file: 'data/en/det.json', squads: ['u13'] },
        { id: 'en-verbs', name: 'Irregular verbs', file: 'data/en/verbs.json', squads: ['u10', 'u13'] },
        { id: 'en-verbs-pp', name: 'Irregular verbs (past + participle)', file: 'data/en/verbs.json', squads: ['u13'], forms: ['past', 'pp'], group: 'Verb Tense' },
      ],
    },
    {
      id: 'fr', name: 'Francais', icon: 'FR', accents: true,
      topics: [{ id: 'fr-gram', name: 'Grammaire', file: 'data/fr/gram.json', squads: ['u13'] }],
    },
  ],
};

function mcqs(prefix, n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i + 1}`, level: (i % 3) + 1, type: i % 2 ? 'input' : 'mcq',
    prompt: `Question ${i + 1}`,
    ...(i % 2 ? { answer: ['yes', 'oui'] } : { choices: ['a', 'b', 'c', 'd'], answer: 'b' }),
    explain: 'Because.',
  }));
}

export const FILES = {
  'data/subjects.json': SUBJECTS,
  'data/en/det.json': { topic: 'en-det', questions: mcqs('det', 30) },
  'data/fr/gram.json': { topic: 'fr-gram', questions: mcqs('gram', 24) },
  'data/en/verbs.json': {
    topic: 'en-verbs', kind: 'verbs',
    verbs: [
      { base: 'go', past: 'went', pp: 'gone', level: 1 },
      { base: 'get', past: 'got', pp: ['got', 'gotten'], level: 2 },
      { base: 'cut', past: 'cut', pp: 'cut', level: 1 },
      { base: 'be', past: ['was', 'were'], pp: 'been', level: 1 },
      { base: 'take', past: 'took', pp: 'taken', level: 1 },
      { base: 'swim', past: 'swam', pp: 'swum', level: 2 },
    ],
  },
};

/** fetchJson stand-in for the loaders */
export async function fetchJson(path) {
  if (!(path in FILES)) throw new Error('404 ' + path);
  return JSON.parse(JSON.stringify(FILES[path]));
}
