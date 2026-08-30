# Stomo

Stomo est un studio de stop motion en français, conçu pour les enfants à partir
de 8 ans. La caméra, le montage, la lecture et les sauvegardes restent sur le
téléphone.

## Essayer

La version publiée est disponible sur
[dcfvg.github.io/stomo](https://dcfvg.github.io/stomo/).

Pour commencer, touche **Nouveau film**, donne-lui un titre et prends une
première photo. Les projets sont enregistrés automatiquement dans le
navigateur.

## Installer sur un téléphone

### Android

1. Ouvrir Stomo dans Chrome ou Samsung Internet.
2. Choisir **Ajouter à l’écran d’accueil** dans le menu du navigateur.
3. Ouvrir Stomo depuis sa nouvelle icône.

### iPhone ou iPad

1. Ouvrir Stomo dans Safari.
2. Toucher **Partager**, puis **Sur l’écran d’accueil**.
3. Ouvrir Stomo depuis sa nouvelle icône.

Après une première ouverture complète, Stomo peut redémarrer en mode avion.
Avant d’effacer les données du navigateur ou de changer de téléphone, utiliser
**Garder mon projet** pour obtenir un fichier `.stomo` contenant les photos et
les réglages.

Les projets créés avec l’adresse de développement ne sont pas transférés
automatiquement vers l’adresse GitHub Pages. Il faut les exporter en `.stomo`,
puis les rouvrir dans la version publiée.

## Compatibilité

| Téléphone ou tablette | Version prise en charge |
| --- | --- |
| Chrome sur Android | Chrome 101 et versions suivantes |
| Samsung Internet | Version 18 et versions suivantes |
| Safari sur iPhone et iPad | iOS/iPadOS 17.4 et versions suivantes |
| Autres navigateurs | Essai possible, sans garantie d’installation ou de vidéo |

Le Galaxy A5 sous Android 7 et Chrome 101 reste l’appareil de référence
minimal. Stomo conserve pour lui des traitements image par image, une frise
virtualisée et de petits caches de lecture. Les optimisations absentes sur un
ancien navigateur ont toujours un chemin de repli.

La vidéo est un WebM VP8 muet. Safari sait lire ce format complètement à partir
d’iOS/iPadOS 17.4. Le plein écran, le partage de fichier et le bouton d’un
casque sont proposés uniquement lorsqu’ils sont disponibles.

Un film peut contenir 480 photos. Stomo avertit à partir de 400 et surveille
l’espace restant sans envoyer cette information ailleurs.

## Développer

Prérequis : Node 22 et npm 11.

```bash
npm install
npm run dev
```

Le serveur utilise toujours le port `4175`. Garder le même protocole, le même
nom d’hôte et le même port permet de retrouver les projets stockés pendant le
développement.

La caméra exige HTTPS ou `localhost`. Pour tester par USB sur Android :

```bash
adb reverse tcp:4175 tcp:4175
npm run dev
```

Puis ouvrir `http://localhost:4175` sur le téléphone.

Pour tester en HTTPS sur le réseau local :

```bash
npm run cert:dev
npm run dev:https
```

`cert:dev` utilise `mkcert` et inclut les adresses IP locales. Sur Android 7,
l’autorité locale indiquée par `mkcert -CAROOT` doit être installée
temporairement dans les réglages de sécurité, puis retirée après les essais.

Commandes utiles :

```bash
npm run lint
npm test
npm run check
npx playwright install chromium webkit
npm run test:e2e
```

`npm run test:e2e` construit la version `/stomo/` et vérifie Chromium et
WebKit aux dimensions du Galaxy A5, d’un Android récent, d’un iPhone et d’un
iPad.

## Publier

Le workflow GitHub Pages vérifie le code, les tests, le fonctionnement hors
ligne et les formats mobiles avant de publier `dist`.

1. Créer un dépôt public nommé `stomo`.
2. Ajouter ce dépôt comme remote `origin` et pousser `main`.
3. Dans **Settings → Pages**, choisir **GitHub Actions** comme source.
4. Attendre la fin du workflow **Vérifier et publier Stomo**.
5. Installer la version publiée sur les appareils de recette et la rouvrir en
   mode avion.

Le build Pages peut aussi être produit localement avec :

```bash
npm run build:pages
```

La première release reste en version bêta `0.1.0` tant que les recettes
physiques Galaxy A5 et iPhone ne sont pas terminées.

## Fichiers produits

- JPEG : une photo choisie ;
- ZIP : toutes les photos JPEG numérotées ;
- WebM VP8 : le film Full HD avec son carton-titre ;
- `.stomo` v2 : le projet complet, ses images WebP, ses vignettes et ses
  réglages.

Stomo n’utilise ni compte, ni suivi d’usage, ni serveur de données. Voir
[PRIVACY.md](./PRIVACY.md), [CONTRIBUTING.md](./CONTRIBUTING.md) et
[ATTRIBUTIONS.md](./ATTRIBUTIONS.md).
