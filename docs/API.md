# Study League: API of `js/core` and `js/store`

Exact exports, for the UI. Everything is an ES module. `js/core` has no DOM, no storage, no `Date.now()`: time is always passed in as `now` (ms since epoch), randomness always through a seeded `rng`. All user-facing strings produced by these modules are in French; identifiers, state keys and this document stay in English.

Imports from a view (`js/ui/...`): `import { ... } from '../core/match.js'`, `import { store } from '../store/index.js'`, `import { MATCH_QUESTIONS } from '../config.js'`.

## Decisions taken (spec gaps)

- A match is **always one subject and one topic** (no "Mixed"). `topicId` is a single id.
- A match has **10 questions** (`MATCH_QUESTIONS`), minutes 9', 18' ... 90'. A goal is scored on **every 2nd correct answer** (`GOAL_EVERY_N_CORRECT`), counted over the whole match, not consecutive. 10/10 = 5 goals. All rule texts in the UI are generated from these constants (`js/ui/rules.js`). "Perfect match" = all questions correct. Training also uses 15 questions. Both constants live in `js/config.js`.
- Speed bonus (spec: "up to +5") is **per correct answer**, 0 to 5 depending on the share of that question's time limit used (<=10 %: 5, <=20 %: 4, <=35 %: 3, <=50 %: 2, <=70 %: 1, else 0). A perfect match can therefore earn up to 75 bonus XP.
- Training uses a neutral "Équipe d'entraînement" opponent (strength 0.5), so a score and W/D/L exist, but nothing reaches the league, coins or win streak. Training matches do count in `totals.matches`, `correct`, `answered`, `perfect`, mastery, streak and activity. XP is halved (rounded down), no coins.
- Totals for wins/draws/losses/goals/streak/clean sheets/hat-tricks count **league matches only**.
- Free packs: one for each promotion, one for each title (winning the top division gives the title pack but no promotion pack; winning a lower division gives both), one per level that is a multiple of 5 (one pack per such level crossed).
- Question selection order, across all levels: never seen, then last answered wrong, then least recently seen (questions of the same match share a timestamp). The division level mix only chooses among the questions of the best remaining tier, so **no question repeats while an unseen one remains in the topic**.
- Coach's pick: lowest recent accuracy; a topic with fewer than 5 recent answers counts as 0.5 (an unplayed topic beats any topic above 50 %).
- Usernames are case-insensitive and always stored lower case.
- Cloud mode is closed to the family: an account needs a `members/<username>@study-league.app` document (created by hand), otherwise Firestore answers `permission-denied`, which the store maps to `StoreError('not-authorized')`; `main.js` then shows a dedicated screen (Réessayer / Se déconnecter) instead of entering the game. `ctx.save()` never throws: on failure it shows the toast « Sauvegarde impossible — vérifie ta connexion » and returns `false`; the next save writes the whole state again. A coach never writes the leaderboard.
- In cloud mode a coach is whoever has a `coaches/{uid}` document. Signing up with `role: 'coach'` creates an ordinary account; until the parent creates the document the returned user has `role: 'player'` and `coachPending: true`.
- `answerQuestion` with `elapsedMs` above the time limit (timed match) is a timeout, whatever the answer.
- Badge "Album complet" triggers at `min(72, deck size)` unique cards (pass `ctx.cards` so the deck size is known).

## `js/config.js`

```js
FIREBASE_CONFIG          // null = local mode, or the Firebase web config object
APP_NAME                 // 'Study League'
MATCH_QUESTIONS = 10
TIMER_MCQ_SECONDS = 30
TIMER_INPUT_SECONDS = 45
GOAL_EVERY_N_CORRECT = 2
PACK_COST = 50
PACK_SIZE = 3
FREE_PACK_EVERY_N_LEVELS = 5
TRAINING_XP_FACTOR = 0.5
HISTORY_LIMIT = 100      // matches kept in state.matches
MASTERY_WINDOW = 20
MASTERY_MIN_ANSWERS = 10
ACTIVITY_DAYS_KEPT = 60
USERNAME_MIN = 3, USERNAME_MAX = 16, PASSWORD_MIN = 6
EMAIL_DOMAIN = 'study-league.app'
FIREBASE_SDK_BASE = 'https://www.gstatic.com/firebasejs/10.12.2/'
```

