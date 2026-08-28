# État des lieux — 28 août 2026 (soir)

Point de reprise. La carte technique reste dans `CLAUDE.md` ; ce fichier dit
**où on en est**, **ce qu'il ne faut pas refaire**, et **ce qui reste**.

> ⚠️ **Tenir ce fichier à jour fait partie du travail.** Le 28 août, deux
> points encore listés comme « en attente » étaient réglés depuis deux jours :
> on a perdu du temps à les rouvrir. Un fichier de reprise faux coûte plus
> cher que pas de fichier du tout. Si tu changes quelque chose, note-le ici
> avant de fermer la session.

## Pour voir le résultat

```powershell
cd "$env:USERPROFILE\OneDrive\Bureau\pixonaute\pixovery-app"; npm run dev
```
Puis **`localhost:5173/?motion=full`**. Le paramètre est obligatoire : sans
lui, Lenis ne démarre pas sur cette machine et tout saute.

Sur téléphone, même réseau : `http://192.168.1.11:5173/?motion=full`.

## Publier

```powershell
cd "$env:USERPROFILE\OneDrive\Bureau\pixonaute"
git add pixovery-app/src
git status --short      # regarder AVANT de continuer
git commit -m "…"
git push
```

Jamais `git add -A` : ça embarquerait `Pixovery Website.html` (6,6 Mo),
`_to_delete/`, `uploads/`, `screenshots/` et les prototypes de la racine.

Le `push` publie le site en ~2 min (`.github/workflows/deploy.yml` → GitHub
Pages). Le site en ligne est **`www.pixovery.com`**, et depuis le 28/08 au
soir cette adresse existe pour de bon (voir le point 7). Il n'y a **aucune
étape de validation** : ce qui part est en ligne pour tout le monde deux
minutes plus tard. On teste donc en local avant.

⚠️ **Un asset ajouté n'est pas ramassé par `git add pixovery-app/src`.** Il
est *non suivi*, pas ignoré — donc en local tout marche, et en ligne c'est un
404. Ça a cassé l'image de Contact pendant deux jours. Après avoir ajouté une
image, l'ajouter explicitement, et vérifier :

```powershell
@("img10-cut.webp","proc-v7.webp","pot-solide.webp","filaire-repos.webp","perso-tour-v2.webp","perso-filaire-v2.webp") | % { git ls-files --error-unmatch "pixovery-app/public/assets/$_" 2>$null | Out-Null; if ($LASTEXITCODE -ne 0) { "NON SUIVI -> $_" } }
```

---

# CE QUI A CHANGÉ LE 28 AOÛT

## 1. SERVICES : QUATRE VRAIS CRANS SUR TÉLÉPHONE

Demande : que le défilement s'arrête sur chaque rubrique, et qu'un petit
glissement ne fasse pas changer de service.

**Pourquoi les crans avaient échoué en juillet.** L'ancien code appelait
`preventDefault` **après 28 px de glissement**. Trop tard : à ce moment-là le
navigateur a déjà engagé son défilement natif pour ce geste, et il ignore le
`preventDefault` de tous les événements suivants. La conclusion tirée alors —
« au doigt, les crans sont impossibles » — était fausse ; c'était le moment de
la décision qui l'était.

**La correction : on décide au PREMIER mouvement.** Dès 4 px, on tranche une
fois pour toutes. Soit la section prend le geste et `preventDefault` part sur
ce `touchmove`-là (le navigateur n'a encore rien engagé, il obéit, et la page
ne bouge pas d'un pixel de tout le geste), soit on le laisse entièrement
natif. Jamais d'entre-deux, jamais de décision revisée en cours de route.

Trois drapeaux dans le bloc `if(tactile)` de `services()` :

- `libre` : geste rendu au navigateur. Posé si on n'est pas dans la section,
  ou si on la quitte par un bout (01 vers le haut, 04 vers le bas).
- `tire` : un geste = **un** cran (l'équivalent tactile de `avale` pour la
  molette). Le reste du glissement est absorbé, pas ignoré : `preventDefault`
  continue, donc la page reste tenue pendant que le service se pose.
- `cale()` : rattrapage de l'ENTRÉE dans la section. L'élan vient d'un geste
  qu'on n'a pas pris, et l'inertie n'est pas un `touchmove` — elle ne se
  `preventDefault` pas. On attend 130 ms de silence et on pose la section sur
  le service le plus proche. Uniquement dans ce cas.

⚠️ **Le filet de sécurité n'est pas décoratif.** Tant qu'on `preventDefault`,
la page ne peut plus bouger DU TOUT. `verrou` est levé par le `onComplete` de
`lenis.scrollTo` ; si ce rappel n'arrive jamais (passage interrompu, cible
identique à la position), la section garderait le doigt pour toujours et on ne
pourrait même plus en sortir. Au-delà de 1500 ms on considère le verrou perdu
et on rend le geste. **Ne retire jamais ce garde-fou.**

