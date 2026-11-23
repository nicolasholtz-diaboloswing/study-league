# UI kit — how to use it

Look: night match at the stadium. Deep navy, pitch green, floodlight glow, gold for rewards. Display font **Barlow Condensed** (scoreboard feel, always uppercase on headings), text font **Inter**. All visible text is French; code, class names and this file are English.

Open `gallery.html` (through a local server) to see everything. Test hooks: `gallery.html?fx=goal|scene|against|pack|modal`, `?t=1.2` freezes the goal scenes at 1.2 s.

## Conventions

- **Components** (`js/ui/components.js`) are pure functions returning **HTML strings**. Escape is done inside; pass raw text. Interaction is by data attributes: you attach the listeners (event delegation on `#view`).
- **Art** (`js/ui/art.js`) returns SVG/HTML strings. **Effects** (`js/ui/effects.js`) touch the DOM and return Promises.
- Club objects look like `{ name, short, colors:[c1,c2], crest }` (see `data/clubs.json`). Card objects (see `data/cards.json`) come in three kinds, told apart by `kind` (`A.cardKind(c)`: absent = `'player'`): player `{ id, name, pos, nation, flag, rating, rarity, era }`, nation `{ id, kind:'nation', name, nation, rarity }`, club `{ id, kind:'club', name, short, colors, crest, country, rarity }`.
- The only impure helpers in components.js: `showModal`, `closeModal`, `showToast`, `updateTimer`.
- Everything respects `prefers-reduced-motion`. Primary touch targets are at least 48–52 px.

```js
import * as C from './ui/components.js';
import * as A from './ui/art.js';
import * as E from './ui/effects.js';
document.getElementById('view').innerHTML = `<div class="page">${C.pageHead('Accueil')}</div>`;
```

## Page shell (`index.html`)

| id | purpose |
|---|---|
| `#top-crest` | put `A.crest(club, 38)` |
| `#top-club` | club name text |
| `#top-version` | `v` + `APP_VERSION` (`js/config.js`), set by `main.js`; the login screen shows the same text in `.login__version` |
| `#top-level` | put `C.xpBar({level, xp, next, compact:true})` |
| `#top-coins-n` | coin count text |
| `#nav` links `a.nav__link[data-route]` | set `aria-current="page"` on the active one |
| `#view` | mount point of every view |
| `#overlay`, `#modal-root`, `#toasts` | layers used by effects, modal and toast |

`document.body.classList`: `no-shell` hides top bar and nav (login), `in-match` hides the nav only. Per-screen styles live in `css/views.css`, `css/views-meta.css` and `css/cups-events.css` (cups, event banner and pop-up, switch rows).

## Layout classes

| class | use |
|---|---|
| `.page` / `.page--narrow` | view container (max 1080 / 560 px), vertical gap |
| `.section`, `.section__head`, `.section__title` | titled block; or use `C.section()` |
| `.stack`, `.stack--sm`, `.stack--lg` | vertical gaps |
| `.row`, `.row--wrap`, `.row--between`, `.row--center` | horizontal flex; `.grow` fills the space |
| `.grid` + `.grid--2` / `--3` / `--4` / `--auto` / `--cards` | grids (`--3` = tiles 150 px, `--cards` = player cards, `--4` = 2 cols phone, 4 cols tablet) |
| `.grid--split` | 1 col on phone, 60/40 from 900 px; `.grid--split-even` added = 50/50 |
| `.panel`, `.panel--gold`, `.panel--pitch`, `.panel--flush` | surface |
| `.text-dim` `.text-faint` `.text-gold` `.text-ok` `.text-bad` `.text-center` `.text-sm` | text helpers |
| `.display`, `.num` | scoreboard font; `.num` = tabular digits |
| `.hide-sm` | hidden under 480 px |
| `.sr-only` | screen-reader only |

## Tokens (`css/tokens.css`)