## `js/core/rng.js`

```js
hashString(str) -> uint32
randomSeed() -> uint32            // only Math.random in core; views call createRng(randomSeed())
createRng(seed: number|string) -> rng
rng.next() -> [0,1)
rng.int(n) -> integer in [0,n)
rng.range(min, max) -> integer, inclusive
rng.chance(p) -> boolean
rng.pick(array) -> item
rng.shuffle(array) -> new array
rng.weighted(items, weightFn) -> item
```

## `js/core/questions.js`

Types used below:
```js
Question = { id, topicId, level: 1|2|3, type: 'mcq'|'input', prompt, choices?: string[] (mcq),
             answer: string | string[], explain: string }
Topic    = { id, name, file, squads: string[], subjectId, subjectName, icon }   // from listTopics
```

```js
normalizeAnswer(s) -> string           // NFC, apostrophes unified, spaces collapsed, trimmed, lower case; accents kept
acceptedAnswers(q) -> string[]
displayAnswer(q) -> string             // accepted forms joined with ' / '
checkAnswer(q, given: string|null) -> boolean

loadCatalog(fetchJson) -> Promise<{ subjects }>          // fetchJson('data/subjects.json')
listTopics(catalog, squad, subjectId?) -> Topic[]        // squad 'u13'|'u10'; subjectId optional filter
listSubjects(catalog, squad) -> [{ id, name, icon, topics: Topic[] }]   // only subjects with topics for the squad

expandVerbs(file, topicId?) -> Question[]        // 3 per verb: <topic>-<verb>-past (input), -pp (input), -form (mcq)
questionsFromFile(file, topicId?) -> Question[]  // handles standard and "kind":"verbs" files
loadTopicQuestions(fetchJson, topic: Topic) -> Promise<Question[]>   // fetchJson(topic.file)

pickQuestions(pool: Question[], { n = MATCH_QUESTIONS, history = {}, division = null, rng }) -> Question[]
LEVEL_WEIGHTS   // per division index, weights for level 1/2/3
```
- `fetchJson(path) -> Promise<object>` is yours to provide (e.g. `(p) => fetch(p).then((r) => r.json())`). Cache loaded pools in the view layer if wanted.
- `pickQuestions` takes the pool of **one topic**, `history = state.questions`, `division` = the league division index (0..4) or `null` for training (flat level mix). Returns copies in play order, mcq `choices` shuffled. Fewer than `n` are returned only if the pool is smaller.
- `checkAnswer` for an mcq compares the chosen string with `answer`; for input, the typed text with any accepted form.

## `js/core/match.js`

```js
PRACTICE_OPPONENT = { id: 'practice', name: "Équipe d'entraînement", strength: 0.5 }

createMatch({ mode = 'league', questions, opponent = null, topicId, subjectId = null,
              division = 0, coachPick = false, rng, now }) -> match
currentQuestion(match) -> Question | null          // null once finished
currentMinute(match) -> number                     // 6, 12, ... 90
currentTimeLimitMs(match) -> number | null         // null in training
answerQuestion(match, given: string|null, elapsedMs) -> AnswerFeedback
timeoutQuestion(match) -> AnswerFeedback           // = answerQuestion(match, null, limit)
summarizeMatch(match, now) -> MatchResult          // match must be finished
timeLimitSeconds(question) -> 30 | 45
speedBonus(ms, question) -> 0..5
minuteOf(index, total) -> number
outcomeOf(goalsFor, goalsAgainst) -> 'W'|'D'|'L'
```
- `mode`: `'league'` (timed, opponent required) or `'training'` (untimed, opponent ignored/neutral).
- `opponent`: `{ id, name, strength }`; take it from `nextFixture(season)`: `{ id: f.opponent.id, name: f.opponent.name, strength: f.strength }`.
- `coachPick: true` if the topic chosen is the coach's pick (+50 % coins).
- The match object is **mutable** and holds the rng; do not store it in the player state. Useful fields: `index` (next question), `questions`, `correct`, `goalsFor`, `goalsAgainst`, `finished`, `opponent`, `timed`.
- Pass `given = null` when the timer expires (or call `timeoutQuestion`).

