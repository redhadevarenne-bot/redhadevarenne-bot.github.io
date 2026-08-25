# État des lieux — 24 août 2026 (fin de journée)

Point de reprise. La carte technique reste dans `CLAUDE.md` ; ce fichier dit
**où on en est** et **ce qu'il ne faut pas refaire**.

## À FAIRE EN PREMIER — commiter

Le dépôt n'a toujours qu'**un seul commit**. Tout le travail est sur le disque.

```powershell
cd "$HOME\OneDrive\Bureau\pixonaute"
git add pixovery-app/src/components/PixoveryPage.jsx `
        pixovery-app/src/styles/global.css `
        pixovery-app/public/projets/kabuki-sushi.html `
        pixovery-app/public/assets/projets/kabuki-sushi `
        pixovery-app/public/assets/fonts `
        ETAT-DES-LIEUX.md
git commit -m "Hero pilote au scroll, gabarit d'etude de cas, Newake, formulaire creuse"
```

Jamais `git add -A` : ça embarquerait `Pixovery Website.html` (6,6 Mo),
`_to_delete/`, `uploads/`, `screenshots/`, et les bancs d'essai.

## Pour voir le résultat

```powershell
cd "$HOME\OneDrive\Bureau\pixonaute\pixovery-app"
npm run dev
```
Puis **`localhost:5173/?motion=full`**. Le paramètre est obligatoire :
« réduire les animations » est actif sur cette machine.

---

# CE QUI A CHANGÉ LE 24 AOÛT

## 1. LE HERO EST ENTIÈREMENT PILOTÉ PAR LE SCROLL

C'est le changement structurant de la journée. Avant, le titre tombait sur une
timeline GSAP au chargement. Maintenant **tout** ce que contient le hero suit
la position de défilement — il n'y a plus qu'une seule tête de lecture.

Dans `intro()`, la fonction `poseLettres()` (exposée en `this.poseTitre`) est
appelée à chaque frame de scroll et pose, dans cet ordre :

| élément | fenêtre (fraction de l'arrivée) |
|---|---|
| les lettres du titre | chacune la sienne, décalée par son rang |
| le sous-texte | 0,70 → 0,94 |
| le bouton | 0,82 → 1,00 |
| le rideau noir (retrait) | 0 → 0,34 |
| l'invite à défiler (retrait) | 0,14 → 0,44 |

`ARRIVEE = 0.24` : toute l'arrivée tient dans les 24 premiers pour cent de la
piste du hero. Reprise du pen GreenSock « containerAnimation SplitText » :
rotation ±20°, décalage vertical, ease `back.out(1.2)`.

### Pièges déjà payés — ne pas les rejouer

**`open()` ne doit plus forcer le sous-texte ni le bouton.** C'est le filet de
sécurité de l'intro ; il arrivait en fin de timeline. Comme la timeline ne
contient plus les tweens du titre, elle se termine **immédiatement** — donc
`open()` allumait le paragraphe et le bouton sur une page encore vide. Il ne le
fait plus que si `this.poseTitre` n'existe pas.

**Les masques de ligne ne se referment jamais.** Ils repassaient en
`overflow:hidden` en fin d'intro, du temps où les lettres avaient fini de
tomber. Les refermer rognerait toutes celles qui ne sont pas encore posées.

**L'amplitude du pen (±200 %) ne marche pas ici.** Le pen n'a qu'UNE ligne ;
il y en a trois, empilées, masques ouverts. À ±200 % le « F » de FAISONS venait
se poser sur le « D » de DÉCOLLER. Plafonné à ±75 %.

**L'opacité des lettres doit être un fondu, pas un interrupteur.** La première
lettre, dont la fenêtre commence à zéro, s'éteignait d'un coup en haut de page
pendant que les autres restaient visibles.

**Le tirage aléatoire est déterministe** (`Math.sin(i * 12.9898)`). En scrub, la
même position de scroll doit rendre la même image, sinon tout grelotte.

**Le bouton porte l'effet magnétique** dans `--mx`. Écraser son `transform` par
un `translateY` simple tue l'effet — la variable est conservée dans la valeur.

### Le rideau noir

`[data-noir]`, `#000` plein, `inset:0`, `z-index:7` — au-dessus de tout sauf de
l'invite (`z-index:8`). Au premier pixel il n'y a rien d'autre à regarder que le
signe à suivre. Il se retire AVANT l'invite : sinon l'écran passe par un instant
où il n'y a plus rien du tout.

