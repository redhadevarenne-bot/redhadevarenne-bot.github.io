# Pixonaute — règles de session

À lire en premier, avant toute exploration.

## Démarrer une session ici

Réponds d'abord par une phrase : ce que tu as compris de la demande, et
quels fichiers tu comptes ouvrir. N'ouvre rien avant. Si la demande est
ambiguë, pose UNE question, pas quatre.

Ne relis jamais ce projet « pour te faire une idée ». Tout ce dont tu as
besoin pour t'orienter est dans ce fichier.

## Économie de contexte — non négociable

Ce projet contient deux fichiers énormes. Les lire en entier consomme
l'équivalent de la moitié d'une session pour rien.

| Fichier | Taille | Règle |
|---|---|---|
| `pixovery-app/src/components/PixoveryPage.jsx` | ~150 Ko | **Ne jamais lire en entier.** Grep ciblé, puis `Read` avec `offset`/`limit` sur 30–60 lignes. |
| `pixovery-app/src/styles/global.css` | ~115 Ko | Idem. Grep le sélecteur, lis autour. |
| `index.html` (racine) | ~230 Ko | Ancien site. Référence morte. Ne pas lire, ne pas modifier. |
| `Pixovery Website.html` | 6,6 Mo | Ne jamais ouvrir. |

Autres règles :

- **Jamais de listing récursif** sur `pixovery-app/` (il contient
  `node_modules`) ni sur `assets/font/` (150 fichiers de polices).
  Lister dossier par dossier, sans `recursive`.
- **Jamais d'images en pleine résolution dans le contexte.** Les visuels
  du projet font 1300–1500 px. Les réduire à ~600 px avant de les
  regarder, ou faire une planche-contact unique pour comparer plusieurs
  fichiers d'un coup. Une image reste en mémoire à chaque tour suivant :
  elle se repaie en permanence.
- **Ne pas recoller une image déjà présente sur le disque.** Elle est
  lisible depuis le chemin, en version réduite.
- Traitement d'image : passer par un script Python (PIL / numpy / scipy /
  skimage sont dispos), pas par des allers-retours visuels.

## Ce qui coûte cher, par ordre

1. **Une image collée en pleine résolution.** Elle reste en mémoire à
   chaque tour suivant : elle se repaie en permanence. Les visuels du
   projet font 1300–1500 px. Lis-les depuis le disque, réduits à ~600 px,
   ou fais une planche-contact unique pour en comparer plusieurs.
2. **La lecture intégrale d'un gros fichier.** `PixoveryPage.jsx` seul
   coûte l'équivalent de la moitié d'une session.
3. **Un listing récursif** sur un dossier qui contient `node_modules` ou
   `assets/font/`.
4. **Les sous-agents** (`/gauntlet-loop`, Task, Explore). Chacun repart à
   froid et reconstruit le contexte du projet. Ne les lance que si on te
   le demande explicitement, et cadre-les sur une seule section.
5. **Changer d'avis en cours de route.** Un travail entamé puis réorienté
   se paie deux fois. Mieux vaut une question au départ.

## Où se trouve quoi

- Site actuel : `pixovery-app/` (Vite + React)
- Tout le markup et tout le JS : `src/components/PixoveryPage.jsx`
- Styles : `src/styles/global.css`
- Assets servis : `pixovery-app/public/assets/`
- Ancien site figé, à ne jamais toucher : `index.html` à la racine

## Lancer

```powershell
cd "$HOME\OneDrive\Bureau\pixonaute\pixovery-app"
npm run dev
```

Puis `localhost:5173/?motion=full`. Le paramètre est **obligatoire** :
« réduire les animations » est actif sous Windows sur cette machine, et
sans lui les animations sont bridées — on croit que c'est cassé.

## Pièges vérifiés

- **GSAP et les `var()`.** `[data-herovisual]`, `[data-bulb]` et les
  `[data-plane]` ont un transform écrit avec `var(--px)`,
  `calc(-50% + var(--py))`, `scale(var(--sc))`. GSAP fige ces `var()` en
  matrice et la parallaxe meurt. Mémoriser le transform et le restituer.
- **`--u` / `--tu`.** Toute la mise en page en dépend. Les supprimer
  casse tout.
- **Les attributs `data-*`.** Le JS s'en sert pour retrouver ses
  éléments. Renommer sans corriger la méthode qui lit casse en silence.
- **Tailwind, si ajouté un jour :** `corePlugins: { preflight: false }`.
- **`prefers-reduced-motion` est actif sur cette machine.** Dégrader,
  jamais couper.
- **Lenis désobéit en silence.** Son option `respectReducedMotion` vaut
  `true` par défaut : quand « réduire les animations » est actif, il
  force `lerp` à 1, jette `duration` et `easing`, et le scroll redevient
  exactement natif — **tout en posant quand même ses classes `.lenis`
  sur `<html>`**. On inspecte, on voit `class="lenis lenis-smooth"`, on
  en conclut qu'il tourne, et on va chercher le problème dans Vite, dans
  le cache ou dans le HMR. Il est dans Lenis. `?motion=full` court-circuite
  le garde-fou du site, pas le sien. L'option est donc à `false` dans
  `smoothScroll()` — l'arbitrage reduced-motion se fait chez nous, plus
  haut, en ne construisant pas d'instance du tout. Ne la remets pas à
  `true` en croyant bien faire.