```js
AnswerFeedback = {
  correct: boolean, timedOut: boolean,
  correctAnswer: string,          // display form
  explanation: string,
  speedBonus: 0..5,               // 0 if wrong
  goalFor: boolean,               // this answer scored (every 3rd correct)
  goalAgainst: boolean,           // wrong answer and the opponent scored
  attack: { charge: 0|1|2, max: 3 },   // meter AFTER this answer; 0 right after a goal
  score: { for: number, against: number },
  minute: number,                 // minute of the question just answered
  finished: boolean
}

MatchResult = {
  mode, topicId, subjectId, division, coachPick,
  opponent: { id, name, strength },
  goalsFor, goalsAgainst, outcome: 'W'|'D'|'L',
  correct, total, accuracy (0..1), perfect, cleanSheet,
  speedBonus (sum), durationMs (sum of answer times), playedAt: now,
  answers: [{ id, topicId, correct, timedOut, given, ms, speedBonus, minute, goalFor, goalAgainst, prompt, answer }]
}
```

## `js/core/league.js`

```js
DIVISIONS = [ {index:0,id:'district',name:'District',strength:[0.35,0.5]}, {1,'regional','Régional',[0.45,0.6]},
              {2,'national','National',[0.55,0.7]}, {3,'ligue2','Ligue 2',[0.65,0.8]}, {4,'ligue1','Ligue 1',[0.75,0.9]} ]
TOP_DIVISION = 4; OPPONENTS_PER_SEASON = 7 and SEASON_MATCHDAYS = 7 (both in config.js); PROMOTION_PLACES = 2; PLAYER_CLUB_ID = 'me'
divisionName(index) -> string

newSeason({ clubs, profile: { club, colors }, division = 0, number = 1, rng, exclude = [] }) -> Season
clubOf(season, id) -> Club
seasonLength(season) -> number     // matchdays of THIS season, read from its fixtures (a saved 14-matchday season stays 14)
isSeasonOver(season) -> boolean
nextFixture(season) -> { matchday, home, away, isHome, opponent: Club, strength } | null
playMatchday(season, { goalsFor, goalsAgainst }, rng) -> { matchday, results: Fixture[] }   // MUTATES season
computeTable(season) -> TableRow[]
fixturesOf(season, clubId = 'me') -> Fixture[]      // matchday order, played or not (hg/ag null if not)
seasonEnd(season) -> SeasonEnd
startNextSeason(season, { clubs, profile, rng }) -> Season
simulateScore(strengthHome, strengthAway, rng) -> [homeGoals, awayGoals]

Club      = { id, name, short, colors: [c1,c2], crest, strength: number|null, isPlayer }   // player club id is 'me'
Fixture   = { md (0-based), home: clubId, away: clubId, hg: number|null, ag: number|null }
Season    = { number, division, clubs: Club[8], fixtures: Fixture[28] (flat, single round-robin), matchday: 0..7 }
TableRow  = { clubId, name, short, colors, crest, isPlayer, played, won, drawn, lost, gf, ga, gd, pts, position }
SeasonEnd = { number, division, position, points, gf, ga, champion, promoted, nextDivision, table: TableRow[] }
```
`clubs` is the array inside `data/clubs.json` (`clubsData.clubs`). Table sort: points, goal difference, goals for, then name. Positions 1-2 promoted (not in the top division), position 1 = champion, no relegation. You normally never call `playMatchday` or `startNextSeason` yourself: `applyResult` does.

## `js/core/rewards.js`