Le seuil de 34 px est le réglage à toucher si c'est trop nerveux ou trop dur.
Sur ordinateur, rien ne change.

## 2. LE TITRE DU HERO NE SE DÉMONTE PLUS

Symptôme : en remontant vers le haut de la landing, « Faisons décoller vos
idées » disparaissait.

Ce n'était pas un bug mais la chute du titre jouée **à l'envers** : depuis le
27, les lettres sont pilotées par la position de scroll (`poseLettres`), donc
réversibles. En descendant on lit une animation ; en remontant, une
disparition.

`pa` garde maintenant la progression **maximale** atteinte (`paMax`) : la
chute avance, ne recule jamais, et un rechargement la rejoue depuis zéro.
C'est la même règle que les reveals de la page — « une fois montré, ça reste
montré ». Pour revenir au comportement réversible : supprimer `paMax` et
rendre `pa` égal à `brut`.

⚠️ **Au tout premier pixel, le titre n'est PAS là.** C'est le principe d'une
animation *scrubbée*, et c'est voulu. Ne pas le confondre avec un bug.

## 3. LA FICHE PORTFOLIO SUR TÉLÉPHONE — RÉÉCRITE TROIS FOIS

Toutes les versions ratées avaient **le même défaut de fond** : une boîte qui
défile À L'INTÉRIEUR d'un plein écran qui, lui, ne défile pas.

1. Version d'origine : scène en `86vh` + `overflow-y:auto`. Le visuel remontait
   avec le texte et se faisait trancher par le bord haut de la boîte. C'est ce
   qu'on lisait comme « l'image est coupée » — elle n'était pas rognée, elle
   était **poussée dehors**.
2. Visuel collé en `position:sticky`. Le texte passait littéralement SOUS
   l'image, et `aspect-ratio:1/1` se battait avec `max-height` : selon celui
   qui l'emportait, la boîte n'avait pas le même rapport.
3. Visuel à hauteur fixe, panneau défilant dessous. L'image n'était enfin plus
   coupée, mais le texte se lisait par la fente restée sous elle.

**Version retenue : une seule glissière.** Le plein écran devient lui-même la
zone qui défile. Visuel entier en haut (`width:100%`, `height:auto`, aucun
plafond de hauteur), texte à la suite, tout défile ensemble.

Détails qui comptent :

- `display:block` sur le plein écran. En flex centré, un contenu plus haut que
  la fenêtre déborde par le HAUT et devient inatteignable au défilement.
- Les deux nappes de fond passent en `position:fixed` — en `absolute inset:0`
  elles s'arrêtaient au bout du premier écran.
- La croix passe en `fixed` : sur une fiche longue, il aurait fallu remonter
  tout en haut pour fermer.
- Les mesures du panneau sont en **pixels**, pas en `--u` (à 390 px de large,
  `32*--u` vaut 12 px — même piège que le formulaire de Contact).

**Fermeture au toucher.** La fiche occupe tout l'écran, donc le clic sur le
fond ne pouvait plus se déclencher : la croix était la seule sortie. Maintenant
**tout ce qui n'est pas le texte ferme**, le visuel compris (son clic ne sert à
rien ici, le zoom 1:1 y est désactivé). Le panneau garde ses clics, sinon on ne
pourrait pas sélectionner un mot sans que la fiche se referme.

## 4. LES NUMÉROS DE SERVICES QUI N'ARRIVAIENT QU'AU DEUXIÈME PASSAGE

Symptôme : on entre sur le service 02, son gros chiffre n'est pas là ; on va au
03, on revient, il y est.

Il n'était ni effacé ni transparent — **il n'avait jamais été peint**.
`[data-svcrail]` fait 400 vw × 100 vh et portait `will-change:transform` : le
navigateur en faisait une seule couche composée, pré-rendue d'un bloc. Sur un
écran de 390 px à DPR 3, ça représente ~4700 × 2400 pixels, une quarantaine de
Mo pour la seule barre des services. Le navigateur ne rastérise qu'une partie
des tuiles, et les zones jamais affichées restent vides.

