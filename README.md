# Stomo

Stomo est un studio de stop motion en français, conçu pour être explicite et agréable à utiliser dès 8 ans. L’application fonctionne dans Chrome, conserve les films dans le navigateur et continue de fonctionner hors connexion après son installation.

## Installer sur le téléphone

1. Ouvrir l’adresse GitHub Pages de Stomo dans Chrome avec une connexion internet.
2. Dans le menu Chrome, choisir **Ajouter à l’écran d’accueil**.
3. Ouvrir Stomo depuis sa nouvelle icône une première fois.
4. Pour vérifier le mode hors ligne, activer le mode avion puis rouvrir Stomo.

Les photos, vidéos et sauvegardes demandées arrivent dans le dossier **Téléchargements**. Les projets restent aussi dans les données du site Chrome. Avant d’effacer les données de Chrome ou de changer de téléphone, utiliser **Sauvegarder ce projet** pour obtenir un fichier `.stomo`.

## Session enfant et épinglage Android

Stomo ne peut pas empêcher Android de fermer une page web. La protection associe donc deux mécanismes :

- **Épinglage de l’écran Android** : l’adulte l’active dans les réglages de sécurité du téléphone, démarre une session enfant dans Stomo, puis épingle l’application depuis l’écran des applications récentes. Le nom exact du réglage varie selon la version Samsung.
- **Journal Stomo** : pendant une session, toute disparition de l’application laisse une alerte persistante et une ligne horodatée dans le journal. Le code adulte est nécessaire pour valider les alertes, terminer la session ou effacer le journal.

L’enfant conserve l’accès à toutes les fonctions créatives et aux téléchargements. Le code ne verrouille aucune fonction de création.

## Développement

Prérequis : Node 22 et npm 11.

```bash
npm install
npm run dev
```

Les commandes de contrôle sont :

```bash
npm run lint
npm test
npm run build
npm run check
```

Le build cible Chrome 101. La variable `VITE_BASE` permet de construire pour un sous-chemin GitHub Pages :

```bash
VITE_BASE=/nom-du-depot/ npm run build
```

## Publication GitHub Pages

Le workflow `.github/workflows/pages.yml` vérifie le code, exécute les tests, construit le site avec le sous-chemin du dépôt puis publie `dist`. Dans les paramètres du dépôt GitHub, choisir **Pages → Source → GitHub Actions**.

## Formats

- JPEG : une photo choisie ;
- ZIP : toutes les photos JPEG numérotées et `informations.txt` ;
- WebM VP8 : film muet ;
- `.stomo` : archive versionnée contenant les images WebP originales et les réglages.

Les détails sur les projets ayant inspiré Stomo sont dans [ATTRIBUTIONS.md](./ATTRIBUTIONS.md).
