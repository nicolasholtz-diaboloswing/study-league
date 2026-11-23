# À faire

## Suivi des limites GitHub (compte gratuit)

- [ ] Avoir une vue des limites du compte gratuit et de la marge restante : taille du repo, taille du site Pages, trafic mensuel, nombre de mises en ligne par heure, stockage LFS et artefacts.
- [ ] Vérifier dans GitHub > Settings > Billing and plans ce qui est réellement consommé.
- [ ] Décider d'un seuil d'alerte (par exemple 50 % d'une limite) et de la façon de le surveiller.

Repère au 22/11/2026 : le site publié pèse 1,1 Mo et le repo 2,4 Mo. Le projet n'utilise ni Git LFS, ni GitHub Actions personnalisées, ni artefacts.

## À vérifier sur un vrai appareil

- [ ] Question à réponse tapée sur un téléphone : le champ et le bouton restent-ils visibles au-dessus du clavier ?
- [ ] Écrans Cartes, Rivaux, Profil et Médailles en étant connecté sur le site en ligne.
- [ ] Un compte absent de la liste `members` voit bien l'écran « pas encore autorisé ».

## Ménage

- [ ] Supprimer ou désactiver le compte de test `zz_test_5339` (Authentication, et son document dans `members`).
- [ ] Mettre `docs/API.md` à jour des derniers ajouts.
- [ ] `gallery.html` déborde en largeur sur téléphone (page de démonstration, hors appli).

## Idées pour la suite

- [ ] Changer son mot de passe depuis le profil (aujourd'hui impossible, et pas de réinitialisation par e-mail).
- [ ] Matières suivantes : maths, physique, SVT, chinois (YCT2).
- [ ] Durcir les adversaires de District si la montée devient trop automatique.
- [ ] Équipes u14 (4e) et u15 (3e) : créer les deux équipes et leurs contenus de maths à partir du programme officiel du cycle 4 (`exemple-mise-en-oeuvre-c4-mathematiques`, parties Quatrième et Troisième). Demande de modifier et redéployer `firestore.rules`, qui n'accepte aujourd'hui que `u10` et `u13`, ainsi que le test de contenu.
