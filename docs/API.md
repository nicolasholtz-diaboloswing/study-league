# Study League: API of `js/core` and `js/store`

Exact exports, for the UI. Everything is an ES module. `js/core` has no DOM, no storage, no `Date.now()`: time is always passed in as `now` (ms since epoch), randomness always through a seeded `rng`. All user-facing strings produced by these modules are in French; identifiers, state keys and this document stay in English.

Imports from a view (`js/ui/...`): `import { ... } from '../core/match.js'`, `import { store } from '../store/index.js'`, `import { MATCH_QUESTIONS } from '../config.js'`.

## Decisions taken (spec gaps)

- A match is **one subject and one topic** (no "Mixed"), `topicId` is a single id. The one exception is an event mix (see `js/core/events.js`): `topicId` is then `'event:<id>'` and `subjectId` is `'event'`, while each question keeps its own real `topicId`.
- A league or cup match has **15 questions** (`LEAGUE_QUESTIONS`, minutes 6', 12' ... 90'); a training match has **10** (`MATCH_QUESTIONS`, minutes 9', 18' ... 90'). The caller passes `n` to `pickQuestions`.
- A goal is scored on **every Nth correct answer**, counted over the whole match, not consecutive. N (`goalEvery`) comes from the match: `DIVISIONS[division].goalEvery` (2, 3, 3, 4, 5 from District to Ligue 1), `CUPS[].goalEvery` for a cup (3, 4, 5, 5), `GOAL_EVERY_N_CORRECT` (2) for training. Most goals in a 15-question league match: `goalScale(division)` = 7, 5, 5, 3, 3. All rule texts in the UI are generated from the match's `goalEvery` (`js/ui/rules.js`). "Perfect match" = all questions correct.
- The u13 "expert" mode no longer exists (`difficulty` is gone from `createMatch`, `summarizeMatch`, the state and `pendingMatch`). `migrateState` deletes `state.difficulty`; an old `matches[].difficulty` or `pendingMatch.difficulty` is left alone and ignored. The same rule survives as `concedeAll` (every wrong answer or timeout is a goal against) in the Coupe du monde.
- u10 typing tolerance: `checkAnswer(q, given, { squad: 'u10' })` treats "ê" and "e" as the same letter in typed answers (other accents stay strict). `createMatch({ squad })` carries the squad to the check.
- Speed bonus (spec: "up to +5") is **per correct answer**, 0 to 5 depending on the share of that question's time limit used (<=10 %: 5, <=20 %: 4, <=35 %: 3, <=50 %: 2, <=70 %: 1, else 0). A perfect match can therefore earn up to 75 bonus XP.
- Training uses a neutral "Équipe d'entraînement" opponent (strength 0.5), so a score and W/D/L exist, but nothing reaches the league, coins or win streak. Training matches do count in `totals.matches`, `correct`, `answered`, `perfect`, mastery, streak and activity. XP is halved (rounded down), no coins.
- Totals for wins/draws/losses/goals/streak/clean sheets/hat-tricks count **league matches only**. A cup match counts like training in the totals (`matches`, `correct`, `answered`, `perfect`, `timePlayedMs`), but earns full XP and coins like a league match, and leaves `league.season` alone.
- Free packs: one for each promotion, one for each title (winning the top division gives the title pack but no promotion pack; winning a lower division gives both), one per level that is a multiple of 10 (one pack per such level crossed), one per cup final won.
- Cup and event rules live in `js/core/cups.js` and `js/core/events.js` (see below). Nation and club cards (`kind` `'nation'` / `'club'`) are never drawn from packs (`openPack` keeps player cards only); they are won in cups (`pickCupCard`).
- Optional topics: a topic with `optional: true` in the catalog is offered only once activated (`state.optionalTopics[topicId]` = ms timestamp of the last activation). It sits at the **top level** of the state, not under `profile`, because `firestore.rules` only accepts a closed list of keys under `profile`; the same holds for `cups`, `eventSeen` and `pendingDemotion`. Only the owner writes the document, so a parent can read the activations but not change them.
- One-off demotion: `SCHEMA_VERSION` is 2. `migrateState` marks every player stored at an older schema with `pendingDemotion: 2` (`DEMOTION_DIVISIONS`); `restoreSession` in `main.js` then calls `applyDemotion` (new season in the division lowered by 2, floor District, same season number, matchday 0, kick-off marker dropped) and saves. A new player is created at schema 2, unmarked.
- Question selection order, across all levels: never seen, then last answered wrong, then least recently seen (questions of the same match share a timestamp). The division level mix only chooses among the questions of the best remaining tier, so **no question repeats while an unseen one remains in the topic**.
- Coach's pick: lowest recent accuracy; a topic with fewer than 5 recent answers counts as 0.5 (an unplayed topic beats any topic above 50 %).
- Usernames are case-insensitive and always stored lower case.
- Cloud mode is closed to the family: an account needs a `members/<username>@study-league.app` document (created by hand), otherwise Firestore answers `permission-denied`, which the store maps to `StoreError('not-authorized')`; `main.js` then shows a dedicated screen (Réessayer / Se déconnecter) instead of entering the game. `ctx.save()` never throws: on failure it shows the toast « Sauvegarde impossible — vérifie ta connexion » and returns `false`; the next save writes the whole state again. A coach never writes the leaderboard.
- In cloud mode a coach is whoever has a `coaches/{uid}` document. Signing up with `role: 'coach'` creates an ordinary account; until the parent creates the document the returned user has `role: 'player'` and `coachPending: true`.
- `answerQuestion` with `elapsedMs` above the time limit (timed match) is a timeout, whatever the answer.
- Badge "Album complet" triggers when the unique cards owned reach the whole file: players, nations and clubs (`ctx.cards.length`, 323 today). Pass `ctx.cards`; without it the badge never triggers.

