# Study League — spécification (v1)

## Objectif

Un jeu de révision en forme de championnat de football pour deux enfants d'âges différents (primaire et collège), compétitifs, avec un suivi pour leur parent.

Le projet est réussi si les enfants ont envie de rejouer un match, sentent qu'ils montent, se comparent l'un à l'autre, et si le parent voit ce qui a été travaillé et où chaque enfant bute.

## Contraintes

- Site statique servi par GitHub Pages depuis la racine du repo (branche `main`). Pas d'étape de build, pas de Node. HTML, CSS et modules ES.
- Interface en français, avec des mots simples pour un enfant de 9 ans. Les questions d'anglais et leurs explications restent en anglais.
- Le repo est public : pas de vrais noms d'enfants, pas de secrets. Les cartes portent les noms de vrais joueurs, de vrais pays et de vrais clubs (noms seuls : portraits, drapeaux et écussons sont générés, aucun logo officiel). Les clubs adverses du championnat et des coupes de clubs sont fictifs.
- Fonctionne sur téléphone, tablette et ordinateur (tactile d'abord, 360 px de large minimum).
- Ajouter une matière plus tard (maths, physique, SVT, chinois YCT2) = ajouter des fichiers JSON et une entrée dans `data/subjects.json`. Le moteur ne change pas.
- Stockage : le mode local (localStorage) marche d'emblée. Le mode cloud (Firebase Auth + Firestore) s'active quand `js/config.js` contient une configuration Firebase.

## Règles du jeu

### Équipes (squads)
Choisie à l'inscription, l'équipe détermine les notions proposées.
- `u13` « Pro Squad » (11 ans et plus) : toutes les matières (anglais, français, maths, SVT, physique-chimie, histoire-géo), plus les thèmes en option que l'enfant active (voir « Thèmes en option »).
- `u10` « Academy Squad » (8–10 ans) : les notions marquées `u10` (verbes irréguliers anglais au prétérit, français du CM1). Aucun thème en option, aucun évènement.

### Match
- **Championnat et coupes : 15 questions**, soit environ 5 minutes. **Entraînement : 10 questions**, environ 3 minutes. Chaque question est une « minute » du match (6', 12' … 90' pour 15 questions ; 9', 18' … 90' pour 10).
- Types de question : `mcq` (4 choix) et `input` (réponse tapée).
- Chrono par question : 30 s pour un mcq, 45 s pour un input (pas de chrono à l'entraînement). Temps écoulé = réponse fausse.
- Après chaque réponse : retour immédiat, bonne réponse, explication en une ligne.
- Sur la carte de question : de une à trois étoiles de difficulté (le `level` de la question) et, si la question a une figure, le dessin entre l'en-tête et l'énoncé.
- **Buts marqués** : le nombre de bonnes réponses nécessaires pour un but dépend de la division. District 2, Régional 3, National 3, Ligue 2 4, Ligue 1 5. À l'entraînement : 2. Les coupes ont leur propre règle (voir « Coupes »). Une jauge d'attaque (autant de crans que de bonnes réponses par but) le rend visible, avec le décompte « Encore 2 bonnes réponses pour marquer ». La règle est expliquée avant le match (« 3 bonnes réponses = 1 but »), et une fois avant la toute première question. Une courte animation montre un joueur aux couleurs du club qui tire et marque. En 15 questions, le maximum de buts est de 7 en District, 5 en Régional et National, 3 en Ligue 2 et Ligue 1.
- **Buts encaissés** : chaque mauvaise réponse donne une occasion à l'adversaire, qui marque avec une probabilité égale à sa force (0,35 à 0,90), tirée par un générateur aléatoire à graine. Exception : à la Coupe du monde, chaque erreur ou chrono écoulé est un but pour l'adversaire, sans tirage.
- Victoire, nul ou défaite selon le score.
- Vérification des réponses tapées : espaces de début et de fin retirés, casse ignorée, espaces multiples réduits, apostrophes normalisées. Les accents comptent, sauf pour l'équipe `u10` : « ê » et « e » y sont la même lettre (les autres accents comptent toujours).

### Championnat
- Un championnat par joueur, toutes matières confondues. Avant chaque match de championnat, le joueur choisit une matière puis une notion. Pas de mélange de notions, sauf pendant un évènement (voir « Évènements »).
- « Le choix du coach » : la notion la plus faible du joueur (ou une notion jamais jouée) est mise en avant et rapporte 50 % de pièces en plus. Il vaut aussi pour les matchs de coupe, et il est suspendu pendant un évènement.
- 5 divisions, de bas en haut : District, Régional, National, Ligue 2, Ligue 1.
- Une saison : le club du joueur et 7 clubs fictifs, matchs aller-retour, 14 journées (deux rencontres contre chaque adversaire, une à domicile et une à l'extérieur, environ deux semaines à un match par jour). Une saison déjà enregistrée garde son calendrier et se termine telle quelle. Les 3 autres rencontres de chaque journée sont simulées d'après la force des clubs ; leurs scores sont mis à l'échelle de la division (plus de buts possibles en District, moins en Ligue 1), pour rester comparables à ce que le joueur peut marquer.
- Victoire 3 points, nul 1, défaite 0. Classement par points, différence de buts, buts marqués.
- Fin de saison : les 2 premiers montent (on reste en Ligue 1 une fois au sommet). Le premier gagne le titre (trophée gardé dans l'historique). Pas de relégation. Une nouvelle saison démarre automatiquement avec de nouveaux clubs.
- Plus la division est haute, plus les adversaires sont forts, plus il faut de bonnes réponses par but et plus les questions sont difficiles (la part des niveaux 2 et 3 augmente).
- **Rétrogradation unique** : une seule fois, chaque joueur qui existait avant cette règle descend de deux divisions (au plus bas : District). Il repart sur une nouvelle saison (même numéro, journée 1) ; historique, XP, pièces et cartes sont gardés. Elle est appliquée à l'ouverture de session suivante et enregistrée. Un joueur déjà en District garde sa saison en cours. Un nouveau joueur n'est pas concerné.

### Terrain d'entraînement
Choix libre d'une notion, 10 questions, pas de chrono, aucun effet sur le championnat. XP à 50 %, pas de pièces. Met à jour la maîtrise. Pendant un évènement, l'écran commence par un choix : « Entraînement de l'évènement » (les questions mélangées de l'évènement) ou « Entraînement classique » (matière et thème au choix).

### Coupes
Quatre coupes à élimination directe se jouent à côté du championnat, depuis l'écran Championnat. Chaque match de coupe est un match chronométré de 15 questions, qui rapporte de l'XP et des pièces comme un match de championnat mais ne touche ni la saison ni le total de victoires, nuls et défaites.

| Coupe | Ouverte quand | Tours | Bonnes réponses par but | Carte gagnée | Bonus de finale |
|---|---|---|---|---|---|
| Coupe de la Ligue | division National atteinte | quart, demi, finale | 3 | club | 20 pièces |
| Coupe d'Europe | Ligue 2 atteinte | huitième, quart, demi, finale | 4 | pays | 30 pièces |
| Ligue des champions | Ligue 1 atteinte | huitième, quart, demi, finale | 5 | club | 40 pièces |
| Coupe du monde | un titre de Ligue 1 ou la Ligue des champions gagnée | huitième, quart, demi, finale | 5 ; chaque erreur = un but de l'adversaire | pays | 60 pièces |

- Un tour = un match contre un adversaire tiré au début de l'édition, de plus en plus fort au fil des tours : clubs fictifs pour les coupes de clubs, sélections nationales pour les coupes de pays.
- Les buts comptent comme en championnat. En cas de match nul : tirs au but, le joueur passe s'il a donné plus de bonnes réponses que d'erreurs. Quitter un match après la première réponse, ou fermer la page pendant le match, élimine le joueur de la coupe ; quitter avant la première réponse ne coûte rien.
- Une édition finie (gagnée ou perdue) laisse la coupe fermée jusqu'au lendemain ; la nouvelle édition démarre alors au premier tour. Tant qu'elle n'est pas finie, on la reprend quand on veut.
- Chaque match gagné (tirs au but compris) donne une carte de la coupe : pays ou club, une que le joueur n'a pas encore ; un double seulement quand la série est complète. La finale donne la plus haute rareté encore manquante.
- Finale gagnée : bonus de pièces (tableau), un paquet offert et un badge trophée propre à la coupe.
- Les cartes de pays et de clubs ne sortent que des coupes, jamais des paquets.

### Évènements
Un évènement est une période pendant laquelle les matchs d'une équipe mélangent plusieurs matières. Il n'y en a qu'un pour l'instant : **« U13 ECE Event »**, du 23 novembre au 2 décembre 2026 (jours inclus), pour l'équipe `u13`, avec l'histoire-géo, l'anglais et la SVT.
- Pendant l'évènement, les matchs de championnat et de coupe n'ont plus de choix de matière ni de thème : les questions viennent de tous les thèmes des trois matières (les thèmes en option seulement s'ils sont activés), à parts égales (5/5/5 en 15 questions, 4/3/3 en 10), dans le désordre. Chaque question indique « matière · thème ». Le choix du coach est suspendu.
- Une fenêtre annonce l'évènement : à l'accueil, une fois par jour ; sinon juste avant le premier match de la journée (championnat, coupe ou entraînement), qui attend que l'enfant la ferme.
- Dans la vue parent, les matchs de l'évènement s'affichent sous le nom de l'évènement.

### Thèmes en option
Certains thèmes (marqués `optional` dans le catalogue) sont en plus du programme : ils n'apparaissent ni dans Jouer, ni dans Entraînement, ni dans les évènements tant que l'enfant ne les a pas activés un par un depuis son profil (« Thèmes en option »). Il peut les retirer ; ses étoiles sont gardées. Aujourd'hui, 11 thèmes u13 sont en option : 6 d'anglais (rubrique « More grammar »), 2 de français et 3 de maths. Un thème en option ne compte pas pour le badge « Maître de la matière », activé ou non. La vue parent liste, en lecture seule, les thèmes activés avec la date et l'heure d'activation.

### Choix des questions
Une question ne revient pas tant que toutes les questions de la notion n'ont pas été vues. Ensuite, les questions ratées la dernière fois reviennent d'abord, puis les plus anciennes. Jamais deux fois la même question dans un match. Une notion compte de 36 questions (Hero's Journey) à 360 (verbes irréguliers avec participe passé) ; la plupart en ont de 90 à 170.

### Récompenses
- XP : 10 par bonne réponse, jusqu'à +5 de bonus de rapidité, +50 pour une victoire, +20 pour un nul, +10 pour une défaite. Niveaux calculés depuis l'XP, avec des paliers croissants.
- Pièces : victoire 30, nul 15, défaite 5, +10 pour un 10/10 ; une défaite avec moins d'un tiers de bonnes réponses ne rapporte rien. Un match de coupe rapporte les mêmes pièces qu'un match de championnat, plus le bonus de finale. Deux paquets : 75 pièces pour 1 carte (jamais de légende : 70 % commune, 24 % rare, 6 % épique) ou 150 pièces pour 3 cartes (55 % commune, 28 % rare, 13 % épique, 4 % légendaire). Les paquets offerts sont des paquets de 3 cartes. Les paquets ne contiennent que des joueurs.
- Paquet offert : à chaque montée, à chaque titre, à chaque niveau multiple de 10, à chaque finale de coupe gagnée.
- Cartes : 323 dans `data/cards.json`, de trois sortes (champ `kind`, absent pour un joueur).
  - 277 joueurs (ids p001 à p277) : 72 de l'équipe de France et 205 de dix-neuf autres sélections (Brésil 24, Allemagne 21, Italie 21, Argentine 20, Angleterre 19, Pays-Bas 18, Espagne 17, Portugal 12, Belgique 12, Maroc 11, puis 3 ou 4 pour Uruguay, Croatie, Sénégal, Pologne, Suède, Mexique, Nigéria, Japon, Ghana). Champs : nom, poste GK/DEF/MID/FWD, sélection (`nation`, clé de `flag` dans `js/ui/art.js`), `flag` (emoji, non utilisé à l'affichage), époque, note, rareté. Raretés : 124 communes, 89 rares, 44 épiques, 20 légendes.
  - 22 cartes de pays (ids n001 à n022, `kind: "nation"`) : nom, `nation`, rareté. Le drapeau est dessiné en SVG.
  - 24 cartes de clubs (ids k001 à k024, `kind: "club"`) : nom, code de 3 lettres, deux couleurs, style d'écusson, pays, rareté. L'écusson est dessiné en SVG ; pas de logo officiel.
  - Les pays et les clubs se gagnent uniquement en coupe (voir « Coupes »). Les doublons sont comptés. Chances par rareté dans un paquet : voir ci-dessus.
  - L'album affiche le nombre de cartes obtenues sur le total, les manquantes en silhouette (« À gagner en coupe » pour un pays ou un club). Trois onglets : Joueurs, Pays, Clubs ; puis un filtre par rareté ; pour les joueurs, un filtre par poste et par sélection (la rangée des sélections passe à la ligne au lieu de défiler).
- Badges : 29 paliers (première victoire, série de 3/5/10 victoires, hat-trick = 3 buts ou plus, clean sheet, match parfait, 10/50/100 matchs, montée, titre, notion maîtrisée, toutes les notions obligatoires d'une matière maîtrisées, 3/7 jours de jeu d'affilée, 10/36/100 cartes différentes, album complet, première carte légende, 100/500/1000 bonnes réponses, et un trophée par coupe gagnée en finale). L'album complet demande toutes les cartes, pays et clubs compris (323).
- Maîtrise d'une notion : taux de réussite sur les 20 dernières réponses de la notion, affiché en 0 à 3 étoiles (≥ 50 %, ≥ 70 %, ≥ 90 %, avec au moins 10 réponses).
- Série de jours : jours calendaires consécutifs avec au moins un match.

### Rivaux
Classement de tous les joueurs (mode local : tous les comptes de l'appareil ; mode cloud : tous les comptes du projet Firebase). Onglets de tri : XP, XP de la semaine, victoires, taux de réussite, meilleure série de victoires, cartes (cartes différentes, pays et clubs compris). Une vue face-à-face compare le joueur à n'importe quel rival, statistique par statistique.

### Vue coach (parent)
Un compte de rôle `coach`. Il voit chaque joueur : dernière activité, temps de jeu, matchs, victoires/nuls/défaites, taux de réussite global et par notion (barres de maîtrise), 20 derniers matchs, activité par jour sur 14 jours, et les 10 questions les plus ratées avec l'énoncé et la bonne réponse. Les matchs sont étiquetés Entraînement, Championnat ou Coupe. Les thèmes en option non activés n'apparaissent pas, sauf s'ils ont déjà été joués ; une section liste les thèmes en option activés (lecture seule).

## Comptes et stockage

- Inscription : identifiant, mot de passe (6 caractères minimum), nom affiché, nom du club, couleurs du maillot, équipe — ou rôle « coach ».
- Mode local : comptes et progression dans localStorage ; mot de passe stocké en SHA-256 salé (WebCrypto). C'est un verrou symbolique, pas une sécurité.
- Mode cloud : Firebase Auth par e-mail et mot de passe, avec un e-mail synthétique `<identifiant>@study-league.app` ; Firestore `users/{uid}` (progression complète, lecture et écriture par son propriétaire, lecture par les coachs), `leaderboard/{uid}` (résumé public, lu par la famille, écrit par son propriétaire), `coaches/{uid}` (créé à la main dans la console Firebase ; donne la lecture de tous les joueurs) et `members/<identifiant>@study-league.app` (liste blanche de la famille, créée à la main : sans ce document, un compte ne peut ni lire ni écrire). `firestore.rules` et `docs/FIREBASE_SETUP.md` sont livrés dans le repo. Le SDK Firebase n'est chargé (depuis le CDN gstatic) que si une configuration est présente.
- À la première inscription en mode cloud, si un compte local du même identifiant existe sur l'appareil, l'appli propose d'importer sa progression.
- La progression est enregistrée après chaque match et chaque achat.
- Les règles Firestore ne contrôlent que le profil (liste fermée de champs), l'XP et les pièces. Les champs ajoutés à la progression (`cups`, `optionalTopics`, `eventSeen`, marqueur de rétrogradation) sont donc au niveau supérieur de l'état, hors de `profile`, qui refuserait tout champ inconnu : `firestore.rules` n'a pas changé. Les thèmes en option sont lus par le parent mais seul l'enfant peut les modifier (écriture réservée au propriétaire du document). Le résumé public du classement garde les mêmes champs (`division` toujours de 0 à 4) ; son nombre de cartes compte maintenant les pays et les clubs.

## Format du contenu

`data/subjects.json`
```json
{ "subjects": [ { "id": "en", "name": "Anglais", "icon": "🇬🇧", "accents": false,
  "topics": [ { "id": "en-determiners", "name": "Determiners & articles", "file": "data/en/determiners.json", "squads": ["u13"], "group": "Intuitive English" } ] } ] }
```
Champs facultatifs : `accents` (matière) affiche les touches d'accents pendant les questions tapées ; `group` (thème) range les thèmes d'une matière par rubrique, dans l'ordre où elles apparaissent, les thèmes sans rubrique venant après ; `forms` (thème de verbes) vaut `["past"]` par défaut, `["past","pp"]` ajoute le participe passé ; `optional: true` (thème) en fait un thème en option, activé par l'enfant (la valeur ne peut être que `true` ou absente). Deux thèmes peuvent partager un fichier (les verbes) : son champ `topic` est alors l'un des deux.

Fichier de notion standard
```json
{ "topic": "en-determiners", "questions": [
  { "id": "en-det-001", "level": 1, "type": "mcq", "prompt": "She is ___ honest person.", "choices": ["a", "an", "the", "—"], "answer": "an", "explain": "'Honest' starts with a vowel sound." },
  { "id": "en-det-002", "level": 2, "type": "input", "prompt": "…", "answer": ["much", "a lot of"], "explain": "…" } ] }
```
- `level` : 1 facile, 2 moyen, 3 difficile (affiché en étoiles sur la carte de question). Pour un mcq, `answer` est exactement l'un des `choices` ; pour un input, une chaîne ou un tableau de réponses acceptées. `explain` tient en une phrase courte.
- Champ facultatif `figure` : un dessin décrit par des données (jamais du SVG ni du HTML), dessiné par `js/ui/figures.js`. Dix types : droite graduée, repère, deux droites et une sécante, triangle, quadrilatère, symétrie sur quadrillage, diagramme en barres, courbe, diagramme circulaire, solide. Paramètres de chaque type : `docs/API.md`. `tests/content.test.js` valide chaque figure. Elle s'affiche sur la carte de question en match (championnat, coupe, entraînement), pas dans « À revoir » du résultat ni dans les questions ratées du parent.
- Règle d'écriture des questions de maths : tout calcul doit pouvoir se faire de tête. Aucun test ne la vérifie ; elle se contrôle à la relecture du contenu.

Fichier de verbes irréguliers (`"kind": "verbs"`) : `{ "topic": "en-irregular-verbs", "kind": "verbs", "verbs": [ { "base": "go", "past": "went", "pp": "gone", "level": 1 } ] }` — `past` peut être un tableau de formes acceptées (par exemple `["dived", "dove"]`). Le champ `pp` n'est demandé que par les thèmes dont `forms` contient `"pp"` (équipe `u13`) ; l'équipe `u10` n'apprend que la forme de base et le prétérit. Le moteur génère deux questions par verbe sur le prétérit : taper le prétérit (« Yesterday, I ___ . (to go) ») et choisir la bonne forme dans un mcq. Les mauvais choix sont de fausses régularisations (« goed »), la forme de base, la troisième personne ou la forme en -ing, jamais un participe passé seul (« gone »). La correction affichée est « go → went » (« dive → dived / dove » quand deux formes sont acceptées). Avec `"pp"`, une troisième question demande le participe passé (« I have ___ . (to go) », identifiant `<thème>-<verbe>-pp`), les formes multiples sont toutes acceptées (« got » et « gotten »), et la correction des trois questions devient « go → went → gone ». Les deux thèmes de verbes (`en-irregular-verbs` pour `u10`, `en-irregular-verbs-pp` pour `u13`) lisent le même fichier ; leurs identifiants de question diffèrent.

Notions
- Anglais (`u13`), par rubrique : Beowulf ; Intuitive English (Prepositions, Determiners & articles, Conjunctions) ; DOL (Sentence corrections) ; Verb Tense (Mixed tenses, Present simple & continuous, Present perfect, Past simple, Past perfect, Irregular verbs avec participe passé) ; Hero's Journey ; Burger Paragraph (Burger paragraph & linking words) ; More grammar, tous en option (Questions & negatives, Modals, Comparatives & superlatives, Future forms, Relative clauses, Conditionals). Anglais (`u10`) : Irregular verbs, prétérit seulement.
- Français (`u13`) : Conjugaison, Le verbe et le présent, Orthographe et accords, Grammaire, Vocabulaire ; en option : Groupe nominal, phrase et discours, Accords : attribut et sujet. Français (`u10`) : Présent, Futur simple, Imparfait.
- Mathématiques (`u13`), par domaine du programme : Nombres et calculs (Nombres relatifs et repérage, Priorités opératoires, Quotients et puissances, Multiples, diviseurs et nombres premiers, Fractions, Calcul littéral et équations) ; Proportionnalité (Proportionnalité, en option) ; Espace et géométrie (Symétries et angles, Parallélogrammes et quadrilatères, Triangles et Solides et mesures, en option) ; Données et probabilités (Statistiques, Probabilités) ; Pensée informatique (Algorithmique et programmes).
- SVT, Physique-chimie, Histoire-Géo (`u13`). Histoire-Géo est en anglais, sans touches d'accents ; SVT et Physique-chimie ont les touches d'accents.

## Architecture

```
index.html            page unique, routeur par hash
css/                  jetons de design, composants, écrans
js/config.js          FIREBASE_CONFIG (null = mode local), constantes
js/core/              logique pure, sans DOM : rng, questions, match, league, cups, events, rewards, stats, state
js/store/             index (choisit le backend), local, firebase — même interface asynchrone
js/ui/                composants (cartes, portraits, écussons, classement…), figures de questions (figures.js) et un module par écran
data/                 subjects.json, clubs.json, cards.json, un dossier de fichiers JSON par matière (en, fr, maths, svt, pc, hg)
tests/                tests.html + *.test.js — tests unitaires de js/core, store/local et des données, lancés dans le navigateur
docs/                 SPEC.md, API.md (API du moteur et du stockage), FIREBASE_SETUP.md
```
`js/core` ne touche ni au DOM ni au stockage ; les écrans appellent le moteur, puis le stockage. Tout l'aléatoire passe par un générateur à graine, pour des tests reproductibles.

Écrans : connexion et inscription, accueil (prochain match, extrait du classement, niveau, série, choix du coach, fenêtre d'évènement), préparation du match, match, résultat (score, récompenses, nouveaux badges, paquet, carte et tour de coupe), championnat avec calendrier, coupes et historique, entraînement (avec le choix évènement ou classique pendant un évènement), album de cartes et ouverture de paquet, badges, rivaux, coach, profil (avec les thèmes en option).

## Direction visuelle

Stade un soir de match : fond bleu nuit et vert pelouse, halo de projecteurs, or pour les trophées et les récompenses, police condensée façon tableau d'affichage pour les scores et les titres, police sans empattement lisible pour le texte. Grandes zones tactiles, animations courtes (célébration de but, confettis sur une victoire, retournement de carte à l'ouverture d'un paquet). Aucune image de personne ou de club réels : écussons, maillots et portraits de joueurs sont générés en SVG/CSS.

## Tests

- Revue de sécurité par un agent dédié avant la mise en ligne.
- Tests unitaires dans `tests/tests.html`, lancés sans interface avec Edge (`--headless --dump-dom`) via un `python -m http.server` local. Quinze fichiers : `rng`, `questions`, `match`, `league`, `rewards`, `stats`, `state`, `cups`, `events`, `store-local`, `ui-utils`, `content`, `figures`, `cards`, `optional-topics`.
- Passe de bout en bout avec Playwright (Python, canal Edge), gardée hors du repo : inscription, match de championnat, résultat, ouverture de paquet, entraînement, vue coach, second joueur et rivaux, en 390 px et 1280 px.
- `tests/content.test.js` lit les vrais fichiers de `data/` : identifiants uniques, forme des questions, QCM à 4 choix distincts, réponses décimales avec virgule et point, champ `optional` du catalogue, validité de chaque `figure`. `tests/cards.test.js` lit `data/cards.json` : sortes de cartes, ids contigus, raretés, champs, drapeaux et écussons.
- Relecture du contenu : chaque question vérifiée (une seule bonne réponse, niveau adapté, explication juste).

## Hors périmètre de la v1

Relégation (la rétrogradation de deux divisions ne s'applique qu'une fois, aux joueurs existants), duels en temps réel, chinois, son, réinitialisation du mot de passe en mode local.