Colours: `--bg-0..4` (navy), `--pitch`, `--pitch-bright`, `--pitch-deep`, `--gold`, `--gold-bright`, `--gold-deep`, `--flood`, `--ink` / `--ink-dim` / `--ink-faint`, `--ok`, `--bad`, `--info`, `--warn`, `--r-common|rare|epic|legend`, `--line`, `--line-strong`.
Type: `--font-display`, `--font-text`, `--fs-xs..3xl`. Space: `--sp-1..7`, `--gutter`. Shape: `--radius-sm|radius|radius-lg`, `--tap`. Depth: `--shadow-1|2`, `--glow-gold`, `--glow-pitch`. Layout: `--topbar-h`, `--tabbar-h`, `--sidenav-w`, `--page-max`.

## Components (`js/ui/components.js`)

| Function | Parameters | Example |
|---|---|---|
| `button(o)` | `{label, variant:'primary'\|'gold'\|'secondary'\|'ghost'\|'danger', size:'sm'\|'md'\|'lg', href, block, disabled, icon, id, type, cls, attrs:{}}` (`href` gives an `<a>`) | `button({label:'Jouer', size:'lg', block:true, attrs:{'data-action':'play'}})` |
| `pill(text, tone)` | tone `neutral\|gold\|ok\|bad\|info` | `pill('Nouveau','gold')` |
| `coins(n)` | number | `coins(120)` |
| `tabs(items, active, {scroll, attrs})` | items `[{id,label}]`; buttons carry `data-tab` | `tabs([{id:'xp',label:'XP'}],'xp')` |
| `section(title, bodyHtml, {link:{href,label}, cls})` | | `section('Classement', table)` |
| `pageHead(title, {kicker, sub})` | | `pageHead('Cartes',{kicker:'Ma collection'})` |
| `panel(html, {tone, cls})` | tone `gold\|pitch` | `panel('<p>…</p>')` |
| `stars(value, {max, size})` | 0–3 | `stars(2)` |
| `xpBar({level, xp, next, compact})` | xp = XP inside the level, next = XP needed for it | `xpBar({level:7,xp:140,next:260})` |
| `scoreboard({home, away, homeScore, awayScore, minute, status, goalSide})` | clubs are objects; `data-score="home\|away"` and `data-minute` for live updates; `goalSide` pops the digit | `scoreboard({home, away, homeScore:1, awayScore:0, minute:27})` |
| `attackMeter(step, {live, n})` | `n` segments (correct answers per goal of the match, default `GOAL_EVERY_N_CORRECT`), step 0..n; n = BUT lit. `live: true` replaces the « Attaque » label by the countdown « Encore 2 bonnes réponses pour marquer » (texts from `js/ui/rules.js`) | `attackMeter(1, { live: true, n: 3 })` |
| `questionCard(q)` | `{number,total,prompt,type:'mcq'\|'input',choices,status:'idle'\|'correct'\|'wrong'\|'timeout',selected,correctAnswer,explanation,inputValue,placeholder,topic,timer,note,level,figure}` — `note` is a short line under the verdict; `topic` is the label in the header (the topic name, or « Matière · thème » for a question of an event mix); `level` (1..3) shows one to three stars (`.qcard__level`, `aria-label` « Difficulté n sur 3 »), none when omitted; `figure` (a spec of `js/ui/figures.js`) is drawn in `.qcard__figure` between the header and the prompt, before and after the answer, and an invalid spec draws nothing; mcq buttons: `[data-choice=index]`; input: `form[data-answer-form]` with `input[name=answer]`; after an answer everything is disabled and feedback + explanation appear | `questionCard({number:1,total:10,type:'mcq',prompt:'…',choices:[…]})` |
| `timer({remaining,total,variant:'ring'\|'bar'})` | goes in `questionCard({timer})`; update with `updateTimer(el, remaining, total)` (urgent red under 25 %) | `timer({remaining:30,total:30})` |
| `leagueTable({rows,promotionSpots,compact})` | row `{pos,club,played,won,drawn,lost,gf,ga,pts,isYou}`; promotion zone marked on the first rows | `leagueTable({rows})` |
| `fixtureRow({matchday,home,away,homeScore,awayScore,status:'upcoming'\|'next'\|'played',result:'W'\|'D'\|'L',youSide,href})` | | `fixtureRow({matchday:3,home,away,status:'next',youSide:'home'})` |
| `topicTile({name,icon,stars,meta,coachPick,href,locked,attrs})` | `coachPick` adds the ribbon "Choix du coach" and gold glow; without `href` it is a `<button>` | `topicTile({name:'Passé simple',stars:2,coachPick:true,attrs:{'data-topic':id}})` |
| `masteryBar({label,pct,stars,meta})` | colour follows pct (<50 red, 50 blue, 70 green, 90 gold) | `masteryBar({label:'Grammaire',pct:72,stars:2})` |
| `badgeMedal({icon,name,desc,unlocked,tier:'gold'\|'silver'\|'bronze'})` | locked = grey with padlock | `badgeMedal({icon:'🏆',name:'Première victoire',unlocked:true})` |
| `leaderboardRow({rank,name,club,value,label,isYou,href})` | ranks 1–3 get gold/silver/bronze podium style | `leaderboardRow({rank:1,name:'Max',club,value:'2 340',label:'XP'})` |
| `h2h({me:{name,club},rival:{name,club},rows:[{label,me,rival,higherIsBetter,format}]})` | better side is gold; bars are proportional | `h2h({me,rival,rows:[{label:'Victoires',me:14,rival:11}]})` |
| `statTile({label,value,sub,icon,tone})` | tone `default\|gold\|ok\|bad` | `statTile({label:'Matchs',value:24})` |
| `barChart({data:[{label,value,highlight}],height,unit})` | | `barChart({data,height:110,unit:'matchs'})` |
| `modal({title,body,actions:[buttonHtml],id})` + `showModal(html)` / `closeModal()` | any element with `data-modal-close` closes it; Esc and the backdrop too | `showModal(modal({title:'Quitter ?',body:'<p>…</p>'}))` |
| `toast({message,tone,icon})` + `showToast(message, tone, {icon, ms})` | tone `info\|ok\|bad\|gold` | `showToast('Nouvelle médaille !','gold',{icon:'🏅'})` |
| `emptyState({icon,title,text,action})` | | `emptyState({title:'Pas de cartes',action:button({label:'Jouer'})})` |
| `rewardBanner({title,text})` | trophy banner (title won, promotion) | `rewardBanner({title:'Montée !'})` |
| `field({label,name,type,value,placeholder,hint,error,required,autocomplete,attrs})` | input id is `f-<name>` | `field({label:'Identifiant',name:'username',required:true})` |
| `selectField({label,name,options:[{value,label}],value,hint})` | | |
| `choiceGroup({label,name,options:[{value,label,desc,icon}],value})` | big radio cards (squad choice) | |
| `toggle({label,desc,meta,name,checked,attrs})` | switch row: title, optional description and small line, and a checkbox with `role="switch"` (`name` and `attrs` go on the input; used for the optional topics of the profile). Rows stacked in one panel get a separator | `toggle({label:'Modals', name:'optional', checked:true, attrs:{'data-optional':'en-modals'}})` |
| `colorPicker({label,name,colors,value})` | radio swatches (kit colours) | |