```js
xpToReach(level) -> number                 // total XP to reach `level`: 0, 100, 250, 450, 700, ...
levelForXp(xp) -> level (>= 1)
levelInfo(xp) -> { level, xp, levelStart, nextLevelAt, progress: 0..1 }
matchXp(result) -> { base, speed, outcome, total }          // 10/correct, speed sum, 50/20/10; training halves total
matchCoins(result) -> { base, perfect, coachPick, total }   // 30/15/5, +10 perfect, x1.5 coach pick; training: 0; a league defeat with fewer than a third of the questions right (minCorrectForLossCoins(total)): 0
RARITY_ODDS = { common: 0.6, rare: 0.28, epic: 0.1, legend: 0.02 }
RARITIES = ['common','rare','epic','legend']
openPack(cards, rng, collection = {}, size = PACK_SIZE) -> [{ card, isNew }]
BADGES -> [{ id, name, desc, icon, check(state, env) }]      // 24, names and descriptions in French
badgeById(id) -> badge | null
badgeInfo(badge) -> { id, name, desc, icon }
evaluateBadges(state, env = {}) -> badge[]                  // earned now and not yet in state.badges
```
- `cards` = `cardsData.cards`. `collection` = `state.cards`. `isNew` is false for a second copy inside the same pack.
- `env = { catalog, totalCards }` (`catalog` from `loadCatalog`, needed for "Maître de la matière").
- Badge ids: `first-match first-win streak-3 streak-5 streak-10 hat-trick clean-sheet perfect matches-10 matches-50 matches-100 promotion title topic-master subject-master day-streak-3 day-streak-7 cards-10 cards-36 cards-all first-legend correct-100 correct-500 correct-1000`.
- To display the full list (locked badges too), use `BADGES.map(badgeInfo)` and `state.badges[id]` (timestamp when earned).

## `js/core/stats.js`

```js
dayKey(ts) -> 'YYYY-MM-DD'                      // local calendar day
lastDays(now, n) -> string[]                    // n day keys ending today, oldest first
topicMastery(state, topicId) -> { answered, accuracy, stars: 0..3, totalAnswered, totalCorrect }
topicStars(state, topicId) -> 0..3
weakestTopic(state, topics: Topic[]) -> Topic | null        // the coach's pick
updateStreak(streak, now) -> { current, best, lastDay }     // used by applyResult
dayStreak(state, now) -> number                             // streak to display (0 if broken)
weeklyXp(state, now) -> number                              // last 7 days incl. today
overallAccuracy(state) -> 0..1
uniqueCards(state) -> number
totalCards(state) -> number                                 // with duplicates
leaderboardSummary(state, now) -> Summary
summaryWeekXp(summary, now) -> number                       // recompute weekly XP of a stored summary
coachReport(state, now) -> CoachReport

Summary = { username, displayName, club, colors, squad, xp, division (0..4), weekXp, xpByDay: {day: xp} (7 days),
            wins, draws, losses, matches, accuracy, bestWinStreak, cards (unique), titles, updatedAt }
CoachReport = { username, displayName, club, squad, lastActive, timePlayedMs, matches, wins, draws, losses, accuracy,
                topics: [{ topicId, answered, accuracy, stars, totalAnswered, totalCorrect }],
                recentMatches: MatchRecord[] (20, newest first),
                activity: [{ day, matches, xp, answered, correct, ms }] (14, oldest first),
                mostMissed: [{ id, topicId, prompt, answer, wrong, seen }] (up to 10) }
```
Mastery stars: accuracy over the last 20 answers of the topic, 0 stars under 10 answers, then >=50 % 1, >=70 % 2, >=90 % 3. For the leaderboard, sort by `summaryWeekXp(s, now)` (not the stored `weekXp`, which goes stale). Display `levelInfo(summary.xp).level` for a rival's level. The coach report holds ids only: resolve topic names through the catalog.

## `js/core/state.js`

