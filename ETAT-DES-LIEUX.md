# État des lieux — 26 août 2026

Point de reprise. La carte technique reste dans `CLAUDE.md` ; ce fichier dit
**où on en est**, **ce qu'il ne faut pas refaire**, et **ce qui reste**.

## À FAIRE EN PREMIER — commiter

Le dépôt n'a toujours qu'**un seul commit**, datant du tout début. Une
vingtaine de fichiers ont changé le 25 août. Aucun point de retour.

```powershell
cd "$env:USERPROFILE\OneDrive\Bureau\pixonaute"
git add pixovery-app/src pixovery-app/index.html pixovery-app/public/robots.txt pixovery-app/public/sitemap.xml
git commit -m "Fluidite, alignements, SEO, textes, responsive"
git push
```

Jamais `git add -A` : ça embarquerait `Pixovery Website.html` (6,6 Mo),
`_to_delete/`, `uploads/`, `screenshots/` et les 14 prototypes.

**Le `push` publie le site en ligne**, automatiquement, en ~2 min :
`.github/workflows/deploy.yml` construit et déploie sur GitHub Pages. Suivre
l'avancement sur `github.com/redhadevarenne-bot/redhadevarenne-bot.github.io`,
onglet **Actions**.

Le site en ligne est sur **`www.pixovery.com`** — `pixovery-app/public/CNAME`
porte le domaine, ce n'est donc PAS l'adresse en `.github.io` qu'il faut
ouvrir pour vérifier un déploiement.

## Pour voir le résultat

```powershell
cd "$env:USERPROFILE\OneDrive\Bureau\pixonaute\pixovery-app"; npm run dev
```
Puis **`localhost:5173/?motion=full`**. Le paramètre est obligatoire : sans
lui, Lenis ne démarre pas sur cette machine et tout saute.

---

# CE QUI A CHANGÉ LE 26 AOÛT

## MODE LÉGER SUR TÉLÉPHONE (fluidité du scroll)

Symptôme rapporté : sur téléphone, **ça saccade partout, tout le long**, et
surtout dans le hero et dans Services.

**Ce qui a été écarté d'abord.** Lenis ne touche pas au tactile
(`syncTouch: false`) : sur téléphone le défilement est natif. Le lissage n'est
donc pas en cause. Si ça saccade, c'est qu'un travail par frame bloque le
thread pendant que la page défile.

**La cause retenue — la mémoire.** Les deux planches du hero font
3320 × 4096. Décodées, elles occupent **54 Mo chacune, soit ~108 Mo
résidents**, et elles le restent pendant toute la visite. Sur un téléphone
milieu de gamme c'est au-delà du budget mémoire de l'onglet : le navigateur
jette des bitmaps puis les redécode, et ces redécodages tombent en plein
défilement. C'est ce qui explique que ça saccade **partout** et pas seulement
là où la figurine est visible.

**Le correctif.** Un drapeau `LEGER` (module, seuil 768 px — le MÊME que
`tactile` dans `services()`) en haut de `PixoveryPage.jsx`. En dessous de
768 px :

- `perso-filaire-v2.webp` **n'est plus chargé du tout** : ni téléchargement
  (−1,5 Mo), ni décodage (−54 Mo). C'est le plan B qui était déjà arbitré ici.
- `repeins()` ne tourne donc plus jamais. C'était un `getImageData` + une
  boucle JS sur ~1,7 million d'octets **à chaque changement d'image** :
  négligeable sur PC, 10 à 25 ms sur un CPU mobile.
- `enBitmap()` n'attend plus `pretF` (sinon `bmP` n'aurait jamais été créé et
  la planche pleine serait redevenue une `<img>` redécodable en plein
  défilement — exactement la saccade que `createImageBitmap` supprimait).

**Ce qui est gardé :** la planche pleine en pleine définition — la figurine
tourne comme avant — et `filaire-repos.webp` (124 Ko), donc le filaire de la
pose de repos, celui qu'on voit à l'arrivée sur le site, immobile, donc le
plus regardé. Il s'efface en fondu aux images 17 à 20 comme avant.

**Ce qui est perdu :** le filaire magenta pendant la rotation elle-même, sur
téléphone uniquement. **Sur ordinateur, rien ne change.**

⚠️ **Non vérifié sur un vrai téléphone.** Le raisonnement est structurel
(108 Mo résidents est indéfendable sur mobile quel que soit le profileur),
mais le gain n'a pas été mesuré. Si ça saccade encore après ce déploiement,
le suspect suivant est la parallaxe 3D des disquettes de Services, pas la
mémoire.