## `js/config.js`

```js
FIREBASE_CONFIG          // null = local mode, or the Firebase web config object
APP_NAME                 // 'Study League'
APP_VERSION                // '1.2.0', shown in the top bar and on the login screen
MATCH_QUESTIONS = 10       // training
MATCH_MINUTES = 3          // shown to the child
LEAGUE_QUESTIONS = 15      // league and cup matches
LEAGUE_MINUTES = 5
TIMER_MCQ_SECONDS = 30
TIMER_INPUT_SECONDS = 45
GOAL_EVERY_N_CORRECT = 2   // training only; league and cup matches use DIVISIONS[].goalEvery / CUPS[].goalEvery
OPPONENTS_PER_SEASON = 7
SEASON_MATCHDAYS = 14      // OPPONENTS_PER_SEASON * 2: home and away
PACKS = { small: { cost: 75, size: 1 }, big: { cost: 150, size: 3 } }
PACK_COST = 150   // = PACKS.big.cost (also the free pack)
PACK_SIZE = 3
FREE_PACK_EVERY_N_LEVELS = 10
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
             answer: string | string[], explain: string, figure?: Figure }
Topic    = { id, name, file, squads: string[], subjectId, subjectName, icon, accents: boolean,
             group?: string, forms?: ('past'|'pp')[], optional?: true }   // from listTopics; accents = the subject shows accent keys
Figure   = { type, ...parameters }   // optional `figure` of a question, see js/ui/figures.js below
```

```js
normalizeAnswer(s) -> string           // NFC, apostrophes unified, spaces collapsed, trimmed, lower case; accents kept
acceptedAnswers(q) -> string[]
displayAnswer(q) -> string             // accepted forms joined with ' / ' (numeric typing variants like '-8,5' / '−8.5' / '4 752' shown once)
checkAnswer(q, given: string|null, { squad = null } = {}) -> boolean   // squad 'u10': "ê" = "e" in typed answers

loadCatalog(fetchJson) -> Promise<{ subjects }>          // fetchJson('data/subjects.json')
listTopics(catalog, squad, subjectId?, active?) -> Topic[]   // squad 'u13'|'u10'; subjectId optional filter; adds subjectId, subjectName, icon, accents (from the subject)
listSubjects(catalog, squad, active?) -> [{ id, name, icon, topics: Topic[] }]   // only subjects with topics for the squad
listOptionalTopics(catalog, squad) -> [{ id, name, icon, topics: Topic[] }]     // optional topics of the squad (on or off), by subject; nothing for u10
allTopics(catalog) -> Topic[]                            // every topic, no squad or optional filter
findTopic(catalog, id) -> Topic | null                   // any topic by id (names of played topics)
isActivated(active, topicId) -> boolean                  // active = state.optionalTopics; true for a positive number
topicAvailable(topic, active) -> boolean                 // compulsory, or optional and activated

expandVerbs(file, topicId?, forms = ['past']) -> Question[]   // 2 per verb about the past simple: <topic>-<verb>-past (input), -form (mcq); correction "base → past".
                                                      // forms containing 'pp' adds <topic>-<verb>-pp (input, "I have ___ . (to go)") and the correction becomes "base → past → pp".
                                                      // The mcq never offers a participle-only form.
questionsFromFile(file, topicId?, forms?) -> Question[]  // handles standard and "kind":"verbs" files; forms only matters for verbs files
loadTopicQuestions(fetchJson, topic: Topic) -> Promise<Question[]>   // fetchJson(topic.file); passes topic.forms

pickQuestions(pool: Question[], { n = MATCH_QUESTIONS, history = {}, division = null, rng }) -> Question[]
LEVEL_WEIGHTS   // per division index, weights for level 1/2/3
```
- `active` is `state.optionalTopics`: `listTopics` and `listSubjects` leave out optional topics that are not activated in it (all of them when omitted).
- `fetchJson(path) -> Promise<object>` is yours to provide (e.g. `(p) => fetch(p).then((r) => r.json())`). Cache loaded pools in the view layer if wanted.
- `pickQuestions` takes the pool of **one topic**, `history = state.questions`, `division` = the league division index (0..4) or `null` for training (flat level mix). Returns copies in play order, mcq `choices` shuffled. Fewer than `n` are returned only if the pool is smaller. `n` defaults to `MATCH_QUESTIONS`; the flow passes `LEAGUE_QUESTIONS` for league and cup matches.
- A question may carry `figure`; the engine passes it through untouched (`questionsFromFile`) and never reads it. `level` is also shown to the child as one to three stars on the question card.
- `checkAnswer` for an mcq compares the chosen string with `answer`; for input, the typed text with any accepted form.
- Topic `group` (a section name of a subject, from the catalog) is unrelated to the `group` of a question (the questions of one verb, never both picked in a match while others remain).