### L'invite à défiler

`[data-cue]` : souris SVG + « SCROLL », centrée, fuchsia `#FF2C86`. La bille
descend puis disparaît et repart du haut invisible — **elle ne remonte pas**, le
geste demandé n'a qu'un sens. Le néon (trois `drop-shadow` empilés) a été essayé
puis retiré : sur un objet de 21 px ça fait une tache, pas une lumière.

### Le pot à crayons

Il reprend `--nait` (0 au premier pixel, 1 à 13 % de la piste). Il en avait été
sorti quand le titre s'affichait au chargement ; maintenant que le titre arrive
au scroll, il n'a plus de raison d'être le seul objet présent.

### Ce qui a été SUPPRIMÉ (et pourquoi ne pas le remettre)

- **Le verrou « pose acquise »** (sessionStorage). Il verrouillait la figurine
  en position finale pour toute la visite : l'animation ne rejouait plus jamais.
  Trois tentatives de conditionner le verrou, trois échecs. Supprimé.
  Le besoin réel est couvert par le lien « Accueil » (voir plus bas).
- **L'interférence sur le titre** (clones colorés, balayage). Retirée à la
  demande.
- **Le glitch intermittent sur les disquettes**. 219 lignes supprimées, il ne
  reste rien. La cause de l'échec est notée : posé sur un `<img>`, le calque
  doublait l'image au lieu de la déchirer, et la parallaxe de souris vit sur
  l'`<img>` lui-même — le calque sautait.

---

## 2. LE MENU

**« Accueil » ne renvoie plus en haut de page** : il pose la page à
`FIN × course` du hero, figurine montée et ampoule levée (`this.heroPoseY()`,
exposé par `scanHero()`). Le haut de la page ne montre qu'une scène vide.

**Les liens qui traversent Services ne sont plus avalés.** Services capture le
défilement : dès qu'on entre dans sa piste, `cadence()` recadre la page de force
(`lenis.scrollTo` en `immediate + force`). On cliquait Contact, on atterrissait
sur Services. Le clic lève un drapeau `this.navVol` que `cadence()` respecte ;
il retombe à l'arrivée (`onComplete`) ou sur un minuteur de 1,6 s.
`this.navReset()` remet `etaitTenue` à zéro pour qu'un vol qui S'ARRÊTE dans
Services rejoue son entrée plus tard.

---

## 3. TYPOGRAPHIE ET COULEUR

**Newake** (`public/assets/fonts/NewakeFont-Demo.otf`) sur le `h1` du hero et
tous les `h2` de section. `font-weight:400` **obligatoire** : la fonte n'a
qu'une graisse, un 700/800 ferait fabriquer un gras de synthèse.

Le fichier est un `.otf` : la conversion en woff2 réclame Brotli, absent de
l'environnement. 68 Ko, à convertir le jour où le poids compte.

Neue Haas était encodée en base64 dans `global.css` ; elle a été extraite en
trois `.woff2` dans `public/assets/fonts/` pour que les pages statiques
(études de cas) puissent la charger.

**Les accents étaient rognés** (« DECOLLER », « IDEES ») : la boîte de ligne
passait sous l'accent. Corrigé par `padding-top:.16em` + `margin-top:-.16em` sur
`#accueil h1 > span` — la boîte s'agrandit vers le haut sans rien déplacer.