## BANC DE DIAGNOSTIC `?light=` (inerte, jetable)

Ajouté en haut de `PixoveryPage.jsx`. **Sans le paramètre, rien n'est
débranché et le site est strictement identique.** Sert à isoler un suspect le
jour où un vrai téléphone est disponible :

- `?motion=full&light=hero` → les planches du hero ne sont jamais chargées
  (la figurine reste vide, c'est voulu)
- `?motion=full&light=svc` → la parallaxe des disquettes ne calcule plus rien
  par frame
- `?motion=full&light=1` → les deux

Lecture : si `light=svc` redevient fluide, c'est la 3D et non la mémoire. Si
`light=1` saccade encore, la cause est ailleurs (animations CSS en boucle,
couches composées). À retirer une fois la cause connue.

## PIÈGE ÉVITÉ — les lignes 738 à 743 sont MORTES

Dans `cadence()` de `services()`, le commentaire ouvert par `/*` juste après
`el.dataset.actif = …` **n'est jamais refermé avant le `*/` suivant**. Les
`querySelector` sur `[data-svcwash]`, `[data-svcnum]` et `[data-svcico] img`
qui s'y trouvent **ne s'exécutent pas**. Ne pas les « optimiser » : ils ne
coûtent rien. C'est le §5 ci-dessous qui se rejoue, sous une autre forme.

Le vrai coût par frame de `cadence()` se limite à deux
`getBoundingClientRect`, le transform du rail, et deux `querySelector` par
panneau pour la parallaxe des disquettes.

---

# CE QUI A CHANGÉ LE 25 AOÛT

## 1. FLUIDITÉ

**Le halo de balayage était re-flouté à chaque image de scroll.** `.scanLine`
et `.scanLineGlow` étaient positionnés par `top: var(--ly)`, réécrit à chaque
frame — or `.scanLineGlow` porte `filter: blur(31u)` sur une bande large comme
le hero. Ils sont maintenant déplacés en `translate3d` via une nouvelle
variable **`--lypx`** (en pixels : un `%` dans un `translate` se résoudrait sur
la taille de l'élément, pas du conteneur). Le flou est rastérisé une fois.

**Le plan de lumière du hero** cumulait `blur(36u)` + `mix-blend-mode:screen` +
parallaxe souris. Le `screen` est retiré — il est **neutre sur du noir pur**
(`screen(0,x) = x`) — et les deux plans floutés sont promus en
`will-change: transform`.

**Onze animations CSS tournaient en boucle même hors écran.** `figeHorsEcran()`
pose `[data-fige]` sur toute section sortie du champ (un écran de marge) et met
ses animations en pause.

**Les planches de sprites ne sont PAS réductibles.** Vérifié : recompresser à
qualité égale les rend jusqu'à 18 % plus lourdes, l'AVIF ne fait pas mieux.
Les 2,9 Mo du hero sont le prix de la qualité. Ne pas y revenir.

## 2. ALIGNEMENTS

Le système est sain : conteneur **1024u** centré + gouttière **82u**, soit
**860u** de contenu. `--u = min(1440/1024, largeur/1024)` — donc au-dessus de
1440 px, le conteneur se fige et les écarts deviennent visibles.

- **Portfolio** : seule section sans conteneur 1024u → 240 px de décalage sur
  un écran 1920. En-tête et rail ramenés sur la grille. Les vignettes restent
  volontairement en pleine largeur.
- **Contact** : les champs faisaient `100% + 48u` (pas de reset `box-sizing`,
  `padding:14u 24u` en CSS). Le bloc penchait et le bouton « Envoyer »
  paraissait plus étroit. Corrigé.
- **Le « 02 » du portfolio était gris** : il vit dans `[data-galhead]`, resté
  dans la liste des petits textes crème. Exclu via `data-chapnum`.

⚠️ **Ce projet n'a AUCUN reset `box-sizing`.** Le piège a déjà mordu trois
fois. À ajouter (`*{box-sizing:border-box}`) un jour **à froid**, en
reparcourant toute la page ensuite.

## 3. SEO

- **17 textes de projets** (15 500 caractères) étaient dans `<div hidden>`,
  donc dépréciés par Google et invisibles pour les moteurs IA. Ils sont
  maintenant dans le **JSON-LD de `index.html`**, avec pour chacun sa
  description, son secteur (`about`), ses prestations (`keywords`) et son
  image. Même texte que la lightbox : aucun cloaking.
- **17 secteurs déclarés** (restaurant japonais, smash burgers, friperie,
  photographe de paysage, bar à cocktails…). C'est le vrai gisement : un
  restaurateur tape « création logo restaurant japonais », pas « graphiste ».
- `robots.txt` bloque les **14 prototypes** de `public/` qui concurrençaient
  la page d'accueil. `sitemap.xml` : 3 URLs réelles au lieu d'1.
- Entrée fantôme « Ô Bo**h**neur D'Emy » (faute de frappe) supprimée du
  JSON-LD. Le fichier image fautif traîne encore dans `assets/portfolio/`.
- **Ciblage : Genève.** Title, description et `areaServed` mis à jour. La
  ligne du hero dit « Genève, France et à distance » pour ne pas fermer la
  porte. Annemasse reste dans les données structurées uniquement.
- **Le `<h1>` n'a PAS été changé** et ne doit pas l'être : c'est le geste
  visuel du site, et le métier est écrit partout autour.

## 4. RESPONSIVE (mobile)

- **Menu** : fond noir franc (le lavis violet délavait les entrées),
  `backdrop-filter` retiré (inutile derrière un fond opaque), bloc centré,
  liens en `width:auto` — le trait du lien actif épouse donc le mot.
- **Services** : contenu ancré en haut (`flex-start`) pour que les quatre
  titres tombent au même pixel ; réserve de 132 px en haut pour la barre de
  menu et l'en-tête de section.
- **Portfolio en grille 2 colonnes** (`setStacked`) : 17 projets passent de
  ~15 écrans à ~2,3. Légendes compactées, numéro en filigrane masqué.
- **Paragraphes justifiés + `hyphens:auto`** (les deux vont ensemble, sinon
  rivières blanches). Contraste du corps de texte remonté de 48 % à 62 %,
  soit **4,9:1 → 7,8:1**.

## 5. PIÈGE PAYÉ CHER — À NE PAS REJOUER

**Un commentaire `/* */` ajouté à l'intérieur d'un bloc déjà commenté a fermé
celui-ci trop tôt** (les commentaires ne s'imbriquent pas en JS). Une ligne est
redevenue active alors que sa déclaration restait commentée →
`chiffre is not defined` → `componentDidMount` plante → **écran noir total**.

Il y a du **code désactivé dans des commentaires multi-lignes** dans ce
fichier, notamment autour de la ligne 714 (`cadence()`). **Toujours vérifier
qu'une ligne est du code vivant avant de la modifier.**

---

## EN ATTENTE

- **Vérifier le mode LÉGER sur un VRAI téléphone** (`http://192.168.1.11:5173/?motion=full`,
  ou directement `www.pixovery.com` une fois déployé). La planche filaire est
  désormais coupée sous 768 px : reste à confirmer que le scroll est fluide, et
  à regarder ce que donne le hero sans filaire pendant la rotation. Ne pas se
  fier au mode responsive du navigateur : à DPR 3 sans accélération matérielle
  il saccade là où un téléphone est fluide.
- **Si ça saccade encore** : passer au suspect suivant avec `?light=svc`
  (parallaxe 3D des disquettes). Ne pas revenir sur la mémoire, elle est réglée.
- **Services 02 et 03** encore dans l'ancienne formulation (01 et Illustration
  ont été réécrits en « votre marque » plutôt que « les marques »).
- **Google Search Console** : déclarer le site + soumettre le sitemap. C'est ce
  qui déclenche l'indexation au lieu de l'attendre.
- **Mentions légales** : trois champs « à compléter » (adresse, hébergeur).
  Obligation légale. Redha a choisi de reporter.
- **Hébergement** : rester sur GitHub Pages. Le plan gratuit de Vercel
  **interdit l'usage commercial** (il faudrait Pro à 20 $/mois), et le
  déploiement actuel fonctionne déjà.
- **Portfolio** : les études de cas (`public/projets/kabuki-sushi.html`) sont
  abandonnées — Redha préfère garder la lightbox.

## Fichiers de travail à la racine (jetables)

`faisceau.html`, `banc-glitch-disquette.html`, et les sauvegardes
`PixoveryPage.AVANT-TOUR.jsx`, `global.AVANT-TOUR.css`,
`PixoveryPage.AVANT-CHUTE.jsx`.