`js/ui/shell-utils.js`
```js
groupTopics(topics: Topic[]) -> [{ group: string|null, topics: Topic[] }]   // by topic.group, in order of first appearance; topics without a group last, with group null
```

## `js/core/match.js`

```js
PRACTICE_OPPONENT = { id: 'practice', name: "Équipe d'entraînement", strength: 0.5 }

createMatch({ mode = 'league', questions, opponent = null, topicId, subjectId = null, division = 0,
              goalEvery = GOAL_EVERY_N_CORRECT, coachPick = false, squad = null, concedeAll = false,
              cupId = null, rng, now }) -> match
currentQuestion(match) -> Question | null          // null once finished
currentMinute(match) -> number                     // 9, 18, ... 90 (10 questions) or 6, 12, ... 90 (15)
currentTimeLimitMs(match) -> number | null         // null in training
answerQuestion(match, given: string|null, elapsedMs) -> AnswerFeedback
timeoutQuestion(match) -> AnswerFeedback           // = answerQuestion(match, null, limit)
summarizeMatch(match, now) -> MatchResult          // match must be finished
timeLimitSeconds(question) -> 30 | 45
speedBonus(ms, question) -> 0..5
minuteOf(index, total) -> number
outcomeOf(goalsFor, goalsAgainst) -> 'W'|'D'|'L'
```
- `mode`: `'league'` or `'cup'` (timed, opponent required) or `'training'` (untimed, opponent ignored/neutral).
- `opponent`: `{ id, name, strength }`; take it from `nextFixture(season)`: `{ id: f.opponent.id, name: f.opponent.name, strength: f.strength }`, or from the cup record (`state.cups[id].opponents[round]`).
- `goalEvery`: correct answers per goal (the attack meter has that many segments): `goalEveryOf(division)` for the league, `cup.goalEvery` for a cup. Floored at 1.
- `concedeAll: true` (set by `cup.concedeAll`): every wrong answer or timeout is a goal against, no random draw. Otherwise a wrong answer concedes with probability = opponent strength.
- `squad`: `'u10'` | `'u13'`, passed to `checkAnswer`. `cupId`: the cup being played (mode `'cup'`); `summarizeMatch` returns it as `cupId`.
- `coachPick: true` if the topic chosen is the coach's pick (+50 % coins).
- The match object is **mutable** and holds the rng; do not store it in the player state. Useful fields: `index` (next question), `questions`, `correct`, `goalsFor`, `goalsAgainst`, `goalEvery`, `concedeAll`, `finished`, `opponent`, `timed` (false only in training).
- Pass `given = null` when the timer expires (or call `timeoutQuestion`).

