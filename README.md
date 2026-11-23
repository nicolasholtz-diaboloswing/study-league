# Study League

Un jeu de révision en forme de championnat de football. On répond à des questions, on marque des buts, on monte de division et on collectionne des cartes de joueurs.

**Jouer** : https://nicolasholtz-diaboloswing.github.io/study-league/

**Version** : le numéro (par exemple `v1.1.0`) s'affiche dans l'en-tête du site et en bas de l'écran de connexion. Il est défini une seule fois, dans `js/config.js` (`APP_VERSION`) : on l'augmente à chaque mise en ligne.

## Comment ça marche

- Un match = 10 questions, environ 3 minutes. Deux bonnes réponses marquent un but ; une erreur donne une occasion à l'adversaire. Les u13 peuvent choisir le « Mode expert » : chaque erreur donne alors un but à l'adversaire.
- Une saison = 7 journées, une rencontre contre chacun des 7 autres clubs (matchs aller simples). Les 2 premiers montent : District, Régional, National, Ligue 2, Ligue 1.
- Chaque match rapporte de l'XP et des pièces. 75 pièces = 1 carte (sans légende), 150 pièces = un paquet de 3 cartes (légende possible, cartes plus fortes) (191 joueurs de 11 sélections nationales à collectionner : France, Argentine, Angleterre, Espagne, Portugal, Brésil, Allemagne, Italie, Pays-Bas, Belgique, Maroc).
- 25 médailles à gagner, un classement entre joueurs et un face-à-face.
- Un compte parent voit le temps de jeu, les résultats et les thèmes à travailler de chaque enfant.

## Matières

| Matière | Thèmes | Questions |
|---|---|---|
| Anglais (Pro) | Beowulf, Prepositions, Determiners & articles, Conjunctions, Sentence corrections, Mixed tenses, Present simple & continuous, Present perfect, Past simple, Hero's Journey, Burger paragraph, Past perfect | environ 150 par thème |
| Anglais (Pro) | Irregular verbs (past + participle), 120 verbes | 360 (3 par verbe) |
| Anglais (Académie, 8-10 ans) | Irregular verbs (120 verbes, prétérit seulement) | 240 |
| Français (Pro) | Conjugaison, Le verbe et le présent, Orthographe et accords, Grammaire, Vocabulaire | environ 150 par thème |
| Français (Académie, 8-10 ans) | Présent, Futur simple, Imparfait | 150 par thème |
| Mathématiques (Pro) | Nombres relatifs et repérage, Priorités opératoires, Quotients et puissances, Symétries et angles | |
| SVT (Pro) | La Terre dans le système solaire, Séismes et volcans | |
| Physique-chimie (Pro) | Les énergies, Les mouvements, Interactions et circuit électrique | |
| Histoire-Géo (Pro, cours en anglais) | Byzantium & Carolingian Europe, Islam, China's population | |

Une question ne revient pas tant que tout le thème n'a pas été vu.

## Mise en route pour le parent

Suivre [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) : publier les règles, inscrire les identifiants de la famille, puis créer les comptes.

<details>
<summary>Technique</summary>

- Site statique sans étape de build : HTML, CSS, modules ES. Servi par GitHub Pages depuis la racine de `main`.
- `js/core/` : règles du jeu, sans DOM. `js/store/` : stockage (Firebase en ligne, localStorage sur `localhost`). `js/ui/` : écrans et composants. `data/` : questions, clubs, cartes.
- Ajouter une matière : un fichier JSON par thème dans `data/<matière>/` et une entrée dans `data/subjects.json`. Format décrit dans [docs/SPEC.md](docs/SPEC.md). Champs facultatifs : `"accents": true` sur la matière (touches é è à ç… pendant les questions tapées), `"group": "Nom"` sur un thème (les thèmes de la matière sont alors rangés par rubrique), `"forms": ["past","pp"]` sur un thème de verbes (ajoute la question du participe passé). Le test `tests/content.test.js` contrôle tous les fichiers de questions.
- Tests unitaires : lancer `python -m http.server` à la racine et ouvrir `tests/tests.html`.
- API du moteur : [docs/API.md](docs/API.md). Système visuel : [docs/UI.md](docs/UI.md), aperçu dans `gallery.html`.

</details>
