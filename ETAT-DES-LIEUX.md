# État des lieux — 22 août 2026

Point de reprise. La carte technique reste dans `CLAUDE.md` ; ce fichier dit
**où on en est** et **ce qu'il ne faut pas refaire**.

## À FAIRE EN PREMIER — commiter

Le dépôt n'a toujours qu'**un seul commit**. Tout le travail est sur le disque.

```powershell
cd "$HOME\OneDrive\Bureau\pixonaute"
git add pixovery-app/src/components/PixoveryPage.jsx `
        pixovery-app/src/styles/global.css `
        pixovery-app/public/assets/perso-tour-v2.webp `
        pixovery-app/public/assets/perso-filaire-v2.webp `
        pixovery-app/public/assets/pot-solide.webp `
        ETAT-DES-LIEUX.md
git commit -m "Hero : piste collante, rotation du perso, scan filaire, chute des lettres"
```

Jamais `git add -A` : ça embarquerait `Pixovery Website.html` (6,6 Mo),
`_to_delete/`, `uploads/`, `screenshots/`.

## Pour voir le résultat

```powershell
cd "$HOME\OneDrive\Bureau\pixonaute\pixovery-app"
npm run dev
```
Puis **`localhost:5173/?motion=full`**. Le paramètre est obligatoire :
« réduire les animations » est actif sur cette machine.

Copie compilée et hébergée du hero (à jour) :
https://claude.ai/code/artifact/7917f635-1a46-4df2-bd5e-7c49d3b8e837

---

## Ce qui a changé aujourd'hui

### Le hero est COLLÉ dans une piste

`[data-heropiste]` enveloppe la section, hauteur `100vh + var(--piste-hero, 300vh)`.
`[data-hero]` est passé en `position:sticky; top:0` (le `position:relative` en
ligne a été retiré du JSX, sinon il gagnait sur la CSS).

`heroScroll()` a été réétalonné sur la même course : calé sur `innerHeight`, la
copie finissait sa montée dès le premier écran alors que tout le reste était
encore collé.

### `scanHero()` a été réécrit

Il pilote maintenant toute la séquence depuis `scrollY / course()`. Répartition,
en fractions de la course :

| | de | à |
|---|---|---|
| naissance (fondu) | 0 | 0,13 |
| rotation, 76 images | 0,06 | **0,62** |
| balayage | 0,16 | 0,52 |
| glitch | 0,64 | 1 |

`FIN = 0.62` : la rotation s'achève **avant** le bout de la piste. Tout ce qui
reste est un temps d'arrêt — la figurine tient sa pose, ampoule levée. Sans ça
le hero se décollait à l'instant où l'ampoule montait : la séquence n'avait pas
de fin, elle était coupée.

### Les deux calques du perso sont des canvas

`<canvas className="scanSolid" data-perso="plein">` et
`<canvas className="scanWire" data-perso="fil">`, 550×550, qui valent toute la
boîte. La tuile est dessinée dedans à `DX/DY/DW/DH` (42,636 % / 12,909 % /
50,273 % / 77,455 %) — comme ça les masques `--sa/--sb` et `--ha..--hd`,
exprimés en pourcentage de la boîte, **restent justes au pixel près**.

Le mécanisme de masque du site n'a pas été remplacé, seulement rebranché.

### Le pot ne se virtualise jamais

`<img className="potSolide">`, hors des calques masqués. Extrait de
`hero-scan-a` en ne gardant que sa composante de gauche.

### La chute des lettres

Dans `intro()`. `splitTitle()` pose `dy` (−290 à −380 %), `dr` (1,5 tour, un sens
sur deux), `dl`. Le tween est une boucle **lettre par lettre**, pas un `fromTo`
avec `stagger`.

### Supprimé

- L'allumage à l'intro : `const ALLUMAGE = false;` → `LUM = 0`. Le code est
  intact. Il tenait à l'ancien perso, qui tenait une ampoule dès la première
  image.
- `[data-bulb]` et ses dix `[data-spark]`, les deux `[data-lens]`, et
  `hero-cut-b` : tous calés sur la pose fixe de l'ancien personnage.

### Ajouté en fin de séquence (classe `pose-tenue` sur `[data-herovisual]`)

- **Reflets de lunettes** : trois couches (point spéculaire permanent, lustre
  qui traverse, halo `box-shadow` qui déborde). Verre gauche à 57,62 %, droit à
  70,80 % — ils n'ont pas la même largeur, la tête est vue de trois quarts.
- **Ampoule** : halo qui respire (`ampouleLuit`) + 16 poussières de lumière
  (`poussiere`), centre mesuré à 49,75 % / 37,87 %.
- **Glitch** : tranches déplacées + séparation RVB par les filtres SVG
  `#pxRouge` / `#pxCyan`.

