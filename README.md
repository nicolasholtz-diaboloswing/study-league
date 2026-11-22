# Study League

Un jeu de révision en forme de championnat de football. On répond à des questions, on marque des buts, on monte de division et on collectionne des cartes de joueurs.

**Jouer** : https://nicolasholtz-diaboloswing.github.io/study-league/

## Comment ça marche

- Un match = 15 questions, environ 5 minutes. Trois bonnes réponses marquent un but ; une erreur donne une occasion à l'adversaire.
- Une saison = 14 journées contre 7 clubs. Les 2 premiers montent : District, Régional, National, Ligue 2, Ligue 1.
- Chaque match rapporte de l'XP et des pièces. 50 pièces = un paquet de 3 cartes (72 joueurs de l'équipe de France à collectionner).
- 24 médailles à gagner, un classement entre joueurs et un face-à-face.
- Un compte parent voit le temps de jeu, les résultats et les thèmes à travailler de chaque enfant.

## Matières

| Matière | Thèmes | Questions |
|---|---|---|
| Anglais | Determiners, Past simple, Past perfect | 150 par thème |
| Anglais | Irregular verbs (120 verbes) | 360 |
| Français | Conjugaison, Orthographe et accords, Grammaire, Vocabulaire | 150 par thème |

Une question ne revient pas tant que tout le thème n'a pas été vu.

## Mise en route pour le parent

Suivre [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) : publier les règles, inscrire les identifiants de la famille, puis créer les comptes.

<details>
<summary>Technique</summary>

- Site statique sans étape de build : HTML, CSS, modules ES. Servi par GitHub Pages depuis la racine de `main`.
- `js/core/` : règles du jeu, sans DOM. `js/store/` : stockage (Firebase en ligne, localStorage sur `localhost`). `js/ui/` : écrans et composants. `data/` : questions, clubs, cartes.
- Ajouter une matière : un fichier JSON par thème dans `data/<matière>/` et une entrée dans `data/subjects.json`. Format décrit dans [docs/SPEC.md](docs/SPEC.md).
- Tests unitaires : lancer `python -m http.server` à la racine et ouvrir `tests/tests.html`.
- API du moteur : [docs/API.md](docs/API.md). Système visuel : [docs/UI.md](docs/UI.md), aperçu dans `gallery.html`.

</details>