```js
SCHEMA_VERSION = 1
newPlayerState({ username, displayName, role = 'player', squad = 'u13', club = '', colors = ['#1e40af','#fbbf24'],
                 clubs = null, rng = null, now }) -> state
ensureSeason(state, clubs, rng) -> state        // creates season 1 if league.season is null
migrateState(raw) -> state | null               // fills defaults, upgrades old schema; the stores call it on load
applyResult(state, result, ctx) -> { state, events }
buyPack(state, ctx) -> { state, cards: [{card, isNew}], events }       // costs PACK_COST; throws Error if short
openFreePack(state, ctx) -> { state, cards: [{card, isNew}], events }  // uses state.freePacks; throws if none
```
- None of these mutates its input; use the returned `state`, then `await store.saveState(state)`.
- `clubs` = `clubsData.clubs`, `squad` is `'u13'` or `'u10'`, `colors` = `[primary, secondary]`. Pass `clubs` and `rng` to get the first season immediately.
- `ctx = { now, rng, clubs, cards, catalog }`. `clubs` is required for league results (new seasons), `cards` for packs (also gives the deck size to the album badge), `catalog` optional (needed to award "Maître de la matière").
- A coach state is `{ schema, role: 'coach', username, createdAt, lastActive, profile: { displayName, club: '', colors, squad: null } }`.

### Player state (JSON, stored as is, no nested arrays)

