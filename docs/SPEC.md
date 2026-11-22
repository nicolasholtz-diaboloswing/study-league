# Study League — spécification (v1)

## Objectif

Un jeu de révision en forme de championnat de football pour deux enfants d'âges différents (primaire et collège), compétitifs, avec un suivi pour leur parent.

Le projet est réussi si les enfants ont envie de rejouer un match, sentent qu'ils montent, se comparent l'un à l'autre, et si le parent voit ce qui a été travaillé et où chaque enfant bute.

## Contraintes

- Site statique servi par GitHub Pages depuis la racine du repo (branche `main`). Pas d'étape de build, pas de Node. HTML, CSS et modules ES.
- Interface en français, avec des mots simples pour un enfant de 9 ans. Les questions d'anglais et leurs explications restent en anglais.
- Le repo est public : pas de vrais noms d'enfants, pas de secrets. Les cartes portent les noms de vrais joueurs de l'équipe de France (noms seuls, portraits génériques générés). Les clubs adverses sont fictifs.
- Fonctionne sur téléphone, tablette et ordinateur (tactile d'abord, 360 px de large minimum).
- Ajouter une matière plus tard (maths, physique, SVT, chinois YCT2) = ajouter des fichiers JSON et une entrée dans `data/subjects.json`. Le moteur ne change pas.
- Stockage : le mode local (localStorage) marche d'emblée. Le mode cloud (Firebase Auth + Firestore) s'active quand `js/config.js` contient une configuration Firebase.

## Règles du jeu

### Équipes (squads)
Choisie à l'inscription, l'équipe détermine les notions proposées.
- `u13` « Pro Squad » (11 ans et plus) : toutes les notions d'anglais et de français.
- `u10` « Academy Squad » (8–10 ans) : les notions marquées `u10` (en v1 : verbes irréguliers anglais).

### Match
- 10 questions, soit environ 3 minutes. Chaque question est une « minute » du match (9', 18' … 90').
- Types de question : `mcq` (4 choix) et `input` (réponse tapée).
- Chrono par question : 30 s pour un mcq, 45 s pour un input. Temps écoulé = réponse fausse.
- Après chaque réponse : retour immédiat, bonne réponse, explication en une ligne.
- **Buts marqués** : une bonne réponse sur deux marque un but (une jauge d'attaque à deux crans le rend visible, avec le décompte « Encore 2 bonnes réponses pour marquer »). 10/10 = 5 buts. La règle est expliquée avant le match (« 2 bonnes réponses = 1 but »), et une fois avant la toute première question. Une courte animation montre un joueur aux couleurs du club qui tire et marque.
- **Buts encaissés** : chaque mauvaise réponse donne une occasion à l'adversaire, qui marque avec une probabilité égale à sa force (0,35 à 0,90), tirée par un générateur aléatoire à graine.
- Victoire, nul ou défaite selon le score.
- Vérification des réponses tapées : espaces de début et de fin retirés, casse ignorée, espaces multiples réduits, apostrophes normalisées. Les accents comptent.

### Championnat
- Un championnat par joueur, toutes matières confondues. Avant chaque match de championnat, le joueur choisit une matière puis une notion. Pas de mélange de notions en v1.
- « Le choix du coach » : la notion la plus faible du joueur (ou une notion jamais jouée) est mise en avant et rapporte 50 % de pièces en plus.
- 5 divisions, de bas en haut : District, Régional, National, Ligue 2, Ligue 1.
- Une saison : le club du joueur et 7 clubs fictifs, matchs aller simples, 7 journées (une rencontre contre chaque adversaire, environ une semaine à un match par jour). Une saison déjà enregistrée avec 14 journées se termine telle quelle. Les 3 autres rencontres de chaque journée sont simulées d'après la force des clubs.
- Victoire 3 points, nul 1, défaite 0. Classement par points, différence de buts, buts marqués.
- Fin de saison : les 2 premiers montent (on reste en Ligue 1 une fois au sommet). Le premier gagne le titre (trophée gardé dans l'historique). Pas de relégation en v1. Une nouvelle saison démarre automatiquement avec de nouveaux clubs.
- Plus la division est haute, plus les adversaires sont forts et les questions difficiles (la part des niveaux 2 et 3 augmente).

### Terrain d'entraînement
Choix libre d'une notion, 10 questions, pas de chrono, aucun effet sur le championnat. XP à 50 %, pas de pièces. Met à jour la maîtrise.

### Choix des questions
Une question ne revient pas tant que toutes les questions de la notion n'ont pas été vues. Ensuite, les questions ratées la dernière fois reviennent d'abord, puis les plus anciennes. Jamais deux fois la même question dans un match. Chaque notion compte environ 150 questions, soit une dizaine de matchs sans répétition.

### Récompenses
- XP : 10 par bonne réponse, jusqu'à +5 de bonus de rapidité, +50 pour une victoire, +20 pour un nul, +10 pour une défaite. Niveaux calculés depuis l'XP, avec des paliers croissants.
- Pièces : victoire 30, nul 15, défaite 5, +10 pour un 10/10 ; une défaite avec moins d'un tiers de bonnes réponses ne rapporte rien. Un paquet de cartes coûte 50 pièces et contient 3 cartes.
- Paquet offert : à chaque montée, à chaque titre, à chaque niveau multiple de 5.
- Cartes : 72 joueurs de l'équipe de France, de 1998 à aujourd'hui, dans `data/cards.json` (nom, poste GK/DEF/MID/FWD, époque, note, rareté). Chances par rareté : commune 60 %, rare 28 %, épique 10 %, légende 2 %. Les doublons sont comptés. L'album affiche le nombre de cartes obtenues sur le total, les manquantes en silhouette.
- Badges : environ 24 paliers (première victoire, série de 3/5/10 victoires, hat-trick = 3 buts ou plus, clean sheet, match parfait, 10/50/100 matchs, montée, titre, notion maîtrisée, toutes les notions d'une matière maîtrisées, 3/7 jours de jeu d'affilée, 10/36/72 cartes différentes, première carte légende, 100/500/1000 bonnes réponses…).
- Maîtrise d'une notion : taux de réussite sur les 20 dernières réponses de la notion, affiché en 0 à 3 étoiles (≥ 50 %, ≥ 70 %, ≥ 90 %, avec au moins 10 réponses).
- Série de jours : jours calendaires consécutifs avec au moins un match.

### Rivaux
Classement de tous les joueurs (mode local : tous les comptes de l'appareil ; mode cloud : tous les comptes du projet Firebase). Onglets de tri : XP, XP de la semaine, victoires, taux de réussite, meilleure série de victoires, cartes. Une vue face-à-face compare le joueur à n'importe quel rival, statistique par statistique.

### Vue coach (parent)
Un compte de rôle `coach`. Il voit chaque joueur : dernière activité, temps de jeu, matchs, victoires/nuls/défaites, taux de réussite global et par notion (barres de maîtrise), 20 derniers matchs, activité par jour sur 14 jours, et les 10 questions les plus ratées avec l'énoncé et la bonne réponse.

## Comptes et stockage

- Inscription : identifiant, mot de passe (6 caractères minimum), nom affiché, nom du club, couleurs du maillot, équipe — ou rôle « coach ».
- Mode local : comptes et progression dans localStorage ; mot de passe stocké en SHA-256 salé (WebCrypto). C'est un verrou symbolique, pas une sécurité.
- Mode cloud : Firebase Auth par e-mail et mot de passe, avec un e-mail synthétique `<identifiant>@study-league.app` ; Firestore `users/{uid}` (progression complète, lecture et écriture par son propriétaire, lecture par les coachs), `leaderboard/{uid}` (résumé public, lu par la famille, écrit par son propriétaire), `coaches/{uid}` (créé à la main dans la console Firebase ; donne la lecture de tous les joueurs) et `members/<identifiant>@study-league.app` (liste blanche de la famille, créée à la main : sans ce document, un compte ne peut ni lire ni écrire). `firestore.rules` et `docs/FIREBASE_SETUP.md` sont livrés dans le repo. Le SDK Firebase n'est chargé (depuis le CDN gstatic) que si une configuration est présente.
- À la première inscription en mode cloud, si un compte local du même identifiant existe sur l'appareil, l'appli propose d'importer sa progression.
- La progression est enregistrée après chaque match et chaque achat.

## Format du contenu

`data/subjects.json`
```json
{ "subjects": [ { "id": "en", "name": "English", "icon": "🇬🇧",
  "topics": [ { "id": "en-determiners", "name": "Determiners", "file": "data/en/determiners.json", "squads": ["u13"] } ] } ] }
```

Fichier de notion standard
```json
{ "topic": "en-determiners", "questions": [
  { "id": "en-det-001", "level": 1, "type": "mcq", "prompt": "She is ___ honest person.", "choices": ["a", "an", "the", "—"], "answer": "an", "explain": "'Honest' starts with a vowel sound." },
  { "id": "en-det-002", "level": 2, "type": "input", "prompt": "…", "answer": ["much", "a lot of"], "explain": "…" } ] }
```
- `level` : 1 facile, 2 moyen, 3 difficile. Pour un mcq, `answer` est exactement l'un des `choices` ; pour un input, une chaîne ou un tableau de réponses acceptées. `explain` tient en une phrase courte.

Fichier de verbes irréguliers (`"kind": "verbs"`) : `{ "topic": "en-irregular-verbs", "kind": "verbs", "verbs": [ { "base": "go", "past": "went", "pp": "gone", "level": 1 } ] }` — `past` peut être un tableau de formes acceptées (par exemple `["dived", "dove"]`). Le champ `pp` reste dans le fichier mais n'est jamais demandé ni affiché : l'enfant n'apprend que la forme de base et le prétérit. Le moteur génère deux questions par verbe, toutes deux sur le prétérit : taper le prétérit (« Yesterday, I ___ . (to go) ») et choisir la bonne forme dans un mcq. Les mauvais choix sont de fausses régularisations (« goed »), la forme de base, la troisième personne ou la forme en -ing, jamais un participe passé seul (« gone »). La correction affichée est « go → went » (« dive → dived / dove » quand deux formes sont acceptées).

Notions de la v1
- Anglais (`u13`) : Determiners, Past simple, Past perfect (y compris past simple contre past perfect). Anglais (`u10` et `u13`) : Irregular verbs.
- Français (`u13`) : Conjugaison, Orthographe et accords, Grammaire, Vocabulaire.

## Architecture

```
index.html            page unique, routeur par hash
css/                  jetons de design, composants, écrans
js/config.js          FIREBASE_CONFIG (null = mode local), constantes
js/core/              logique pure, sans DOM : rng, questions, match, league, rewards, stats, state
js/store/             index (choisit le backend), local, firebase — même interface asynchrone
js/ui/                composants (cartes, portraits, écussons, classement…) et un module par écran
data/                 subjects.json, clubs.json, cards.json, en/*.json, fr/*.json
tests/                tests.html + *.test.js — tests unitaires de js/core et store/local, lancés dans le navigateur
docs/                 SPEC.md, API.md (API du moteur et du stockage), FIREBASE_SETUP.md
```
`js/core` ne touche ni au DOM ni au stockage ; les écrans appellent le moteur, puis le stockage. Tout l'aléatoire passe par un générateur à graine, pour des tests reproductibles.

Écrans : connexion et inscription, accueil (prochain match, extrait du classement, niveau, série, choix du coach), préparation du match, match, résultat (score, récompenses, nouveaux badges, paquet), classement avec calendrier et historique, entraînement, album de cartes et ouverture de paquet, badges, rivaux, coach, profil.

## Direction visuelle

Stade un soir de match : fond bleu nuit et vert pelouse, halo de projecteurs, or pour les trophées et les récompenses, police condensée façon tableau d'affichage pour les scores et les titres, police sans empattement lisible pour le texte. Grandes zones tactiles, animations courtes (célébration de but, confettis sur une victoire, retournement de carte à l'ouverture d'un paquet). Aucune image de personne ou de club réels : écussons, maillots et portraits de joueurs sont générés en SVG/CSS.

## Tests

- Revue de sécurité par un agent dédié avant la mise en ligne.
- Tests unitaires dans `tests/tests.html`, lancés sans interface avec Edge (`--headless --dump-dom`) via un `python -m http.server` local.
- Passe de bout en bout avec Playwright (Python, canal Edge), gardée hors du repo : inscription, match de championnat, résultat, ouverture de paquet, entraînement, vue coach, second joueur et rivaux, en 390 px et 1280 px.
- Relecture du contenu : chaque question vérifiée (une seule bonne réponse, niveau adapté, explication juste).

## Hors périmètre de la v1

Relégation, duels en temps réel, autres matières, son, réinitialisation du mot de passe en mode local.