**Le crème `#FFE4CB`** (relevé sur l'affiche Newake) a été essayé sur les titres
et le corps de texte : trop chaud face à une palette entièrement froide.
Il ne reste que sur les **petits textes** — légendes du portfolio, en-tête
galerie, pied de page. `[data-chapter] span` en est explicitement exclu : c'est
le numéro de chapitre, il doit rester fuchsia.

**Le fuchsia `#E2006B` ne fonctionne qu'en aplat plein.** Sa luminance est
d'environ 0,25 : en trait de 1 px sur fond noir il ne se lit pas comme une
lumière mais comme une salissure brunâtre. Trois essais ratés sur le focus des
champs avant de comprendre.

---

## 4. LE RESTE DE LA PAGE

**Le bouton « Voir mes projets » est à plat.** Biseau, ombre interne, flanc de
3 u et trois ombres portées : tout est parti. Les états jouent sur la valeur —
`#E2006B` / `#FF2C86` au survol / `#B80057` à l'enfoncement. Le `transform` reste
interdit sur ce bouton, il appartient au JS.

**Les champs du formulaire sont des gélules creusées** (principe uiverse) :
aucune bordure, une ombre interne en haut à gauche. Fond `#0B0A0E` et non `#000`
— sur du noir pur, une ombre interne noire n'a rien à assombrir. L'autofill de
Chrome est neutralisé (il repeint avec sa propre ombre interne). Au focus :
aucune couleur, seulement de la lumière.

**Le trait de balayage du hero est un faisceau, pas un néon.** Quatre couches
centrées sur la même ligne : cœur 1,5 u, nappe 40 u, point chaud mobile, halo
135 u. Un néon est un tube (épaisseur constante) ; un faisceau est un fuseau, et
une pointe ne se fait qu'avec un dégradé **elliptique**. Profil retenu au banc
d'essai (`faisceau.html`, à la racine) : **D**, « halo dominant ».

**La figurine du Processus est revenue sur ordinateur.** Elle avait été retirée
partout ; la demande ne portait que sur le responsive. Masquée sous 769 px, et
`spin()` refuse d'y démarrer — sinon 1,3 Mo de planches partiraient en
téléchargement sur téléphone pour un élément invisible.

**Services** : le titre ne glisse plus de 10 u au survol (ça cassait
l'alignement numéro / titre / paragraphe, et comme la souris est forcément dans
le panneau quand on le lit, l'état décalé était l'état normal). Le gros numéro
est écarté du titre (6 u → 16 u). Les paragraphes 2, 3 et 4 ont été nettoyés
(`<br>` parasite, `data-start`/`data-end`, `&nbsp;`).

**Contact** : la lueur au sol de l'ordinateur était posée devant la machine, pas
sous elle — et comme l'image est en `mix-blend-mode:screen`, le plateau sombre
est quasi transparent et la laissait traverser. Resserrée. Le masque du bas
commençait à 88 %, c'est-à-dire en plein dans le clavier ; descendu à 93 %.

---

## 5. LES ÉTUDES DE CAS (nouveau)

`public/projets/kabuki-sushi.html` — gabarit d'étude de cas, fichier **statique**
dans `public/`, pas un composant React. Trois raisons : aucune dépendance
(pas de routeur), Vite recopie `public/` tel quel donc l'URL est réelle et
indexable, et ça ne touche pas au `PixoveryPage.jsx` de 3 000 lignes.

Quatre blocs : le logo en grand, les couleurs, les applications, l'appel à
l'action. **Aucun texte de présentation** — les emplacements sont en commentaire,
Redha doit les fournir.

Le clic sur une vignette du portfolio : une `<article>` qui porte
`data-projet="/projets/…"` mène à sa page ; les autres gardent le plein écran.
On ajoute l'attribut au fur et à mesure que les pages existent.

Visuels découpés dans le mockup fourni, dans
`public/assets/projets/kabuki-sushi/` : `logo`, `enseigne`, `sac`, `boite`,
`menu`, `cartes`, `stickers`, `valeurs`.

---

## EN ATTENTE

- **Les textes des études de cas** — Redha doit les envoyer.
- **Le logo du header en SVG.** Il est en `.webp` : impossible de repeindre ses
  formes en CSS. Une demande de logo fuchsia est restée en suspens pour ça.
- **Le poids** : les deux planches du hero font 2,9 Mo.
- **Témoignages** : textes de remplissage, noms inventés. À remplacer avant
  mise en ligne.
- Le site en ligne (`www.pixovery.com`, GitHub Pages) tourne toujours sur la
  version d'avant. Rien de tout ça n'y est.

## Fichiers de travail à la racine (jetables)

`faisceau.html` (banc d'essai du trait de balayage, profils A→E),
`banc-glitch-disquette.html` (banc d'essai abandonné).
Plus les sauvegardes : `PixoveryPage.AVANT-TOUR.jsx`, `global.AVANT-TOUR.css`,
`PixoveryPage.AVANT-CHUTE.jsx`.