```js
{
  schema: 1, role: 'player', username, createdAt, lastActive,           // ms timestamps
  profile: { displayName, club, colors: [c1, c2], squad: 'u13'|'u10' },
  xp: 0, coins: 0, freePacks: 0,                                         // level = levelForXp(xp)
  totals: { matches, leagueMatches, wins, draws, losses, goalsFor, goalsAgainst, correct, answered,
            perfect, cleanSheets, hatTricks, winStreak, bestWinStreak, promotions, titles, legends, timePlayedMs },
  topics:    { [topicId]: { recent: (0|1)[] (last 20), answered, correct, lastAt } },
  questions: { [questionId]: { seen, correct, wrong, lastAt, lastCorrect: boolean|null, topicId, p?: prompt, a?: answer } },
  league:    { season: Season, history: [{ season, division, position, points, gf, ga, promoted, champion, at }] },
  matches:   MatchRecord[]  /* last 100, oldest first */,
  cards:     { [cardId]: count },
  badges:    { [badgeId]: earnedAtMs },
  streak:    { current, best, lastDay: 'YYYY-MM-DD'|null },
  activity:  { ['YYYY-MM-DD']: { matches, xp, answered, correct, ms } }   // last 60 days
}
MatchRecord = { at, mode, topicId, subjectId, opponent: name, division, goalsFor, goalsAgainst,
                outcome, correct, total, xp, coins }
```
`p` and `a` on a question are only set once it has been answered wrong (for the coach's most-missed list). Trophies: `league.history.filter((h) => h.champion)`.

### Events returned by `applyResult` (in this order; no text, the view writes the French labels)

```js
{ type: 'xp', base, speed, outcome, total }
{ type: 'coins', base, perfect, coachPick, total }                 // league only; coachPick = bonus part
{ type: 'mastery', topicId, from, to }                             // a topic gained stars
{ type: 'level-up', from, to }
{ type: 'free-pack', reason: 'level', level }                      // one per multiple of 5 crossed
{ type: 'streak', days }                                           // first match of a new day
{ type: 'matchday', matchday, results: Fixture[], position, table: TableRow[] }   // league only
{ type: 'free-pack', reason: 'promotion' | 'title' }               // at season end
{ type: 'season-end', summary: SeasonEnd, nextDivision, promoted, champion }       // league only; new season already in state
{ type: 'badge', badge: { id, name, desc, icon } }
```
(`free-pack` events for promotion and title come just before `season-end`.) `buyPack` / `openFreePack` return only `badge` events.

## `js/store` (one async interface, two backends)

```js
import { store, mode, StoreError, findLocalProgress, importLocalProgress } from '../store/index.js';
```
`mode` is `'local'` or `'cloud'` (from `FIREBASE_CONFIG`). `store` has:

```js
store.init() -> Promise<User|null>              // call once at start: restores the remembered session
store.currentUser() -> User | null              // synchronous, cached
store.signUp({ username, password, role = 'player', state }) -> Promise<User>   // also signs in, saves `state`
store.signIn({ username, password }) -> Promise<User>
store.signOut() -> Promise<void>
store.loadState() -> Promise<state | null>      // migrated; null if nothing saved yet (create one, save it)
store.saveState(state) -> Promise<void>         // call after every match and every purchase
store.listLeaderboard() -> Promise<[{ uid, ...Summary }]>      // all players, signed-in users only
store.listPlayerStates() -> Promise<[{ uid, username, state }]> // coach only, else StoreError 'forbidden'

User = { uid, username (lower case), role: 'player'|'coach', coachPending?: true }
```
- `signUp`: build `state` with `newPlayerState(...)` first. For a coach, `role: 'coach'` and a coach state.
- Errors are `StoreError` with `.code` and a **French** `.message` ready to display. Codes: `bad-username`, `weak-password`, `username-taken`, `wrong-credentials` (same message for unknown user and wrong password), `not-signed-in`, `forbidden`, `network`, `too-many-requests`, `storage`, `unknown`.
- Username: 3 to 16 characters, letters, digits, underscore; case-insensitive unique. Password: at least 6 characters.
- The leaderboard includes the current user. Coach accounts never appear in it.
- Local backend extras (not on the cloud one): `peekState(username)`. Also exported: `createLocalStore({ storage, prefix, now })`, `createMemoryStorage()`, `createFirebaseStore(config, { now })`.
- Importing local progress after a cloud sign-up (cloud mode only; both return `null` in local mode):

```js
const found = await findLocalProgress(username);   // state of the same-named local account on this device, or null
if (found && confirm('...')) await importLocalProgress();   // saves it into the cloud account; returns the state
```
Reload the state with `store.loadState()` afterwards.

## How a view plays a league match end to end

```js
import { store } from '../store/index.js';
import { createRng, randomSeed } from '../core/rng.js';
import { loadCatalog, listTopics, loadTopicQuestions, pickQuestions } from '../core/questions.js';
import { nextFixture } from '../core/league.js';
import { weakestTopic } from '../core/stats.js';
import { createMatch, currentQuestion, currentMinute, currentTimeLimitMs, answerQuestion, timeoutQuestion, summarizeMatch } from '../core/match.js';
import { applyResult } from '../core/state.js';

const fetchJson = (p) => fetch(p).then((r) => r.json());
const catalog = await loadCatalog(fetchJson);
const clubsData = await fetchJson('data/clubs.json');
const cardsData = await fetchJson('data/cards.json');

let state = await store.loadState();
const rng = createRng(randomSeed());

// 1. choose subject then topic (never both mixed); highlight the coach's pick
const topics = listTopics(catalog, state.profile.squad, 'en');
const pick = weakestTopic(state, topics);          // coach's pick for this subject
const topic = pick;                                // what the player chose

// 2. build the match
const season = state.league.season;
const fx = nextFixture(season);                    // { matchday, opponent, strength, isHome }
const pool = await loadTopicQuestions(fetchJson, topic);
const questions = pickQuestions(pool, { history: state.questions, division: season.division, rng });
const match = createMatch({
  mode: 'league', questions, topicId: topic.id, subjectId: topic.subjectId, division: season.division,
  opponent: { id: fx.opponent.id, name: fx.opponent.name, strength: fx.strength },
  coachPick: pick && pick.id === topic.id, rng, now: Date.now(),
});

// 3. play: show currentQuestion(match) with currentMinute(match) and a timer of currentTimeLimitMs(match)
while (!match.finished) {
  const q = currentQuestion(match);
  const started = performance.now();
  const answer = await askPlayer(q);               // string (mcq choice or typed text), or null on timeout
  const fb = answer === null ? timeoutQuestion(match)
                             : answerQuestion(match, answer, performance.now() - started);
  // fb.correct, fb.correctAnswer, fb.explanation, fb.goalFor, fb.goalAgainst, fb.attack, fb.score, fb.minute
  await showFeedback(fb);
}

// 4. finish: summarise, apply, save, then show the result screen from the events
const result = summarizeMatch(match, Date.now());
const out = applyResult(state, result, { now: Date.now(), rng, clubs: clubsData.clubs, cards: cardsData.cards, catalog });
state = out.state;
await store.saveState(state);
showResult(result, out.events);                    // xp, coins, level-up, badges, matchday table, season-end, free packs

// Training: same, with mode: 'training', division: null in pickQuestions, no opponent, no coachPick.
// Packs: buyPack(state, { now, rng, cards: cardsData.cards, catalog }) then saveState(out.state).
```
