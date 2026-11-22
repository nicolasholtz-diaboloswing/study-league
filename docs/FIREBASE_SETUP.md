# Mode « en ligne » de Study League (Firebase)

Le projet Firebase est déjà créé (`study-league-83cbe`) et sa configuration est déjà dans `js/config.js`. Il reste à publier les règles de sécurité, puis à déclarer les trois comptes de la famille (deux enfants et le parent).

Principe : seuls les comptes dont l'identifiant figure sur une **liste de la famille** (la collection `members`) peuvent lire ou écrire quoi que ce soit. Un inconnu qui s'inscrirait sur le site ne verrait rien.

## 1. Publier les règles

1. Ouvrez <https://console.firebase.google.com>, votre projet, puis **Firestore Database**, onglet **Règles**.
2. Effacez tout, ouvrez le fichier `firestore.rules` du dépôt, copiez tout son contenu et collez-le.
3. Cliquez sur **Publier**.

## 2. Créer la liste de la famille (`members`)

Un document par personne : les deux enfants **et vous**.

1. **Firestore Database**, onglet **Données**, **Démarrer une collection**. ID de la collection : `members` (exactement).
2. **ID du document** : l'identifiant de la personne suivi de `@study-league.app`, **en minuscules**. Exemple : l'enfant choisit l'identifiant `Leo`, le document s'appelle `leo@study-league.app`.
3. Un champ : nom `ok`, type `boolean`, valeur `true`. **Enregistrer**.
4. Répétez pour chaque personne (**Ajouter un document**).

Le mieux : créez le document juste avant que la personne s'inscrive, et choisissez l'identifiant avec elle.

## 3. Inscrire les trois comptes

1. Chacun ouvre le site et crée son compte avec **exactement** l'identifiant de l'étape 2 (majuscules ou minuscules, peu importe).
2. Les enfants choisissent « Créer mon compte ». Vous, vous choisissez **Je suis un parent**.
3. Si l'écran « Ton compte n'est pas encore autorisé » apparaît, le document `members` correspondant manque ou son nom est faux. Corrigez-le, puis touchez **Réessayer**.

## 4. Déclarer le compte parent (`coaches`)

À faire une seule fois, **après** votre inscription.

1. Console Firebase, **Authentication**, onglet **Users**. Repérez votre compte (`votreidentifiant@study-league.app`) et copiez la colonne **User UID** (une longue suite de lettres et de chiffres). L'application l'affiche aussi sur votre Espace parent, avec un bouton **Copier**.
2. **Firestore Database**, **Démarrer une collection**, ID : `coaches`.
3. **ID du document** : collez le User UID. Ajoutez un champ au choix (par exemple `note` = `parent`). **Enregistrer**.
4. Dans l'application, déconnectez-vous puis reconnectez-vous : l'**Espace parent** apparaît.

## 5. Entretien et sécurité

- **Faire le ménage** : de temps en temps, dans **Authentication > Users**, supprimez tout compte que vous ne reconnaissez pas, puis supprimez ses documents dans Firestore (`users/<uid>` et `leaderboard/<uid>`). Sans document `members`, un tel compte ne peut de toute façon rien lire.
- **Limiter les inscriptions** : une fois les trois comptes créés, dans **Authentication > Paramètres**, désactivez la création de comptes (« Actions utilisateur », décocher la création). Pour ajouter quelqu'un plus tard, réactivez-la le temps de son inscription. Si la console propose un **quota d'inscriptions**, baissez-le (par exemple 10 par heure).
- **Rester gratuit** : gardez le forfait **Spark** (gratuit). Ne renseignez aucune carte bancaire : si un quota est dépassé, le service se bloque au lieu de facturer.
- **Mot de passe oublié** : voir la section ci-dessous.
- **Tablette partagée** : après chaque séance, **Plus > Se déconnecter**. Sinon l'enfant suivant arrive dans le compte du précédent.

## Mot de passe oublié

Il n'existe pas de récupération simple, et mieux vaut le savoir avant :

- Les comptes utilisent de **fausses adresses e-mail** (`identifiant@study-league.app`). Ces boîtes n'existent pas : Firebase ne peut envoyer aucun e-mail de réinitialisation.
- La console Firebase ne permet pas non plus de choisir un nouveau mot de passe pour un compte existant.
- **Prévention** : notez, en tant que parent, l'**identifiant** et le **mot de passe** de chaque enfant (et les vôtres) sur papier ou dans un gestionnaire de mots de passe.
- **Dernier recours** : dans la console, **Authentication > Users**, supprimez le compte (menu **⋮**, **Supprimer le compte**), puis recréez-le : **Ajouter un utilisateur** avec `identifiant@study-league.app` et un nouveau mot de passe, ou laissez l'enfant se réinscrire (le document `members` reste valable). **Cet enfant perd sa progression** : le nouveau compte a un nouvel UID et repart de zéro. L'ancienne fiche reste dans Firestore (`users/<ancien uid>` et `leaderboard/<ancien uid>`) ; vous pouvez la supprimer.

## En cas de problème

- « Ton compte "…" n'est pas encore autorisé » : le document `members/<identifiant>@study-league.app` est absent ou mal écrit (minuscules, pas d'espace). Après correction : **Réessayer**.
- « Sauvegarde impossible — vérifie ta connexion » : pas d'internet, ou règles non publiées. La progression reste dans l'appareil tant que la page n'est pas fermée, et la sauvegarde suivante réessaie.
- Espace parent qui demande une étape : le document `coaches/<UID>` manque (étape 4), ou votre identifiant n'est pas dans `members`.
- « Unauthorized domain » sur le site publié : dans **Authentication > Settings > Authorized domains**, ajoutez `<votre-compte-github>.github.io`.
- « La connexion par e-mail et mot de passe n'est pas activée » : dans **Authentication > Sign-in method**, activez **E-mail/Mot de passe**.

<details>
<summary>Détails techniques</summary>

- Collections : `users/{uid}` (état complet du joueur ou du parent), `leaderboard/{uid}` (résumé public, écrit seulement par un joueur membre), `coaches/{uid}` (à la main), `members/{identifiant@study-league.app}` (à la main, jamais lisible depuis l'application).
- `firestore.rules` valide aussi les données écrites : longueurs (nom ≤ 40, club ≤ 24), couleurs en `#rrggbb`, compteurs entiers bornés, écusson parmi `shield`, `round`, `diamond`, `stripes`. Un client modifié ne peut donc pas y mettre n'importe quoi.
- Un compte parent n'écrit jamais dans `leaderboard`.
- Le site impose une politique de sécurité de contenu (balise `Content-Security-Policy` de `index.html`) : scripts du site et du SDK Firebase (`www.gstatic.com/firebasejs/`) seulement.
- Le SDK Firebase (10.12.2) n'est chargé que si `FIREBASE_CONFIG` n'est pas `null`. Sur `localhost` l'application reste en mode local ; ajouter `?cloud=1` à l'adresse force le mode en ligne.
- Identifiant de connexion : `<identifiant en minuscules>@study-league.app`, 3 à 16 caractères (lettres, chiffres, `_`).
- Une progression locale du même identifiant peut être importée à l'inscription en ligne.

</details>