Deux corrections indépendantes, sous 768 px : `will-change` retiré du rail (il
bouge toujours en `translate3d`, donc il reste composé, mais le navigateur gère
ses tuiles normalement), et chaque chiffre devient sa propre petite couche.

⚠️ **`will-change` est une promesse faite au navigateur, pas une optimisation
gratuite.** Sur une grande surface, elle coûte plus qu'elle ne rapporte. C'est
la même leçon que les 108 Mo des planches du hero : sur téléphone, la mémoire
est la contrainte.

## 5. LE FORMULAIRE DE CONTACT ENVOIE VRAIMENT

**Avant, il n'envoyait rien.** Il fabriquait un lien `mailto:` et poussait le
visiteur dans sa messagerie avec le message pré-rempli. Sur téléphone sans
appli mail configurée : rien. Sur ordinateur chez quelqu'un qui lit son
courrier dans son navigateur : rien. Et même quand ça marchait, il restait un
« Envoyer » à cliquer dans SA messagerie. Des demandes perdues sans qu'aucune
erreur ne s'affiche.

Maintenant : envoi réel en arrière-plan vers **Web3Forms**, qui relaie vers
`redhadevarenne@gmail.com`. Le visiteur ne quitte jamais la page.

- Objet du mail reçu : **« Pixovery — [sujet du visiteur] »**, pour les
  repérer d'un coup d'œil dans Gmail.
- L'adresse du visiteur est posée en « Répondre à » : un clic sur Répondre lui
  écrit directement.
- Champ piège `botcheck` (invisible, `display:none`). S'il est coché, on jette
  **silencieusement** et on affiche le même message de succès — dire au robot
  qu'il a été repéré, c'est lui apprendre à contourner.
- Le bouton se désarme pendant l'envoi : un double clic sur connexion lente
  n'envoie plus deux fois.
- En cas d'échec (relais en panne, visiteur hors ligne), le message d'erreur
  donne `pixovery@gmail.com` en clair. **C'est le seul endroit du site où
  l'adresse apparaît**, et seulement en cas de panne.

**La clé d'accès est publique par construction** (`90de4956-…` dans
`submit()`). Sur un site statique il n'y a pas de serveur où la cacher, c'est
le modèle assumé du service. Elle ne donne accès à rien : elle route vers une
adresse qui, elle, n'apparaît nulle part. Compte gratuit, 250 messages/mois.

## 6. FICHIERS ENFIN COMMITÉS