- **Un halo placé en pourcentage rate son sujet.** `--u` est plafonné à
  1,40625 : au-delà de 1440 px de large, le contenu se fige à 1440 px et
  reste centré, pendant qu'un `radial-gradient(… at 74% 50%)` continue de
  s'écarter avec le viewport. Les deux radiaux de Services dérivaient
  ainsi de −69 px à 1024 jusqu'à +171 px à 2560. Tout halo censé éclairer
  un élément se centre en unités `--u` depuis le milieu —
  `calc(50% + 315*var(--u))` pour la disquette, `calc(50% - 145*var(--u))`
  pour la colonne de texte — et pas en pourcentage.
- **Deux moteurs de défilement ne cohabitent pas.**
  `html{scroll-behavior:smooth}` a été retiré de `global.css` pour cette
  raison : le natif relissait par-dessus Lenis et le mouvement n'arrivait
  jamais. Même règle pour tout `window.scrollTo` frame par frame — Lenis
  resynchronise sa cible sur chaque scroll natif, les deux se corrigent
  soixante fois par seconde, et ça se voit.

## Défilement — Lenis

`lenis` ^1.3.26, branché dans `smoothScroll()`, appelée **en premier**
dans `componentDidMount` (les autres méthodes testent `this.lenis`).

- Réglage : `duration: 1.40` + easeOutExpo, `wheelMultiplier: 1.4`. Un
  cran de molette = 420 px en 1,38 s. Au-delà de ~1,5 s la page ne
  s'arrête plus franchement quand on lâche : on ne la tient plus. Pour
  accentuer, ne pas monter la durée — retirer `duration` **et** `easing`
  et mettre `lerp: 0.055`, qui change de caractère (glisse continue au
  lieu d'une course chronométrée). Lenis ignore `lerp` tant que
  `duration`+`easing` sont fournis.
- **Un seul rAF** : `gsap.ticker` pilote `lenis.raf`, avec
  `lagSmoothing(0)`. Deux boucles se décalent d'une frame et la
  parallaxe du hero se met à nager.
- Les six écouteurs `scroll` d'origine n'ont pas été réécrits : Lenis
  écrit une vraie position, donc `window.scrollY` reste juste.
- `syncTouch: false` — le tactile garde le natif.

**Section Services.** Elle garde son défilement par crans. Le partage se
fait par l'option `virtualScroll`, qui rend la main à la section
exactement quand son écouteur `wheel` va consommer le geste (elle tient
l'écran **et** on n'est pas à une extrémité). Ne pas utiliser
`lenis.stop()` ici : `stop()` continue de faire `preventDefault` sur la
molette, on reste coincé dans la section. `stop()` est en revanche le bon
outil dans `intro()`, où on veut un blocage franc.
`this.svcConsomme` et l'écouteur `wheel` portent la même condition — si
tu touches à l'une, touche à l'autre.

**Ruban Portfolio.** Même principe, appliqué au déplacement horizontal :
tout passe par une cible, et un suivi amorti (`exp(-LAMBDA·dt)`,
`LAMBDA = 9`) la poursuit sur `gsap.ticker`. Quatre entrées seulement —
`glisseVers` (molette, bords), `porteVers` (flèches, recalage après un
glisser), `poseX` (glisser en cours, redimensionnement) et `setX` qui
n'est plus appelée que par elles. `dt` est plafonné à 64 ms, sinon un
onglet revenu au premier plan téléporte le ruban. L'ancienne boucle
`autoTick` a été supprimée : c'était un second rAF.

## Section Services — disquettes

Les pictogrammes ont été remplacés par les disquettes 3,5".

- Assets : `public/assets/floppy/floppy-{identite-visuelle,print,web,illustration}.webp`
  — 576×576, détourés, **redressés** (aucune inclinaison dans le
  fichier), calibrés au même poids visuel, ~45 Ko pièce.
- Markup : `[data-svcico]` (boîte + `perspective`) →
  `[data-floppy]` (nœud de rotation) → `<img>`.
- CSS : fin de `global.css`, bloc « SERVICES — disquettes 3,5" ».

**L'ordre des transforms compte.** `rotate(var(--floppy-tilt))` doit
rester **avant** `rotateY()`. Dans cet ordre, le pivot se fait sur l'axe
vertical propre de la disquette ; inversé, elle vacille.

Le survol passe `--floppy-sway` de 6deg à 12deg. La propriété est
déclarée en `@property` pour que la transition s'interpole au lieu de
sauter — ne pas retirer la déclaration.

`[data-floppy]` est le nœud prévu pour une éventuelle rotation 360°
ultérieure : c'est le seul endroit à modifier.

## Méthode

Direction artistique d'abord, code ensuite. Montrer le résultat.
Ne jamais annoncer qu'un défaut est corrigé sans l'avoir vérifié dans un
vrai navigateur (Playwright + Chromium sont dispos ; monter un harnais
minimal avec le vrai markup et le vrai CSS).

Tutoiement.