---

## Les assets

| fichier | quoi |
|---|---|
| `perso-tour-v2.webp` | 76 images du solide, RVBA, tuiles **332×512**, 10 colonnes |
| `perso-filaire-v2.webp` | les mêmes en filaire, **niveaux de gris** (l'intensité EST l'alpha) |
| `pot-solide.webp` | le pot seul, 1100×1100 |

Sources : deux vidéos Kling. Le solide vient de la rotation + levée d'ampoule
(121 images), le filaire du maillage (97 images).

**Le filaire tourne dans l'AUTRE sens que le solide** — mesuré, pente −0,61 sur
les meilleurs appariements de silhouette. Il est joué **à rebours**. Calage
pose par pose sur cinq repères, vérifiés à l'œil :

```
solide  [24, 43, 69,  90, 110]
filaire [88, 68, 54,  38,  18]      face, profil G, dos, profil D, face
```

Les **douze dernières tuiles** du filaire basculent sur la pose ampoule levée
(image fournie par Redha, détourée par passe-haut), avec un fondu sur sept
images. Le maillage filmé n'a jamais eu cette pose : c'est ce qui faisait
apparaître un fragment décalé sous le curseur-scanner.

Recolorisation du filaire : **une tuile à la fois**, au changement d'image
(~170 000 px, 2 ms). Repeindre la planche entière au chargement coûterait 13
millions de pixels d'un coup.

---

## Pièges vérifiés — ne pas les rejouer

**`gsap.from()` + `stagger` ne masque pas les cibles en attente.** Elles se
rendent à leur valeur **finale** tant que leur sous-tween n'a pas démarré.
Mesuré : opacités `0,1,1,1,1…` au temps 0. Utiliser `fromTo`.

**Deux `set()` au même instant sur la timeline : le dernier ajouté gagne.** La
première lettre ne s'affichait jamais. Poser le masquage AVANT le dévoilement,
et l'omettre pour l'élément qui part à zéro.

**Ne jamais remplacer une zone délimitée par deux repères** dans
`PixoveryPage.jsx`. Ça a emporté tout le bloc des lettres une fois de plus.
Chaînes exactes, une par une.

**Le hero n'a pas d'`overflow:hidden`.** Les lettres qui tombent en sortaient
par le haut et passaient devant le header. Le hero se clippe donc le temps de
la séquence, et se rouvre après.

**`mix-blend-mode` n'atteint pas le fond du hero.** `[data-herovisual]` porte un
transform, donc un contexte d'empilement. Un canvas sur fond noir affichait un
rectangle noir sur la nappe violette. Les planches sont détourées à la source.

**Un tirage aléatoire doit être déterministe.** En scrub, la même position de
scroll doit rendre la même image, sinon tout grelotte à la molette.

**Le trait filaire s'épaissit à chaque rééchantillonnage.** Seuil resserré
(125, largeur 38) **et gamma 1,7 appliqué APRÈS le redimensionnement** — c'est
là que naissent les franges. Les tuiles font 332×512 pour un affichage à
~400×617 : en dessous, on voit l'agrandissement.

**Un glitch se lit à ~14 images/seconde, pas à 60.** Il avance par `setTimeout`,
et **aucun rAF permanent** ne tourne : rien avant le bout de la piste, tout
s'arrête si on remonte.

---

## En attente

- **Le poids** : les deux planches font 2,9 Mo. C'est le prix du net à cette
  taille. Réductible en baissant le nombre d'images ou la taille des tuiles.
- `perso-tour-76.webp` et `perso-filaire-76.webp` ne servent plus dans
  `public/assets/` — supprimables.
- **Témoignages** : textes de remplissage, noms inventés. À remplacer avant
  mise en ligne.
- Le site en ligne (`www.pixovery.com`, GitHub Pages) tourne sur la version
  d'avant. Rien de tout ça n'y est.

## Sauvegardes à la racine

`PixoveryPage.AVANT-TOUR.jsx`, `global.AVANT-TOUR.css`,
`PixoveryPage.AVANT-CHUTE.jsx`.