`img10-cut.webp` (l'image de Contact, 404 en ligne pendant deux jours),
`mentions-legales.html`, `confidentialite.html`, `legal.css` — les deux pages
légales étaient liées depuis le pied de page et renvoyaient un 404.

---

## 7. LE DOMAINE EXISTE ENFIN — pixovery.com acheté et branché

**Ce qui n'allait pas, et que personne n'avait vu.** Le `CNAME`, la balise
canonique d'`index.html`, le `sitemap.xml`, les données structurées et les
balises de partage affirmaient tous que le site vivait sur
`https://www.pixovery.com/`. Or **ce domaine n'existait pas** : personne ne
l'avait acheté, il ne résolvait nulle part. Le site n'était accessible qu'en
`redhadevarenne-bot.github.io`. Vérifié à la résolution DNS : `github.io`,
`google.com` et le dépôt répondaient, `pixovery.com` non.

Conséquence directe : déclarer le site à Google Search Console dans cet état
n'aurait servi à **rien** — Google serait allé vérifier une adresse morte.

**La règle à retenir.** Domaine = payant, ~12 €/an chez le bureau
d'enregistrement. Hébergement = gratuit, GitHub Pages, HTTPS compris. Ce sont
deux choses distinctes : on n'a jamais besoin de payer un hébergement ici, et
il ne faut surtout pas prendre un pack « domaine + hébergement + mail ».

**Acheté chez Infomaniak** (suisse, interface et support en français — Redha
est à Genève ; Porkbun était moins cher mais tout en anglais, et son
formulaire d'inscription bloquait). Expire le **28 août 2027** — à renouveler,
sinon le site tombe.

**Configuration DNS posée** (Infomaniak → domaine → Zone DNS) :

```
www   CNAME  redhadevarenne-bot.github.io.
@     A      185.199.108.153
@     A      185.199.109.153
@     A      185.199.110.153
@     A      185.199.111.153
```

Les quatre A doivent **coexister** : quand Infomaniak demande, choisir
« ajouter en complément de l'existant », jamais « remplacer ». Ne pas cocher
la case AAAA. Ces quatre adresses sont celles de GitHub Pages.

Puis côté GitHub : dépôt → Settings → Pages → Custom domain =
`www.pixovery.com` → Save, et cocher **Enforce HTTPS** une fois le certificat
émis.

⚠️ **Le certificat prend jusqu'à une heure.** Tant qu'il n'est pas là, le
navigateur affiche « Non sécurisé », et c'est normal. **Ne pas retirer le
domaine pour « réessayer »** : ça relance le compteur à zéro.

## 8. LES POLICES NE SONT PAS SOUS LICENCE — à régler

Deux polices sont chargées, aucune n'est couverte pour un usage commercial :

- **Newake** (`/assets/fonts/NewakeFont-Demo.otf`) — les gros titres : h1 du
  hero, titres de sections, noms de projets. Le nom du fichier dit tout :
  version **DEMO**, gratuite pour un usage **personnel**. Licence web à
  acheter, une trentaine d'euros.
- **Neue Haas Display** — tout le texte courant. Police commerciale
  (Monotype), présente deux fois : en `nhd-500/700/800.woff2` et en copie
  base64 directement dans `global.css`. **Une licence bureau ne couvre pas la
  mise en ligne**, ce sont deux licences distinctes. La plus chère des deux.

Poppins a été essayée sur les titres le 28/08 puis **écartée par Redha** :
géométrique et ronde là où Newake est condensée et anguleuse, le titre perdait
son caractère. Si une substitution est retentée : Poppins demande la graisse
800 (Newake n'en a qu'une, d'où le 400 imposé), un interlettrage de 0,4 u au
lieu de 1,5, et la suppression des corrections d'accents en `.14em`. Tout est
noté dans `global.css`, bloc 9.

Alternatives libres si l'achat est écarté : **Anton** ou **Archivo Black**
pour les titres, **Barlow** (déjà chargée) ou **Inter** pour le texte.

## 9. LE BLISTER DU PROCESSUS — ce qui a été fait, et le plafond

Redha : « le perso a l'air flou, de mauvaise qualité ». Mesuré, puis corrigé
en deux temps.

**Temps 1 — la planche.** Le canvas était en 352 × 503 (planche v7) alors
qu'il s'affiche à 365 × 630 sur un écran de 1920. Retour à la **v5**
(448 × 640, 60 poses) : plus nette de 27 % dans les deux dimensions, pour la
**même mémoire** (69 contre 64 Mo) et un fichier plus léger au téléchargement.
Seul coût : 60 poses au lieu de 90, soit 6° par pose au lieu de 4 — invisible
sur une rotation pilotée par le défilement. La v7 avait échangé de la netteté
permanente contre de la fluidité invisible.
(La v6 — 576 × 610, 72 poses — est plus large mais plus **courte** que la v5,
et coûte 101 Mo. Mauvais marché.)

**Temps 2 — l'accentuation.** À 448 × 640 pour 365 × 630 affichés, le
navigateur **diminue** l'image : il ne reste plus aucune étape d'agrandissement
dans la chaîne. Ce qui restait de mou venait donc de la **source** — une vidéo
compressée, avec son flou de mouvement. D'où `proc-v5-net.webp` : la v5 passée
au masque flou (rayon 1,4 / 105 %, seuil 2), réencodée en qualité 88. Un
masque flou n'invente pas de détail, il augmente l'acutance — le contraste
local sur les arêtes, que l'œil lit comme de la netteté. 2,23 Mo au lieu de
1,79 ; la mémoire ne bouge pas.
Seuil 2 pour ne pas accentuer le bruit du fond noir ; au-delà de ~130 % un
liseré clair apparaît sur les contours.

⚠️ **Le plafond, c'est la source, pas le code.** Refaire une planche en tuiles
plus grandes depuis la **même** vidéo ne servirait à rien : on agrandirait du
flou. Pour aller plus loin il faut refilmer le blister de plus près, ou le
rendre en 3D. La vidéo source n'est plus dans `uploads/`.

## 10. TROIS CHARGES RETIRÉES DU RENDU PAR IMAGE

Redha : « ça rame ». Le banc `?light=svc` a **innocenté** la parallaxe 3D des
disquettes (aucune différence). Le travail JavaScript par image de Services a
été mesuré : deux `getBoundingClientRect`, le transform du rail et huit
`querySelector` — quelques dizaines de microsecondes sur un budget de 16 ms,
**rien à gratter là**. Le coût est dans le rendu. Trois gaspillages supprimés :

1. **Le grain couvrait quatre fois l'écran.** Le voile de bruit posé par-dessus
   tout le site était en `inset:-50%`, soit 2× la largeur et 2× la hauteur :
   8,3 millions de pixels à mélanger à chaque image sur un écran de 1920, pour
   une couche dont on ne voit qu'un quart. Son animation ne le déplace que de
   3 % de sa propre taille — `inset:-9%` suffit. Surface divisée par trois,
   zéro changement visuel.
2. **`will-change` retiré du rail des services sur tous les écrans** (il ne
   l'était que sur téléphone). Voir le point 4.
3. **Le titre du hero se réécrivait pour rien.** Depuis que la chute ne recule
   plus, sa progression reste à 1 dès le premier quart du hero — et on
   continuait à réécrire `opacity` et `transform` sur les ~22 lettres à chaque
   image, jusqu'en bas du site. 44 écritures de style par image pour reposer
   les mêmes valeurs. On pose une dernière fois, puis on s'arrête (drapeau
   `pose`, remis à zéro au `resize` puisque la course dépend de la hauteur de
   la fenêtre).

⚠️ Ces trois points sont des gaspillages réels et mesurables, mais **le
ralentissement lui-même n'a jamais été mesuré**, faute d'accès à un navigateur
depuis la session. Si ça rame encore : F12 → onglet Performances → enregistrer
5 secondes de défilement. Les barres jaunes (script), violettes (style) et
vertes (rendu) diront où ça part.

# DEUX FAUSSES PISTES À NE PAS ROUVRIR

- **Le title et la description sont bons.** 65 et 145 caractères une fois les
  entités HTML décodées (`&egrave;` compte pour 1, pas 8). Rien à raccourcir.
- **Les textes des quatre services sont cohérents.** Tous à la première
  personne, tous en « votre marque / votre communication ». La note du 26 qui
  disait le contraire était périmée.

---

# PIÈGES PERMANENTS DU PROJET

**1. Aucun reset `box-sizing`.** Le piège a déjà mordu trois fois (débordement
horizontal de la page, champs de Contact à `100% + 48u`, `[data-contactrow]`).
À ajouter (`*{box-sizing:border-box}`) un jour **à froid**, en reparcourant
toute la page ensuite.

**2. Du code désactivé vit dans des commentaires multi-lignes**, notamment
autour de `cadence()` dans `services()` — les lignes qui posent
`webkitTextStrokeColor` sur `[data-svcnum]` ne s'exécutent JAMAIS. Les
commentaires ne s'imbriquent pas en JS : un `/* */` ajouté à l'intérieur d'un
bloc déjà commenté le ferme trop tôt, une ligne redevient active alors que sa
déclaration reste commentée, et c'est l'**écran noir total**. **Toujours
vérifier qu'une ligne est du code vivant avant de la modifier.**

**3. Sur téléphone, la mémoire est la contrainte, pas le CPU.** Les planches
du hero pesaient 108 Mo décodées ; le rail des services 40 Mo de couche
composée. Le drapeau `LEGER` (seuil 768 px, en haut de `PixoveryPage.jsx`)
coupe la planche filaire sous 768 px. Le seuil est le MÊME que `tactile` dans
`services()` : si tu changes l'un, change l'autre.

**4. Les planches de sprites ne sont PAS réductibles.** Vérifié :
recompresser à qualité égale les rend jusqu'à 18 % plus lourdes, l'AVIF ne fait
pas mieux. Les 2,9 Mo du hero sont le prix de la qualité. Ne pas y revenir.

**5. Le `<h1>` ne doit pas être changé.** C'est le geste visuel du site, et le
métier est écrit partout autour.

**6. Le banc `?light=` est inerte sans le paramètre.** `?motion=full&light=hero`
coupe les planches du hero, `light=svc` la parallaxe des disquettes, `light=1`
les deux. Sert à isoler un suspect de saccade sur un vrai téléphone.

**7. Mesures : conteneur 1024u centré + gouttière 82u = 860u de contenu.**
`--u = min(1440/1024, largeur/1024)` — au-dessus de 1440 px le conteneur se
fige. Sur téléphone, `--u` vaut ~0,38 : **toute mesure d'interface écrite en
`--u` y devient minuscule**. Les métriques tactiles passent en pixels (16 px
minimum sur les champs, sinon iOS zoome tout seul à la saisie).

---

# CE QUI RESTE — par ordre de ce que ça coûte de ne pas le faire

**1. Mentions légales : cinq « à compléter » affichés en ligne.** Adresse
professionnelle, puis hébergeur / raison sociale / adresse / téléphone de
l'hébergeur. L'hébergeur est GitHub Pages → **GitHub, Inc., 88 Colin P. Kelly
Jr. Street, San Francisco, CA 94107, États-Unis**. Manquent : l'adresse
professionnelle de Redha et son statut (auto-entrepreneur français avec SIRET ?
entreprise individuelle suisse ?), qui déterminent les mentions obligatoires.

**2. Google Search Console : le site n'est pas déclaré.** Débloqué depuis que
le domaine existe (28/08 au soir) — avant, ça n'aurait servi à rien. Tout le travail SEO
du 25 (17 secteurs dans le JSON-LD, ciblage Genève) ne sert à rien tant que
Google ne sait pas que le site existe. **C'est le seul point de la liste qui
peut ramener des clients.** Marche à suivre, décidée le 28 août, à reprendre
telle quelle :

> **a. Créer la propriété.** `search.google.com/search-console`, connecté avec
> `redhadevarenne@gmail.com`. Choisir **« Préfixe de l'URL »** (colonne de
> droite) et entrer exactement `https://www.pixovery.com/`.
> Pas la version sans `www` : le `CNAME` porte `www.pixovery.com` et la balise
> canonique dit la même chose — les trois doivent concorder. L'autre option,
> « Domaine », passe par un enregistrement DNS chez le registrar : plus
> puissant, plus long, inutile ici.
>
> **b. Vérifier par balise HTML.** Déplier « Balise HTML », récupérer la ligne
> `<meta name="google-site-verification" content="…" />`, la poser dans le
> `<head>` de `pixovery-app/index.html`, **pousser, attendre la fin du
> déploiement**, puis cliquer sur « Vérifier ».
> ⚠️ Ne pas cliquer avant que le déploiement soit fini : Google lit la page en
> ligne, pas le disque. En cas d'échec il impose souvent une attente avant de
> pouvoir réessayer.
>
> **c. Soumettre le sitemap.** Menu de gauche → Sitemaps → entrer
> `sitemap.xml` → Envoyer. Puis coller `https://www.pixovery.com/` dans la
> barre de recherche en haut et cliquer sur « Demander une indexation » : la
> page d'accueil passe en file prioritaire.
>
> **Délai normal : de quelques jours à trois semaines.** Le rapport
> « Performances » reste vide au début — ce n'est pas un échec.

**3. Les cinq champs du formulaire n'ont pas de label.** Ils fonctionnent au
`placeholder` seul : le texte disparaît dès qu'on tape, les lecteurs d'écran
n'annoncent rien, le remplissage automatique ne reconnaît pas les champs.
Maintenant que le formulaire envoie vraiment, chaque friction se paie.

**4. Neuf mégaoctets de prototypes publiés sur le domaine.** Dix fichiers
`proto-*.html` dans `pixovery-app/public/`, dont `proto-full-solo.html` à
4,2 Mo, plus `_tmp.html` et `intro-tv-v1.html`. `robots.txt` les cache de
Google mais ils sont publics et dans le dépôt. À sortir de `public/`.

**5. La licence des deux polices** (point 8 ci-dessus). C'est le seul vrai
risque juridique du projet, devant les mentions légales.

**6. Le ménage des planches du processus** : `proc-v5.webp` et `proc-v7.webp`
ne servent plus, seule `proc-v5-net.webp` est chargée. Le `console.log` de
`spin()` a été retiré le 28/08.

**7. Le reset `box-sizing`** (voir Pièges permanents n°1). À faire à froid.

**8. Vérifier la fluidité du hero sur un vrai téléphone.** Le mode `LEGER` du
26 n'a jamais été mesuré. Si ça saccade encore, passer à `?light=svc`
(parallaxe 3D des disquettes) — la mémoire des planches, elle, est réglée.

## Abandonné volontairement

- **Études de cas** (`public/projets/kabuki-sushi.html`) : Redha préfère garder
  la lightbox.
- **Hébergement ailleurs** : rester sur GitHub Pages. Le plan gratuit de Vercel
  interdit l'usage commercial, et le déploiement actuel fonctionne.

## Fichiers de travail à la racine (jetables)

`faisceau.html`, `banc-glitch-disquette.html`, et les sauvegardes
`PixoveryPage.AVANT-TOUR.jsx`, `global.AVANT-TOUR.css`,
`PixoveryPage.AVANT-CHUTE.jsx`.