```js
AnswerFeedback = {
  correct: boolean, timedOut: boolean,
  correctAnswer: string,          // display form
  explanation: string,
  speedBonus: 0..5,               // 0 if wrong
  goalFor: boolean,               // this answer scored (every goalEvery-th correct answer)
  goalAgainst: boolean,           // wrong answer and the opponent scored
  attack: { charge: 0..goalEvery-1, max: goalEvery },   // meter AFTER this answer; 0 right after a goal
  score: { for: number, against: number },
  minute: number,                 // minute of the question just answered
  finished: boolean
}

MatchResult = {
  mode, topicId, subjectId, division, coachPick, cupId?,           // cupId only for mode 'cup'
  opponent: { id, name, strength },
  goalsFor, goalsAgainst, outcome: 'W'|'D'|'L',
  correct, total, accuracy (0..1), perfect, cleanSheet,
  speedBonus (sum), durationMs (sum of answer times), playedAt: now,
  answers: [{ id, topicId, correct, timedOut, given, ms, speedBonus, minute, goalFor, goalAgainst, prompt, answer }]
}
```

## `js/core/league.js`

```js
DIVISIONS = [ {index:0,id:'district',name:'District',strength:[0.35,0.5],goalEvery:2}, {1,'regional','Régional',[0.45,0.6],3},
              {2,'national','National',[0.55,0.7],3}, {3,'ligue2','Ligue 2',[0.65,0.8],4}, {4,'ligue1','Ligue 1',[0.75,0.9],5} ]
TOP_DIVISION = 4; OPPONENTS_PER_SEASON = 7 and SEASON_MATCHDAYS = 14 (both in config.js); PROMOTION_PLACES = 2; PLAYER_CLUB_ID = 'me'
divisionName(index) -> string
goalEveryOf(index) -> 2|3|4|5          // correct answers per goal in a division (index clamped to 0..4)
goalScale(index) -> number              // most goals in a league match: floor(LEAGUE_QUESTIONS / goalEvery) = 7, 5, 5, 3, 3

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
simulateScore(strengthHome, strengthAway, rng, maxGoals = 5) -> [homeGoals, awayGoals]   // chances per side = round(6 * maxGoals / 5); playMatchday passes goalScale(season.division)

Club      = { id, name, short, colors: [c1,c2], crest, strength: number|null, isPlayer }   // player club id is 'me'
Fixture   = { md (0-based), home: clubId, away: clubId, hg: number|null, ag: number|null }
Season    = { number, division, clubs: Club[8], fixtures: Fixture[56] (flat, double round-robin: home and away), matchday: 0..14 }
TableRow  = { clubId, name, short, colors, crest, isPlayer, played, won, drawn, lost, gf, ga, gd, pts, position }
SeasonEnd = { number, division, position, points, gf, ga, champion, promoted, nextDivision, table: TableRow[] }
```
A season lasts `seasonLength(season)` matchdays, read from its own fixtures (a season saved with another length keeps it). `clubs` is the array inside `data/clubs.json` (`clubsData.clubs`). Table sort: points, goal difference, goals for, then name. Positions 1-2 promoted (not in the top division), position 1 = champion, no relegation. You normally never call `playMatchday` or `startNextSeason` yourself: `applyResult` does.

## `js/core/rewards.js`

```js
xpToReach(level) -> number                 // total XP to reach `level`: 0, 100, 250, 450, 700, ...
levelForXp(xp) -> level (>= 1)
levelInfo(xp) -> { level, xp, levelStart, nextLevelAt, progress: 0..1 }
matchXp(result) -> { base, speed, outcome, total }          // 10/correct, speed sum, 50/20/10; training halves total
matchCoins(result) -> { base, perfect, coachPick, total }   // 30/15/5, +10 perfect, x1.5 coach pick; training: 0; a league or cup defeat with fewer than a third of the questions right (minCorrectForLossCoins(total)): 0
PACK_ODDS = { small: { common: 0.7, rare: 0.24, epic: 0.06, legend: 0 }, big: { common: 0.55, rare: 0.28, epic: 0.13, legend: 0.04 } }
RARITY_ODDS = PACK_ODDS.big
RARITIES = ['common','rare','epic','legend']
isPlayerCard(card) -> boolean                // no `kind`, or kind 'player'
openPack(cards, rng, collection = {}, size = PACK_SIZE, odds = RARITY_ODDS) -> [{ card, isNew }]   // draws player cards only
pickCupCard(cards, rng, collection, kind: 'nation'|'club', { final = false } = {}) -> { card, isNew } | null
BADGES -> [{ id, name, desc, icon, check(state, env) }]      // 29, names and descriptions in French
badgeById(id) -> badge | null
badgeInfo(badge) -> { id, name, desc, icon }
evaluateBadges(state, env = {}) -> badge[]                  // earned now and not yet in state.badges
```
- `cards` = `cardsData.cards` (the whole file: `kind` is absent or `'player'` for a player, `'nation'`, `'club'`). `collection` = `state.cards`. `isNew` is false for a second copy inside the same pack.
- `pickCupCard`: a card of `kind` the player does not own; a duplicate (`isNew: false`) only when the kind is complete; `final: true` restricts the draw to the highest rarity still missing (of the whole kind once complete). `null` when the file has no card of that kind.
- `env = { catalog, totalCards }`. `catalog` (from `loadCatalog`) is needed for "Maître de la matière", which looks at compulsory topics only (an optional topic never blocks nor grants it). `totalCards` is the size of the whole deck, players + nations + clubs; "Album complet" needs it.
- Badge ids: `first-match first-win streak-3 streak-5 streak-10 hat-trick clean-sheet perfect matches-10 matches-50 matches-100 promotion title topic-master subject-master day-streak-3 day-streak-7 cards-10 cards-36 cards-100 cards-all first-legend correct-100 correct-500 correct-1000`, then one per cup, `cup-<cupId>` ("Vainqueur : <cup name>", earned with `state.cups[id].trophies >= 1`).
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
SCHEMA_VERSION = 2
DEMOTION_DIVISIONS = 2
newPlayerState({ username, displayName, role = 'player', squad = 'u13', club = '', colors = ['#1e40af','#fbbf24'],
                 clubs = null, rng = null, now }) -> state