Division names shown in the UI: District, Régional, National, Ligue 2, Ligue 1.

## Art (`js/ui/art.js`)

| Function | Notes |
|---|---|
| `crest(club, size=64)` | styles by `club.crest`: `shield`, `round`, `diamond`, `stripes`; monogram = `short` |
| `kit(c1, c2, {size, pattern:'plain'\|'hoops'\|'stripes'\|'sash', number})` | shirt |
| `portrait(seed, {size, kit:[c1,c2]})` | generic fictional face, skin/hair/shirt derived from the seed (use the card id) |
| `flag(nation, width=24)` | SVG flag (Windows has no flag emoji); flags and crests are generated, no official logo |
| `card(c, {count, size:'sm'\|'md'\|'lg'\|'fluid'})` | collectible card; rarity frames `common`, `rare`, `epic`, `legend` (gold foil, shine, sparkles); `count>1` shows a ×n badge. `fluid` fills its container (aspect 5:7). Player: portrait, rating, position, and `c.era` (else the nation). Nation (`pcard--nation`): kind label « Pays », large generated flag, name, footer « Sélection ». Club (`pcard--club`): kind label « Club », generated crest, name, footer = the country. Names of nation and club cards may take two lines |
| `cardBack({size})` | face-down card |
| `cardMissing({id,pos,kind}, {size})` | silhouette for a card not yet owned; for a nation or club it shows the kind label and « À gagner en coupe » |
| `cardKind(c)` | `'player'` (also when `kind` is absent), `'nation'` or `'club'` |
| `nationLabel(key)`, `hasNationLabel(key)`, `hasFlag(key)` | French name of a nation key (the keys of the flag table and of the `nation` field of a card); whether a label / a flag drawing exists |
| `trophy(size, {color:'gold'\|'silver'\|'bronze'\|'locked'})`, `football(size)` | |
| `shade(hex, amt)`, `inkOn(bg, pref)`, `rarityLabel(r)`, `esc(s)` | helpers |

