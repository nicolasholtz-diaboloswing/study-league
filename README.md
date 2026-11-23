# Study League

Un jeu de révision en forme de championnat de football. On répond à des questions, on marque des buts, on monte de division et on collectionne des cartes de joueurs.

**Jouer** : https://nicolasholtz-diaboloswing.github.io/study-league/

**Version** : le numéro (par exemple `v1.2.0`) s'affiche dans l'en-tête du site et en bas de l'écran de connexion. Il est défini une seule fois, dans `js/config.js` (`APP_VERSION`) : on l'augmente à chaque mise en ligne.

## Comment ça marche

- Un match de championnat ou de coupe = 15 questions, environ 5 minutes (entraînement : 10 questions). Le nombre de bonnes réponses pour marquer un but monte avec la division : 2 en District, 3 en Régional et National, 4 en Ligue 2, 5 en Ligue 1. Une erreur donne une occasion à l'adversaire.
- Une saison = 14 journées, deux rencontres contre chacun des 7 autres clubs (aller et retour). Les 2 premiers montent : District, Régional, National, Ligue 2, Ligue 1.
- Quatre coupes à élimination directe (Coupe de la Ligue, Coupe d'Europe, Ligue des champions, Coupe du monde) s'ouvrent en montant de division. Chaque match gagné donne une carte de club ou de pays ; la finale donne des pièces en plus, un paquet offert et un trophée.
- Chaque match rapporte de l'XP et des pièces. 75 pièces = 1 carte joueur (sans légende), 150 pièces = un paquet de 3 cartes (légende possible, cartes plus fortes). 323 cartes à collectionner : 277 joueurs de 20 sélections, 22 pays et 24 clubs (les pays et les clubs ne se gagnent qu'en coupe).
- Évènement « U13 ECE Event » du 23 novembre au 2 décembre 2026, pour les u13 : les matchs mélangent histoire-géo, anglais et SVT, sans choisir de matière.
- Des thèmes en option (anglais, français, maths) sont activés un par un par l'enfant depuis son profil.
- 29 médailles à gagner, un classement entre joueurs et un face-à-face.
- Un compte parent voit le temps de jeu, les résultats, les thèmes à travailler et les thèmes en option activés de chaque enfant.

## Matières

| Matière | Thèmes | Questions |
|---|---|---|
| Anglais (Pro) | Beowulf, Prepositions, Determiners & articles, Conjunctions, Sentence corrections, Mixed tenses, Present simple & continuous, Present perfect, Past simple, Past perfect, Hero's Journey, Burger paragraph & linking words | de 36 à 150 par thème |
| Anglais (Pro) | Irregular verbs (past + participle), 120 verbes | 360 (3 par verbe) |
| Anglais (Pro, en option) | Questions & negatives, Modals, Comparatives & superlatives, Future forms, Relative clauses, Conditionals | de 105 à 129 par thème |
| Anglais (Académie, 8-10 ans) | Irregular verbs (120 verbes, prétérit seulement) | 240 |
| Français (Pro) | Conjugaison, Le verbe et le présent, Orthographe et accords, Grammaire, Vocabulaire | de 100 à 150 par thème |
| Français (Pro, en option) | Groupe nominal, phrase et discours ; Accords : attribut et sujet | 146 et 90 |
| Français (Académie, 8-10 ans) | Présent, Futur simple, Imparfait | 150 par thème |
| Mathématiques (Pro) | Nombres relatifs et repérage, Priorités opératoires, Quotients et puissances, Multiples diviseurs et nombres premiers, Fractions, Calcul littéral et équations, Symétries et angles, Parallélogrammes et quadrilatères, Statistiques, Probabilités, Algorithmique et programmes | de 93 à 166 par thème |
| Mathématiques (Pro, en option) | Proportionnalité, Triangles, Solides et mesures | de 135 à 164 par thème |
| SVT (Pro) | La Terre dans le système solaire, Séismes et volcans | 100 et 112 |
| Physique-chimie (Pro) | Les énergies, Les mouvements, Interactions et circuit électrique | de 46 à 91 par thème |
| Histoire-Géo (Pro, cours en anglais) | Byzantium & Carolingian Europe, Islam, China's population | de 50 à 88 par thème |

Une question ne revient pas tant que tout le thème n'a pas été vu. Certaines questions de maths sont accompagnées d'une figure (repère, triangle, diagramme…).

## Mise en route pour le parent

Suivre [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) : publier les règles, inscrire les identifiants de la famille, puis créer les comptes.

<details>
<summary>Technique</summary>

- Site statique sans étape de build : HTML, CSS, modules ES. Servi par GitHub Pages depuis la racine de `main`.
- `js/core/` : règles du jeu, sans DOM. `js/store/` : stockage (Firebase en ligne, localStorage sur `localhost`). `js/ui/` : écrans et composants. `data/` : questions, clubs, cartes.
- Ajouter une matière : un fichier JSON par thème dans `data/<matière>/` et une entrée dans `data/subjects.json`. Format décrit dans [docs/SPEC.md](docs/SPEC.md). Champs facultatifs : `"accents": true` sur la matière (touches é è à ç… pendant les questions tapées), `"group": "Nom"` sur un thème (les thèmes de la matière sont alors rangés par rubrique), `"forms": ["past","pp"]` sur un thème de verbes (ajoute la question du participe passé), `"optional": true` sur un thème (thème en option, activé par l'enfant), `"figure": {...}` sur une question (dessin décrit par des données, types dans [docs/API.md](docs/API.md)). Le test `tests/content.test.js` contrôle tous les fichiers de questions, figures comprises.
- Tests unitaires : lancer `python -m http.server` à la racine et ouvrir `tests/tests.html` (quinze fichiers `tests/*.test.js` : moteur, état, coupes, évènements, thèmes en option, figures, cartes, contenu…).
- API du moteur : [docs/API.md](docs/API.md). Système visuel : [docs/UI.md](docs/UI.md), aperçu dans `gallery.html`.

</details>