ensureSeason(state, clubs, rng) -> state        // creates season 1 if league.season is null
setOptionalTopic(state, topicId, on, now) -> state   // on: stores `now` under optionalTopics[topicId] (switching on again updates it); off: removes the key. Coach state unchanged
migrateState(raw) -> state | null               // fills defaults, upgrades old schema (1 -> 2 sets pendingDemotion: 2), keeps only positive-number optionalTopics entries, deletes `difficulty` and `packs`; the stores call it on load
applyDemotion(state, clubs, rng) -> state       // no-op without state.pendingDemotion; else removes it and, when the season is above District, starts a new season (same number, matchday 0) that many divisions lower (floor 0), clears pendingMatch. History, totals, cards, xp, coins untouched. Caller saves (main.js restoreSession)
applyResult(state, result, ctx) -> { state, events }
startPendingMatch(state, { mode = 'league', cupId = null, opponent, topicId, subjectId = null, division = 0,
                           total = LEAGUE_QUESTIONS, goalEvery = null, now }) -> state   // kick-off marker, see state.pendingMatch
clearPendingMatch(state) -> state                // leaving before the first answer costs nothing
forfeitResult(pending, now) -> result            // 0-3, every question unanswered, no per-question history; mode 'cup' (with cupId) when the marker is a cup one
applyPendingForfeit(state, ctx) -> { state, events, result } | null   // settles a marker through applyResult (a cup forfeit eliminates the player); null without marker
buyPack(state, ctx, kind = 'big') -> { state, cards: [{card, isNew}], events }  // 'big' = 150 coins, 3 cards; 'small' = 75 coins, 1 card, no legend; throws Error if short or unknown kind
openFreePack(state, ctx) -> { state, cards: [{card, isNew}], events }  // uses state.freePacks; throws if none
```
- None of these mutates its input; use the returned `state`, then `await store.saveState(state)`.
- `clubs` = `clubsData.clubs`, `squad` is `'u13'` or `'u10'`, `colors` = `[primary, secondary]`. Pass `clubs` and `rng` to get the first season immediately.
- `ctx = { now, rng, clubs, cards, catalog }`. `clubs` is required for league results (new seasons) and to draw cup opponents, `cards` for packs, for the card won in a cup and for the deck size of the album badge, `catalog` optional (needed to award "Maître de la matière").
- A coach state is `{ schema, role: 'coach', username, createdAt, lastActive, profile: { displayName, club: '', colors, squad: null } }`.

### Player state (JSON, stored as is, no nested arrays)

```js
{
  schema: 2, role: 'player', username, createdAt, lastActive,           // ms timestamps
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
  activity:  { ['YYYY-MM-DD']: { matches, xp, answered, correct, ms } },  // last 60 days
  pendingMatch: null | { mode:'league'|'cup', opponent: {id, name, strength}, topicId, subjectId, division, total, startedAt,
                         goalEvery?, cupId? },   // a marker without goalEvery is an older league marker
  cups:      { [cupId]: { edition, round, status: 'active'|'out'|'won', endedDay: 'YYYY-MM-DD'|null, trophies,
                          opponents: [{ id, name, short, colors, crest, strength }] (one per round) } },
  optionalTopics: { [topicId]: ms of the last activation },   // top level on purpose: firestore.rules only restricts `profile`
  eventSeen?: { [eventId]: 'YYYY-MM-DD' },     // day the event pop-up was shown (top level, set by markEventAnnounced)
  pendingDemotion?: 2,                         // one-off demotion marker (schema 1 -> 2), removed by applyDemotion
  pendingReveal?: { kind, ids: cardId[], fresh: boolean[] } | null   // pack opening to resume (cards view)
}
MatchRecord = { at, mode: 'league'|'cup'|'training', topicId, subjectId, opponent: name, division, goalsFor, goalsAgainst,
                outcome, correct, total, xp, coins, cup?: cupId }
