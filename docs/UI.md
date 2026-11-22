# UI kit — how to use it

Look: night match at the stadium. Deep navy, pitch green, floodlight glow, gold for rewards. Display font **Barlow Condensed** (scoreboard feel, always uppercase on headings), text font **Inter**. All visible text is French; code, class names and this file are English.

Open `gallery.html` (through a local server) to see everything. Test hooks: `gallery.html?fx=goal|scene|against|pack|modal`, `?t=1.2` freezes the goal scenes at 1.2 s.

## Conventions

- **Components** (`js/ui/components.js`) are pure functions returning **HTML strings**. Escape is done inside; pass raw text. Interaction is by data attributes: you attach the listeners (event delegation on `#view`).
- **Art** (`js/ui/art.js`) returns SVG/HTML strings. **Effects** (`js/ui/effects.js`) touch the DOM and return Promises.
- Club objects look like `{ name, short, colors:[c1,c2], crest }` (see `data/clubs.json`). Card objects look like `{ id, name, pos, nation, flag, rating, rarity, era }` (see `data/cards.json`).
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
| `#top-level` | put `C.xpBar({level, xp, next, compact:true})` |
| `#top-coins-n` | coin count text |
| `#nav` links `a.nav__link[data-route]` | set `aria-current="page"` on the active one |
| `#view` | mount point of every view |
| `#overlay`, `#modal-root`, `#toasts` | layers used by effects, modal and toast |

`document.body.classList`: `no-shell` hides top bar and nav (login), `in-match` hides the nav only. Views may add `css/views.css` (already linked, empty).

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
| `attackMeter(step, {live})` | `GOAL_EVERY_N_CORRECT` segments, step 0..N; N = BUT lit. `live: true` replaces the « Attaque » label by the countdown « Encore 2 bonnes réponses pour marquer » (texts from `js/ui/rules.js`) | `attackMeter(1, { live: true })` |
| `questionCard(q)` | `{number,total,prompt,type:'mcq'\|'input',choices,status:'idle'\|'correct'\|'wrong'\|'timeout',selected,correctAnswer,explanation,inputValue,placeholder,topic,timer,note}` — `note` is a short line under the verdict; mcq buttons: `[data-choice=index]`; input: `form[data-answer-form]` with `input[name=answer]`; after an answer everything is disabled and feedback + explanation appear | `questionCard({number:1,total:10,type:'mcq',prompt:'…',choices:[…]})` |
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
| `colorPicker({label,name,colors,value})` | radio swatches (kit colours) | |

Division names shown in the UI: District, Régional, National, Ligue 2, Ligue 1.

## Art (`js/ui/art.js`)

| Function | Notes |
|---|---|
| `crest(club, size=64)` | styles by `club.crest`: `shield`, `round`, `diamond`, `stripes`; monogram = `short` |
| `kit(c1, c2, {size, pattern:'plain'\|'hoops'\|'stripes'\|'sash', number})` | shirt |
| `portrait(seed, {size, kit:[c1,c2]})` | generic fictional face, skin/hair/shirt derived from the seed (use the card id) |
| `flag(nation, width=24)` | SVG flag (Windows has no flag emoji) |
| `card(c, {count, size:'sm'\|'md'\|'lg'\|'fluid'})` | collectible card; shows `c.era` (else the nation); rarity frames `common`, `rare`, `epic`, `legend` (gold foil, shine, sparkles); `count>1` shows a ×n badge. `fluid` fills its container (aspect 5:7) |
| `cardBack({size})` | face-down card |
| `cardMissing({id,pos}, {size})` | silhouette for a card not yet owned |
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

## Cards view and coach view

- Album: «&nbsp;Mes cartes&nbsp;» chip (default when the player owns a card), owned cards first by rating, 3 columns under 480 px, missing cards (`.album__cell--missing`) at about half height. `.odds` shows the four rarities in their colours next to the buy button.
- Pack reveal is resumable: the purchase save also stores `state.pendingReveal = { kind: 'buy'|'free', ids: [cardId x3], fresh: [bool x3] }`. The cards view resumes it on mount and sets it to `null` (and saves) when the last card is flipped or the child leaves. Badge toasts are held until the reveal is over.
- Parent dashboard (`coach.js`, shown as « Espace parent »): `.psum` button per child (this week: matches, time, V/N/D, accuracy, weakest theme, last activity; `aria-pressed` marks the selected child), then the detail: 7-day `barChart` with weekday letters (today in gold), themes by subject weakest first (`.coach__todo` = « pas encore joué »), most-missed questions, last 20 matches (`.cm`, two lines on phones).
