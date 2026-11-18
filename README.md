# AGRI-LINK RDC — version PostgreSQL

Ce dossier contient le code source d'une première version web progressive (PWA) d'AGRI-LINK RDC.

## Fonctions
- Compte administrateur initial protégé par une clé de première configuration.
- Connexion par identifiant et mot de passe.
- Création de comptes agents par l'administrateur.
- Enregistrement d'observations de prix, stock et transport.
- Mise en attente locale des observations hors connexion et synchronisation au retour d'Internet.
- Consultation des observations centralisées.

## Prérequis
- Node.js 20+
- Base PostgreSQL
- Variables d'environnement : `DATABASE_URL`, `JWT_SECRET`, `BOOTSTRAP_KEY`

## Déploiement Render (à faire après création du dépôt)
Build command : `npm install`
Start command : `npm start`

Créer une base PostgreSQL Render, puis renseigner `DATABASE_URL` avec son URL interne si le service est dans la même région. Définir aussi :
- `JWT_SECRET` : longue valeur aléatoire secrète.
- `BOOTSTRAP_KEY` : longue clé secrète à usage de première configuration.

Ne partagez jamais ces secrets dans un chat ou une capture d'écran. Saisissez-les directement dans les paramètres du service Render.

## Première configuration
Après le déploiement, ouvrir l'adresse HTTPS du service. La page de première configuration permet de créer le premier administrateur à l'aide de `BOOTSTRAP_KEY`. Cette route refuse toute nouvelle création dès qu'un compte existe.

## Important
- Ceci est le code source, pas un service déjà hébergé et pas un fichier APK.
- La PWA peut être installée depuis le navigateur Android après déploiement HTTPS.
- Les données saisies hors ligne sont stockées dans le navigateur de l'appareil jusqu'à leur synchronisation. Ne pas effacer les données du navigateur avant synchronisation.
- Version initiale à tester avec un petit groupe avant utilisation opérationnelle. Prévoir ensuite sauvegardes PostgreSQL, gestion des mots de passe oubliés, journal d'audit, rôles plus fins et tests de sécurité.