```
`p` and `a` on a question are only set once it has been answered wrong (for the coach's most-missed list). Trophies: `league.history.filter((h) => h.champion)`; cup trophies: `state.cups[id].trophies`. An event match has `topicId: 'event:<id>'` (see `eventOfTopicId`) while its `questions` entries keep the real topic ids.

### Events returned by `applyResult` (in this order; no text, the view writes the French labels)

```js
{ type: 'xp', base, speed, outcome, total }
{ type: 'coins', base, perfect, coachPick, total }                 // league and cup; coachPick = bonus part
{ type: 'mastery', topicId, from, to }                             // a topic gained stars
{ type: 'level-up', from, to }
{ type: 'free-pack', reason: 'level', level }                      // one per multiple of 10 crossed
{ type: 'streak', days }                                           // first match of a new day
{ type: 'matchday', matchday, results: Fixture[], position, table: TableRow[] }   // league only
{ type: 'free-pack', reason: 'promotion' | 'title' }               // at season end
{ type: 'season-end', summary: SeasonEnd, nextDivision, promoted, champion }       // league only; new season already in state
{ type: 'cup', cupId, cupName, edition, round, roundName, rounds, qualified, shootout, eliminated, finalWon,
  card: { card, isNew } | null, coins }                              // cup only; card = the nation/club card won by a qualification, coins = final bonus (0 otherwise)
{ type: 'free-pack', reason: 'cup' }                               // cup final won, right after the cup event
{ type: 'badge', badge: { id, name, desc, icon } }
```
(`free-pack` events for promotion and title come just before `season-end`.) `buyPack` / `openFreePack` return only `badge` events. A cup result for a cup that is locked or whose edition ended today is recorded as a plain match: no `cup` event.

## `js/core/cups.js`

Four knock-out cups played next to the league (match mode `'cup'`, `state.cups`). Pure: nothing mutates its inputs.

```js
CUPS = [ { id, name, icon, unlock: { division } | { world: true }, unlockText, rounds: string[] (last = final), goalEvery,
           concedeAll, opponents: 'clubs'|'nations', cardKind: 'club'|'nation', strength: [first round, final], finalCoins } ]