## Effects (`js/ui/effects.js`)

| Function | Notes |
|---|---|
| `goalScene({kit:[c1,c2], conceded})` | HTML string of the 2.2 s SVG scene: a player in `kit` runs up, shoots, the ball hits the net, the net ripples. `conceded:true` = mirrored, muted colours, opponent kit. Animation starts when inserted |
| `playGoalScene({kit, conceded})` | shows the scene alone in `#overlay`; use for a goal conceded (quiet) |
| `goalCelebration({text, sub, ms, side:'home'\|'away', kit})` | full-screen "BUT !" (or "Aïe !" for `side:'away'`); with `kit` the goal scene is shown above the text; confetti for our goals; tap to skip |
| `confetti({count, origin:{x,y}, ms, colors})` | canvas burst, skipped under reduced motion |
| `revealPack(container, cards, {auto, onReveal})` | face-down cards; each tap flips the next; epic glows, legend adds confetti; resolves when all are shown |
| `countUp(el, to, {from, ms, format})` | animated number |

## Review rules (measured)

- **Readable text is never under 12 px.** `--fs-xs` is `.8125rem` (13 px). Card text uses `max(12px, Ncqw)`. Only decorative or screen-reader text may be smaller.
- **`--ink-faint` is `#8a9dc8`**: 6:1 on `--bg-2`, 5.1:1 on `--bg-3` (AA for body text). Empty mastery stars use it as their outline.
- **Touch targets are at least 44 px** (`.tabs__tab`, `.btn--sm`, `.section__link`). Primary actions stay at 52 px.
- **`.btn--lg` stays on one line under 420 px** (tighter size and spacing, icon hidden under 380 px). Keep labels short.
- **Names wrap instead of ending in an ellipsis** (league table: two lines, scoreboard, leaderboard rows, mastery labels).
- `.stat__value` is `clamp(1.4rem, 6vw, 2rem)` on phones. Text inputs show a solid `--gold-bright` focus ring. The wrong-answer ✗ is stroked thicker.
- `.swatches` (kit colours) is a 4-column grid.
- `body.in-pack` moves the toast area to the bottom so toasts never cover the pack-opening title (set by the cards view during a reveal).

## Rule texts and match flow

