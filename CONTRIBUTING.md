# Contribuer

Merci de garder Stomo simple à comprendre pour un enfant et économe sur un
ancien téléphone.

## Avant une modification

```bash
npm install
npm run check
```

Pour les changements d’interface, d’installation ou de fonctionnement hors
ligne :

```bash
npx playwright install chromium webkit
npm run test:e2e
```

## Principes

- Écrire les commandes et les erreurs en français courant.
- Associer un pictogramme et un libellé accessible aux actions importantes.
- Garder des cibles tactiles d’au moins 56 px autour de la caméra.
- Prévoir l’absence des API facultatives au lieu de bloquer l’application.
- Traiter les images une par une et borner les caches en mémoire.
- Ne pas ajouter de ressource distante, de compte ou de suivi d’usage.
- Ajouter un test lorsqu’un comportement change.

Les commentaires de code doivent expliquer une contrainte utile, pas répéter
ce que fait la ligne suivante. Les messages de commit courts et concrets sont
préférés.

## Recette mobile

Le minimum avant une release est : Galaxy A5 avec Chrome 101, Android récent
avec Chrome, Samsung Internet 18 ou plus, et Safari sous iOS/iPadOS 17.4 ou
plus. Vérifier caméra, orientation, reprise, exports et relance en mode avion.