//  league-cup         'Coupe de la Ligue'     division >= 2  3 rounds  goalEvery 3  clubs    club    strength 0.55-0.70  final 20 coins
//  europe-cup         "Coupe d'Europe"       division >= 3  4 rounds  goalEvery 4  nations  nation  strength 0.65-0.80  final 30
//  champions-league   'Ligue des champions'   division >= 4  4 rounds  goalEvery 5  clubs    club    strength 0.75-0.90  final 40
//  world-cup          'Coupe du monde'        a Ligue 1 title or a Ligue des champions won  4 rounds  goalEvery 5  concedeAll  nations  nation  0.75-0.90  final 60
cupById(id) -> cup | null
nationPool(cards, need) -> opponent[]       // names of the nation cards, completed by a built-in list when fewer than `need`
cupOpponents(cup, edition, seed, { clubs, cards, clubName }) -> [{ id, name, short, colors, crest, strength }]   // one per round, strength rising; deterministic for (seed, cup, edition); the player's club is never drawn
isCupUnlocked(state, cup) -> boolean        // current league division >= cup.unlock.division; world cup: a title in division 4 in league.history, or cups['champions-league'].trophies > 0
cupPlan(state, cup, now, data = null) -> { cup, status: 'locked'|'ready'|'waiting', edition, round, roundName, isFinal, trophies, opponent, record }
cupPlans(state, now, data = null) -> plan[]   // the four, in display order
ensureCupEdition(state, cup, now, { clubs, cards }) -> state   // unchanged when an edition is active; else a new edition (round 0, opponents drawn). Throws when locked or the last edition ended today
cupOutcome(result) -> { qualified, shootout }                  // a draw is a shoot-out: qualified when correct > total - correct
advanceCup(cup, record, result, now) -> { record, qualified, shootout, round, roundName, finalWon, eliminated }
NEXT_EDITION_TEXT = 'Nouvelle édition demain'
```
- `'ready'`: a match can be played. With no active edition it is round 0 of edition `n + 1`, once the previous one ended on an earlier local day (`dayKey`). `'waiting'`: the edition ended today (lost or won), the next one opens tomorrow.
- `applyResult` with `result.mode === 'cup'` starts the edition if needed, advances the record, gives the card (`pickCupCard(cards, rng, state.cards, cup.cardKind, { final })`) on a qualification, and on a won final adds `finalCoins`, one free pack and the trophy (`state.cups[id].trophies`, badge `cup-<id>`).

## `js/core/events.js`

Time-limited events: a window of local days during which a squad's matches draw a mixed set of subjects. Pure: `now` is a parameter.

```js
EVENTS = [ { id: 'u13-ece-2026-11', name: 'U13 ECE Event', squad: 'u13', subjects: ['hg', 'en', 'svt'], start: '2026-11-23', end: '2026-12-02' } ]   // start and end inclusive, local days
EVENT_TOPIC_PREFIX = 'event:'; EVENT_SUBJECT_ID = 'event'
activeEvent(squad, now) -> event | null           // null for u10 and outside the window
isEventTopicId(id) -> boolean; eventOfTopicId(id) -> event | null
eventTopic(event) -> { id: 'event:<id>', name, subjectId: 'event', subjectName, icon, accents: false, event }   // stands for the event in the match flow
eventTopics(catalog, squad, event, active) -> Topic[]   // topics of the squad in the event subjects, optional ones only when activated in `active` (state.optionalTopics)
eventShares(order, n) -> { [subjectId]: count }          // equal shares, remainder to the first ids of `order` (15 over 3: 5/5/5; 10 over 3: 4/3/3)
pickEventQuestions(event, poolsBySubject, { n, history, division, rng }) -> Question[]   // each subject's share through pickQuestions, a short subject is topped up from the others, shuffled
trainingOptions(squad, now) -> { event, modes: ['classic'] | ['event', 'classic'] }
shouldAnnounceEvent(state, event, now) -> boolean         // state.eventSeen[event.id] !== today
eventToAnnounce(state, squad, now) -> event | null        // active and not announced today
markEventAnnounced(state, event, now) -> state            // eventSeen[event.id] = today (top level of the state)
```
- `ui/flow.js` `prepareMatch` builds the event mix for league, cup and training when the topic is `eventTopic(event)`: every question is tagged `tag` (`"<subject> · <topic>"`, shown on the question card) and `accents` (accent keys follow the question's subject). The coach's pick is suspended during an event.
- The pop-up is shown by the home screen (once per local day) and, as a fallback, before any match (league, cup, event training, classic training) when it was not shown that day.

## `js/ui/figures.js`

A question's `figure` is data only (never SVG or HTML); the module turns it into an SVG string. No DOM.

```js
FIGURE_TYPES -> ['numberline','plane','secant','triangle','quad','symmetry','bar','line','pie','solid']
validateFigure(spec) -> string[]     // problems, [] when valid; never throws
renderFigure(spec) -> string         // '' for an unknown or invalid spec; otherwise <svg class="fg" viewBox="0 0 320 H" role="img">, H <= 200
fmt(v) -> string                     // number as French text: decimal comma, real minus sign
```
`{ "type": "...", ...parameters }`. Maths coordinates (y up) unless said otherwise. Text labels: plain strings, 24 characters at most (escaped by the renderer); vertex and point names 3 characters at most. `hl` (1..6) picks a highlight colour: 1 gold, 2 blue, 3 green, 4 pink, 5 violet, 6 orange.

| type | parameters |
|---|---|
| `numberline` | `{ min, max, step, labelEvery?=1, labels?: [values], points?: [{ x, name?, label?: true, hl? }] }`. Graduations every `step` from `min` to `max` (whole number of steps, at most 40); numbers under every `labelEvery`-th graduation, or only under the values in `labels`; a point is a dot with its name above and, with `label: true`, its abscissa below. |
| `plane` | `{ xmin, xmax, ymin, ymax, labelEvery?, points?: [{ name, x, y, label?: true, pos?: 'n\|s\|e\|w\|ne\|nw\|se\|sw', hl? }], lines?: [[nameA, nameB]], polygon?: [names] }`. Whole numbers, `xmin <= 0 <= xmax`, same for y, orthonormal grid. Numbers are on the lower and left edges of the grid. |
| `secant` | `{ angle: 35..145, tilt?: 0..12, parallelMarks?: bool, lines?: true, marks?: [{ at: 'P ne', text, hl? }] }`. Two lines (d) and (d') cut by a secant (s) at P (upper line) and Q (lower line). `angle` is the angle between the first line and the secant (north-east at P). `at` = P or Q + quadrant `ne\|nw\|se\|sw`. `tilt`: rotates the lower line so it is not parallel. |
| `triangle` | `{ vertices: [[x,y] x3], names?: [3], angles?: [3 of null\|''\|text], sides?: [3 of null\|text], ticks?: [3 of 0..3], rightAt?: [vertex indexes], height?: { from, to?, label?, foot? }, fill?: false }`. `sides[i]` and `ticks[i]` belong to the edge from vertex i to vertex i+1. Angles: null = nothing, '' = arc only. `height`: dashed altitude from vertex `from` to the line of edge `to` (default: the opposite edge). |
| `quad` | Same as `triangle` with 4 vertices, plus `par?: [[edge, edge], ..]` (each group gets 1, 2, ... chevrons: parallel sides), `diagonals?: bool`, `center?: name`, `diagTicks?: [n, n]` (equal marks on the halves of AC and BD), `diagRight?: bool`, `diagLabels?: [2 of null\|text]`. For a quad, the default `height.to` is the edge two places on. |
| `symmetry` | `{ mode: 'axial'\|'central', cols, rows, shape: [[x,y]..], names?: [..], image?: bool, imageNames?: [..], axis?: { p: [x,y], q: [x,y], name? }, center?: { p: [x,y], name? }, points?: [{ p: [x,y], name }] }`. Square grid of `cols` x `rows` cells (3..14 by 3..9), nodes (0..cols, 0..rows); the image is computed by the renderer. |
| `bar` | `{ cats: [text], values: [n >= 0], ymax, ystep, xTitle?, yTitle?, show?: 'all'\|[indexes], highlight?: [indexes] }`. 2 to 8 categories. |
| `line` | `{ x: { min, max, step, title? } \| { cats: [text], title? }, y: { min, max, step, title? }, series: [{ pts: [[x,y]..], join?: true, dots?: true, labels?: 'all'\|[indexes], hl? }], guides?: [[x,y]..] }`. 1 to 3 series. A proportionality graph is a series through (0 ; 0). With `cats`, x = 0..n-1 is the category index. |
| `pie` | `{ parts: [{ v > 0, name?, text? }] }` (2 to 7 parts). Sectors start at the top and go clockwise; `text` (a percentage, '?') is written inside the sector, `name` outside. |
| `solid` | `{ kind: 'block', l, w, h, labels?: { l?, w?, h? }, names?: [8], hidden?: true }`: cavalier perspective, `l` = front width, `w` = depth, `h` = height (numbers > 0 that only set the proportions); names A..D bottom (front-left, front-right, back-right, back-left), E..H top above them. Or `{ kind: 'cubes', heights: [[n..]..] }`: stack of unit cubes, `heights[row][col]` in 0..5, row 0 = front row; a column behind a taller one is refused. |

`tests/content.test.js` runs `validateFigure` on every `figure` of `data/`; `tests/figures.test.js` covers rendering, escaping and the question card.

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
import { nextFixture, goalEveryOf } from '../core/league.js';
import { weakestTopic } from '../core/stats.js';
import { LEAGUE_QUESTIONS } from '../config.js';
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
const questions = pickQuestions(pool, { n: LEAGUE_QUESTIONS, history: state.questions, division: season.division, rng });
const match = createMatch({
  mode: 'league', questions, topicId: topic.id, subjectId: topic.subjectId, division: season.division,
  goalEvery: goalEveryOf(season.division), squad: state.profile.squad,
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

// Training: same, with mode: 'training', division: null in pickQuestions (default n = MATCH_QUESTIONS), no opponent, no coachPick.
// Cup: mode: 'cup', cupId, goalEvery and concedeAll from the cup, opponent from state.cups[cupId].opponents[round] (ensureCupEdition first).
// In the app, ui/flow.js prepareMatch / finishMatch do all of this, including the kick-off marker (startPendingMatch).
// Packs: buyPack(state, { now, rng, cards: cardsData.cards, catalog }) then saveState(out.state).
```