- `js/ui/rules.js`: `ruleFor(n, { concedeAll })` gives `{ line: « 3 bonnes réponses = 1 but », miss, intro, introMiss }` for `n` correct answers per goal (`concedeAll`: « Chaque erreur = un but pour l'adversaire », Coupe du monde); `meterText(filled, n)` is the countdown under the attack meter; `remainingText(filled, n)` the line added to « Bravo ! » when the answer did not score. Every screen takes `n` from the match, the player's division (`goalEveryOf`) or the cup, never from a constant.
- `js/ui/flow.js`: `prepareMatch(ctx, { mode: 'league'|'cup'|'training', topic, coachPick, cupId })` builds the match (15 questions for league and cup, 10 for training; the event mix when `topic` is the event topic), writes the kick-off marker for league and cup, and stores it in `flow.current`; `finishMatch` applies the result once; `settlePendingForfeit` settles a marker left by a reload.
- Match view: the scoreboard status reads « Championnat », the cup name, or « Entraînement ». Leaving a started league or cup match is a forfeit; the confirmation adds « et tu es éliminé de la coupe » for a cup. With a figure on a phone (`.match.has-figure`) the scoreboard shrinks and the attack meter is hidden, to leave room; the verdict scrolls into view above the sticky « Question suivante » button.
- Pre-match screen (`play.js`): subject, topic, then a summary with the number of questions and minutes (15, about 5), the rule line, and for a cup the knock-out reminder. During an event the subject and topic steps are skipped and `.event-banner` shows « 🎓 U13 ECE Event · jusqu'au 2 décembre ».
- Result screen: for a cup, a « Qualifié ! » / « Éliminé » / « Tu gagnes la … ! » headline (with the shoot-out line when the draw went to « tirs au but »), the round, the card won (`.cup-won`, « Nouvelle carte ! » or « Carte en double »), and a reward banner for a won final (medal, free pack, bonus coins). The « À revoir » list shows the prompt and the answer only, no figure.

## League view: cups, events, optional topics

- Championnat screen, « Coupes » section (`.cup` panels, `css/cups-events.css`): one panel per cup. Locked: the unlock text with a padlock. Open: edition, round and opponent, the list of rounds (`.cup__round`, done / current), the goal rule, a « Jouer » / « Jouer le tour » button to `#/play?cup=<id>`, and a trophy count pill. Waiting: « Coupe gagnée ! » or « Éliminé en … », then « Nouvelle édition demain. ».
- Event pop-up (`announceEvent` in `play.js`, `.event-pop`): a modal with the event name, the end date and the subjects mixed; « C'est parti ! » closes it. Home shows it once per local day (after the welcome carousel when there is one); before a match or a training it appears when it was not shown that day. The coach's pick is hidden during an event.
- Training screen: during an event, a first choice between « Entraînement de l'évènement » and « Entraînement classique »; a button « Changer de mode d'entraînement » goes back.
- Profile: « Thèmes en option » (only when the squad has some): one panel per subject, one `toggle` per optional topic. Switching saves immediately and shows a toast.

## Question figures

Drawn by `js/ui/figures.js` as one 320-unit wide SVG (`.fg`, 200 units high at most, text 14 to 16 units so it stays readable on a 360 px phone), coloured through the classes of `css/components.css` which use the tokens (`k1` gold, `k2` blue, `k3` green, `k4` pink, `k5` violet, `k6` orange). Shown on the question card of every match (league, cup, training) when the question has a `figure`; not shown in the result review nor in the parent's most-missed list. Spec of the ten types: `docs/API.md`.

## Cards view and coach view

- Album: a kind row (« Joueurs », « Pays », « Clubs »), then the rarity row with «&nbsp;Mes cartes&nbsp;» (default when the player owns a card). For players only, a position row and a nations row (`tabs--wrap`: it wraps onto several lines instead of scrolling sideways; each tab shows owned/total). Owned cards come first (players by rating, nations and clubs by rarity), 3 columns under 480 px, missing cards (`.album__cell--missing`) at about half height; the empty « Mes cartes » message for nations and clubs says to win cup matches. The progress panel counts the whole file (players, nations, clubs) and shows « Album complet ! » at the total. `.odds` shows the four rarities in their colours next to the buy button; packs hold players only.
- Pack reveal is resumable: the purchase save also stores `state.pendingReveal = { kind: 'buy-small'|'buy-big'|'free' (old saves: 'buy'), ids: [cardId x1..3], fresh: [bool x1..3] }`. The cards view resumes it on mount and sets it to `null` (and saves) when the last card is flipped or the child leaves. Badge toasts are held until the reveal is over.
- Parent dashboard (`coach.js`, shown as « Espace parent »): `.psum` button per child (this week: matches, time, V/N/D, accuracy, weakest theme, last activity; `aria-pressed` marks the selected child), then the detail: 7-day `barChart` with weekday letters (today in gold), themes by subject weakest first (`.coach__todo` = « pas encore joué »; an optional topic is listed only once played or activated), « Thèmes en option » (read-only: topic, subject, « activé le … à … »), most-missed questions, last 20 matches (`.cm`, two lines on phones; an event match shows the event name, mode labels are Entraînement / Championnat / Coupe).
