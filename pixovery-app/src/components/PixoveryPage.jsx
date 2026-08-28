import React from 'react'
import { gsap } from 'gsap'
import Lenis from 'lenis'

/* =============================================================================
   Pixovery — page complete.

   Migration du composant <x-dc> vers React/Vite. La logique ci-dessous est
   reprise VERBATIM de index.html (lignes 697-1349) : memes 14 methodes, memes
   selecteurs, memes constantes. Seuls 3 points ont change :

     1. `class Component extends DCLogic`  ->  `extends React.Component`
     2. `renderVals()` supprime : ses 3 valeurs (rootRef, onSubmit, setVideoRef)
        sont devenues des proprietes d'instance, liees dans le constructeur.
     3. `render()` ajoute : le markup de <x-dc> converti en JSX.

   Le markup conserve les 335 styles en ligne, les 217 attributs data-*, les
   28 aria-*, le systeme d'echelle calc(N*var(--u)) et les 20 proprietes
   personnalisees --dx / --dy. Aucune valeur n'a ete modifiee.
   Seuls les chemins d'assets sont passes de "assets/..." a "/assets/...".

   NE PAS refactoriser ce fichier tant que la fidelite visuelle n'est pas
   definitivement validee.
   ========================================================================== */

/* =============================================================================
   BANC DE DIAGNOSTIC — ?light=...

   Sert a TROUVER ce qui saccade sur telephone, pas a corriger quoi que ce
   soit. Rien n'est actif sans le parametre : en usage normal ALLEGE()
   renvoie toujours false et le site est strictement identique.

   On teste sur le VRAI telephone, meme page, meme reseau, en changeant
   seulement l'URL :

     ?motion=full                -> reference, tout est branche
     ?motion=full&light=hero     -> les deux planches du hero ne sont JAMAIS
                                    chargees (ni telechargees, ni decodees).
                                    La figurine reste vide : c'est voulu.
                                    Gain vise : ~108 Mo de bitmaps residents.
     ?motion=full&light=svc      -> la parallaxe des disquettes ne calcule
                                    plus rien par frame dans Services.
     ?motion=full&light=1        -> les deux a la fois.

   Lecture du resultat :
     - light=hero fluide, le reste non   -> c'est la MEMOIRE des planches.
     - light=svc fluide                  -> c'est la parallaxe 3D, pas la memoire.
     - light=1 saccade encore            -> la cause est ailleurs (a chercher
                                            du cote des animations CSS en
                                            boucle et des couches composees).

   Ce bloc est jetable : une fois la cause connue, on le retire.
   ========================================================================== */
const ALLEGE = (() => {
  const m = typeof window !== 'undefined'
    && /[?&]light=([a-z0-9,]+)/i.exec(window.location.search);
  const v = m ? m[1].toLowerCase().split(',') : [];
  return k => v.indexOf('1') >= 0 || v.indexOf(k) >= 0;
})();

/* =============================================================================
   MODE LEGER — telephone

   POURQUOI. Les deux planches du hero font 3320 x 4096. Decodees, elles
   occupent 54 Mo CHACUNE, soit ~108 Mo residents pour toute la duree de la
   visite. Sur un telephone milieu de gamme c'est au-dela du budget memoire de
   l'onglet : le navigateur jette des bitmaps puis les redecode, et ces
   redecodages tombent en plein defilement. Ca ne saccade donc pas seulement
   dans le hero — ca saccade PARTOUT, tant que la page vit.

   CE QU'ON COUPE. La planche FILAIRE seulement (`perso-filaire-v2.webp`).
   Elle ne sert qu'au balayage magenta pendant la rotation. On ne la charge
   pas du tout : ni telechargement (1,5 Mo de moins), ni decodage (54 Mo de
   moins), et `repeins()` — un getImageData + une boucle JS sur ~1,7 million
   d'octets a chaque changement d'image — ne tourne plus jamais.

   CE QU'ON GARDE. La planche PLEINE, en pleine definition : la figurine
   tourne exactement comme avant. Et `filaire-repos.webp` (124 Ko, fichier a
   part) reste charge : le filaire de la POSE DE REPOS — celui qu'on voit a
   l'arrivee sur le site, immobile, donc le plus regarde — est intact et en
   pleine definition. Il s'efface en fondu quand la rotation demarre, aux
   images 17 a 20, exactement comme il le faisait deja.

   CE QU'ON PERD. Le filaire magenta pendant la rotation elle-meme, sur
   telephone uniquement. Sur ordinateur rien ne change.

   Le seuil est 768 px, le MEME que `tactile` dans services(). Si tu changes
   l'un, change l'autre.
   ========================================================================== */
const LEGER = typeof window !== 'undefined' && !!(window.matchMedia
  && window.matchMedia('(max-width:768px)').matches);

export default class PixoveryPage extends React.Component {
  constructor(props){
    super(props);
    this.rootRef = React.createRef();
    this.cleanups = [];

    // --- remplace renderVals() du runtime dc ---
    this.handleSubmit = (e) => this.submit(e);
    this.setVideoRef = (el) => {
      if (!el) return;
      el.muted = true;
      el.defaultMuted = true;
      el.loop = true;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    };
  }

  /* Position du halo [data-bulb], mesuree sur chacune des deux images du
     hero. L'ampoule n'est pas au meme endroit selon que le bras est
     baisse (hero-cut-a, au repos) ou leve (hero-cut-b, au survol). */
  q(sel){ return this.rootRef.current ? this.rootRef.current.querySelector(sel) : null; }
  qa(sel){ return this.rootRef.current ? Array.prototype.slice.call(this.rootRef.current.querySelectorAll(sel)) : []; }
  on(t, ev, fn, opt){ t.addEventListener(ev, fn, opt); this.cleanups.push(() => t.removeEventListener(ev, fn, opt)); }

  /* ---------------------------------------------------------------------
     Defilement doux (Lenis).

     Lenis etait deja dans package.json (^1.3.26) mais n'etait importe
     nulle part : le scroll etait donc reste natif. C'est ici qu'on pose
     le cable.

     Pourquoi ce branchement est peu risque : Lenis en mode fenetre ecrit
     une VRAIE position de scroll (window.scrollTo a chaque frame). Donc
     window.scrollY reste juste et les six ecouteurs 'scroll' deja en
     place (header, services, reveals, parallax, rhythm) continuent de
     fonctionner sans etre touches. On n'a pas eu a les reecrire.

     Trois precautions, par ordre d'importance :

     1. Il ne prend PAS la main quand « reduire les animations » est
        actif, sauf ?motion=full — meme regle que intro() et spin(). On
        degrade vers le scroll natif, on ne coupe rien.
     2. Un seul rAF pour tout le site : c'est le ticker de GSAP qui
        pilote Lenis (autoRaf reste a false). Deux boucles concurrentes
        se decalent d'une frame et la parallaxe du hero se met a nager.
     3. La section Services garde son defilement par crans. virtualScroll
        rend la main a Lenis des que la section tient l'ecran : Lenis
        ressort AVANT son preventDefault, donc son ecouteur 'wheel' a
        lui travaille exactement comme avant, et quand il rend la main
        aux extremites (index 0 / n-1) le scroll natif reprend. On
        n'utilise volontairement PAS lenis.stop() ici : stop() continue
        de faire preventDefault sur la molette, on resterait coince dans
        la section.
     --------------------------------------------------------------------- */
  smoothScroll(){
    const force   = /[?&]motion=full/.test(window.location.search);
    const reduced = !force && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced) return;                     // scroll natif, franc, assume

    const lenis = new Lenis({
      /* duree du rattrapage apres un cran de molette. 1.05 s : assez
         long pour le glisse continu, assez court pour que la page
         s'arrete quand on lache. Au-dela de ~1.4 s ca devient mou et on
         a l'impression de ne plus tenir le scroll.
         (Reglage alternatif si le rendu parait trop « telecommande » :
         retirer duration+easing et passer lerp: 0.075 — Lenis donne la
         priorite a duration+easing quand les deux sont fournis.) */
      /* LE piege de cette machine. Par defaut Lenis honore lui-meme
         prefers-reduced-motion : il force lerp a 1, jette duration et
         easing, et le scroll redevient exactement natif — tout en
         posant quand meme les classes .lenis sur <html>. On croit donc
         qu'il tourne, et il ne lisse rien. « Reduire les animations »
         etant actif sous Windows sur cette machine, c'est ce qui se
         passait ici.
         On lui coupe cet arbitrage parce qu'on l'a deja fait
         nous-memes, plus haut : sans ?motion=full et avec
         reduced-motion, on ne construit meme pas d'instance et le
         scroll reste natif. Quand on arrive ici, la decision est prise.
         Ne remets pas cette option a true en pensant bien faire. */
      respectReducedMotion: false,
      /* Duree du rattrapage apres un cran de molette.

         Mesure au banc (un cran = deltaY 300, viewport 1280x800), lue en
         distance parcourue / duree totale / frames de traine apres 90 %
         du trajet. La traine, c'est ce qu'on percoit comme « la glisse » :

           d=1.05 w=1.1   330 px   1.03 s   39   <- premier reglage
           d=1.40 w=1.4   420 px   1.38 s   54   <- ici
           d=1.70 w=1.6   480 px   1.62 s   68   <- commence a echapper
           lerp 0.055     450 px   2.08 s   82   <- autre caractere

         1.40 s est la limite haute utile : au-dela, la page ne s'arrete
         plus franchement quand on lache et on perd la sensation de la
         tenir. Pour ALLER PLUS LOIN, ne monte pas la duree — change de
         caractere : retire duration ET easing, mets lerp: 0.055.
         L'amortissement par frame n'a pas de fin fixe, la glisse devient
         continue au lieu d'etre une course chronometree. (Lenis donne la
         priorite a duration+easing quand les deux sont fournis : il faut
         vraiment retirer les deux lignes, pas seulement ajouter lerp.) */
      duration: 1.40,
      /* easeOutExpo : depart franc, donc le geste repond tout de suite,
         puis une fin tres etalee — c'est de la que vient la glisse. */
      easing: t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
      /* Distance parcourue par cran, donc le poids de la page : 1.4 donne
         420 px la ou 1.1 en donnait 330. Monter ce chiffre sans monter la
         duree rend le scroll rapide et sec, pas fluide — les deux vont
         ensemble. */
      wheelMultiplier: 1.4,
      smoothWheel: true,
      /* le tactile garde le defilement natif : interpoler sous le doigt
         fabrique une latence percue, et la section Services a deja ses
         propres ecouteurs touchstart/touchmove */
      syncTouch: false,
      /* les ancres passent par le handler maison de header(), qui
         decale la cible de la hauteur d'en-tete */
      anchors: false,
      /* Main rendue a la section Services — mais seulement quand elle va
         VRAIMENT consommer le geste. false = Lenis ressort avant d'avoir
         consomme ET avant son preventDefault : ni lissage, ni blocage.
         La condition est la meme que celle de l'ecouteur 'wheel' de
         services() : elle tient l'ecran ET on n'est pas a une extremite.
         Aux extremites la section rend deja la main ; en laissant Lenis
         reprendre des cet evenement-la, la sortie de section est un
         glisse et non un saut sec. svcConsomme est posee par services(),
         qui tourne apres nous dans componentDidMount. */
      virtualScroll: d => !(this.svcConsomme && this.svcConsomme(d.deltaY)),
      /* c'est GSAP qui bat la mesure, voir juste en dessous */
      autoRaf: false
    });
    this.lenis = lenis;

    /* Un seul battement pour les deux moteurs. lagSmoothing(0) : sans
       ca, apres un a-coup GSAP « rattrape » le temps perdu alors que
       Lenis, lui, ne rattrape pas — les deux repartent decales. */
    const tick = time => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    this.cleanups.push(() => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);    // valeurs par defaut de GSAP
      lenis.destroy();
      this.lenis = null;
    });
  }

  componentDidMount(){
    /* ?motion=full est lu une dizaine de fois dans ce fichier, mais la CSS,
       elle, n'en sait rien : une @media (prefers-reduced-motion) s'applique
       quoi qu'on demande dans l'URL. Sur cette machine, ou « reduire les
       animations » est actif en permanence, les reflets de lunettes restaient
       donc figes meme en ?motion=full. On pose la reponse sur <html> pour que
       la CSS puisse s'effacer devant. */
    /* ?motion=full COLLE MAINTENANT A LA MACHINE.
       « Reduire les animations » est actif en permanence sur le poste de
       travail. Sans le parametre, Lenis ne demarre meme pas : le defilement
       redevient natif, chaque cran de molette est un saut brut, et tout ce
       qui suit le scroll saute avec. Toutes les recettes de non-fluidite
       viennent de la, et on l'oublie a chaque rechargement.
       On le retient donc une fois pour toutes : ?motion=full ecrit le
       reglage, et aux visites suivantes on le REMET DANS L'URL avant que
       quoi que ce soit ne la lise. Les dix tests de ce fichier n'ont ainsi
       rien a savoir de ce mecanisme. ?motion=auto efface le reglage.
       Aucun effet pour un visiteur : sa memoire locale est vide. */
    try {
      const p = new URLSearchParams(window.location.search);
      if(p.get('motion') === 'full') localStorage.setItem('pixovery-motion', 'full');
      else if(p.get('motion') === 'auto') localStorage.removeItem('pixovery-motion');
      else if(localStorage.getItem('pixovery-motion') === 'full'){
        p.set('motion', 'full');
        history.replaceState(null, '', window.location.pathname + '?' + p + window.location.hash);
      }
    } catch(e){ /* navigation privee, stockage refuse : on continue sans */ }

    if(/[?&]motion=full/.test(window.location.search))
      document.documentElement.setAttribute('data-motion', 'full');

    /* ?verres : aide de calage. Dessine les deux boites de reflet en vert
       par-dessus la figurine, sans animation ni masque. Une capture suffit
       alors a dire si elles tombent sur les verres ou a cote — mesurer la
       planche ne dit rien de ce que le navigateur affiche vraiment. */
    if(/[?&]verres/.test(window.location.search))
      document.documentElement.setAttribute('data-verres', '1');

    /* en premier : les methodes suivantes testent this.lenis */
    this.smoothScroll();
    this.applyProps();
    this.scale();
    this.on(window, 'resize', () => this.scale());
    this.header();
    this.hovers();
    this.gallery();
    this.reveals();
    this.intro();
    this.parallax();
    this.scanHero();
    this.rhythmSetup();
    this.spin();
    this.services();
    this.mediaGuard();
    this.figeHorsEcran();
  }

  /* Le tour du Processus. 72 poses a 5 degres, reparties sur deux
     planches webp de 36 cases (576 px). On dessine la pose la plus
     proche : PAS de fondu croise entre deux poses, ca fabriquait un
     fantome au lieu d'un mouvement. Entree et sortie en fondu pour que
     la figurine ne soit ni posee la avant qu'on arrive, ni coupee net
     au bord de la section. */
  spin(){
    const cv = this.q('[data-spin]'), tour = this.q('[data-tour]');
    const sec = this.q('#processus');
    if(!cv || !tour || !sec) return;
    /* La figurine EST affichee sur telephone depuis le 26/08 (demande de
       Redha). L'ancienne sortie anticipee a saute EN MEME TEMPS que le
       display:none du CSS : les deux doivent toujours bouger ensemble, sinon
       on paie le telechargement d'une planche que personne ne voit, ou
       l'inverse — un canvas visible et vide.
       CE QUE CA COUTE SUR TELEPHONE : proc-v7.webp, 1,8 Mo au telechargement
       et ~64 Mo une fois decodee. Le chargement reste differe
       (IntersectionObserver, 400 % de marge) et les <img> sont videes des que
       les bitmaps existent — mais les deux planches du hero, elles, ne sont
       jamais liberees. Le pic tient donc autour de 170 Mo de bitmaps. C'est
       le point a surveiller si le site se met a saccader ou a recharger tout
       seul sur un telephone d'entree de gamme. */
    const cx = cv.getContext('2d');
    if(!cx) return;

    /* Planches refaites le 24/08 a partir de la video du blister (241 images
       a 30 i/s, fond noir). 72 poses retenues, tuiles de 384 px, alpha tiree
       de la LUMINANCE et non par colorkey : le sujet a des noirs profonds
       (les lunettes, les ombres du blister) qu'un colorkey aurait troues.
       Un seuil bas et une montee courte suffisent, le fond de la video est
       du noir pur. */
    /* Tuiles RECTANGULAIRES, 448 x 640. Un blister est un portrait : dans
       une tuile carree, un tiers des pixels payait du vide sur les cotes.
       A poids egal, le passage au format de l'objet rend l'image nettement
       plus nette. */
    console.log('[pixovery] spin v7 — 90 poses, planche allegee (64 Mo au lieu de 101)');
    /* UN TOUR COMPLET, MESURE CETTE FOIS.
       La session precedente avait conclu que « Video sans titre 7 » etait
       inexploitable : trois segments, chacun un demi-tour suivi d'un arret
       sur un dos different, aucun verso presentable. Conclusion tiree
       d'images reduites en 96x54, ou deux dos differents se ressemblent.

       Remesure image par image (largeur du sujet, seuil 40/255, et delta
       inter-images pour les coupes) : il n'y a QU'UNE coupe franche, a
       l'image 240. Deux segments, pas trois.
         - 0 a 239   : un demi-tour puis un arret sur le dos. Inutilisable.
         - 240 a 720 : DEUX TOURS COMPLETS ET CONTINUS, de 240 images
                       chacun. Les creux de largeur — le chant du blister —
                       tombent aux images 311, 431 et 559 : espaces de 120
                       et 128, soit un demi-tour tous les 4 s. Regulier.
       Le PREMIER de ces deux tours (241 -> 480) est propre : verso lisible,
       un seul code-barres, texte coherent. Le second porte le dos rate
       (« 180 001 180 », deux codes-barres) — c'est lui qu'on avait vu.

       LA PLANCHE proc-v5 EN EST TIREE : 60 poses, une image sur quatre,
       6 degres par pose, tuiles de 448 x 640 comme avant. 1,75 Mo, 10 x 6.
       Cadre commun a toutes les poses (boite englobante mesuree sur les 60,
       plus une marge) : sans cadre commun, le blister se decalerait d'une
       image a l'autre.
       PAS DE COUCHE ALPHA, comme la v4 : le fond de la video est du noir
       pur et la section est en #000. */
    const N = 90, COLS = 10, PER = 90, TW = 352, TH = 503;
    const sheets = [new Image()];
    let bitmaps = null;                 /* les planches decodees une fois pour toutes */
    let vue = -1, prets = 0, rate = false;

    /* meme regle que intro() : ?motion=full force la version pleine */
    const force  = /[?&]motion=full/.test(window.location.search);
    const reduce = !force && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* LE ZOOM D'ENTREE. La sequence s'ouvre serree sur le blister puis
       recule jusqu'a le cadrer entier. Il est fait au dessin, pas en CSS :
       un transform:scale sur le canvas agrandirait des pixels deja traces,
       alors qu'ici on redessine la tuile a la taille voulue — c'est net a
       toutes les etapes. */
    const ZOOM0 = 1.20, ZOOM_FIN = 0.28;   /* depart, et part de la course */
    let vueZ = -1;
    const draw = (f, z) => {
      /* LE MODULO EST ICI, PAS AILLEURS. Sans lui, une pose a 71,6 arrondit
         a 72 — un index qui n'existe pas. `sheets[2]` est alors undefined,
         drawImage leve une exception, le canvas GARDE l'image precedente
         (le dos), et l'image suivante saute directement a 0 (la face).
         C'est ca, la teleportation : pas un raccord rate, une case hors
         planche. Le modulo referme la boucle : 72 redevient 0. */
      /* PLUS DE QUANTIFICATION EN MODE REDUIT. Elle arrondissait la pose au
         multiple de 5, soit des paliers de 15 degres : le tour partait en
         diaporama. Elle etait la pour economiser des dessins, mais un
         drawImage depuis une planche deja decodee ne coute rien — ce n'est
         pas la ce qu'on economise. Si « reduire les animations » est actif,
         c'est le mouvement d'accompagnement qui est coupe (le zoom, le
         translate, l'echelle), pas la finesse de la rotation. */
      /* Plus de modulo : ce n'est plus une boucle mais un aller-retour, la
         valeur ne peut pas depasser N-1. Un modulo ici ramenerait la pose la
         plus tournee sur la pose de face — un claquement au bout de la
         course. On borne. */
      /* UNE SEULE POSE, NETTE. Le fondu entre deux poses avait ete essaye
         pour lisser le mouvement sans alourdir la planche : il rendait la
         rotation floue, deux images du blister se superposant en
         permanence. Sur un objet a contours durs — un blister sous
         plastique, du texte imprime — le melange ne se lit pas comme un
         file de mouvement mais comme une mise au point ratee.
         La fluidite vient donc du NOMBRE de poses : 90, soit 4 degres par
         pose. Pourquoi pas 120 : une planche de 120 poses en tuiles de
         384 x 549 fait 25 Mpx, donc CENT MEGAOCTETS de memoire une fois
         decodee — a quoi s'ajoutaient les 108 Mo des deux planches du hero.
         C'est ce qui saccadait. En tuiles de 352 x 503, 90 poses tiennent
         en 16 Mpx, soit 64 Mo. Le canvas est affiche a environ 360 px de
         large : la definition suffit toujours. */
      const i = Math.max(0, Math.min(N - 1, Math.round(f))) % N;
      const zz = Math.round(z * 400) / 400;      /* on ne redessine pas pour rien */
      const src = bitmaps || sheets;
      if((i === vue && zz === vueZ) || !(bitmaps || sheets[0].naturalWidth)) return;
      vue = i; vueZ = zz;
      const k = (i / PER) | 0, j = i % PER;
      const dw = TW * zz, dh = TH * zz;          /* zoom centre */
      cx.clearRect(0, 0, TW, TH);
      cx.drawImage(src[k], (j % COLS) * TW, ((j / COLS) | 0) * TH, TW, TH,
                   (TW - dw) / 2, (TH - dh) / 2, dw, dh);
    };

    /* (l'afficheur de mesures vert a servi puis a ete retire — il avait
       revele que Lenis tournait bien et que la geometrie etait correcte,
       donc que le probleme etait dans la video, pas dans le code) */
    let file = false;
    const cadence = () => {
      file = false;
      const r = sec.getBoundingClientRect(), vh = window.innerHeight;
      const span = vh * 0.25 + r.height;
      const p = Math.max(0, Math.min(1, (vh * 0.85 - r.top) / span));
      /* le recul se fait sur les 30 premiers pour cent de la course, en
         sortie douce : un zoom lineaire se lit comme un travelling mecanique */
      const zp = Math.min(1, p / ZOOM_FIN);
      const ze = 1 - Math.pow(1 - zp, 3);
      /* UN TOUR CONTINU, QUI SE TERMINE DE FACE.
         Rien n'est fige, rien n'attend : la rotation suit le defilement du
         premier au dernier pixel de la section. Les 72 poses couvrent
         exactement 360° — la 72e n'est pas la reprise de la 1re, elle
         s'arrete juste avant. Le modulo ramene donc la fin sur la pose 0,
         qui EST le packshot de face.
         J'avais ajoute des zones mortes au debut et a la fin pour forcer la
         face : ca hachait le mouvement pour rien. Une boucle qui se referme
         sur elle-meme n'a besoin d'aucune de ces bequilles.
         `pose` et pas `f` : cadence() declare deja un `f` plus bas. */
      /* LA ROTATION SUIT LA VIE COLLEE DU BLISTER, RIEN D'AUTRE.
         Deux mesures fausses avant celle-ci :
         - la traversee de la SECTION : elle ne finit qu'une fois la section
           entierement passee, longtemps apres que le blister soit parti ;
         - la vie visible « au jugé » : elle ne tenait pas compte du fait
           qu'un element collant se DECOLLE a la fin de son conteneur.

         C'est ce decollement qui produisait ce que tu decrivais : le blister
         quittait l'ecran de dos, puis la valeur continuait de courir dans le
         vide et repassait de face une fois qu'on ne le voyait plus.

         La bonne course est donc celle de son conteneur : elle demarre quand
         il se colle (le haut du rail atteint la position collante) et se
         termine quand il se decolle (le rail n'a plus de place sous lui).
         Sur cette course, 0 et 1 sont tous les deux la pose de face, et il
         est visible du premier au dernier instant. */
      const rail = tour.parentElement;
      const rr = rail ? rail.getBoundingClientRect() : r;
      /* getComputedStyle(tour).top a disparu d'ici. Il y etait appele a
         CHAQUE image pour lire la position collante ; c'est une lecture de
         style forcee, donc un recalcul de mise en page a chaque frame, en
         plein defilement. La mesure n'en a plus besoin. */
      /* Le tour se boucle sur les 80 PREMIERS POUR CENT de cette course, pas
         sur la totalite. Raison : le saut du dos a la face que tu voyais a
         la fin. Il ne venait pas d'un raccord rate mais d'une course trop
         longue — le blister se decollait alors qu'il en etait au dos, la
         valeur finissait sa montee hors champ, et la pose de face
         n'apparaissait qu'au retour, d'un coup.
         En terminant le tour avant le decollement, la derniere pose est
         atteinte a l'ecran, image par image, et le blister TIENT sa face
         pendant qu'il s'en va. */
      /* LE TOUR NE SE JOUE PLUS SUR LA SEULE VIE COLLEE. C'est ca qui le
         rendait saccade.
         La course collee vaut (hauteur du rail - hauteur du blister) : les
         quatre etapes mesurent ~1070 px, le blister 680 px — il reste
         ~390 px. Faire 360 degres en 390 px de defilement, c'est 3 px de
         scroll par pose. Un cran de molette en vaut cent : on saute trente
         poses d'une image a l'autre. Aucun nombre d'images ne repare ca —
         on ne voyait pas une rotation lente et hachee, on voyait une
         toupie echantillonnee une fois par cran.
         Deux versions precedentes avaient masque le probleme au lieu de le
         voir : un plancher a 900 px, qui etalait le tour sur une course
         inexistante et l'arretait a 155 degres ; puis la course reelle, qui
         faisait bien le tour complet mais en 340 px.

         LA BONNE MESURE EST LA TRAVERSEE DU RAIL PAR LA FENETRE. Elle
         demarre quand le haut du rail touche le bas de l'ecran — le blister
         apparait — et se termine quand le bas du rail passe le haut de
         l'ecran — il est parti. Elle vaut donc (hauteur d'ecran + hauteur du
         rail), soit ~1970 px : cinq fois plus, et le blister est a l'ecran
         d'un bout a l'autre. Le collage n'a plus a etre pris en compte, il
         ne fait que decider OU le blister se tient pendant que la mesure,
         elle, ne cesse jamais d'avancer.
         Aux deux extremites la valeur retombe sur la pose 0, la face : il
         arrive de face et il repart de face.
         Le plafond a 2600 px sert aux ecrans bas ou aux rails tres longs :
         au-dela, le tour se termine avant la sortie et le blister tient sa
         face en s'en allant. */
      const traversee = Math.min(vh + rr.height, 2600);
      const pv = Math.max(0, Math.min(1, (vh - rr.top) / traversee));
      /* SENS INVERSE, ET LA FACE AU MILIEU DE LA TRAVERSEE.
         La version precedente posait la face aux DEUX extremites : le
         blister arrivait de face en bas de l'ecran et repartait de face en
         haut. Joli sur le papier, absurde a l'usage — aux deux extremites il
         est a moitie hors champ et en train de se fondre. Pendant tout le
         temps ou on le regarde vraiment, c'est-a-dire pendant qu'on lit les
         quatre etapes, il montrait son dos. On ne voyait jamais le perso.
         Le demi-tour d'avance (+ N/2) place la face a pv = 0,5, quand le
         blister est au centre de l'ecran. Il entre de dos, se retourne vers
         nous pendant la lecture, et repart en se retournant a nouveau.
         Le signe moins inverse le sens de rotation. */
      /* |2·pv − 1| vaut 1 aux deux extremites de la traversee et 0 au
         milieu. La pose 0 etant celle de face, le blister entre de trois
         quarts, se presente de face quand il est au centre de l'ecran —
         c'est-a-dire pendant qu'on lit les etapes — et repart de trois
         quarts. La face tombe la ou on le regarde, pas la ou il sort du
         champ : c'est l'erreur que j'avais faite en la calant aux deux
         bouts. */
      /* UN TOUR DE 360 DEGRES QUI S'ARRETE DE FACE.
         `u` va de -1 a +1 sur la traversee, donc l'angle de -180 a +180 :
         une rotation continue, dans le meme sens du debut a la fin. Le
         blister entre de dos, se retourne vers nous, et repart en montrant
         de nouveau son dos. La face tombe a pv = 0,5, quand il est au
         centre de l'ecran — la ou on le regarde vraiment, pendant qu'on lit
         les quatre etapes. La caler aux extremites (erreur d'une version
         precedente) revenait a la montrer pendant qu'il est a moitie hors
         champ et en fondu.

         LE PALIER. Sans zone morte, la face n'est qu'un point de passage :
         il l'atteint et repart aussitot. Sur PALIER de la traversee (16 %),
         la pose reste a 0 et le blister TIENT sa face.
         Le smoothstep n'est pas une coquetterie : sans lui la rotation
         repart a pleine vitesse en sortant du palier, et l'arret se lit
         comme un a-coup. Avec, la vitesse repart de zero.

         LE MODULO EST DE RETOUR, et il est correct ici : ce n'est plus un
         aller-retour borne mais une boucle. -30 poses et +30 poses sont la
         MEME pose, le dos. Sans lui, un index negatif sortirait de la
         planche. */
      const PALIER = 0.16;
      const u = pv * 2 - 1;
      const au = Math.abs(u);
      const s2 = Math.max(0, (au - PALIER) / (1 - PALIER));
      const e2 = s2 * s2 * (3 - 2 * s2);
      const pose = (((u < 0 ? -1 : 1) * e2 * (N / 2)) + N) % N;
      draw(pose, reduce ? 1 : ZOOM0 + (1 - ZOOM0) * ze);
      /* Fondu a l'entree uniquement. Il y avait aussi une sortie — la
         figurine s'effacait sur les 16 derniers pourcents de la section —
         mais elle disparaissait alors qu'on la regardait encore. Le bord
         de section ne la coupe pas : etant collante, elle remonte et sort
         du champ d'elle-meme, comme n'importe quel contenu. */
      const ent = Math.min(1, p / 0.10);
      const f = ent, d = f * f * (3 - 2 * f);
      /* LA SORTIE. Il n'y avait qu'une entree en fondu : une fois decolle,
         le blister remontait en clair jusqu'a passer sous le header, et il
         reapparaissait par-dessus la section suivante. On le fait donc
         s'eteindre pendant qu'il glisse sous la barre — la mesure est prise
         sur SA propre boite, donc elle ne bouge pas tant qu'il est colle et
         ne se declenche qu'au moment ou il part vraiment. */
      const tr = tour.getBoundingClientRect();
      const sortie = Math.max(0, Math.min(1, (tr.bottom - 120) / Math.max(1, tr.height * 0.6)));
      tour.style.opacity = (d * sortie).toFixed(3);
      tour.style.transform = reduce ? 'none'
        : 'translateY(' + ((1 - d) * 26).toFixed(1) + 'px) scale(' + (0.955 + 0.045 * d).toFixed(4) + ')';
    };
    const queue = () => { if(file) return; file = true; requestAnimationFrame(cadence); };

    const demarre = () => {
      /* L'APPARITION BRUSQUE. Le fondu d'entree est pilote par le
         defilement : il suppose qu'on arrive par le haut, progressivement.
         Mais si les planches finissent d'arriver alors que la section est
         DEJA a l'ecran, la premiere valeur calculee est deja 1 — le blister
         se materialise d'un coup, sans transition, en plein milieu.
         On donne donc une transition CSS a la toute premiere valeur, puis on
         la retire : apres ca, l'opacite doit suivre le scroll a l'image
         pres, et une transition la ferait trainer. */
      tour.style.transition = 'opacity .5s ease';
      setTimeout(() => { tour.style.transition = ''; }, 560);
      draw(0, ZOOM0); cadence();   /* le zoom manquait : draw(0) posait un NaN */
      /* ON SE BRANCHE SUR LENIS, PAS SUR L'EVENEMENT `scroll`.
         Deuxieme cause du hachage. Lenis interpole le defilement dans son
         propre rAF ; il pose la nouvelle position, le navigateur emet
         `scroll`, et queue() reportait alors le dessin a l'image SUIVANTE.
         Le blister etait donc systematiquement une image en retard sur le
         reste de la page — et quand le navigateur regroupait deux
         evenements `scroll`, le retard devenait irregulier. C'est ca qu'on
         lit comme un a-coup.
         `lenis.on('scroll')` se declenche a l'interieur de la meme image que
         le deplacement : on dessine la position du moment, pas celle d'avant.
         C'est deja la methode employee ailleurs dans ce fichier. */
      if(this.lenis){
        this.lenis.on('scroll', cadence);
        this.cleanups.push(() => { if(this.lenis) this.lenis.off('scroll', cadence); });
      } else {
        this.on(window, 'scroll', queue, {passive: true});
      }
      this.on(window, 'resize', queue);
    };

    const pret = () => {
      if(++prets < sheets.length) return;
      if(rate){ tour.style.display = 'none'; return; }
      /* TROISIEME CAUSE : le decodage. Une planche fait 4480 x 3840. Tant
         qu'elle reste un <img>, le navigateur est libre de jeter son image
         decodee et de la refaire au prochain drawImage — ce qui tombe en
         plein defilement et coute une image entiere. createImageBitmap la
         decode UNE fois, definitivement, et drawImage n'a plus qu'a copier.
         Si le navigateur ne connait pas createImageBitmap ou echoue, on
         garde les <img> : c'est degrade, pas casse. */
      if(window.createImageBitmap){
        Promise.all(sheets.map(im => createImageBitmap(im)))
          .then(bm => {
            bitmaps = bm;
            /* draw() lit `bitmaps || sheets` : une fois les bitmaps la, les
               <img> ne servent plus a rien et gardent une deuxieme copie
               decodee de la planche. On les vide. */
            sheets.forEach(im => { im.onload = im.onerror = null; im.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='; });
            demarre();
          })
          .catch(demarre);
      } else demarre();
    };
    /* CHARGEMENT DIFFERE. La planche pese 1,2 Mo — plus rien a voir avec les
       5,3 Mo d'avant, mais on la demande quand meme quatre ecrans a
       l'avance : le telechargement commence des Services et a tout le temps
       de finir pendant qu'on lit le portfolio. Une marge d'un ecran et demi
       etait trop juste, le blister arrivait parfois alors qu'on le regardait
       deja — c'etait l'apparition brutale. */
    const charge = () => {
      sheets.forEach((im, k) => {
        im.onload = pret;
        im.onerror = () => { rate = true; pret(); };
        im.src = '/assets/proc-v7.webp';
      });
    };
    if('IntersectionObserver' in window){
      const obs = new IntersectionObserver(en => {
        if(!en[0].isIntersecting) return;
        obs.disconnect();
        charge();
      }, {rootMargin: '400% 0px'});
      obs.observe(sec);
      this.cleanups.push(() => obs.disconnect());
    } else charge();
  }


  /* Services en panneaux horizontaux. Le scroll vertical fait defiler les
     quatre services de cote, et chacun se cale. Quatre ecrans, pas onze :
     le parcours reste court. */
  /* Services : un cran de molette = un service. Pas un defilement
     continu qu'on recale apres coup — un vrai passage de page. Tant que
     la section tient l'ecran, on prend la main sur la molette et on
     avance d'un panneau par geste. Aux deux extremites on rend la main :
     la page repart normalement vers le haut ou vers Portfolio. */
  services(){
    const sec = this.q('[data-piste="services"]');
    const rail = this.q('[data-svcrail]');
    if(!sec || !rail) return;
    const panneaux = this.qa('[data-panneau]');
    const n = panneaux.length;
    if(n < 2) return;
    const num = this.q('[data-svcn]'), barre = this.q('[data-svcbarre]');

    /* TACTILE : AUCUN CRAN. Le systeme de crans est fait pour la molette, ou
       un evenement = une intention. Au doigt il ne peut pas marcher : le
       declencheur attend 28 px de glissement, or des que ces 28 px sont
       parcourus le navigateur a DEJA engage son defilement natif, et il
       ignore alors le preventDefault du reste du geste. On obtenait donc le
       pire des deux : ni un defilement libre, ni un calage propre.
       Le rail, lui, n'a jamais eu besoin des crans — cadence() le positionne
       en continu sur la progression du scroll (voir plus bas,
       translate3d(-p * ...)). Sur telephone on laisse donc le defilement
       natif faire son travail et le rail suit tout seul. */
    const tactile = !!(window.matchMedia && window.matchMedia('(max-width:768px)').matches);

    const haut = () => sec.getBoundingClientRect().top + window.scrollY;
    const course = () => Math.max(1, sec.offsetHeight - window.innerHeight);
    const posDe = i => haut() + course() * i / (n - 1);
    /* la section tient-elle l'ecran ? */
    const tenue = () => {
      const r = sec.getBoundingClientRect();
      return r.top <= 2 && r.bottom >= window.innerHeight - 2;
    };
    /* Lue a chaque evenement par le virtualScroll de smoothScroll().
       Tant qu'elle renvoie true, Lenis ne touche ni a la molette ni au
       defilement, et toute la mecanique par crans ci-dessous travaille
       exactement comme avant Lenis. La condition est volontairement la
       MEME que celle de l'ecouteur 'wheel' plus bas (ligne « on rend la
       main a la page ») : aux extremites on renvoie false, donc Lenis
       reprend des cet evenement-la et la sortie de section glisse au
       lieu de sauter. Si tu touches a l'une des deux conditions,
       touche a l'autre. */
    this.svcConsomme = dy => {
      if(!tenue()) return false;
      const dir = dy > 0 ? 1 : -1;
      if((dir > 0 && index >= n - 1) || (dir < 0 && index <= 0)) return false;
      return true;
    };
    this.cleanups.push(() => { this.svcConsomme = null; });

    /* Le rythme de la section, en un seul endroit.
       DUREE   : le passage lui-meme. Court, sinon on attend.
       REPOS   : court silence apres une arrivee, juste de quoi eviter qu'un
                 meme elan compte deux fois. Surtout PAS un delai pendant
                 lequel on ignore la molette : le temps d'arret sur le 01 ne
                 vient pas de la sourdine, il vient du fait qu'on avale le
                 geste qui t'a fait entrer dans la section — son elan ne
                 traverse plus, mais un vrai nouveau geste passe tout de
                 suite, des le premier cran.
       SEUIL   : quantite de molette a fournir pour valider un cran. Une
                 souris envoie ~100 par cran, donc un cran = un service. Un
                 pave tactile envoie des dizaines de petits deltas : il faut
                 un vrai geste, pas un frolement.
       PAUSE   : au-dela de ce silence, c'est un nouveau geste. */
    /* Amplitude du lancer de la premiere disquette. this.lenis est null
       quand « reduire les animations » est actif sans ?motion=full : on
       raccourcit le geste au lieu de le supprimer. Degrader, jamais couper. */
    const LANCER = this.lenis ? 1 : 0.35;

    /* CADENCE DE SERVICES — les quatre nombres qui font la vitesse.
       Valeurs d'origine, si tu veux revenir : 640 / 90 / 46 / 180 et
       DUREE_L = 900.
         DUREE  : duree du passage d'un service au suivant, sans Lenis.
         REPOS  : silence minimal entre deux passages.
         SEUIL  : molette a cumuler avant de declencher. Le baisser rend la
                  section nerveuse et fait sauter deux services d'un geste.
         PAUSE  : silence apres lequel le geste avale est reouvert. */
    const DUREE = 460, REPOS = 70, SEUIL = 46, PAUSE = 120;
    /* Duree du passage quand c'est Lenis qui bouge la page. Plus longue
       que DUREE : maintenant que tout le site glisse sur ~1 s, un
       passage de service en 640 ms tranchait. Ramene a 600 ms : Redha
       trouvait la section trop lente a parcourir. C'EST LE REGLAGE A
       TOUCHER en premier — c'est lui qui agit quand Lenis est la, donc
       dans la quasi-totalite des visites. */
    const DUREE_L = 620;

    let index = 0, verrou = false, file = false, garde = null, repos = 0;
    /* Instant ou la section vient de prendre l'ecran. On s'en sert pour
       laisser le premier service se montrer avant d'accepter un geste. */
    let entree = 0, etaitTenue = false, dernierY = 0;

    /* le rail suit la position de scroll : pendant le glissement doux, il
       se deplace avec, donc le passage reste fluide au lieu de sauter */
    /* NE BRANCHE JAMAIS cadence() SUR gsap.ticker. Essaye : cette fonction
       contient le recalage d'entree de la section (scrollTo + verrou).
       Appelee a chaque frame, elle recale la section soixante fois par
       seconde et LE SCROLL DE TOUT LE SITE MEURT. Le vol reste pilote par
       le scroll, ce qui n'exige aucune boucle. */
    /* le header remet ce drapeau a zero en fin de vol : sans ca, un vol qui
       s'ARRETE dans Services laisserait etaitTenue a true et l'entree ne se
       rejouerait plus jamais */
    this.navReset = () => { etaitTenue = false; };

    const cadence = () => {
      file = false;
      const r = sec.getBoundingClientRect();
      const t0 = tenue();
      /* Un clic du menu qui VISE plus loin (Contact, A propos) traverse cette
         section en vol. Sans ce garde-fou, l'entree ci-dessous la recadrait
         de force — lenis.scrollTo immediate+force — et le voyage mourait ici :
         on cliquait Contact, on atterrissait sur Services. */
      /* !tactile : ce recadrage force (lenis.scrollTo immediate+force) se bat
         avec l'inertie native du doigt sur telephone — la page etait tiree en
         arriere au moment ou on entrait dans la section. */
      if(t0 && !etaitTenue && !this.navVol && !tactile){
        /* On vient d'entrer. preventDefault n'annule PAS un defilement deja
           lance : sans arret franc, l'elan traverse la section et le premier
           service ne se pose jamais. On coupe donc net, et on se cadre sur
           le service d'entree — le premier si on descend, le dernier si on
           remonte depuis Portfolio. */
        entree = (window.performance && performance.now) ? performance.now() : Date.now();
        index = (window.scrollY >= dernierY) ? 0 : n - 1;
        verrou = true;
        /* Lenis peut etre en plein rattrapage du geste qui vient de nous
           amener ici : un window.scrollTo brut serait ecrase a la frame
           suivante par SA cible a lui, et on repartirait en arriere.
           immediate + force recalent la valeur ET la cible d'un coup. */
        const yEntree = Math.round(posDe(index));
        if(this.lenis) this.lenis.scrollTo(yEntree, {immediate: true, force: true});
        else window.scrollTo({top: yEntree, behavior: 'auto'});
        /* Le geste qui vient de nous amener ici est consomme : son elan ne
           traversera pas la section. Il se reouvrira tout seul apres PAUSE
           de silence, donc un nouveau coup de molette repond aussitot. */
        avale = true; cumul = 0;
        clearInterval(garde);
        setTimeout(() => { verrou = false; queue(); }, 60);
      }
      etaitTenue = t0;
      dernierY = window.scrollY;
      /* Progression de l'ARRIVEE de la section, etalee sur CINQ ecrans de
         defilement et non un seul. Sert au lancer de la premiere
         disquette, plus bas. */
      const eIn = Math.max(0, Math.min(1, 1 - r.top / (5 * window.innerHeight)));
      const p = Math.max(0, Math.min(1, -r.top / course()));
      rail.style.transform = 'translate3d(' + (-p * (n - 1) * 100).toFixed(3) + 'vw,0,0)';
      const a = Math.round(p * (n - 1));
      if(!verrou) index = a;
      panneaux.forEach((el, k) => {
        const actif = k === a;
        const etait = el.dataset.actif === '1';
        el.dataset.actif = actif ? '1' : '0';
        /* On efface tout de suite en quittant. On ne LANCE rien ici :
        const wash = el.querySelector('[data-svcwash]');
        if(wash) wash.style.opacity = actif ? '1' : '0';
        const chiffre = el.querySelector('[data-svcnum]');
        if(chiffre) chiffre.style.webkitTextStrokeColor = actif ? 'rgba(236,0,112,.42)' : 'rgba(255,255,255,.14)';
        const ico = el.querySelector('[data-svcico] img');
        if(ico) ico.style.opacity = actif ? '1' : '.55';
        /* Parallaxe des disquettes. pk vaut 0 quand le panneau est cale au
           centre, -1 quand il attend a droite, +1 quand il est sorti a
           gauche. Le rail deplace le panneau de -pk*100vw ; on redonne
           +pk*17vw a la disquette pour qu'elle avance moins vite que le
           texte — c'est ce decalage qui fait la profondeur. La rotation
           suit le meme signal : la disquette se tourne vers nous en
           arrivant, comme un objet pose dans l'espace devant lequel on
           passerait. Valeurs bornees, sinon les panneaux lointains
           partent trop loin. */
        const prof = el.querySelector('[data-floppydepth]');
        /* ?light=svc : on saute tout le calcul de parallaxe des disquettes
           (transformations 3D ecrites a chaque frame de defilement). Les
           disquettes restent visibles, simplement immobiles. */
        if(prof && !ALLEGE('svc')){
          const pk = Math.max(-1.5, Math.min(1.5, p * (n - 1) - k));
          const abs = Math.min(Math.abs(pk), 1);
          let px = pk * 17, py = abs * -3.4, ps = 1 - abs * 0.20;
          const pivot = el.querySelector('[data-floppy]');

          /* --- LE PLONGEON DE LA PREMIERE DISQUETTE ---------------------
             Les disquettes 2 a 4 arrivent portees par le rail : elles ont
             deja une entree. La premiere, elle, est simplement LA quand la
             section prend l'ecran — pk vaut 0 des le depart pour k = 0, donc
             rien ne l'annonce. On lui fabrique son arrivee.

             Elle tombe du coin HAUT DROIT, traverse en restant haute, puis
             pique sur son emplacement et s'y range. Pilotee par le SCROLL et
             non par une timeline : `eIn` est la progression de l'arrivee de
             la section (0 quand son bord haut est encore un ecran plus bas,
             1 quand elle se cale). Reculer la renvoie en arriere — c'est ce
             qui la rend solidaire de la page au lieu de la faire jouer une
             fois et se taire.

             La courbe ne vient PAS d'un chemin dessine : elle vient du
             decalage entre deux axes qui n'ont pas la meme courbe. X arrive
             tot (easeOutBack), Y arrive tard (easeInOut). Sur la meme courbe
             les deux donneraient une diagonale.

             La culbute est a plat (--floppy-tilt), jamais en rotateY : un
             rotateY de 180 deg afficherait l'image en miroir, et le visuel
             de la disquette a une face — le texte de l'etiquette se
             retournerait en plein vol.

             On n'ajoute AUCUNE couche : tout passe par --par-x/y/s et
             --floppy-tilt, qui existent deja. La regle d'or du bloc SERVICES
             tient toujours — une transformation par couche, et rotate()
             reste avant rotateY() puisqu'on ne change qu'une valeur.
             --------------------------------------------------------------- */
          if(k === 0){
            /* Le vol occupe TOUTE la montee de la section : un ecran
               entier de defilement, soit environ 670 px de course visible.
               Une fenetre plus courte donnait un geste expedie.

               Il avait d'abord ete retarde a 42 % par crainte du bord haut
               de [data-colle], qui coupe net pendant l'approche. Mesure sur
               160 points de la course : inutile. Au moment ou la disquette
               est la plus grosse, elle est encore hors champ a DROITE — elle
               ne teste jamais le bord haut a ce moment-la. */
            /* DEUX TEMPS. Temps 1 (0 -> DEPART) : elle attend hors champ, a
               droite, pendant qu'on lit encore le hero. Temps 2 : le vol.

               FENETRE — c'est LE reglage a toucher si le vol te parait
               expedie. Le vol reste pilote par la molette : chaque cran
               doit donner une etape VISIBLE, pas avaler la moitie du geste.
               Lenis fait 420 px par cran ; eIn est etale sur 5 ecrans, donc
               la fenetre vaut FENETRE * 5 * innerHeight pixels de course.
               A 0,14 elle valait ~720 px, soit 1,7 cran : deux etapes a
               peine, dont une hors champ. A 0,25 elle vaut ~1125 px, soit
               pres de 3 crans — trois etapes franches. Monter FENETRE pour
               plus de crans, la baisser pour moins.

               Elle n'apparait pas plus tot a l'ecran pour autant : a u = 0
               la disquette est a +80 vw, largement hors champ a droite.
               Allonger la fenetre la fait seulement attendre plus
               longtemps a droite, pas surgir pendant le hero. */
            /* DEUX TEMPS. Temps 1 : elle attend hors champ a droite,
               pendant qu'on lit encore le hero. Temps 2 : le vol.

               VITESSE DU VOL — c'est LE seul reglage a toucher. Le vol est
               pilote par le scroll, donc « plus lent » veut dire « etale
               sur plus de course ». eIn court sur 5 ecrans, donc la
               fenetre vaut FENETRE * 5 * innerHeight pixels :

                 0,14  ->  ~673 px   (etait juge trop rapide)
                 0,24  ->  ~1150 px  (actuel, 1,7x plus lent)
                 0,34  ->  ~1630 px  (2,4x plus lent)

               Elargir ne risque PAS de la faire rogner : mesure sur 160
               points de course, au moment ou elle est la plus grosse elle
               est encore hors champ a DROITE — elle ne teste jamais le
               bord haut de [data-colle] a cet instant-la. Et elle ne
               deborde pas non plus sur le hero : a u = 0 elle est a
               +80 vw, donc elle attend simplement plus longtemps hors
               ecran. DEPART et FENETRE doivent toujours totaliser 1. */
            /* NE PAS ELARGIR CETTE FENETRE POUR « RALENTIR ». Essaye a 0,24
               puis 0,40 : ca ne ralentit pas le vol, ca DEFORME sa
               trajectoire. La disquette se deplace pendant que la page
               monte ; etaler le vol sur plus de course change le rapport
               entre ces deux mouvements, et la courbe vue a l'ecran n'est
               plus la meme. Rejete a l'oeil par Redha. 0,86 / 0,14 est la
               valeur d'origine, celle qui donne la bonne courbe. */
            const DEPART = 0.86, FENETRE = 0.14;
            const u = Math.max(0, Math.min(1, (eIn - DEPART) / FENETRE));
            /* X — easeOutBack. Elle traverse vite, depasse la cible d'environ
               3 vw sur la gauche vers u = 0,65, puis revient. */
            const t  = u - 1;
            const eb = 1 + 2.10 * t * t * t + 1.10 * t * t;
            /* Y — easeInOut, donc l'inverse : elle reste HAUT pendant que X
               fait sa course, et ne tombe qu'apres. C'est ce decalage entre
               les deux axes qui fabrique la courbe. Deux axes sur la meme
               courbe donneraient une diagonale, pas un plongeon. */
            const ey = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2.2) / 2;
            /* le rebond de la pose : une demi-sinusoide sur le dernier tiers.
               Nulle aux deux bouts, donc elle ne peut pas laisser de residu —
               elle passe 3,4 vh SOUS l'emplacement puis remonte dedans. */
            const rb = u > 0.62 ? Math.sin(Math.PI * (u - 0.62) / 0.38) : 0;

            /* DEPORT_X — de combien elle part a DROITE de son emplacement.
               80 vw la mettait tres loin hors champ : on ne voyait jamais
               le debut du lancer, elle surgissait deja a mi-course. 30 vw
               la pose au bord droit de l'ecran, visible des le depart. */
            const DEPORT_X = 80;
            px += (1 - eb) * DEPORT_X * LANCER;
            /* Seulement 4 vh de haut, et c'est deliberе : plus elle part
               haut, plus TOT elle entre dans le champ. Pendant l'approche
               l'emplacement de l'icone est sous la ligne de flottaison, donc
               une disquette placee au-dessus de lui est tiree dans l'ecran
               par le haut. C'est ce qui la faisait apparaitre pendant le
               hero. Le mouvement vertical est donc rendu au ZOOM : c'est lui
               qui porte la profondeur, pas le plongeon. */
            /* DEPORT_Y — de combien elle part AU-DESSUS de son emplacement.
               C'est LE reglage du « lancer depuis la landing ».

               Il valait -4 vh, c'est-a-dire quasiment a plat : la disquette
               arrivait par le cote et non d'en haut. Le commentaire d'alors
               s'en justifiait — plus elle part haut, plus tot elle entre
               dans le champ, et elle risque d'apparaitre pendant le hero.
               Sauf que c'est precisement l'effet VOULU : elle doit se jeter
               depuis la landing.

               Attention a l'echelle : la disquette est ancree DANS la
               section Services, qui est encore ~1,5 ecran plus bas quand le
               vol commence. Son emplacement est donc lui-meme hors champ
               par le bas. Il faut un deport de l'ordre de la CENTAINE de vh
               pour la faire apparaitre en haut de l'ecran — pas quelques
               dizaines. C'est contre-intuitif mais c'est arithmetique.

               Monte-le si elle part encore trop bas, baisse-le si elle
               plonge de trop loin. Le 2,6 * rb est le rebond de la pose,
               il ne bouge pas. */
            /* IL Y A UN PLAFOND, et il n'est pas esthetique : la landing est
               peinte PAR-DESSUS Services. Des que la disquette monte plus
               haut que la frontiere entre les deux sections, elle passe
               dessous et se fait trancher net a l'horizontale. A 110 vh
               c'est exactement ce qui arrivait — on voyait une demi
               disquette. Tant qu'elle reste sous cette frontiere, aucun
               probleme d'empilement a regler.
               Le lancer part donc du BORD DROIT a mi-hauteur, pas du ciel. */
            /* 18 vh, et c'est une valeur MESUREE, pas un gout. Avec le zoom
               a 2,0 la disquette occupe plus de place au-dessus de son
               emplacement : la marge au point le plus haut a ete remesuree
               a 108 px sous le bord de [data-colle]. Aucune coupure.
               Monter ce chiffre la fait rogner par le cadre ; le baisser
               (il avait ete ramene a 4) la fait arriver a plat, par le
               cote, et tue le plongeon. */
            const DEPORT_Y = 18;
            py += (-DEPORT_Y * (1 - ey) + 2.6 * rb) * LANCER;
            /* le zoom : elle entre a ~1,25x, elle est deja passee a 1,5x hors
               champ. Elle vient VERS nous puis se range. Le creux a 0,98 au
               moment du depassement est le contrecoup de l'impact. */
            /* L'echelle a sa PROPRE courbe, et surtout pas celle de X.
               Avec l'easeOutBack elle passait SOUS sa taille de rangement
               (312 px pour 365 au repos) avant de regrossir : on lisait un
               deuxieme rebond, pas un eloignement. Ici la courbe est
               monotone — elle ne fait que retrecir.

               Et c'est une ease-IN : elle reste grosse LONGTEMPS, puis
               recule vite. C'est ce qui laisse le temps de la voir au
               premier plan avant qu'elle ne se range. Avec une ease-out
               elle avait deja fini de reculer quand elle entrait dans le
               champ, et tout l'effet de profondeur se jouait hors ecran. */
            /* GROSSEUR — de combien elle est plus grande au depart qu'a
               l'arrivee. A 1,80 (soit 2,8x) elle depassait largement de
               l'ecran au lancer : on ne voyait qu'un morceau de disquette
               coupe par le bord, pas un objet lance. A 0,55 elle fait 1,55x
               sa taille de rangement — assez pour lire la profondeur,
               assez peu pour tenir ENTIERE dans le champ. */
            /* ZOOM 2,0 — elle entre dans le cadre a environ 1,8x (580 px de
               large contre 320 au repos) et se reduit jusqu'a sa taille de
               rangement. C'est CA qui se lit comme de la profondeur : le
               zoom porte le premier plan, pas le deplacement vertical.
               Il avait ete pousse a 1,80 (soit 2,8x) : a cette taille la
               disquette deborde du cadre et se fait rogner. */
            const GROSSEUR = 1.0;
            const es = Math.pow(u, 1.9);
            ps *= 1 + GROSSEUR * (1 - es) * LANCER;
            if(pivot) pivot.style.setProperty('--floppy-tilt',
              (-8 - (1 - eb) * 330 * LANCER).toFixed(2) + 'deg');
          }

          prof.style.setProperty('--par-x', px.toFixed(2) + 'vw');
          prof.style.setProperty('--par-y', py.toFixed(2) + 'vh');
          prof.style.setProperty('--par-s', ps.toFixed(3));
          if(pivot) pivot.style.setProperty('--floppy-rot', (pk * -46).toFixed(2) + 'deg');
        }
      });
      if(num) num.textContent = String(a + 1).padStart(2, '0');
      /* jauge continue : elle glisse avec le scroll au lieu de sauter d'un
         quart a chaque cran. */
      if(barre) barre.style.left = (Math.max(0, Math.min(1, p)) * (n - 1) / n * 100).toFixed(2) + '%';
    };
    const queue = () => { if(file) return; file = true; requestAnimationFrame(cadence); };

    /* Le verrou tombe quand on est arrive, pas sur un minuteur : c'est ce
       qui faisait derailler le passage 3 -> 2, le verrou s'ouvrait en plein
       vol et index se recalculait depuis une position intermediaire. Avec
       le tween maison ci-dessous la question ne se pose plus — c'est nous
       qui bougeons, on sait exactement quand c'est fini.

       Glissement maison, en remplacement de scrollTo({behavior:'smooth'}).
       Le natif a trois defauts ici. Sa duree ne se regle pas. Sa courbe
       non plus. Et surtout il est neutralise quand « reduire les
       animations » est actif : le passage redevient un saut sec, et un
       saut ne laisse aucune image intermediaire — donc plus aucune
       parallaxe, plus aucun mouvement a voir. On tween nous-memes :
       duree fixe, courbe choisie, et cadence() rappele a chaque frame
       pour que le rail, les disquettes et la jauge suivent le meme
       signal. La surveillance par setInterval disparait avec : on sait
       exactement quand on est arrive, puisque c'est nous qui bougeons. */
    let glisse = null;
    const arreteGlisse = () => { if(glisse !== null){ cancelAnimationFrame(glisse); glisse = null; } };
    this.cleanups.push(() => { arreteGlisse(); clearInterval(garde); });

    const vers = i => {
      index = Math.max(0, Math.min(n - 1, i));
      arreteGlisse();
      clearInterval(garde);
      const depart = window.scrollY;
      const cible = Math.round(posDe(index));
      const delta = cible - depart;
      if(Math.abs(delta) < 2){ verrou = false; queue(); return; }
      verrou = true;
      /* LA COURBE DU PASSAGE — melange, et c'est voulu.
         easeInOutCubic seul (ce qu'il y avait) part de zero : le service ne
         bouge pas pendant les 100 premieres millisecondes, on croit que le
         geste n'a pas ete pris. easeOutCubic seul part a pleine vitesse : la
         parallaxe defile trop vite pour etre lue, c'est le defaut note plus
         haut sur cubic-bezier(.16,1,.3,1).
         35 % de l'un, 65 % de l'autre : le depart repond tout de suite, le
         milieu garde du temps, l'arrivee se pose sans marche. C'est le poids
         (.65) qu'on touche pour rendre le passage plus glissant — pas la
         duree. */
      const courbe = t => {
        const io = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const out = 1 - Math.pow(1 - t, 3);
        return io * .35 + out * .65;
      };

      /* Quand Lenis est la, c'est LUI qui bouge la page. On ne superpose
         plus un window.scrollTo frame par frame : Lenis resynchronise sa
         propre cible sur chaque scroll natif, donc les deux moteurs se
         corrigeaient mutuellement soixante fois par seconde et ca se
         voyait sur le rail. En passant par lui, le passage d'un service
         a l'autre a exactement la meme matiere que le reste du site.
         La courbe ne change pas, seule la duree s'allonge (DUREE_L).
         lock:true tient le geste pendant le vol — c'est l'ancien role du
         verrou, sauf que Lenis l'applique aussi a sa propre entree. */
      if(this.lenis){
        this.lenis.scrollTo(cible, {
          duration: DUREE_L / 1000,
          easing: courbe,
          force: true,
          lock: true,
          onComplete: () => {
            glisse = null;
            verrou = false;
            repos = (window.performance && performance.now) ? performance.now() : Date.now();
            queue();
          }
        });
        return;
      }

      /* Repli sans Lenis (reduced-motion sans ?motion=full) : le tween
         maison d'origine, inchange. */
      const duree = DUREE;
      const t0g = (window.performance && performance.now) ? performance.now() : Date.now();
      const frame = () => {
        const now = (window.performance && performance.now) ? performance.now() : Date.now();
        const t = Math.min(1, (now - t0g) / duree);
        const e = courbe(t);
        /* 'instant' et pas 'auto' : par prudence. global.css ne pose plus
           html{scroll-behavior:smooth} (retire en branchant Lenis), mais
           si quelqu'un le remet, 'auto' s'y soumettrait et relancerait un
           glissement natif par-dessus le notre a chaque frame — le
           mouvement redeviendrait caoutchouteux et n'arriverait jamais. */
        window.scrollTo({top: Math.round(depart + delta * e), behavior: 'instant'});
        cadence();
        if(t < 1){ glisse = requestAnimationFrame(frame); }
        else { glisse = null; verrou = false; repos = now; }
      };
      glisse = requestAnimationFrame(frame);
    };

    /* renvoie true si on a consomme le geste */
    const pas = dir => {
      if(!tenue()) return false;
      const tp = (window.performance && performance.now) ? performance.now() : Date.now();
      if((dir > 0 && index >= n - 1) || (dir < 0 && index <= 0)) return false; // on rend la main
      if(verrou) return true;   // geste avale pendant le glissement
      if(tp - repos < REPOS) return true;   // il vient de se poser, on le laisse respirer
      vers(index + dir);
      return true;
    };

    /* Une souris envoie un evenement par cran. Un pave tactile en envoie
       des dizaines, avec de l'inertie qui court encore une seconde apres
       que le doigt a quitte la surface — c'est elle qui faisait doubler le
       01. On ne compte donc plus les evenements, on compte la matiere : il
       faut avoir fourni SEUIL de molette pour valider un cran. Une fois le
       cran parti, tout le reste du geste est avale ; il faut PAUSE de
       silence pour qu'un nouveau geste puisse commencer. L'elan a beau
       courir, il ne passe plus. */
    let dernier = 0, cumul = 0, sens = 0, avale = false;
    this.on(window, 'wheel', e => {
      if(Math.abs(e.deltaY) < 2) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      if(!tenue()){ cumul = 0; avale = false; return; }
      if((dir > 0 && index >= n - 1) || (dir < 0 && index <= 0)){
        dernier = 0; cumul = 0; avale = false;   // on sort : le prochain geste repart propre
        return;                                  // et on rend la main a la page
      }
      e.preventDefault();
      const t = (window.performance && performance.now) ? performance.now() : Date.now();
      if(t - dernier > PAUSE){ avale = false; cumul = 0; }   // le geste precedent est fini
      dernier = t;
      if(avale) return;                     // la suite du geste, et son inertie
      if(dir !== sens){ cumul = 0; sens = dir; }   // demi-tour : on repart de zero
      if(verrou) return;
      if(t - repos < REPOS) return;         // anti-doublon d'un meme elan
      cumul += Math.abs(e.deltaY);
      if(cumul < SEUIL) return;
      cumul = 0; avale = true;
      vers(index + dir);
    }, {passive: false});

    let y0 = null;
    this.on(window, 'touchstart', e => { y0 = e.touches[0].clientY; }, {passive: true});
    this.on(window, 'touchmove', e => {
      if(tactile) return;          /* voir le commentaire de `tactile` plus haut */
      if(y0 === null) return;
      const dy = y0 - e.touches[0].clientY;
      if(Math.abs(dy) < 28) return;
      if(pas(dy > 0 ? 1 : -1)) e.preventDefault();
      y0 = e.touches[0].clientY;
    }, {passive: false});
    this.on(window, 'touchend', () => { y0 = null; }, {passive: true});

    /* ===== TACTILE : QUATRE CRANS, UN GESTE = UN SERVICE (28/08) ==========
       Version precedente : on laissait le doigt libre et on recalait apres
       coup, sur le service le plus proche. Ca posait toujours la section
       proprement, mais un grand geste traversait deux ou trois services d'un
       coup — on ne s'ARRETAIT pas sur chacun. C'est ce qui est demande ici.

       On revient donc aux crans, et il faut savoir pourquoi ils avaient
       echoue : l'ancien code appelait preventDefault APRES 28 px de
       glissement. Trop tard — a ce moment-la le navigateur a deja engage son
       defilement natif pour ce geste, et il ignore le preventDefault de tous
       les evenements suivants. Le geste etait donc perdu quoi qu'on fasse.

       LA CORRECTION TIENT EN UN MOT : ON DECIDE AU PREMIER MOUVEMENT. Des
       4 px, on tranche une fois pour toutes — soit la section prend le geste
       et preventDefault part sur CE touchmove-la (le navigateur n'a encore
       rien engage, il obeit et la page ne bougera pas d'un pixel de tout le
       geste), soit on le laisse entierement natif. Jamais d'entre-deux, et
       jamais de decision revisee en cours de route.

       Ce qui suit decoule de ce choix :
       - `libre` : geste rendu au navigateur. Pose quand on n'est pas dans la
         section, ou quand on la quitte par un bout (01 vers le haut, 04 vers
         le bas). Une fois pose, on ne reprend plus la main avant le doigt
         suivant.
       - `tire` : un geste = UN cran, comme `avale` pour la molette. Le reste
         du glissement est absorbe, pas ignore : preventDefault continue, donc
         la page reste tenue pendant que le service se pose.
       - `cale()` : le seul cas ou l'inertie peut encore nous deposer entre
         deux services, c'est l'ENTREE dans la section — l'elan vient d'un
         geste qu'on n'a pas pris (`libre`), et l'inertie n'est pas un
         touchmove, elle ne se preventDefault pas. On attend donc le silence
         et on pose la section sur le service le plus proche. Uniquement dans
         ce cas : apres un cran, la position est deja juste. */
    if(tactile){
      /* 34 px : un vrai glissement de pouce, pas un frolement. C'est
         l'equivalent tactile de SEUIL pour la molette. */
      const SEUIL_T = 34;
      let yDep = null, decide = false, libre = false, tire = false;
      let minuteur = null, geste = 0, tVerrou = 0;
      const quand = () => (window.performance && performance.now) ? performance.now() : Date.now();
      /* Le service le plus proche de la position ACTUELLE. On ne se fie pas a
         `index` en entrant : on y arrive par un defilement natif, il est donc
         pratiquement toujours perime. */
      const rang = () => {
        const p = (window.scrollY - haut()) / course();
        return Math.max(0, Math.min(n - 1, Math.round(p * (n - 1))));
      };

      const cale = () => {
        minuteur = null;
        if(verrou || yDep !== null) return;
        if(!geste || quand() - geste > 2000) return;
        if(!tenue()) return;
        const i = rang();
        const cible = Math.round(posDe(i));
        index = i;
        /* 3 px : en dessous on est arrive. Sans ce seuil le calage se
           rappellerait sans fin, son propre glissement reveillant l'ecouteur
           de scroll ci-dessous. */
        if(Math.abs(window.scrollY - cible) < 3){ queue(); return; }
        window.scrollTo({top: cible, behavior: 'smooth'});
      };
      const armer = () => { if(minuteur) clearTimeout(minuteur); minuteur = setTimeout(cale, 130); };

      this.on(window, 'touchstart', e => {
        yDep = e.touches[0].clientY;
        decide = false; libre = false; tire = false;
        if(minuteur){ clearTimeout(minuteur); minuteur = null; }
      }, {passive: true});

      this.on(window, 'touchmove', e => {
        if(yDep === null || libre) return;
        const dy = yDep - e.touches[0].clientY;
        if(!decide){
          /* 4 px : le doigt tremble toujours un peu en se posant. En dessous
             on n'a pas encore d'intention, et trancher sur du bruit
             donnerait un sens au hasard. */
          if(Math.abs(dy) < 4) return;
          decide = true;
          const dir = dy > 0 ? 1 : -1;
          if(!tenue()){ libre = true; return; }
          /* En plein passage, la position est intermediaire : la lire
             donnerait un rang faux. On garde celui du passage en cours. */
          if(!verrou) index = rang();
          if((dir > 0 && index >= n - 1) || (dir < 0 && index <= 0)){ libre = true; return; }
        }
        /* FILET DE SECURITE — NE JAMAIS PIEGER LE VISITEUR.
           Tant qu'on preventDefault, la page ne peut plus bouger DU TOUT :
           c'est ce qui donne les crans, et c'est aussi ce qui rend un verrou
           bloque catastrophique. `verrou` est leve par le onComplete de
           lenis.scrollTo ; si ce rappel n'arrive jamais — passage interrompu,
           Lenis arrete, cible identique a la position — la section garderait
           le doigt pour toujours et on ne pourrait meme plus en sortir.
           Au-dela d'une seconde et demie (le passage en dure 0,62), on
           considere le verrou perdu : on le leve et on rend le geste au
           navigateur. Mieux vaut un cran rate qu'une page morte. */
        if(verrou && tVerrou && quand() - tVerrou > 1500){ verrou = false; libre = true; return; }
        /* La section tient le geste : la page ne bouge plus d'elle-meme. */
        e.preventDefault();
        if(tire || verrou) return;
        if(Math.abs(dy) < SEUIL_T) return;
        tire = true;
        tVerrou = quand();
        vers(index + (dy > 0 ? 1 : -1));
      }, {passive: false});

      this.on(window, 'touchend', () => {
        yDep = null;
        if(libre){ geste = quand(); armer(); }
      }, {passive: true});

      this.on(window, 'scroll', () => { if(libre && geste) armer(); }, {passive: true});
      this.cleanups.push(() => { if(minuteur) clearTimeout(minuteur); });
    }

    this.on(window, 'keydown', e => {
      const bas = e.key === 'ArrowDown' || e.key === 'PageDown';
      const hautK = e.key === 'ArrowUp' || e.key === 'PageUp';
      if(!bas && !hautK) return;
      const cible = e.target;
      if(cible && /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName)) return;
      if(pas(bas ? 1 : -1)) e.preventDefault();
    });

    this.on(window, 'scroll', queue, {passive: true});
    this.on(window, 'resize', queue);
    /* La meme chose, mais branchee sur le tick de Lenis. L'evenement
       'scroll' natif arrive APRES que Lenis a ecrit la position : passer
       par queue() renvoie cadence() a la frame SUIVANTE, et le rail
       horizontal accuse donc une frame de retard sur la page. C'est ce
       retard qu'on percoit comme un tremblement du rail pendant un
       passage. L'evenement de Lenis, lui, est emis dans sa propre frame
       avant peinture : le rail, les disquettes et la jauge bougent sur
       la meme image que le reste. */
    if(this.lenis){
      this.lenis.on('scroll', cadence);
      this.cleanups.push(() => { if(this.lenis) this.lenis.off('scroll', cadence); });
    }
    cadence();
  }

  mediaGuard(){
    const r = this.rootRef.current; if(!r) return;
    this.on(r, 'contextmenu', e => {
      const t = e.target;
      if(t && (t.tagName === 'IMG' || t.tagName === 'VIDEO')) e.preventDefault();
    });
  }
  componentDidUpdate(){ this.applyProps(); }
  /* ONZE ANIMATIONS CSS TOURNENT EN BOUCLE INFINIE — les disquettes qui
     flottent, le lustre du verre, l'ampoule et son filament, les vingt
     poussieres de lumiere, les vingt etincelles du balayage, les trois
     couches du faisceau, la bille de l'invite. Le navigateur les fait
     vivre meme quand leur section est a quatre ecrans de la fenetre :
     le halo du hero continuait de respirer pendant qu'on lisait Contact.
     On les met en pause des que la section sort du champ, avec un ecran
     de marge de chaque cote. `animation-play-state` ne touche ni au
     layout ni a la geometrie : une animation reprend ou elle s'etait
     arretee, et comme la section n'etait pas visible, personne ne le
     voit. C'est du temps de calcul rendu, pour aucun changement a
     l'ecran. */
  figeHorsEcran(){
    if(!('IntersectionObserver' in window)) return;
    const secs = this.qa('section');
    if(!secs.length) return;
    const obs = new IntersectionObserver(entrees => {
      entrees.forEach(e => {
        if(e.isIntersecting) e.target.removeAttribute('data-fige');
        else e.target.setAttribute('data-fige', '1');
      });
    }, {rootMargin: '100% 0px'});
    secs.forEach(s => obs.observe(s));
    this.cleanups.push(() => obs.disconnect());
  }

  componentWillUnmount(){ this.cleanups.forEach(f => f()); }

  applyProps(){
    const r = this.rootRef.current; if(!r) return;
    const p = this.props || {};
    const set = (k, v) => { if(v) r.style.setProperty(k, v); };
    set('--pink', p.pink ?? '#E2006B');
    set('--pink-b', p.pink ? p.pink : '#EC0070');
    set('--violet-b', p.violet ?? '#8F2BFF');
    set('--violet', p.violet ?? '#7A01FF');
    const intro = this.q('[data-intro]');
    if(intro && p.showIntro === false){ intro.style.display = 'none'; }
  }

  /* échelle maquette : 1 px maquette = --u */
  scale(){
    const MOCK = 1024, MAXU = 1440 / MOCK;
    const w = document.documentElement.clientWidth;
    const u = Math.min(MAXU, w / MOCK);
    document.documentElement.style.setProperty('--u', u + 'px');
    if(this.measure) this.measure();
  }

  header(){
    const hdr = this.q('[data-hdr]'), hot = this.q('[data-hotzone]');
    const hero = this.q('[data-hero]');
    let hideTimer = null, pinned = false;
    const IDLE = 1400;
    const onHome = () => hero && window.scrollY < hero.offsetHeight - 90;
    const show = () => {
      hdr.style.transform = 'none'; hdr.style.opacity = '1';
      clearTimeout(hideTimer);
      if(pinned || onHome()) return;
      hideTimer = setTimeout(() => {
        if(!pinned && !onHome()){ hdr.style.transform = 'translateY(-110%)'; hdr.style.opacity = '0'; }
      }, IDLE);
    };
    this.on(window, 'scroll', () => {
      const s = window.scrollY > 40;
      hdr.style.background = s ? 'rgba(0,0,0,.82)' : 'transparent';
      hdr.style.backdropFilter = s ? 'blur(10px)' : 'none';
      show();
    }, {passive:true});
    show();
    const pin = v => { pinned = v; show(); };
    this.on(hdr, 'mouseenter', () => pin(true));
    this.on(hdr, 'mouseleave', () => pin(false));
    if(hot){ this.on(hot, 'mouseenter', () => pin(true)); this.on(hot, 'mouseleave', () => pin(false)); }

    /* lien actif au scroll + survol */
    const links = this.qa('[data-nav] a');
    const targets = links.map(a => this.q(a.getAttribute('href')) || document.querySelector(a.getAttribute('href')));
    const paint = (i, on) => {
      const a = links[i], bar = a.querySelector('i');
      a.style.color = on ? 'var(--pink-b)' : 'var(--nav)';
      if(bar){ bar.style.transform = on ? 'scaleX(1)' : 'scaleX(0)'; bar.style.transformOrigin = on ? 'left' : 'right'; }
    };
    let activeLink = 0;
    paint(0, true);
    links.forEach((a, i) => {
      this.on(a, 'mouseenter', () => paint(i, true));
      this.on(a, 'mouseleave', () => paint(i, i === activeLink));
    });
    if('IntersectionObserver' in window){
      const obs = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if(!en.isIntersecting) return;
          const i = targets.indexOf(en.target);
          if(i < 0) return;
          activeLink = i;
          links.forEach((_, j) => paint(j, j === i));
        });
      }, {rootMargin:'-45% 0px -50% 0px'});
      targets.forEach(t => { if(t) obs.observe(t); });
      this.cleanups.push(() => obs.disconnect());
    }

    /* clic sur un lien interne : on vise la ligne numérotée de la section,
       pas le haut de la section (qui tombe 110u plus haut à cause du padding) */
    const HDR = 76, GAP = 18;                       // en px maquette
    /* Le voyage se fait RIDEAU BAISSE. On coupe au noir, on pose la page
       d'un coup (`immediate`), puis on rouvre : la section apparait au lieu
       de defiler. `navVol` reste leve tout du long — c'est lui qui empeche
       Services de recadrer la page pendant qu'on est pose chez lui. On rend
       la vue deux frames apres la pose : une seule frame laisse passer un
       eclair de l'ancienne section. */
    const voile = this.q('[data-voile]');
    const vole = (y, href) => {
      clearTimeout(this.navGarde); clearTimeout(this.voileT);
      this.navVol = true;
      const arrive = () => {
        if(this.lenis) this.lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
        /* La section est posee : on revele son contenu INSTANTANEMENT, avant
           que le rideau ne se leve. Sinon le titre entame seulement son fondu
           de 1,05 s au moment ou le noir s'ouvre (0,5 s) — on arrive sur un
           titre a moitie transparent, encore decale vers le bas. */
        if(this.reveleDansZone) this.reveleDansZone(this.q(href));
        try { history.replaceState(null, '', href); } catch(_){}
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if(voile){
            voile.style.transition = 'opacity .5s cubic-bezier(.16,1,.3,1)';
            voile.style.opacity = '0';
          }
          this.navGarde = setTimeout(() => {
            this.navVol = false;
            if(this.navReset) this.navReset();
          }, 540);
        }));
      };
      if(!voile){ arrive(); return; }
      voile.style.transition = 'opacity .26s ease';
      voile.style.opacity = '1';
      this.voileT = setTimeout(arrive, 270);
    };
    this.qa('a[href^="#"]').forEach(a => {
      this.on(a, 'click', e => {
        const href = a.getAttribute('href');
        if(!href || href === '#') return;
        const sec = this.q(href);
        if(!sec) return;
        e.preventDefault();
        const mark = sec.querySelector('[data-chapter],[data-galhead]');
        let top = 0;
        /* « Accueil » ne renvoie pas au premier pixel : il pose la page au
           bout de la piste du hero, la figurine montee et l'ampoule levee.
           Le haut de la page, lui, ne montre qu'une scene vide — c'est un
           point de depart d'animation, pas un etat a montrer a quelqu'un
           qui DEMANDE a revenir a l'accueil. */
        if(href === '#accueil' && this.heroPoseY){
          vole(this.heroPoseY(), href);
          return;
        }
        const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
        const viser = el => Math.max(0, window.scrollY
          + el.getBoundingClientRect().top - (HDR + GAP) * u);
        if(mark) top = viser(mark);
        /* ON DOIT VOIR LE TITRE EN ARRIVANT.
           La cible naturelle est la ligne numerotee ([data-chapter]), et sur
           ordinateur elle suffit : le titre la suit de quelques dizaines de
           pixels. Sur telephone, non — les colonnes se remettent les unes
           SOUS les autres, et le visuel de la section (la photo de Contact
           fait 470u de large, donc toute la largeur une fois empilee) vient
           s'intercaler entre le numero et le titre. On atterrissait sur
           « 05 ——— » avec « DISCUTONS DE VOTRE PROJET » une hauteur d'ecran
           plus bas : la section avait l'air vide.
           Regle : si viser le numero laisse le titre a plus de la moitie de
           l'ecran, on vise le titre. Ce qu'on perd alors, c'est la ligne
           numerotee — un ornement — et ce qu'on gagne, c'est ce que le
           visiteur est venu lire. Le seuil se declenche tout seul quand la
           mise en page l'exige : rien a brancher sur une largeur d'ecran. */
        const titre = sec.querySelector('h2');
        if(titre){
          const yTitre = viser(titre);
          if(yTitre - top > window.innerHeight * 0.5) top = yTitre;
        }
        vole(top, href);
      });
    });
  }

  hovers(){
    /* Position du halo [data-bulb], mesuree sur les deux images du hero :
       l'ampoule n'est pas au meme endroit selon que le bras est baisse
       (hero-cut-a, repos) ou leve (hero-cut-b, survol). Sans ce recalage,
       le halo s'allume a cote du personnage dans l'un des deux etats. */
    const BULB_REPOS  = ['49%', '40%'];
    const BULB_SURVOL = ['53.3%', '11%'];
    /* hero : bras levé, ampoule, verres décalés.
       Coupé le 20 août 2026 : le nouveau personnage n'a pas de pose « ampoule
       levée ». Repasser SURVOL_AMPOULE à true le jour où hero-cut-b existe
       pour lui — le reste du code est intact. */
    const SURVOL_AMPOULE = false;
    const hv = this.q('[data-herovisual]');
    if(hv && SURVOL_AMPOULE){
      const a = hv.querySelector('[data-ch="a"]'), b = hv.querySelector('[data-ch="b"]');
      const bulb = hv.querySelector('[data-bulb]');
      const ll = hv.querySelector('[data-lens="l"]'), lr = hv.querySelector('[data-lens="r"]');
      this.on(hv, 'mouseenter', () => {
        a.style.opacity = '0'; b.style.opacity = '1'; bulb.style.opacity = '1';
        /* hero-cut-b : le bras est leve, l'ampoule monte. Le halo suit,
           sinon il s'allume a cote du personnage. */
        bulb.style.left = BULB_SURVOL[0]; bulb.style.top = BULB_SURVOL[1];
        ll.style.left = '64.10%'; ll.style.top = '30.55%';
        lr.style.left = '71.90%'; lr.style.top = '30.45%';
      });
      this.on(hv, 'mouseleave', () => {
        a.style.opacity = '1'; b.style.opacity = '0'; bulb.style.opacity = '0';
        bulb.style.left = BULB_REPOS[0];  bulb.style.top = BULB_REPOS[1];
        ll.style.left = '59.90%'; ll.style.top = '30.80%';
        lr.style.left = '68.20%'; lr.style.top = '30.80%';
      });
    }
    /* éclat des verres au survol des trois visuels */
    ['[data-herovisual]','[data-aboutphoto]','[data-contactphoto]'].forEach(sel => {
      const box = this.q(sel); if(!box) return;
      this.on(box, 'mouseenter', () => {
        box.querySelectorAll('[data-streak]').forEach((s, i) => {
          s.style.animation = 'none';
          void s.offsetWidth;
          s.style.animation = 'streak 620ms cubic-bezier(.30,.06,.16,1) ' + (i ? 130 : 70) + 'ms both';
        });
      });
    });
    /* services */
    this.qa('[data-svc]').forEach(svc => {
      const wash = svc.querySelector('[data-svcwash]'), num = svc.querySelector('[data-svcnum]');
      const h3 = svc.querySelector('[data-svch]'), p = svc.querySelector('[data-svcp]');
      const ico = svc.querySelector('[data-svcico]'), img = ico && ico.querySelector('img');
      this.on(svc, 'mouseenter', () => {
        wash.style.opacity = '1'; num.style.color = 'var(--pink-b)';
        /* Plus de glissement du titre au survol. Le numero, le titre et le
           paragraphe sont tous en colonne 1 : ils partagent le meme bord
           gauche. Decaler le seul titre de 10 u des que la souris entre
           dans le panneau cassait cet alignement — et comme la souris est
           forcement dans le panneau quand on le lit, l'etat decale etait
           l'etat NORMAL. Le survol garde le reste : le lavis, le numero
           qui s'allume, le texte qui s'eclaircit. */
        p.style.color = 'rgba(255,255,255,.72)';
        if(img) img.style.opacity = '1';
      });
      this.on(svc, 'mouseleave', () => {
        wash.style.opacity = '0'; num.style.color = 'var(--pink-b)';
        p.style.color = 'rgba(255,255,255,.45)';
        /* La disquette reste PLEINE en quittant le panneau. Elle etait
           rendue a 55 % : elle n'etait franche qu'au survol, et pendant son
           vol d'entree — ou personne ne survole — elle traversait l'ecran a
           moitie transparente. Le reste du panneau garde son attenuation,
           c'est lui qui porte le survol. */
        if(img) img.style.opacity = '1';
      });
      /* Parallaxe a la souris. L'ecoute est sur le panneau entier, pas sur
         la vignette : la disquette reagit des qu'on bouge quelque part
         dans le service, pas seulement quand on la survole. Deux couches
         qui ne se marchent pas dessus — la rotation part sur [data-floppy]
         (elle s'ajoute au pivot de repos et a celui du scroll dans les
         keyframes), la translation reste sur l'image. */
      const pivot = svc.querySelector('[data-floppy]');
      if(img && pivot){
        /* nx et ny vont de -.5 a +.5 : l'amplitude vue est donc la moitie
           de ces nombres, de part et d'autre du repos. */
        const AMP_X = 76, AMP_Y = 46;   // -> +/-38u et +/-23u
        const ROT   = 42, TILT = 14;    // -> +/-21deg et +/-7deg
        const suit = (nx, ny, vite) => {
          const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
          img.style.transitionDuration = vite ? '.12s' : '.65s';
          img.style.transform = 'translate3d(' + (nx*AMP_X*u).toFixed(2) + 'px,' + (ny*AMP_Y*u).toFixed(2) + 'px,0) scale(' + (vite ? 1.05 : 1) + ')';
          pivot.style.transitionDuration = vite ? '.12s, .12s, .7s' : '.65s, .65s, .7s';
          pivot.style.setProperty('--mouse-rot',  (nx*ROT).toFixed(2) + 'deg');
          pivot.style.setProperty('--mouse-tilt', (-ny*TILT).toFixed(2) + 'deg');
        };
        this.on(svc, 'mousemove', e => {
          const r = svc.getBoundingClientRect();
          suit((e.clientX - r.left) / r.width - .5, (e.clientY - r.top) / r.height - .5, true);
        });
        this.on(svc, 'mouseleave', () => suit(0, 0, false));
      }
    });
    /* processus */
    this.qa('[data-step]').forEach(step => {
      const num = step.querySelector('[data-stepnum]');
      this.on(step, 'mouseenter', () => { num.style.background = 'var(--pink)'; num.style.transform = 'scale(1.06)'; });
      this.on(step, 'mouseleave', () => { num.style.background = 'var(--dark)'; num.style.transform = 'none'; });
    });
    /* galerie */
    this.qa('[data-piece]').forEach(piece => {
      const frame = piece.querySelector('[data-pieceframe]'), veil = piece.querySelector('[data-pieceveil]');
      const media = piece.querySelector('[data-piecemedia]'), num = piece.querySelector('[data-piecenum]');
      const sweep = piece.querySelector('[data-piecesweep]');
      const pc = piece.getAttribute('data-piece') === 'pink' ? 'var(--pink-b)' : 'var(--violet-b)';
      this.on(piece, 'mouseenter', () => {
        frame.style.transform = 'translateY(calc(-10*var(--u)))';
        veil.style.opacity = '.4';
        num.style.webkitTextStrokeColor = pc;
        sweep.style.opacity = '1'; sweep.style.animation = 'none';
        void sweep.offsetWidth;
        sweep.style.animation = 'piece-sweep .9s cubic-bezier(.3,.05,.2,1)';
      });
      this.on(piece, 'mouseleave', () => {
        frame.style.transform = 'none'; veil.style.opacity = '.9';
        num.style.webkitTextStrokeColor = 'rgba(255,255,255,.16)';
        sweep.style.opacity = '0';
      });
    });
    /* flèches galerie */
    this.qa('[data-galprev],[data-galnext]').forEach(btn => {
      this.on(btn, 'mouseenter', () => { btn.style.borderColor = 'var(--pink)'; btn.style.background = 'var(--pink)'; btn.style.transform = 'translateY(calc(-2*var(--u)))'; });
      this.on(btn, 'mouseleave', () => { btn.style.borderColor = 'rgba(255,255,255,.18)'; btn.style.background = 'transparent'; btn.style.transform = 'none'; });
    });
    /* champs du formulaire */
    this.qa('[data-form] input,[data-form] textarea').forEach(f => {
      this.on(f, 'focus', () => { f.style.outline = 'none'; f.style.borderBottomColor = 'var(--pink-b)'; });
      this.on(f, 'blur', () => { f.style.borderBottomColor = 'rgba(255,255,255,.18)'; });
      this.on(f, 'input', () => { f.style.borderBottomColor = 'var(--pink-b)'; });
    });
    /* boutons magnétiques */
    if(window.matchMedia('(pointer:fine)').matches){
      this.qa('[data-magnetic]').forEach(el => {
        this.on(el, 'mousemove', e => {
          const r = el.getBoundingClientRect();
          el.style.setProperty('--mx', ((e.clientX - r.left - r.width/2) * .28).toFixed(1) + 'px');
          el.style.setProperty('--my', ((e.clientY - r.top - r.height/2) * .38).toFixed(1) + 'px');
        });
        this.on(el, 'mouseleave', () => { el.style.setProperty('--mx','0px'); el.style.setProperty('--my','0px'); });
      });
    }
  }

  gallery(){
    const gal = this.q('[data-gallery]'), track = this.q('[data-galtrack]');
    if(!gal || !track) return;
    const ambient = gal.querySelector('[data-ambient]');
    const idxOut = this.q('[data-galindex]');
    /* Le total etait ecrit en dur dans le markup : il annonçait encore 11
       pieces alors que le ruban en comptait 13. On le lit du DOM. */
    const totOut = this.q('[data-galtotal]');
    const prev = this.q('[data-galprev]'), next = this.q('[data-galnext]');
    const pieces = this.qa('[data-piece]');
    if(totOut) totOut.textContent = String(pieces.length).padStart(2, '0');
    const rail = this.q('[data-galrail]'), railBar = this.q('[data-galrailbar]');
    const ACC = {violet:'rgba(143,43,255,.07)', pink:'rgba(236,0,112,.07)'};
    let maxShift = 0, active = -1, horizontal = true, x = 0;

    const step = () => {
      const first = pieces[0];
      if(!first) return 400;
      const w = first.getBoundingClientRect().width;
      const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
      return w + 46 * u;
    };
    const setX = (v, smooth) => {
      x = Math.max(0, Math.min(maxShift, v));
      track.style.transition = smooth ? 'transform .42s cubic-bezier(.22,1,.3,1)' : 'none';
      track.style.transform = 'translate3d(' + (-x).toFixed(2) + 'px,0,0)';
      update();
    };

    /* ------------------------------------------------------------------
       Amortissement du ruban.

       Avant : chaque geste ecrivait la position directement, donc le
       ruban collait a l'entree en 1:1 et s'arretait net. Depuis que la
       page glisse (voir smoothScroll), c'est le seul endroit du site qui
       repondait encore comme un tiroir.

       Maintenant tout passe par une cible, et une seule fonction la
       poursuit avec un amortissement exponentiel. Trois consequences :
       le ruban a une traine, le defilement par les bords demarre et
       s'arrete en fondu au lieu de s'allumer d'un coup, et l'inertie a
       exactement le meme caractere que le scroll vertical.

       Le suivi tourne sur `gsap.ticker`, comme Lenis : un seul rAF pour
       tout le site (regle inscrite dans CLAUDE.md). L'ancienne boucle
       autoTick a disparu avec.
       ------------------------------------------------------------------ */
    let cible = 0, suit = null, vel = 0;
    /* Amortissement doux seulement si on anime deja le reste. En
       reduced-motion sans ?motion=full, this.lenis est null : la cible
       est appliquee telle quelle et le ruban repond en 1:1 comme avant.
       Degrader, pas couper. */
    const doux = () => !!this.lenis;
    /* LAMBDA en unites par seconde, pas par frame : le rendu est le meme
       a 60 et a 144 Hz. 9 donne environ un tiers de seconde de traine —
       assez pour qu'on la voie, assez peu pour que le ruban ne flotte
       pas derriere le curseur pendant un glissement aux bords. */
    const LAMBDA = 9;
    const borne = v => Math.max(0, Math.min(maxShift, v));

    const suivre = (time, deltaTime) => {
      if(!horizontal || dragging){ arreteSuivi(); return; }
      /* onglet en arriere-plan ou frame sautee : un dt geant ferait
         teleporter le ruban. On plafonne a 4 frames. */
      const dt = Math.min(deltaTime || 16, 64) / 1000;
      if(vel !== 0) cible = borne(cible + vel);
      const d = cible - x;
      if(vel === 0 && Math.abs(d) < 0.3){
        if(d !== 0) setX(cible, false);
        arreteSuivi();
        return;
      }
      setX(doux() ? cible - d * Math.exp(-LAMBDA * dt) : cible, false);
    };
    const arreteSuivi = () => { if(suit){ gsap.ticker.remove(suit); suit = null; } };
    const lanceSuivi = () => { if(!suit){ suit = suivre; gsap.ticker.add(suit); } };
    this.cleanups.push(arreteSuivi);

    /* mouvement continu : molette, defilement par les bords */
    const glisseVers = v => { cible = borne(v); lanceSuivi(); };
    /* saut choisi : fleches, recalage apres un glisser. Sans Lenis on
       garde la transition CSS d'origine plutot qu'un saut sec. */
    const porteVers = v => {
      cible = borne(v);
      if(doux()) lanceSuivi();
      else setX(cible, true);
    };
    /* position imposee : glisser en cours, redimensionnement. La cible
       suit la main, sinon le suivi ramenerait le ruban en arriere des
       que le doigt s'arrete. */
    const poseX = v => { arreteSuivi(); setX(v, false); cible = x; };

    const update = () => {
      if(!horizontal) return;
      const p = maxShift > 0 ? x / maxShift : 0;
      if(rail && railBar){
        const visible = Math.min(1, track.clientWidth / Math.max(1, track.scrollWidth));
        railBar.style.transform = 'none';
        railBar.style.width = (visible * 100).toFixed(2) + '%';
        railBar.style.left = (p * (100 - visible * 100)).toFixed(2) + '%';
      }
      const vw = window.innerWidth;
      pieces.forEach(el => {
        const r = el.getBoundingClientRect();
        const c = (r.left + r.width/2) / vw - .5;
        const m = el.querySelector('[data-piecemedia]');
        if(m) m.style.setProperty('--mp', (-c * 26).toFixed(1) + 'px');
      });
      const i = Math.min(pieces.length - 1, Math.round(p * (pieces.length - 1)));
      if(i !== active){
        active = i;
        if(idxOut) idxOut.textContent = String(i + 1).padStart(2, '0');
        const kind = pieces[i].getAttribute('data-piece') === 'pink' ? 'pink' : 'violet';
        if(ambient) ambient.style.setProperty('--accent', ACC[kind]);
        if(prev){ prev.disabled = i === 0; prev.style.opacity = i === 0 ? '.25' : '1'; prev.style.pointerEvents = i === 0 ? 'none' : 'auto'; }
        if(next){ const last = i === pieces.length - 1; next.disabled = last; next.style.opacity = last ? '.25' : '1'; next.style.pointerEvents = last ? 'none' : 'auto'; }
      }
    };
    const shell = track.parentElement;
    const head = this.q('[data-galhead]');
    const meta = head && head.children[2];
    /* pile verticale sous 1000px : le ruban n'a plus de sens au doigt */
    const setStacked = on => {
      if(on){
        shell.style.padding = 'calc(56*var(--u)) 0 calc(60*var(--u))';
        track.style.transform = 'none';
        /* GRILLE A DEUX COLONNES, et non une pile. Dix-sept projets empiles
           en pleine largeur font une quinzaine d'ecrans : le visiteur ne sait
           jamais combien il en reste et decroche vers le quatrieme. En grille
           il en voit six d'un coup, saisit le volume et la variete du travail,
           et touche celui qui parle a son secteur — la vue plein ecran existe
           deja pour le detail. Les cadres portent aspect-ratio:1/1, les cases
           restent donc carrees quelle que soit la largeur. */
        track.style.display = 'grid';
        track.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        track.style.flexDirection = '';
        track.style.alignItems = 'start';
        track.style.gap = 'calc(34*var(--u)) calc(18*var(--u))';
        track.style.cursor = 'auto';
        if(meta) meta.style.display = 'none';
        if(rail) rail.style.display = 'none';
        pieces.forEach(p => { p.style.width = 'auto'; });
      } else {
        shell.style.padding = 'calc(110*var(--u)) 0 calc(120*var(--u))';
        track.style.display = 'flex';
        track.style.gridTemplateColumns = '';
        track.style.flexDirection = 'row';
        track.style.alignItems = 'center';
        track.style.gap = 'calc(46*var(--u))';
        track.style.cursor = 'grab';
        if(meta) meta.style.display = 'flex';
        if(rail) rail.style.display = 'block';
        pieces.forEach(p => { p.style.width = 'calc(360*var(--u))'; });
      }
    };
    this.measure = () => {
      horizontal = document.documentElement.clientWidth > 1000;
      setStacked(!horizontal);
      gal.style.height = '';
      if(!horizontal) return;
      /* la gouttière droite (82u) tombe du scrollWidth d'un flex row : on la
         recalcule depuis la dernière carte pour la conserver à l'arrivée */
      const last = pieces[pieces.length - 1];
      const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
      const end = last ? last.offsetLeft + last.offsetWidth + 82 * u : track.scrollWidth;
      /* la largeur de référence est celle du conteneur qui clippe, pas du ruban */
      maxShift = Math.max(0, end - shell.clientWidth);
      poseX(Math.min(x, maxShift));
    };
    const goTo = i => {
      i = Math.max(0, Math.min(pieces.length - 1, i));
      porteVers(i * step());
    };
    const curIndex = () => { const s = step(); return s > 0 ? Math.round(x / s) : 0; };
    if(prev) this.on(prev, 'click', () => goTo(curIndex() - 1));
    if(next) this.on(next, 'click', () => goTo(curIndex() + 1));

    /* glisser-déposer à la souris */
    let dragging = false, startX = 0, startPos = 0, moved = 0, captured = false;
    this.on(track, 'pointerdown', e => {
      if(!horizontal) return;
      dragging = true; moved = 0; captured = false;
      startX = e.clientX; startPos = x;
    });
    this.on(track, 'pointermove', e => {
      if(!dragging) return;
      const d = e.clientX - startX;
      moved = Math.abs(d);
      /* On ne capture le pointeur qu'a partir d'un vrai glissement.
         Capturer des le pointerdown redirige le click suivant vers le ruban
         au lieu du visuel clique : le plein ecran ne s'ouvrait jamais. */
      if(!captured && moved > 4){
        captured = true;
        track.style.cursor = 'grabbing';
        try { track.setPointerCapture(e.pointerId); } catch(_){}
      }
      if(!captured) return;
      poseX(startPos - d);
    });
    const endDrag = () => {
      if(!dragging) return;
      const wasDrag = captured;
      dragging = false; captured = false;
      track.style.cursor = 'grab';
      /* pas de recalage si l'utilisateur a simplement clique */
      if(wasDrag) porteVers(Math.round(x / step()) * step());
    };
    this.on(track, 'pointerup', endDrag);
    this.on(track, 'pointercancel', endDrag);
    this.on(window, 'pointerup', endDrag);
    /* un clic accidentel après un vrai glissement ne suit pas le lien */
    this.on(track, 'click', e => { if(moved > 6){ e.preventDefault(); e.stopPropagation(); } }, true);

    /* plein écran au clic sur un visuel */
    const lb = this.q('[data-lightbox]'), lbBox = this.q('[data-lbbox]'), lbImg = this.q('[data-lbimg]');
    const lbT = this.q('[data-lbtitle]'), lbM = this.q('[data-lbmeta]'), lbTx = this.q('[data-lbtexte]');
    const lbT2 = this.q('[data-lbtitle2]'), lbM2 = this.q('[data-lbmeta2]');
    /* bascule "taille reelle" : par defaut le visuel remplit l'ecran sans
       jamais depasser sa taille naturelle ; un clic dessus passe au 1:1 et
       rend le fond defilable pour parcourir l'image. */
    let zoomed = false;
    /* Les contraintes de taille sont posees en style inline dans le markup :
       il faut memoriser leurs valeurs d'origine, car les remettre a '' les
       supprimerait au lieu de les restaurer (le visuel resterait alors en
       taille naturelle en permanence). */
    const lbDef = (lbImg && lbBox) ? {
      iw: lbImg.style.maxWidth, ih: lbImg.style.maxHeight, w: lbImg.style.width,
      bw: lbBox.style.maxWidth, ai: lb.style.alignItems, ov: lb.style.overflow
    } : null;
    const setZoom = (on) => {
      if(!lbImg || !lbBox || !lbDef) return;
      zoomed = on;
      if(on){
        lbBox.style.maxWidth = 'none';
        lbImg.style.maxWidth = 'none'; lbImg.style.maxHeight = 'none';
        lbImg.style.width = lbImg.naturalWidth + 'px';
        lbImg.style.cursor = 'zoom-out';
        lb.style.alignItems = 'flex-start'; lb.style.overflow = 'auto';
      } else {
        lbBox.style.maxWidth = lbDef.bw;
        lbImg.style.maxWidth = lbDef.iw; lbImg.style.maxHeight = lbDef.ih; lbImg.style.width = lbDef.w;
        lbImg.style.cursor = 'zoom-in';
        lb.style.alignItems = lbDef.ai; lb.style.overflow = lbDef.ov;
        lb.scrollTop = 0; lb.scrollLeft = 0;
      }
    };
    /* `data-lenis-prevent` est pose sur [data-lightbox] : Lenis ignore
       entierement les evenements dont le chemin le traverse, AVANT son
       preventDefault. Sans lui, `lenis.stop()` bloquerait aussi le
       defilement du panneau de texte et celui de l'image en 1:1.

       Position de la page au moment de l'ouverture. `overflow:hidden` sur le
       body prive le document de sa hauteur : le navigateur ramene le scroll a
       zero, et en refermant on se retrouvait sur le hero au lieu du ruban.
       On bloque donc par Lenis quand il est la — il fait un blocage franc sans
       toucher a la mise en page — et on repose la position dans tous les cas. */
    let lbY = 0;
    const closeLb = () => {
      if(!lb) return;
      setZoom(false);
      lb.style.opacity = '0'; lb.style.visibility = 'hidden'; lb.setAttribute('aria-hidden', 'true');
      if(lbBox) lbBox.style.transform = 'scale(.94) translateY(calc(16*var(--u)))';
      if(this.lenis) this.lenis.start(); else document.body.style.overflow = '';
      /* ON REPOSE LA PAGE SUR LE RUBAN, ET ON INSISTE.
         Une seule remise en position ne tient pas : plusieurs mecaniques
         reagissent au scroll dans les instants qui suivent la reouverture
         (le recadrage de Services, la pose du hero), et la derniere qui
         parle gagne. On repose donc la position sur quatre passes reparties
         sur 200 ms, et on leve `navVol` pendant ce temps — c'est le drapeau
         que `cadence()` respecte deja pour laisser passer un lien de menu. */
      const cible = lbY > 4 ? lbY : (this.q('#portfolio') ? this.q('#portfolio').offsetTop : 0);
      const pose = () => {
        if(this.lenis) this.lenis.scrollTo(cible, {immediate: true, force: true});
        else window.scrollTo(0, cible);
      };
      this.navVol = true;
      pose();
      requestAnimationFrame(pose);
      setTimeout(pose, 70);
      setTimeout(() => {
        pose();
        this.navVol = false;
        if(this.navReset) this.navReset();
      }, 200);
    };
    /* stopPropagation UNIQUEMENT quand le clic sert a quelque chose. En mode
       fiche le zoom 1:1 est desactive : on laisse donc le clic remonter
       jusqu'au plein ecran, qui s'en sert pour fermer (voir plus bas). */
    if(lbImg) this.on(lbImg, 'click', e => { if(this.lbFiche) return; e.stopPropagation(); setZoom(!zoomed); });
    const openLb = piece => {
      if(!lb || !lbImg) return;
      const m = piece.querySelector('[data-piecemedia]'); if(!m) return;
      setZoom(false);
      lbImg.src = m.currentSrc || m.src; lbImg.alt = m.alt || '';
      const h = piece.querySelector('h3'), tag = piece.querySelector('span[style*="uppercase"]');
      if(lbT) lbT.textContent = h ? h.textContent : '';
      if(lbM) lbM.textContent = tag ? tag.textContent : '';
      /* La presentation n'existe que sur les pieces qui en portent une :
         sans elle le paragraphe est replie, pas laisse vide (le gap du
         figure ajouterait 20u de trou sous la legende). */
      const txt = piece.querySelector('[data-piecetexte]');
      /* Deux mises en page pour un seul plein ecran. Une piece qui porte une
         presentation ouvre la FICHE : image a gauche, texte a droite. Les
         autres gardent l'image seule et sa legende dessous. Le mode est pose
         sur [data-lightbox] ; tout le reste est du CSS. */
      if(lbTx) lbTx.innerHTML = txt ? txt.innerHTML : '';
      if(lbT2) lbT2.textContent = lbT ? lbT.textContent : '';
      /* Sur-titre du panneau : la discipline de la vignette, puis le sujet
         du projet quand l'article en declare un (data-sujet). Deux mots
         separes d'un point median, comme le reste du site. */
      if(lbM2){
        const disc = lbM ? lbM.textContent : '';
        const suj = piece.dataset.sujet || '';
        lbM2.textContent = suj ? (disc + ' · ' + suj) : disc;
      }
      lb.setAttribute('data-lbmode', txt ? 'fiche' : 'simple');
      /* le ton de la piece (violet / pink) teinte le sur-titre du panneau */
      lb.setAttribute('data-lbton', piece.dataset.piece || 'violet');
      /* En fiche, l'image est cadree dans sa colonne : le 1:1 defilable n'a
         plus de sens, il ferait sortir le texte de l'ecran. */
      lbImg.style.cursor = txt ? 'default' : 'zoom-in';
      this.lbFiche = !!txt;
      lb.style.visibility = 'visible'; lb.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        lb.style.opacity = '1';
        if(lbBox) lbBox.style.transform = 'scale(1) translateY(0)';
      });
      lbY = window.scrollY;
      if(this.lenis) this.lenis.stop(); else document.body.style.overflow = 'hidden';
    };
    pieces.forEach(p => {
      const frame = p.querySelector('[data-pieceframe]');
      if(!frame) return;
      /* Une piece qui porte data-projet a sa propre etude de cas : le clic
         y mene au lieu d'ouvrir le plein ecran. Les autres gardent le plein
         ecran — on ne casse rien tant qu'une page n'existe pas. */
      const versProjet = p.dataset.projet;
      frame.style.cursor = versProjet ? 'pointer' : 'zoom-in';
      this.on(frame, 'click', e => {
        if(moved > 6) return;
        e.preventDefault();
        if(versProjet){ window.location.href = versProjet; return; }
        openLb(p);
      });
    });
    if(lb) this.on(lb, 'click', e => {
      /* le fond, partout et toujours */
      if(!lbBox || !lbBox.contains(e.target)){ closeLb(); return; }
      /* TELEPHONE : IL N'Y A PLUS DE FOND A TOUCHER. La fiche occupe tout
         l'ecran, donc la regle ci-dessus ne peut plus se declencher — on se
         retrouvait enferme, la croix etant le seul moyen de sortir.
         Tout ce qui n'est PAS le texte ferme donc la fiche : le visuel
         compris, dont le clic ne sert a rien ici. Le panneau, lui, garde ses
         clics — sinon on ne pourrait pas selectionner un mot sans que la
         fiche se referme sous les doigts. */
      const petit = !!(window.matchMedia && window.matchMedia('(max-width:900px)').matches);
      if(!petit || !this.lbFiche) return;
      const panneau = lbBox.querySelector('[data-lbpanel]');
      if(!panneau || !panneau.contains(e.target)) closeLb();
    });
    const lbc = this.q('[data-lbclose]');
    if(lbc) this.on(lbc, 'click', closeLb);
    this.on(window, 'keydown', e => { if(e.key === 'Escape') closeLb(); });

    /* défilement automatique : la souris vers un bord entraîne le ruban.
       La vitesse suit la distance au bord — on ralentit en revenant au centre. */
    /* `vel` et la boucle vivent maintenant dans le suivi amorti declare
       plus haut : c'est lui qui ajoute `vel` a la cible a chaque frame.
       On ne fait plus que regler la vitesse ici. Effet de bord voulu :
       l'entrainement demarre et s'arrete en fondu au lieu de s'allumer
       et se couper net quand on franchit le seuil. */
    const autoStart = () => { if(vel !== 0) lanceSuivi(); };
    this.on(shell, 'mousemove', e => {
      if(!horizontal || dragging){ vel = 0; return; }
      /* la bande du ruban seule : l'en-tête et ses flèches ne déclenchent rien */
      const tr = track.getBoundingClientRect();
      if(e.clientY < tr.top || e.clientY > tr.bottom){ vel = 0; return; }
      /* la zone visible, pas le ruban : celui-ci est plus large que l'écran */
      const r = shell.getBoundingClientRect();
      const p = (e.clientX - r.left) / r.width;
      const EDGE = .38, MAX = 30;
      if(p < EDGE) vel = -MAX * ((EDGE - p) / EDGE);
      else if(p > 1 - EDGE) vel = MAX * ((p - (1 - EDGE)) / EDGE);
      else vel = 0;
      autoStart();
    });
    /* on coupe la vitesse, pas le suivi : il finit sa traine puis
       s'arrete tout seul. C'est ce qui remplace l'arret sec d'avant. */
    this.on(shell, 'mouseleave', () => { vel = 0; });

    /* trackpad : le geste horizontal fait défiler le ruban, le vertical la page */
    this.on(track, 'wheel', e => {
      if(!horizontal) return;
      if(Math.abs(e.deltaX) > Math.abs(e.deltaY)){
        e.preventDefault();
        /* on empile sur la CIBLE, pas sur la position rendue : sinon
           chaque nouvel evenement repartirait d'un ruban encore en
           mouvement et le geste perdrait de la course. */
        glisseVers(cible + e.deltaX * 2.2);
      }
    }, {passive:false});

    /* défilement tactile natif */
    this.on(track, 'touchstart', () => {}, {passive:true});

    this.on(window, 'resize', this.measure);
    this.on(window, 'load', this.measure);
    this.measure();
  }

  reveals(){
    const groups = [
      ['[data-chapter]', 0], ['[data-galhead]', 0], ['[data-step]', 110], ['[data-reveal]', 90], ['[data-signature]', 300]
    ];
    const items = [];
    groups.forEach(([sel, stagger]) => {
      this.qa(sel).forEach((el, i) => {
        const isSig = el.hasAttribute('data-signature');
        el.style.opacity = '0';
        el.style.transform = isSig ? 'translateX(calc(-40*var(--u)))' : 'translateY(calc(34*var(--u)))';
        el.style.transition = isSig ? 'opacity 1s ease, transform 1s cubic-bezier(.22,1,.36,1)' : 'opacity 1.05s ease, transform 1.05s cubic-bezier(.22,1,.36,1)';
        items.push({el: el, stagger: stagger, fade: false});
      });
    });
    /* les deux grands visuels : fondu seul (ils portent déjà un transform) */
    this.qa('[data-floater]').forEach(el => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 1.1s ease';
      items.push({el: el, stagger: 0, fade: true});
    });
    /* révélation pilotée par le défilement : une fois montré, ça reste montré */
    let queued = false;
    /* Au-dela de quatre, une cascade cesse d'etre un rythme et devient une
       attente. */
    const PLAFOND = 4;
    const check = () => {
      queued = false;
      const vh = window.innerHeight;
      /* On COLLECTE d'abord, on pose ensuite. Le rang de la cascade se compte
         parmi les elements qui arrivent DANS CETTE PASSE, et non selon leur
         place dans le document. C'etait le defaut : le bouton « Envoyer »,
         treizieme [data-reveal] de la page, portait 13 x 90 = 1170 ms de
         retard alors qu'il entrait seul a l'ecran, bien apres les champs
         qu'il termine. */
      const arrivants = [];
      for(let k = items.length - 1; k >= 0; k--){
        const it = items[k], b = it.el.getBoundingClientRect();
        if(b.top < vh * .84 && b.bottom > vh * .04){
          it.top = b.top;
          arrivants.push(it);
          items.splice(k, 1);
        }
      }
      /* de haut en bas : la cascade suit l'oeil, pas l'ordre de la boucle */
      arrivants.sort((a, c) => a.top - c.top);
      arrivants.forEach((it, rang) => {
        it.el.style.transitionDelay = (Math.min(rang, PLAFOND) * it.stagger) + 'ms';
        it.el.style.opacity = '1';
        if(!it.fade) it.el.style.transform = 'none';
        const rule = it.el.querySelector && it.el.querySelector('[data-rule]');
        if(rule) rule.style.transform = 'scaleX(1)';
      });
    };
    /* REVELATION INSTANTANEE D'UNE ZONE — utilisee par le menu.
       Le voyage du menu se fait rideau baisse : on coupe au noir, on pose la
       page, on rouvre. Pour que ca marche, la section doit etre DEJA posee
       quand le noir se retire. Or check() ne fait que LANCER le fondu, qui
       dure 1,05 s, alors que le rideau se leve en 0,5 s : on arrivait sur un
       titre a moitie transparent, encore decale de 34u vers le bas, qui
       finissait son entree sous les yeux. On ne voyait pas la section
       arriver — on la voyait se construire.
       Ici on pose l'etat final SANS transition. Ces elements ne rejouent
       jamais (« une fois montre, ca reste montre »), donc couper leur
       transition pour de bon ne coute rien. */
    this.reveleDansZone = zone => {
      if(!zone) return;
      for(let k = items.length - 1; k >= 0; k--){
        const it = items[k];
        if(!zone.contains || !zone.contains(it.el)) continue;
        it.el.style.transition = 'none';
        it.el.style.transitionDelay = '0ms';
        it.el.style.opacity = '1';
        if(!it.fade) it.el.style.transform = 'none';
        const rule = it.el.querySelector && it.el.querySelector('[data-rule]');
        if(rule){ rule.style.transition = 'none'; rule.style.transform = 'scaleX(1)'; }
        items.splice(k, 1);
      }
    };
    this.cleanups.push(() => { this.reveleDansZone = null; });

    const queueReveal = () => {
      if(typeof requestAnimationFrame !== 'function'){ check(); return; }
      if(queued) return;
      queued = true;
      requestAnimationFrame(check);
      /* rAF peut être étranglé (onglet caché, capture) : filet immédiat */
      setTimeout(() => { if(queued) check(); }, 120);
    };
    this.on(window, 'scroll', queueReveal, {passive:true});
    this.on(window, 'resize', queueReveal);
    check();
    /* horloge indépendante : ne dépend ni de rAF ni des événements de scroll,
       s'arrête d'elle-même quand tout est révélé */
    const beat = setInterval(() => { check(); if(!items.length) clearInterval(beat); }, 200);
    this.cleanups.push(() => clearInterval(beat));
  }

  /* ===========================================================================
     LE SEUIL — sequence d'entree, orchestree par une timeline GSAP.

     Idee directrice : la barre de chargement est deja un degrade violet->rose,
     et le sol du hero ([data-floor], [data-ground], [data-spot]) est deja un
     lavis violet. C'est la meme lumiere. La sequence ne fait donc pas
     disparaitre un loader pour afficher une page : elle conduit une seule
     lumiere de la barre vers le sol de la scene.

       CHARGE      les keyframes CSS d'origine (intro-mark, intro-bar) jouent
                   telles quelles, intactes.
       SEUIL       le logo se retire vers le haut ; la barre ne s'efface pas,
                   elle s'etire au-dela de l'ecran en s'eteignant.
       OUVERTURE   le noir se retire, les lueurs du sol montent de zero et la
                   figurine avance legerement (--sc 1.06 -> 1).
       (temps mort ~0,5 s : la scene est eclairee mais encore muette)
       SCENE       les 3 lignes du titre montent en cascade, puis la ligne de
                   texte, puis le bouton.

     Contraintes respectees :
       - aucun element DOM ajoute, aucun asset, aucun texte touche ;
       - on n'anime QUE des proprietes possedees par personne d'autre :
         opacity sur [data-herovisual] et sur les 4 lueurs (aucun autre code
         ne les lit), --sc (ecrit uniquement par heroScroll, et le scroll est
         bloque pendant la sequence), et les elements du loader ;
       - [data-bulb] et [data-ch] appartiennent a hovers() : jamais touches ;
       - [data-plane] : on ne touche pas leur transform, possede par parallax() ;
       - opacity et transform uniquement, jamais filter/blur (cout GPU) ;
       - prefers-reduced-motion : la sequence n'est pas coupee, elle est
         degradee (aucun deplacement, durees divisees par ~3,5).

     L'etat final produit est EXACTEMENT celui de l'ancien open() : le contrat
     avec le reste du code est inchange.
     ======================================================================== */
  /* Decoupe les trois lignes du titre en lettres, une seule fois.
     Rien n'est touche dans render() : les <i data-ln> et l'<em> de
     "idees" restent tels quels, on ne fait que remplacer leurs noeuds
     texte par des <span data-c>. Le titre reste lisible pour les
     lecteurs d'ecran grace a l'aria-label pose sur le <h1>. */
  splitTitle(){
    const lignes = this.qa('[data-ln]');
    if(!lignes.length) return [];
    if(lignes[0].querySelector('[data-c]')) return this.qa('[data-ln] [data-c]');

    const h1 = lignes[0].closest('h1');
    if(h1 && !h1.getAttribute('aria-label'))
      h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());

    const lettres = [];
    lignes.forEach((ligne, li) => {
      const w = document.createTreeWalker(ligne, NodeFilter.SHOW_TEXT);
      const noeuds = []; while(w.nextNode()) noeuds.push(w.currentNode);
      let k = 0;
      noeuds.forEach(n => {
        const frag = document.createDocumentFragment();
        [...n.textContent].forEach(ch => {
          if(ch === ' '){ frag.appendChild(document.createTextNode(' ')); return; }
          const s = document.createElement('span');
          s.setAttribute('data-c', '1');
          s.setAttribute('aria-hidden', 'true');
          s.style.display = 'inline-block';
          s.style.willChange = 'transform';
          s.textContent = ch;
          /* chaque lettre a son ecart et son angle propres : ca se range
             comme des briques, pas comme une vague reguliere */
          const r = Math.sin(li * 13 + k * 7.3);
          /* Chute depuis le plafond : la lettre part environ trois hauteurs
             de ligne au-dessus de sa place. Au-dela, elle sortirait du hero
             par le haut et passerait devant le header. */
          s.dataset.dy = (-290 - Math.abs(r) * 90).toFixed(0);
          /* Elle tourne sur elle-meme pendant la chute : un tour et demi,
             un sens sur deux, avec assez d'irregularite pour que les lettres
             ne battent pas la mesure ensemble. */
          s.dataset.dr = ((k % 2 ? 1 : -1) * (540 + Math.abs(r) * 200)).toFixed(0);
          s.dataset.dl = (li * 0.09 + k * 0.032 + Math.abs(r) * 0.05).toFixed(3);
          frag.appendChild(s); lettres.push(s); k++;
        });
        n.replaceWith(frag);
      });
    });
    return lettres;
  }

  /* ========================================================================
     LE TITRE DU HERO, PILOTE PAR LE DEFILEMENT

     Sorti de intro() et pose ici pour une raison precise : intro() SORT
     PREMATUREMENT quand on n'arrive pas par le haut (`if(yInitial > seuil)`).
     Tant que le titre vivait dedans, ouvrir le site ailleurs qu'en haut —
     ou simplement recharger en cours de page — n'installait jamais le
     defilement du titre : plus aucune animation de toute la visite.
     Cette methode est donc appelee dans les DEUX cas.
     ======================================================================== */
  titreAuScroll(){
    const lettres = this.splitTitle();
    const lines = this.qa('[data-ln]');
    if(!lettres.length){ lines.forEach(l => { l.style.transform = 'none'; }); return; }
    const para = this.q('[data-heroline="p"]');
    const btn  = this.q('[data-heroline="btn"]');
    const pisteHero = this.q('[data-heropiste]');
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;

    /* --- LE TITRE ARRIVE AU SCROLL, PLUS AU CHARGEMENT ------------------
       Reprise du pen GreenSock « containerAnimation SplitText » : chaque
       lettre arrive avec une rotation et un decalage vertical tires au
       sort, sur un rebond back.out — mais la tete de lecture n'est plus
       une timeline, c'est la POSITION DE DEFILEMENT.

       Ce que ca change, concretement :
       - il n'y a plus de duree. Une chute a une duree ; ici, une lettre
         avance exactement autant qu'on scrolle, et recule si on remonte.
         On ne peut donc plus rien exprimer en secondes.
       - les lettres se relaient au lieu de tomber ensemble : chacune a sa
         propre fenetre le long de la course, decalee par son rang.
       - back.out DEPASSE puis revient. C'est l'inverse d'une chute, qui
         accelere et s'arrete net. Le pen tient son elasticite de la.

       L'arrivee tient dans les 24 premiers pour cent de la piste du hero,
       donc bien avant que la figurine finisse de tourner.

       A savoir : au tout premier pixel, le titre n'est PAS la. C'est le
       principe meme d'une animation scrubbee — elle n'a pas commence tant
       qu'on n'a pas scrolle. */
    const masques = lines.map(l => l.parentElement).filter(Boolean);
    lines.forEach(l => { l.style.transform = 'none'; });
    /* les masques restent ouverts en permanence : une lettre qui arrive
       de -180 % en sortirait a chaque frame */
    masques.forEach(m => {
      if(m.dataset.ov === undefined) m.dataset.ov = m.style.overflow || '';
      m.style.overflow = 'visible';
    });

    const N = lettres.length;
    const FEN = 0.42;                 /* largeur de la fenetre d'une lettre */
    lettres.forEach((c, i) => {
      /* meme tirage deterministe que la chute d'avant : en scrub, la meme
         position de scroll DOIT rendre la meme image, sinon tout grelotte */
      const r = Math.sin(i * 12.9898);
      /* Amplitude reduite par rapport au pen (qui va a ±200 %). Le pen n'a
         qu'UNE ligne ; ici il y en a trois, empilees, et les masques sont
         ouverts en permanence. A ±200 % le « F » de FAISONS venait se poser
         en plein sur le « D » de DECOLLER — ce qu'on lisait comme un bug en
         remontant. ±75 % laisse le mouvement lisible sans chevauchement. */
      c.dataset.dy = ((r < 0 ? -1 : 1) * (30 + Math.abs(r) * 45)).toFixed(0);
      c.dataset.dr = ((i % 2 ? 1 : -1) * (6 + Math.abs(r) * 14)).toFixed(1);
      c.dataset.t0 = ((i / N) * (1 - FEN)).toFixed(4);
    });

    const cue = this.q('[data-cue]');
    const u16 = u;                    /* l'unite de la maquette */
    const ease = (gsap.parseEase && gsap.parseEase('back.out(1.2)'))
               || (t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2));
    const ARRIVEE = 0.24;             /* part de la piste consacree au titre */
    const courseTitre = () => pisteHero
      ? Math.max(1, (pisteHero.offsetHeight - window.innerHeight) * ARRIVEE)
      : Math.max(1, window.innerHeight * ARRIVEE);

    /* LA CHUTE NE SE REJOUE PAS A L'ENVERS (28/08).
       `pa` etait lu directement sur la position de scroll, donc reversible :
       en REMONTANT vers le haut de la page, les lettres repartaient au
       plafond et le titre s'effaçait. Vu depuis le bas de la page ça se lit
       comme une disparition, pas comme une animation — le titre du site n'est
       pas un element decoratif qu'on peut retirer parce qu'on remonte.
       On garde donc la progression MAXIMALE atteinte : la chute avance, ne
       recule jamais, et un rechargement la rejoue depuis le debut puisque
       `paMax` repart de zero. C'est la meme regle que les reveals de la page
       (« une fois montre, ca reste montre »).
       Pour revenir au comportement reversible : supprimer `paMax` et rendre
       `pa` egal a `brut`. */
    let paMax = 0;
    const poseLettres = () => {
      const brut = Math.min(1, Math.max(0, (window.scrollY || 0) / courseTitre()));
      if(brut > paMax) paMax = brut;
      const pa = paMax;
      lettres.forEach(c => {
        const t0 = +c.dataset.t0;
        const u = Math.min(1, Math.max(0, (pa - t0) / FEN));
        const e = ease(u);
        /* Fondu CONTINU, pas un interrupteur. Avec un binaire, la premiere
           lettre — dont la fenetre commence a zero — s'eteignait d'un coup
           en arrivant en haut de page pendant que les autres restaient
           visibles : un clignotement isole, qui se lit comme un defaut. */
        c.style.opacity = Math.min(1, u * 5).toFixed(3);
        c.style.transform = 'translateY(' + ((1 - e) * +c.dataset.dy).toFixed(2) + '%)'
                          + ' rotate(' + ((1 - e) * +c.dataset.dr).toFixed(2) + 'deg)';
      });
      /* Le sous-texte et le bouton suivent la MEME course, mais apres les
         lettres : ils commencent quand le titre est aux trois quarts pose.
         Les enchainer dans la meme fonction plutot que par une timeline
         separee garantit qu'ils ne peuvent pas se desynchroniser du titre
         — il n'y a qu'une seule tete de lecture, la position de scroll. */
      const fondu = (el, a, b, dy, magnetique) => {
        if(!el) return;
        const v = Math.min(1, Math.max(0, (pa - a) / (b - a)));
        const e = 1 - Math.pow(1 - v, 3);        /* sortie douce, sans rebond */
        const y = ((1 - e) * dy).toFixed(2) + 'px';
        el.style.opacity = v.toFixed(3);
        /* Le bouton porte l'effet magnetique : sa position horizontale vit
           dans --mx, ecrite par parallax() a chaque mouvement de souris.
           Ecraser son transform par un simple translateY tuerait l'effet —
           on garde donc la variable dans la valeur. */
        el.style.transform = magnetique
          ? 'translate(var(--mx,0px),' + y + ')'
          : 'translateY(' + y + ')';
      };
      fondu(para, 0.70, 0.94, 18 * u16, false);
      fondu(btn,  0.82, 1.00, 16 * u16, true);
      /* Le rideau noir a ete retire : place dans le conteneur centre de
         1024 u, il ne couvrait pas toute la largeur de la section — la
         nappe violette debordait sur les cotes et on voyait la couture. */
      if(cue) cue.style.opacity = (1 - Math.min(1, pa / 0.34)).toFixed(3);
    };
    let fileT = false;
    const queueT = () => { if(fileT) return; fileT = true; requestAnimationFrame(() => { fileT = false; poseLettres(); }); };
    this.on(window, 'scroll', queueT, {passive: true});
    this.on(window, 'resize', queueT, {passive: true});
    poseLettres();
    /* open() doit pouvoir tout reposer : le filet de securite passe par la */
    this.poseTitre = poseLettres;
  }

  intro(){
    const intro = this.q('[data-intro]');
    /* le hero doit pouvoir se ré-ouvrir si le template est re-rendu */
    this.opened = false;
    const open = () => {
      this.opened = true;
      if(intro){ intro.style.opacity = '0'; intro.style.visibility = 'hidden'; intro.style.pointerEvents = 'none'; }
      this.qa('[data-ln]').forEach(i => { i.style.transform = 'none'; });
      /* le titre est decoupe en lettres : le filet de securite doit les
         reposer elles aussi, sinon il rouvre une ligne vide */
      /* les lettres sont pilotees par le defilement : on ne les fige pas a
         leur etat final, on redemande simplement leur pose courante */
      if(this.poseTitre) this.poseTitre();
      else this.qa('[data-ln] [data-c]').forEach(c => {
        c.style.transform = 'none'; c.style.opacity = '1';
      });
      /* Les masques de ligne NE SE REFERMENT PLUS. Ils etaient rendus a leur
         overflow:hidden d'origine en fin d'intro, du temps ou les lettres
         avaient fini de tomber. Maintenant elles arrivent au defilement :
         refermer les masques rognerait toutes celles qui ne sont pas encore
         posees. */

      /* Le sous-texte et le bouton ne sont PLUS forces a leur etat final.
         C'est ce qui les faisait apparaitre sur une page vide : open() est
         appele en fin de timeline — donc tres tot, maintenant qu'elle ne
         contient plus rien — et il les allumait alors que le titre, lui,
         attendait le scroll. Ils suivent la meme tete de lecture que le
         reste, poseTitre() s'en charge. */
      if(!this.poseTitre){
        const p = this.q('[data-heroline="p"]'), btn = this.q('[data-heroline="btn"]');
        if(p){ p.style.opacity = '1'; p.style.transform = 'none'; }
        if(btn){ btn.style.opacity = '1'; btn.style.transform = 'translate(var(--mx,0px),var(--my,0px))'; }
        const cue = this.q('[data-cue]');
        if(cue) cue.style.opacity = '1';
      }
    };

    /* --- L'INTRO NE SE JOUE QUE SI ON ARRIVE PAR LE HAUT ---------------
       Au rechargement, le navigateur restitue la position de defilement.
       Si on rouvre le site sur Services ou sur Contact, la sequence d'entree
       n'a aucun sens : plus bas elle fait `window.scrollTo(0, 0)` et un
       `lenis.stop()`, donc elle rembobine la page en haut et impose son
       ecran noir alors qu'on voulait revenir ou on etait.
       On pose donc le hero dans son etat final et on sort avant d'avoir
       construit la moindre timeline. Le seuil est volontairement bas :
       quelques pixels de restitution suffisent a dire « on n'arrive pas
       par le haut ». */
    /* ?intro force la sequence d'entree meme si le navigateur a restitue une
       position de defilement. On travaille la chute des lettres en scrollant
       sans arret pour juger le hero : sans ce parametre, il faut remonter tout
       en haut avant chaque F5, et on croit l'animation disparue. La suite se
       charge du reste — elle rembobine elle-meme la page en haut.
       Aucun effet pour un visiteur qui n'ajoute pas le parametre. */
    const forceIntro = /[?&]intro\b/.test(window.location.search);

    /* LE SEUIL. Il valait 4 px : le moindre pixel restitue et la sequence
       sautait. En pratique on passe son temps a scroller dans le hero pour
       juger la rotation, donc elle ne se jouait plus jamais — on la croyait
       cassee.
       Ce que la regle veut vraiment dire, c'est « ne rembobine pas quelqu'un
       qui etait ailleurs ». Tant qu'on est encore DANS la piste du hero, on
       n'est pas ailleurs : remonter en haut de sa propre section ne desoriente
       personne. Le seuil est donc le bout de la piste, l'instant ou le hero se
       decolle. Rouvrir le site sur Services ou sur Contact saute toujours
       l'intro, ce qui etait le but. */
    const pisteHero = this.q('[data-heropiste]');
    const seuil = pisteHero
      ? Math.max(4, pisteHero.offsetHeight - window.innerHeight)
      : 4;
    const yInitial = forceIntro
      ? 0
      : (window.scrollY || document.documentElement.scrollTop || 0);
    /* Le titre est branche sur le defilement dans tous les cas, y compris
       quand la sequence d'entree ne se joue pas. */
    this.titreAuScroll();
    if(yInitial > seuil){
      open();
      if(intro) intro.style.display = 'none';
      return;
    }

    const lines = this.qa('[data-ln]');
    const para  = this.q('[data-heroline="p"]');
    const btn   = this.q('[data-heroline="btn"]');
    const hv    = this.q('[data-herovisual]');
    const logo  = intro ? intro.querySelector('img') : null;
    const railW = intro ? intro.querySelectorAll(':scope > div')[1] : null;
    const bar   = railW ? railW.querySelector('i') : null;
    const glows = ['[data-floor="1"]', '[data-floor="2"]', '[data-ground]', '[data-spot]']
      .map(s => this.q(s)).filter(Boolean);
    /* la jauge de lecture du header : meme degrade que la barre du loader */
    const hdrRail = this.q('[data-progress]');
    const hdrBar  = this.q('[data-bar]');
    /* l'ampoule que tient la figurine : halo radial orange, au repos a 0,
       pilote au survol par hovers(). C'est la source de lumiere de la scene. */
    const bulb    = this.q('[data-bulb]');

    /* le loader est masque quand showIntro === false (voir applyProps) */
    const noLoader = !intro || getComputedStyle(intro).display === 'none';
    /* ?motion=full force la version pleine, quel que soit le reglage systeme.
       Sert a travailler la sequence sans toucher aux reglages de Windows.
       Aucun effet pour un visiteur qui n'ajoute pas ce parametre. */
    const force    = /[?&]motion=full/.test(window.location.search);
    const reduced  = !force && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* "Mouvement reduit" veut dire eviter les grands deplacements qui donnent
       le mal des transports, pas tout couper. On garde donc la meme
       choregraphie, avec des amplitudes divisees par 2,5 et un tempo plus
       vif. Le visiteur qui a coche ce reglage voit la meme scene, en plus
       sobre -- pas une page qui s'allume sans rien dire. */
    const M = reduced ? 0.4 : 1;    /* amplitude des deplacements */
    const D = reduced ? 0.6 : 1;    /* facteur de duree */
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;

    /* --- les transitions CSS de ces elements se battraient avec GSAP : on les
           met en pause, on les restitue telles quelles a la fin --- */
    /* [data-intro] a `transition: opacity .6s` en ligne : sans le neutraliser,
       la transition CSS reease chaque image ecrite par GSAP et etale le fondu. */
    const tw = lines.concat(para ? [para] : [], btn ? [btn] : [], intro ? [intro] : [],
                            bulb ? [bulb] : []);
    const savedTr = tw.map(el => el.style.transition);
    tw.forEach(el => { el.style.transition = 'none'; });

    /* --- GSAP normalise le transform de tout element qu'il anime, meme pour
           une simple opacity. Or le transform de [data-herovisual] est ecrit
           avec des var() que GSAP ne sait pas relire :
             translate(var(--px,0px), calc(-50% + var(--py,0px))) scale(var(--sc,1))
           S'il le remplace par une matrice, --px / --py / --sc ne pilotent plus
           rien et la parallaxe meurt. On memorise donc les transform d'origine
           de tous les elements possedes par parallax() et on les restitue mot
           pour mot a la fin de la sequence. --- */
    /* [data-bulb] est centre par translate(-50%,-50%). GSAP resout ces %
       en pixels des qu'il touche l'element : le centrage se figerait et
       casserait au redimensionnement. On restitue donc aussi son transform. */
    const owned = (hv ? [hv] : []).concat(glows, bulb ? [bulb] : []);
    const savedTf = owned.map(el => el.style.transform);

    const thaw = () => {
      tw.forEach((el, i) => { el.style.transition = savedTr[i]; });
      owned.forEach((el, i) => { el.style.transform = savedTf[i]; });
      if(hv) hv.style.setProperty('--sc', '1');
      /* etat de repos de l'ampoule : hovers() attend exactement '0' */
      if(bulb) bulb.style.opacity = '0';
    };

    /* --- blocage du scroll sans overflow:hidden, qui ferait sauter la page
           de la largeur de la barre de defilement au deverrouillage --- */
    const KEYS = [' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
    const stop = (e) => e.preventDefault();
    const stopKeys = (e) => { if(KEYS.indexOf(e.key) >= 0) e.preventDefault(); };
    let locked = false;
    const lock = () => {
      if(locked) return; locked = true;
      window.scrollTo(0, 0);
      /* Ici, contrairement a Services, lenis.stop() est exactement ce
         qu'on veut : il continue de faire preventDefault sur la molette,
         donc il verrouille au lieu de rendre la main. On recale d'abord
         sa cible sur 0, sinon il reprendrait au deverrouillage la
         descente amorcee avant le rechargement. */
      if(this.lenis){ this.lenis.scrollTo(0, {immediate:true, force:true}); this.lenis.stop(); }
      window.addEventListener('wheel', stop, {passive:false});
      window.addEventListener('touchmove', stop, {passive:false});
      window.addEventListener('keydown', stopKeys, {passive:false});
    };
    const unlock = () => {
      if(!locked) return; locked = false;
      if(this.lenis) this.lenis.start();
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchmove', stop);
      window.removeEventListener('keydown', stopKeys);
    };

    /* etats de depart : poses tout de suite, sous le rideau noir */
    if(hv) gsap.set(hv, { opacity: 0 });
    if(glows.length) gsap.set(glows, { opacity: 0 });
    lock();

    const tl = gsap.timeline({
      delay: noLoader ? 0.05 : 1.30,
      /* PAS de force3D ici. [data-herovisual] a un transform ecrit avec des
         var() : translate(var(--px), calc(-50% + var(--py))) scale(var(--sc)).
         force3D obligerait GSAP a reecrire ce transform, il resoudrait les
         var() en une matrice figee et la parallaxe cesserait de fonctionner.
         Toutes les animations sur le hero sont donc en opacity pure, et
         l'echelle passe uniquement par --sc, ecrit a la main. */
      defaults: { ease: 'power3.out' },
      onComplete: () => { open(); thaw(); unlock(); },
    });

    /* --- SEUIL : on reprend la main sur les keyframes CSS en figeant d'abord
           leur etat final, sinon `animation:none` les remettrait a zero --- */
    if(!noLoader){
      if(logo)  tl.set(logo,  { animation: 'none', opacity: 1, y: 0 }, 0);
      if(bar)   tl.set(bar,   { animation: 'none', scaleX: 1, transformOrigin: 'left center' }, 0);
      if(railW) tl.set(railW, { transformOrigin: 'center center' }, 0);
    }
    tl.addLabel('seuil', 0);

    /* -------------------------------------------------------------------
       LE FIL DE LUMIERE
       La barre du loader et la jauge de lecture du header sont exactement le
       meme degrade : linear-gradient(90deg, var(--violet-b), var(--pink)).
       Jusqu'ici l'une mourait et l'autre naissait sans lien. Desormais c'est
       le meme objet : la barre ne s'eteint pas, elle monte se loger dans le
       header et change de metier. Un seul fil de lumiere du premier au
       dernier pixel de la visite.

       Contrainte de mise en scene : le loader est en z-index 1000, le header
       en 100. La barre voyageuse est donc AU-DESSUS du rideau noir, la vraie
       jauge EN DESSOUS. Plutot que de manipuler les z-index, on fait
       atterrir la barre pendant que le noir se retire : au point d'arrivee
       les deux lignes se superposent au pixel pres, l'une s'efface avec le
       rideau pendant que l'autre se decouvre. L'oeil ne voit qu'une seule
       ligne continue.
       ------------------------------------------------------------------- */
    const viser = () => {
      const r = railW.getBoundingClientRect();
      const W = document.documentElement.clientWidth;
      const pr = hdrRail ? hdrRail.getBoundingClientRect() : null;
      /* on vise la vraie ligne du header ; si elle est masquee (header
         retracte), on retombe sur sa position de maquette : 76u de haut. */
      const ty = (pr && pr.width > 0 && pr.top > -1)
        ? pr.top + pr.height / 2
        : 76 * u - 0.5;
      return {
        dx: W / 2 - (r.left + r.width / 2),
        dy: ty - (r.top + r.height / 2),
        sx: W / r.width,
      };
    };

    if(!noLoader){
      if(logo) tl.to(logo, {
        y: -14 * u * M, opacity: 0, duration: 0.55 * D, ease: 'power2.in',
      }, 'seuil');

      if(railW){
        let AIM = null;
        /* la jauge est mise a plein AVANT le voyage : elle est encore cachee
           sous le rideau noir, donc invisible. Elle attend, en place. */
        tl.call(() => {
          AIM = viser();
          if(hdrBar) hdrBar.style.width = '100%';
          if(hdrRail) hdrRail.style.opacity = '1';
        }, null, 'seuil');

        tl.to(railW, {
          x: () => AIM.dx,
          y: () => AIM.dy,
          scaleX: () => AIM.sx,
          duration: 0.62 * D,
          ease: 'power3.inOut',
        }, 'seuil+=0.02');
      }
      /* mouvement reduit : pas de voyage, le rideau emporte la barre */
    }

    /* --- LE NOIR : le rideau se retire sur une scene encore eteinte -------
       On ne decouvre pas un decor deja eclaire, on decouvre le noir. La
       figurine n'est qu'un fantome a 18% : assez pour qu'on devine une
       presence, pas assez pour qu'on la voie. Les lueurs du sol restent a 0.
       ------------------------------------------------------------------ */
    /* --- L'ALLUMAGE ------------------------------------------------------
       La piece est noire, l'ampoule est la seule source, et la camera est
       posee dessus. Puis la lumiere s'ouvre et la camera recule jusqu'au
       cadrage de la landing : l'intro ne se leve pas comme un rideau, elle
       devient la page.

       Rien de la landing n'est touche — ni la mise en page, ni les tailles,
       ni le transform de [data-herovisual], qui appartient a heroScroll et
       a ses var(). L'effet tient en deux nappes fixes ajoutees
       ([data-lightveil], [data-lightwarm]) et une camera sur [data-hero],
       qui n'a aucun transform ecrit par le JS.

       Tout est calcule depuis la position REELLE de [data-bulb] : le centre
       du halo, l'origine du zoom, et la distance pour amener l'ampoule au
       centre de l'ecran. Rien n'est devine en pourcentages.

       LUM = le temps que la piece reste noire, en unites D. A 0 (mouvement
       reduit, ou nappes absentes) toute la sequence disparait proprement et
       l'intro d'origine reprend a l'identique. */
    const veil = this.q('[data-lightveil]'), warm = this.q('[data-lightwarm]');
    const heroCam = this.q('[data-hero]'), RACINE = document.documentElement;
    /* L'ALLUMAGE EST COUPE. Il tenait a l'ancien personnage, qui tenait une
       ampoule des la premiere image : c'est elle qui allumait la scene. Le
       nouveau perso arrive les bras baisses et ne leve son ampoule qu'a la
       fin de la rotation — l'allumage n'aurait plus rien a allumer.
       Le code est intact, il suffit de repasser ALLUMAGE a true. Le commentaire
       plus bas le dit : a LUM = 0, toute la sequence disparait proprement. */
    const ALLUMAGE = false;
    const LUM = (ALLUMAGE && veil && warm && bulb && heroCam && !reduced) ? 1.05 : 0;

    tl.addLabel('ouverture', 'seuil+=' + (noLoader ? 0 : 0.25 * D));

    if(!noLoader && intro){
      tl.to(intro, { opacity: 0, duration: 0.50 * D, ease: 'power2.inOut' }, 'ouverture');
    }
    if(hv){
      /* 0.18 quand il n'y a pas d'allumage : c'est le reglage d'origine.
         Avec l'allumage, c'est le voile qui fait le noir — la figurine doit
         rester lisible a l'interieur de la bulle, donc presque pleine. */
      tl.to(hv, { opacity: LUM ? 0.92 : 0.18, duration: 0.45 * D, force3D: false }, 'ouverture');
    }
    /* le fil se range vers la gauche : detail discret, plus le spectacle */
    if(!noLoader && hdrBar){
      tl.to(hdrBar, {
        width: '0%', duration: 0.70 * D, ease: 'power2.inOut',
      }, 'ouverture+=' + (0.25 * D));
    }

    /* --- L'ALLUMAGE -------------------------------------------------------
       Le geste principal. La figurine tient une ampoule ; c'est elle qui
       allume la scene. Le titre du site dit "Faisons decoller vos idees" :
       l'ampoule EST l'idee. On la joue au lieu de l'illustrer.

       La lumiere se propage depuis sa source, dans cet ordre : l'ampoule
       claque, la figurine sort de l'ombre, puis le halo violet gagne le
       spot, le sol, et enfin les deux nappes du fond. Chaque decalage est
       court (40 a 80 ms) : on ne voit pas une cascade, on sent une onde.

       Le flash est transitoire, l'eclairage reste -- comme un vrai allumage.
       [data-bulb] revient donc exactement a 0, son etat de repos, sinon le
       survol gere par hovers() serait casse.
       ------------------------------------------------------------------- */
    tl.addLabel('allumage', 'ouverture+=' + ((0.37 + LUM) * D));

    if(LUM){
      const rb = bulb.getBoundingClientRect(), rh = heroCam.getBoundingClientRect();
      const bx = rb.left + rb.width / 2, by = rb.top + rb.height / 2;
      const z0 = 1 + 0.55 * M;
      RACINE.style.setProperty('--lum-x', bx.toFixed(1) + 'px');
      RACINE.style.setProperty('--lum-y', by.toFixed(1) + 'px');
      /* Sur la racine, pas sur la section : les deux nappes sont ses SOEURS,
         elles n'heriteraient pas d'une variable posee sur elle — et le halo
         ne suivrait pas le recul de camera. */
      RACINE.style.setProperty('--cam-ox', (bx - rh.left).toFixed(1) + 'px');
      RACINE.style.setProperty('--cam-oy', (by - rh.top).toFixed(1) + 'px');

      const L = { r: 0, rw: 0, z: z0,
                  dx: window.innerWidth / 2 - bx, dy: window.innerHeight / 2 - by };
      const ecrire = () => {
        RACINE.style.setProperty('--lum-r',  L.r.toFixed(1) + 'px');
        RACINE.style.setProperty('--lum-rw', L.rw.toFixed(1) + 'px');
        RACINE.style.setProperty('--cam-z', L.z.toFixed(4));
        RACINE.style.setProperty('--cam-x', L.dx.toFixed(1) + 'px');
        RACINE.style.setProperty('--cam-y', L.dy.toFixed(1) + 'px');
      };
      ecrire();
      gsap.set([veil, warm], { opacity: 1 });
      /* Un element agrandi compte dans la zone scrollable : sans ca, la
         camera ferait apparaitre des barres de defilement le temps de
         l'intro. `clip` et pas `hidden` : hidden fabrique un conteneur de
         defilement, et ca casse position:sticky. Retire a la fin. */
      heroCam.style.overflow = 'clip';

      /* la bulle s'ouvre autour de l'ampoule : on ne voit que la tete */
      tl.to(L, { r: 180, rw: 250, duration: 0.40 * D, ease: 'power2.out', onUpdate: ecrire },
        'ouverture+=' + (0.22 * D));
      tl.to(bulb, { opacity: 0.5, duration: 0.30 * D, ease: 'power2.out', force3D: false },
        'ouverture+=' + (0.22 * D));
      /* le decrochage : la piece se resserre juste avant le plein feu.
         Une ampoule ne passe jamais de faible a fort en ligne droite. */
      tl.to(L, { r: 150, rw: 196, duration: 0.10 * D, ease: 'power1.in', onUpdate: ecrire },
        'ouverture+=' + ((0.37 + LUM - 0.12) * D));

      /* plein feu : la lumiere deborde et la camera recule, en meme temps */
      tl.to(L, { r: 2800, rw: 2600, z: 1, dx: 0, dy: 0,
        duration: 0.85 * D, ease: 'power3.out', onUpdate: ecrire }, 'allumage');
      tl.to(warm, { opacity: 0, duration: 0.70 * D, ease: 'power2.in' },
        'allumage+=' + (0.25 * D));
      tl.to(veil, { opacity: 0, duration: 0.30 * D, ease: 'none',
        onComplete: () => { veil.style.display = 'none'; warm.style.display = 'none';
                            heroCam.style.overflow = ''; } },
        'allumage+=' + (0.55 * D));
    }

    if(hv){
      tl.to(hv, { opacity: 1, duration: 0.30 * D, ease: 'power2.out', force3D: false }, 'allumage');
      /* profondeur : --sc est la variable que le hero utilise deja pour son
         echelle. heroScroll() ne la reecrit qu'au scroll, bloque ici. */
      const depth = { v: 1 + 0.14 * M };
      tl.to(depth, {
        v: 1, duration: 1.00 * D, ease: 'power3.out',
        onStart:    () => hv.style.setProperty('--sc', String(1 + 0.14 * M)),
        onUpdate:   () => hv.style.setProperty('--sc', depth.v.toFixed(4)),
        onComplete: () => hv.style.setProperty('--sc', '1'),
      }, 'allumage');
    }
    if(bulb){
      tl.to(bulb, { opacity: 1, duration: 0.16 * D, ease: 'power2.out', force3D: false },
        'allumage+=' + (0.06 * D));
      tl.to(bulb, { opacity: 0, duration: 0.90 * D, ease: 'power2.inOut', force3D: false },
        'allumage+=' + (0.30 * D));
    }
    /* l'onde : spot -> sol -> nappes du fond */
    const onde = [
      [this.q('[data-spot]'),      0.10],
      [this.q('[data-ground]'),    0.14],
      [this.q('[data-floor="1"]'), 0.18],
      [this.q('[data-floor="2"]'), 0.18],
    ];
    onde.forEach(([el, t]) => {
      if(el) tl.to(el, { opacity: 1, duration: 0.45 * D, ease: 'power2.out', force3D: false },
        'allumage+=' + (t * D));
    });

    /* --- SCENE : apres un temps mort, le titre monte --- */
    /* Sans allumage on garde le temps mort d'origine. Avec, le titre attend
       que la lumiere ait fini de s'ouvrir : il arrive sur une page eclairee,
       pas pendant qu'elle s'eclaire. */
    tl.addLabel('scene', 'allumage+=' + ((LUM ? 0.88 : 0.48) * D));

    /* --- LE TITRE : les lettres se rangent -------------------------------
       Le markup de render() n'est pas touche : le decoupage se fait ici,
       une seule fois, et il preserve l'<em> qui porte le violet de
       "idees". Chaque lettre arrive de plus ou moins haut avec son propre
       angle, puis se pose. Le sujet du site est une figurine a assembler :
       le titre se monte, piece par piece.

       Deux precautions :
       - les <span> parents ont overflow:hidden pour masquer les lignes ;
         il couperait les lettres qui arrivent d'au-dessus. On l'ouvre
         pendant la sequence et on le rend a la fin.
       - les lignes elles-memes passent a transform:none tout de suite :
         ce ne sont plus elles qui portent le mouvement. On evite ainsi le
         piege du yPercent qui s'ajoute au translateY(112%) d'origine. */
    /* Le sous-texte et le bouton ne sont plus animes par la timeline : ils
       sont accroches au defilement, avec le titre (voir poseLettres). Deux
       tetes de lecture pour trois elements de la meme colonne, c'etait la
       garantie de les voir se croiser. */

    /* --- filets de securite : la landing doit s'ouvrir quoi qu'il arrive --- */
    const safety = setTimeout(() => { if(!this.opened) tl.progress(1); }, 6500);
    const guard = setInterval(() => {
      const hidden = this.qa('[data-ln]').some(i => i.style.transform === 'translateY(112%)');
      if(hidden && this.opened) open();
    }, 300);

    this.cleanups.push(() => {
      clearInterval(guard); clearTimeout(safety);
      tl.kill(); unlock(); thaw();
    });
  }

  parallax(){
    const hv = this.q('[data-herovisual]'), copy = this.q('[data-herocopy]'), hero = this.q('[data-hero]');
    const planes = this.qa('[data-plane]').map(el => ({el: el, k: parseFloat(el.getAttribute('data-k')) || 0}));
    let mx = 0, my = 0, cx = 0, cy = 0, pending = false, shift = 0;
    const apply = () => {
      pending = false;
      cx += (mx - cx) * .08; cy += (my - cy) * .08;
      if(hv){ hv.style.setProperty('--px', (cx*18).toFixed(2) + 'px'); hv.style.setProperty('--py', (cy*14).toFixed(2) + 'px'); }
      planes.forEach(p => { p.el.style.transform = 'translate3d(' + (cx*18*p.k).toFixed(2) + 'px,' + (cy*14*p.k).toFixed(2) + 'px,0)'; });
      if(copy) copy.style.setProperty('--cpy', (cy*-6 + shift).toFixed(2) + 'px');
      if(Math.abs(mx-cx) > .001 || Math.abs(my-cy) > .001) queue();
    };
    const queue = () => { if(pending) return; pending = true; requestAnimationFrame(apply); };
    if(window.matchMedia('(pointer:fine)').matches){
      this.on(window, 'mousemove', e => {
        mx = (e.clientX / window.innerWidth - .5) * 2;
        my = (e.clientY / window.innerHeight - .5) * 2;
        queue();
      }, {passive:true});
    }
    const heroScroll = () => {
      if(!hero) return;
      /* Meme course que scanHero : le hero etant colle, se caler sur
         innerHeight ferait finir la copie des le premier ecran. */
      const piste = document.querySelector('[data-heropiste]');
      const course = piste ? Math.max(1, piste.offsetHeight - window.innerHeight)
                           : window.innerHeight;
      const p = Math.min(1, window.scrollY / course);
      /* La copie ne monte plus au scroll. Le hero est colle : le texte
         glissait vers le haut alors que la piste, elle, ne bougeait pas —
         on lisait un decrochage, pas un mouvement. Passer MONTEE a 90 pour
         retrouver l'ancien comportement. */
      const MONTEE = 0;
      shift = -p * MONTEE;
      if(hv){ hv.style.setProperty('--sc', (1 - p*.12).toFixed(3)); }
      if(copy){ copy.style.setProperty('--cpy', (cy*-6 + shift).toFixed(2) + 'px'); }
    };
    this.on(window, 'scroll', heroScroll, {passive:true});
    heroScroll();
  }

  /* Apparition au balayage — séquence 1.
     Pilotée par la même progression que heroScroll (scrollY / innerHeight),
     ramenée sur COURSE pour que le personnage soit entièrement matérialisé
     bien avant que le hero quitte l'écran.
     N'écrit que --sa --sb --ha --hb --hc --hd --ly --lo --footo --cx --cy --cr
     sur [data-herovisual]. Aucune de ces variables n'est lue ailleurs, et le
     transform du hero (--px --py --sc) n'est jamais touché : il reste la
     propriété de parallax(). Pour tout couper : SCAN_HERO = false. */
  scanHero(){
    const SCAN_HERO = true;
    const hv = this.q('[data-herovisual]');
    if(!hv || !SCAN_HERO) return;

    const TOP = 0.15, BOT = 0.895, BAND = 0.13, FADE = 0.05;
    const RAYON  = '11%';         /* halo du curseur, en % du carré du visuel */
    const cl = (v, a, b) => v < a ? a : (v > b ? b : v);
    const pct = v => (v * 100).toFixed(3) + '%';
    /* « Réduire les animations » : on garde la matérialisation, on coupe le
       glitch, qui est de la secousse pure. */
    const reduit = !(/[?&]motion=full/.test(window.location.search))
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* La piste. Le hero est collé dans [data-heropiste] : la séquence se lit
       sur la course de cette piste, plus sur le premier écran. Sans repli si
       la piste manque, on retombe sur l'ancien calage. */
    const piste = this.q('[data-heropiste]');
    const course = () => piste
      ? Math.max(1, piste.offsetHeight - window.innerHeight)
      : Math.max(1, window.innerHeight * 0.45);

    /* Répartition sur la course, en fractions :
         0    → 0.16   la figurine naît (fondu ; rien au premier pixel)
         0.08 → 1      elle tourne, 76 images, jusqu'à l'ampoule levée
         0.20 → 0.66   le balayage descend et la matérialise */
    /* FIN : la rotation s'acheve AVANT le bout de la piste. Tout ce qui reste
       apres est un temps d'arret — la figurine tient sa pose, ampoule levee,
       et decroche par a-coups pendant qu'on ne bouge pas encore. Sans ca, le
       hero se decollait au moment precis ou l'ampoule montait : la sequence
       n'avait pas de fin, elle etait coupee. */
    const NAIT = 0.13, TOUR0 = 0.06, SCAN_A = 0.16, SCAN_B = 0.52, FIN = 0.62;
    /* La hauteur de defilement a laquelle la sequence est finie : rotation
       achevee, ampoule levee. C'est la que « Accueil » doit poser la page —
       pas en haut, ou la figurine n'existe pas encore. Mesuree a l'appel,
       jamais en cache : la course depend de la hauteur de la fenetre. */
    this.heroPoseY = () => Math.round(course() * FIN);

    /* Les deux planches : 76 images, 10 colonnes, tuiles 228×352. */
    const N = 76, COLS = 10, TW = 332, TH = 512;
    const cvPlein = hv.querySelector('[data-perso="plein"]');
    const cvFil   = hv.querySelector('[data-perso="fil"]');
    const cxP = cvPlein ? cvPlein.getContext('2d') : null;
    const cxF = cvFil   ? cvFil.getContext('2d')   : null;

    /* La tuile ne couvre pas toute la boîte : elle occupe le rectangle mesuré
       de la figurine dans le repère 1100×1100 de hero-scan-a (x 469→1021,
       y 142→993). On la dessine à cette place dans un canvas qui, lui, vaut
       toute la boîte — comme ça les masques --sa/--sb et --ha..--hd, exprimés
       en pourcentage de la boîte, restent justes au pixel près. */
    /* CW est la taille de la MEMOIRE du canvas, pas celle de son affichage.
       Elle valait 550 en dur. Or la boite fait 566*--u, soit jusqu'a 796 px
       CSS, et davantage en pixels reels sur un ecran a forte densite. La tuile
       filaire (332 px de large) etait donc REDUITE a 276 px pour entrer dans
       le canvas (DW = 0,50273 * 550), puis le canvas etait ETIRE a ~400 px CSS
       par la mise en page. Deux reechantillonnages a la suite, dont un vers le
       bas : le trait perdait sa definition d'abord, on l'agrandissait ensuite.
       C'est de la qu'il bavait.
       On dimensionne maintenant la memoire sur les pixels REELLEMENT affiches :
       le trait ne traverse plus qu'un seul agrandissement, depuis sa taille
       native. Les masques --sa/--sb et --ha..--hd sont en pourcentage de la
       boite, donc ils suivent sans rien changer. */
    const dpr   = Math.min(window.devicePixelRatio || 1, 2);
    const boite = (cvPlein && cvPlein.clientWidth) || 796;
    const CW    = cl(Math.round(boite * dpr), 660, 1600);
    if(cvPlein){ cvPlein.width = CW; cvPlein.height = CW; }
    if(cvFil)  { cvFil.width   = CW; cvFil.height   = CW; }
    if(cxP) cxP.imageSmoothingQuality = 'high';
    if(cxF) cxF.imageSmoothingQuality = 'high';

    const DX = CW * 0.42636, DY = CW * 0.12909;
    const DW = CW * 0.50273, DH = CW * 0.77455;

    /* Hauteur du conteneur, mise en cache. La lire a chaque image serait
       un thrashing de layout ; elle ne change qu'au redimensionnement. */
    let hvH = hv.clientHeight || window.innerHeight;
    const mesureHv = () => { hvH = hv.clientHeight || window.innerHeight; };

    const plein = new Image(), fil = new Image(), repos = new Image();
    /* LES PLANCHES DU HERO FONT 3320 x 4096 — 54 Mo une fois decodees, DEUX
       FOIS. Tant qu'elles restent des <img>, le navigateur est libre de
       jeter l'image decodee et de la refaire au prochain drawImage : ca
       tombe en plein defilement et coute une image entiere. C'est la cause
       des saccades, et c'est exactement ce que spin() avait deja corrige de
       son cote sans que le hero en profite.
       createImageBitmap decode UNE fois, definitivement. Et on VIDE les
       <img> juste apres : sans ca la planche existe en double en memoire,
       le bitmap plus l'image decodee, soit 108 Mo pour rien. */
    let bmP = null, bmF = null;
    let pretP = false, pretF = false, vue = -1;
    /* La planche filaire est stockee en NIVEAUX DE GRIS : l'intensite du trait
       EST son alpha. En RVBA elle pesait 4 Mo — les traits fins antialiases
       coutent une fortune en couche alpha ; en gris, 1,5 Mo.
       On la repeint donc, mais UNE TUILE A LA FOIS et seulement quand l'image
       change : 170 000 pixels, environ 2 ms. Repeindre la planche entiere au
       chargement en couterait 13 millions d'un coup, soit une saccade. */
    const MAG = [250, 45, 185];   /* releve sur la video de reference : #F12FB6 */
    /* On repeint ET on redurcit le trait, dans le meme passage.
       La planche a ete REDUITE depuis sa source : un trait de 1 px y est
       devenu un degrade gris de deux ou trois pixels. Prendre cette intensite
       telle quelle comme alpha, c'est afficher le degrade — c'est exactement
       ce qui bave. On lui repasse donc une courbe en S (smoothstep entre BAS
       et HAUT) : le coeur du trait remonte a 255, la frange retombe a 0, et
       seule la vraie transition garde des valeurs intermediaires. Le trait
       reste antialiase, mais sur un pixel au lieu de trois.
       La courbe est appliquee APRES l'agrandissement, jamais avant : les
       franges naissent a l'agrandissement, les durcir en amont ne sert a rien.
       RW est la resolution de travail : la taille affichee, plafonnee a 1,6x
       la tuile native — au-dela on ne fait que payer des pixels vides. */
    const RW = Math.max(TW, Math.min(Math.round(DW), Math.round(TW * 1.6)));
    const RH = Math.round(RW * TH / TW);
    const BAS = 0.10, HAUT = 0.62;
    const gribouille = document.createElement('canvas');
    gribouille.width = RW; gribouille.height = RH;
    const cxG = gribouille.getContext('2d', { willReadFrequently: true });
    cxG.imageSmoothingQuality = 'high';
    const repeins = (sx, sy) => {
      cxG.clearRect(0, 0, RW, RH);
      cxG.drawImage(bmF || fil, sx, sy, TW, TH, 0, 0, RW, RH);
      const d = cxG.getImageData(0, 0, RW, RH), px = d.data;
      for(let k = 0; k < px.length; k += 4){
        let a = (px[k] / 255 - BAS) / (HAUT - BAS);
        a = a < 0 ? 0 : a > 1 ? 1 : a;
        a = a * a * (3 - 2 * a);
        px[k] = MAG[0]; px[k+1] = MAG[1]; px[k+2] = MAG[2]; px[k+3] = (a * 255) | 0;
      }
      cxG.putImageData(d, 0, 0);
      return gribouille;
    };

    const dessinePlein = (sx, sy) => {
      cxP.clearRect(0, 0, CW, CW);
      cxP.drawImage(bmP || plein, sx, sy, TW, TH, DX, DY, DW, DH);
    };

    /* LA POSE DE REPOS, EN PLEINE DEFINITION.
       Les tuiles 0 a 16 de la planche filaire sont RIGOUREUSEMENT identiques :
       la figurine attend, bras baisses, avant que la rotation ne commence. Or
       c'est la pose qu'on voit au chargement, immobile, le temps qu'on veut —
       donc celle ou le trait mou se remarque le plus.
       Elle est servie par un fichier a part, rendu a 996x1536 depuis la source
       (contre 332x512 dans la planche, soit trois fois moins de definition).
       Cadre identique a la tuile, verifie par recouvrement : ecart mesure
       inferieur au demi-pixel.
       Un fondu de quatre images (17 a 20) rattrape la planche quand la
       rotation demarre, sinon le passage du net au mou se voit d'un coup. */
    const REPOS_FIN = 16, REPOS_FONDU = 4;
    const reposCv = document.createElement('canvas');
    let pretR = false;
    const preparerRepos = () => {
      /* Le repaint magenta est fait UNE FOIS, au chargement : l'image ne
         change jamais. A 1,5 million de pixels, le faire a chaque rendu
         couterait une saccade. */
      const RWr = Math.max(1, Math.min(repos.naturalWidth, Math.round(DW * 1.25)));
      const RHr = Math.round(RWr * repos.naturalHeight / repos.naturalWidth);
      reposCv.width = RWr; reposCv.height = RHr;
      const c = reposCv.getContext('2d', { willReadFrequently: true });
      c.imageSmoothingQuality = 'high';
      c.drawImage(repos, 0, 0, RWr, RHr);
      const d = c.getImageData(0, 0, RWr, RHr), px = d.data;
      /* courbe plus douce que celle de la planche : ce trait-ci est deja net,
         on ne fait que retirer le voile de bloom du rendu. */
      const B = 0.06, H2 = 0.78;
      for(let k = 0; k < px.length; k += 4){
        let a = (px[k] / 255 - B) / (H2 - B);
        a = a < 0 ? 0 : a > 1 ? 1 : a;
        a = a * a * (3 - 2 * a);
        px[k] = MAG[0]; px[k+1] = MAG[1]; px[k+2] = MAG[2]; px[k+3] = (a * 255) | 0;
      }
      c.putImageData(d, 0, 0);
      pretR = true;
    };

    const dessine = f => {
      const i = cl(Math.round(f), 0, N - 1);
      if(i === vue) return;
      vue = i;
      const sx = (i % COLS) * TW, sy = ((i / COLS) | 0) * TH;
      if(cxP && pretP) dessinePlein(sx, sy);
      /* `pretR` suffit desormais a entrer ici : en mode LEGER la planche
         filaire n'est jamais chargee (pretF reste false) mais la pose de
         repos, elle, doit continuer a s'afficher puis a s'effacer. */
      if(cxF && (pretF || pretR)){
        cxF.clearRect(0, 0, CW, CW);
        const w = pretR ? cl((REPOS_FIN + REPOS_FONDU - i) / REPOS_FONDU, 0, 1) : 0;
        /* `&& pretF` : sans planche filaire, cette branche est simplement
           sautee. Le filaire de repos s'efface donc en fondu aux images 17
           a 20 et plus rien ne le remplace — la rotation se joue en plein
           seul. C'est la degradation voulue, pas un manque. */
        if(w < 1 && pretF){
          cxF.globalAlpha = 1 - w;
          cxF.drawImage(repeins(sx, sy), 0, 0, RW, RH, DX, DY, DW, DH);
        }
        if(w > 0){
          cxF.globalAlpha = w;
          cxF.drawImage(reposCv, 0, 0, reposCv.width, reposCv.height, DX, DY, DW, DH);
        }
        cxF.globalAlpha = 1;
      }
    };

    /* --- LE GLITCH ---------------------------------------------------------
       Une fois la rotation finie, l'ampoule levee, la figurine decroche par
       a-coups : des tranches horizontales glissent, et deux copies decalees en
       rouge et en cyan passent par-dessus.

       Deux regles apprises au banc d'essai :
       - un glitch se lit a ~14 images/seconde, pas a 60. A 60 il devient lisse
         et cesse de ressembler a une panne. On avance donc par setTimeout.
       - pas de rAF permanent : rien ne tourne tant qu'on n'est pas au bout de
         la piste, et tout s'arrete des qu'on remonte. */
    /* Le glitch remplit le temps d'arret : il demarre des que la rotation est
       finie et tient jusqu'au bout de la piste. */
    const GLITCH_A = FIN + 0.02;
    let horloge = null, prochaine = null, actif = false;

    const glitchImage = () => {
      if(!cxP || !pretP) return;
      const i = cl(Math.round(derniere), 0, N - 1);
      const sx = (i % COLS) * TW, sy = ((i / COLS) | 0) * TH;
      dessinePlein(sx, sy);

      const n = 5 + ((Math.random() * 4) | 0);
      for(let b = 0; b < n; b++){
        const h  = TH * (0.04 + Math.random() * 0.13);
        const y  = Math.random() * (TH - h);
        const dxb = (Math.random() - 0.5) * DW * 0.16;
        cxP.drawImage(bmP || plein, sx, sy + y, TW, h,
                      DX + dxb, DY + y * (DH / TH), DW, h * (DH / TH));
      }
      const ec = DW * (0.012 + Math.random() * 0.02);
      cxP.globalCompositeOperation = 'lighter';
      cxP.globalAlpha = 0.55;
      cxP.filter = 'url(#pxRouge)';
      cxP.drawImage(bmP || plein, sx, sy, TW, TH, DX - ec, DY, DW, DH);
      cxP.filter = 'url(#pxCyan)';
      cxP.drawImage(bmP || plein, sx, sy, TW, TH, DX + ec, DY, DW, DH);
      cxP.filter = 'none';
      cxP.globalAlpha = 1;
      cxP.globalCompositeOperation = 'source-over';
    };

    const finDeSalve = () => {
      horloge = null;
      const i = cl(Math.round(derniere), 0, N - 1);
      dessinePlein((i % COLS) * TW, ((i / COLS) | 0) * TH);
      if(actif) prochaine = setTimeout(salve, 900 + Math.random() * 2200);
    };
    const salve = () => {
      if(!actif) return;
      let reste = 2 + ((Math.random() * 3) | 0);
      const pas = () => {
        if(!actif) return;
        glitchImage();
        if(--reste > 0) horloge = setTimeout(pas, 70);
        else horloge = setTimeout(finDeSalve, 70);
      };
      pas();
    };
    const arreteGlitch = () => {
      actif = false;
      if(horloge){ clearTimeout(horloge); horloge = null; }
      if(prochaine){ clearTimeout(prochaine); prochaine = null; }
      vue = -1;
    };
    this.cleanups.push(arreteGlitch);
    /* Les deux planches decodees une fois pour toutes, puis les <img>
       liberes (une image 1x1 en data-URI : `src = ''` relancerait une
       requete vers la page courante). Si createImageBitmap manque ou
       echoue, on garde les <img> : degrade, pas casse. */
    const enBitmap = () => {
      /* En mode LEGER on n'attend PAS pretF : la planche filaire ne viendra
         jamais. Sans cette exception on resterait bloque ici, bmP ne serait
         jamais cree, et la planche pleine resterait une <img> que le
         navigateur est libre de redecoder en plein defilement — precisement
         la saccade que createImageBitmap etait la pour supprimer. */
      if(bmP || !pretP || (!pretF && !LEGER) || !window.createImageBitmap) return;
      const VIDE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
      if(LEGER){
        createImageBitmap(plein)
          .then(a => {
            bmP = a;
            plein.onload = null;
            plein.src = VIDE;
            vue = -1; dessine(derniere);
          })
          .catch(() => {});
        return;
      }
      Promise.all([createImageBitmap(plein), createImageBitmap(fil)])
        .then(([a, b]) => {
          bmP = a; bmF = b;
          plein.onload = fil.onload = null;
          plein.src = fil.src = VIDE;
          vue = -1; dessine(derniere);
        })
        .catch(() => {});
    };
    plein.onload = () => { pretP = true; vue = -1; dessine(derniere); enBitmap(); };
    fil.onload   = () => { pretF = true; vue = -1; dessine(derniere); enBitmap(); };
    /* Noms versionnes : une planche precedente avait des tuiles de 235 px de
       large. Lue avec TW = 332, elle derive vers la droite d'image en image —
       c'est exactement le decalage qu'on voyait. Un nom neuf coupe court a
       tout cache navigateur qui trainerait. */
    repos.onload = () => { preparerRepos(); vue = -1; dessine(derniere); };
    /* ?light=hero : on ne pose meme pas les src. Sans chargement, pretP et
       pretF restent false, dessine() sort tout de suite et enBitmap() ne
       decode rien. Aucun autre chemin de code ne change. */
    if(!ALLEGE('hero')){
      plein.src = '/assets/perso-tour-v2.webp';
      /* LEGER : la ligne suivante est LA correction. Ne pas poser ce src,
         c'est economiser 1,5 Mo de telechargement, 54 Mo de memoire, et
         toutes les executions de repeins(). */
      if(!LEGER) fil.src = '/assets/perso-filaire-v2.webp';
      repos.src = '/assets/filaire-repos.webp';
    }

    const sparks = hv.querySelector('[data-scansparks]');
    if(sparks && !sparks.childElementCount){
      for(let i = 0; i < 20; i++){
        const e = document.createElement('i');
        const t = 2.6 + (i * 7 % 5) * 0.9;
        e.style.left   = (4 + (i * 37) % 92) + '%';
        e.style.width  = 'calc(' + t.toFixed(1) + '*var(--u))';
        e.style.height = 'calc(' + t.toFixed(1) + '*var(--u))';
        e.style.boxShadow = '0 0 calc(' + (t * 2.6).toFixed(1) + '*var(--u)) calc(' + (t * 0.6).toFixed(1) + '*var(--u)) rgba(255,60,205,.85)';
        e.style.setProperty('--dx', 'calc(' + (((i * 53) % 17) - 8) + '*var(--u))');
        e.style.setProperty('--dy', 'calc(' + (-14 - ((i * 29) % 22)) + '*var(--u))');
        e.style.setProperty('--dur', (1.6 + ((i * 13) % 9) * 0.22).toFixed(2) + 's');
        e.style.setProperty('--del', '-' + (((i * 17) % 23) * 0.13).toFixed(2) + 's');
        sparks.appendChild(e);
      }
    }

    /* Les poussieres de lumiere autour de l'ampoule. Meme methode que les
       etincelles du balayage : engendrees une fois, reparties par une suite
       deterministe plutot qu'au hasard, pour que deux chargements donnent la
       meme scene. Elles montent, donc --dy est toujours negatif. */
    const ampoule = hv.querySelector('[data-ampoule]');
    if(ampoule && !ampoule.childElementCount){
      /* Deux familles : la poussiere fine, nombreuse et lente, et quelques
         braises — plus grosses, plus chaudes, elles montent plus vite. Une
         seule taille donnait une pluie reguliere, qui se lit comme un motif. */
      for(let i = 0; i < 30; i++){
        const e = document.createElement('i');
        const braise = (i % 6 === 1);
        /* diametre de la BOITE, en --u. Le degrade s'eteint a 74 % du rayon,
           donc ce qu'on voit fait environ les trois quarts de ces valeurs. */
        const t = braise ? 2.6 + (i * 7 % 3) * 0.5
                         : 1.3 + (i * 5 % 4) * 0.32;
        const ang = (i * 137.5) * Math.PI / 180;        /* angle d'or : ca ne fait pas de paquet */
        const ray = 10 + (i * 11 % 21);                 /* distance au centre, en % */
        e.style.left   = (50 + Math.cos(ang) * ray * 0.9).toFixed(1) + '%';
        e.style.top    = (52 + Math.sin(ang) * ray * 0.7).toFixed(1) + '%';
        e.style.width  = 'calc(' + t.toFixed(2) + '*var(--u))';
        e.style.height = 'calc(' + t.toFixed(2) + '*var(--u))';
        /* un voile de flou propre a chaque particule : plus elle est grosse,
           plus elle est diffuse. C'est ce qui l'empeche de se lire comme un
           objet pose sur l'image. */
        e.style.filter = 'blur(calc(' + (t * 0.34).toFixed(2) + '*var(--u)))';
        /* la derive laterale change de sens d'une particule a l'autre */
        e.style.setProperty('--dx', 'calc(' + (((i * 47) % 19) - 9) + '*var(--u))');
        e.style.setProperty('--dy', 'calc(' + (braise ? -26 - ((i * 31) % 30) : -14 - ((i * 31) % 26)) + '*var(--u))');
        e.style.setProperty('--dur', (braise ? 2.1 + ((i * 17) % 9) * 0.22
                                             : 2.9 + ((i * 17) % 13) * 0.28).toFixed(2) + 's');
        e.style.setProperty('--del', '-' + (((i * 23) % 37) * 0.19).toFixed(2) + 's');
        ampoule.appendChild(e);
      }
    }

    let p = 0, q = 0, derniere = 0;
    const rendu = () => {
      const s = hv.style;
      /* --lypx : la meme valeur que --ly, mais en pixels absolus. Voir la
         note sur .scanLine dans global.css — les deux couches du balayage
         sont deplacees en transform et non plus en top, pour que le flou
         du halo ne soit pas recalcule a chaque image. Un pourcentage dans
         un translate se resoudrait sur la taille de l'element et non sur
         celle du conteneur : il faut donc des pixels. */

      /* Naissance : rien n'est visible au premier pixel. */
      s.setProperty('--nait', cl(p / NAIT, 0, 1).toFixed(3));

      /* Rotation : elle démarre un peu après la naissance et occupe le reste. */
      derniere = cl((p - TOUR0) / (FIN - TOUR0), 0, 1) * (N - 1);
      dessine(derniere);

      /* Balayage : mécanique inchangée, seulement réétalonnée sur la piste. */
      q = cl((p - SCAN_A) / (SCAN_B - SCAN_A), 0, 1);
      const line = TOP - BAND - FADE + q * ((BOT + BAND + FADE * 2) - (TOP - BAND - FADE));
      const sa = cl(line - BAND, 0, 1), sb = cl(line, 0, 1);
      s.setProperty('--sa', pct(sa));
      s.setProperty('--sb', pct(sb < sa + 0.001 ? sa + 0.001 : sb));
      s.setProperty('--ha', pct(cl(line - BAND - FADE, 0, 1)));
      s.setProperty('--hb', pct(cl(line - BAND, 0, 1)));
      s.setProperty('--hc', pct(cl(line, 0, 1)));
      s.setProperty('--hd', pct(cl(line + FADE, 0, 1)));
      s.setProperty('--ly', pct(cl(line, 0, 1)));
      s.setProperty('--lypx', (cl(line, 0, 1) * hvH).toFixed(1) + 'px');
      /* le trait s'allume en arrivant sur les cheveux et s'éteint avec les
         pieds, au lieu d'apparaître et de disparaître d'un coup. */
      const entree = cl(q / 0.10, 0, 1), sortie = cl((1 - q) / 0.16, 0, 1);
      s.setProperty('--lo', (entree * sortie).toFixed(3));
      s.setProperty('--footo', String(cl((line - 0.80) / 0.10, 0, 1)));
      if(q < 0.985) s.setProperty('--cr', '0%');

      /* La pose est tenue : les reflets de lunettes s'allument. */
      hv.classList.toggle('pose-tenue', p >= FIN);

      /* le glitch ne vit qu'au bout de la piste, ampoule levee */
      const veut = p >= GLITCH_A && !reduit;
      if(veut && !actif){ actif = true; prochaine = setTimeout(salve, 260); }
      else if(!veut && actif){ arreteGlitch(); dessine(derniere); }
    };

    let file = false;
    const auScroll = () => {
      file = false;
      p = cl((window.scrollY || 0) / course(), 0, 1);
      rendu();
    };
    /* Une seule image par frame : le scroll peut tirer des dizaines
       d'évènements, on ne redessine qu'une fois. */
    const queue = () => { if(file) return; file = true; requestAnimationFrame(auScroll); };
    this.on(window, 'scroll', queue, {passive: true});
    this.on(window, 'resize', () => { mesureHv(); queue(); }, {passive: true});
    auScroll();

    /* le curseur devient le scanner, une fois le personnage matérialisé */
    if(window.matchMedia('(pointer:fine)').matches){
      let attente = null;
      this.on(window, 'pointermove', e => {
        if(q < 0.985){ hv.style.setProperty('--cr', '0%'); return; }
        const r = hv.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        if(x < -0.15 || x > 1.15 || y < -0.15 || y > 1.15){ hv.style.setProperty('--cr', '0%'); return; }
        if(attente) return;
        attente = requestAnimationFrame(() => {
          attente = null;
          hv.style.setProperty('--cx', (x * 100).toFixed(2) + '%');
          hv.style.setProperty('--cy', (y * 100).toFixed(2) + '%');
          hv.style.setProperty('--cr', RAYON);
        });
      }, {passive: true});
    }
  }

  rhythmSetup(){
    const bar = this.q('[data-bar]'), progress = this.q('[data-progress]');
    const steps = this.q('[data-steps]'), gal = this.q('[data-gallery]');
    /* `data-floater` marque les deux grands visuels — reveals() s'en sert
       pour les fondre SANS transform, puisqu'ils en portent deja un. On ne
       pose donc pas cet attribut sur la colonne de texte : elle serait
       entree dans ce lot et aurait recu un fondu de bloc en plus du fondu
       echelonne de ses propres paragraphes. Elle porte `data-par` seul, et
       la parallaxe accepte les deux marqueurs. */
    const floaters = Array.from(new Set(this.qa('[data-floater]').concat(this.qa('[data-par]'))));
    let tick = false;
    const rhythm = () => {
      tick = false;
      const vh = window.innerHeight;
      if(bar){
        const doc = document.documentElement.scrollHeight - vh;
        bar.style.width = (doc > 0 ? (window.scrollY / doc) * 100 : 0).toFixed(2) + '%';
        if(progress) progress.style.opacity = '1';
      }
      if(steps){
        const r = steps.getBoundingClientRect();
        const d = (vh*.85 - r.top) / (vh*.45);
        steps.style.setProperty('--draw', Math.max(0, Math.min(1, d)).toFixed(3));
      }
      floaters.forEach(el => {
        const b = el.getBoundingClientRect();
        if(b.bottom < -200 || b.top > vh + 200) return;
        const c = (b.top + b.height/2 - vh/2) / vh;
        /* Amplitude par element, en px, via data-par. 34 reste la valeur
           d'origine et donc le defaut : la photo de Contact ne bouge pas.
           Un nombre NEGATIF inverse le sens — c'est ce qui permet de faire
           descendre une colonne pendant que l'autre monte. La parallaxe
           est un ecart, pas un deplacement : deux elements qui vont en
           sens contraire se lisent bien plus que le double du meme
           mouvement, et aucun des deux ne quitte sa boite. */
        const amp = parseFloat(el.dataset.par);
        /* Arrondi au pixel entier, et pas au dixieme comme avant. Depuis
           que des colonnes de TEXTE bougent aussi (A propos, formulaire de
           Contact), une translation sous-pixel fait rendre le texte entre
           deux pixels : sur certaines cartes graphiques il devient flou
           pendant tout le defilement. Un pas de 1 px sur 150 px de course
           ne se voit pas ; du texte flou, si. */
        el.style.setProperty('--ty', Math.round(c * -(isNaN(amp) ? 34 : amp)) + 'px');
      });
    };
    const queue = () => {
      if(typeof requestAnimationFrame !== 'function'){ rhythm(); return; }
      if(tick) return;
      tick = true;
      requestAnimationFrame(rhythm);
      setTimeout(() => { if(tick) rhythm(); }, 120);
    };
    this.on(window, 'scroll', queue, {passive:true});
    this.on(window, 'resize', queue);
    /* Sur le tick de Lenis, pas seulement sur l'evenement 'scroll' : celui-ci
       arrive apres l'ecriture de la position, donc queue() renverrait le
       calcul a la frame suivante. Une frame de retard passait inapercue a
       34 px d'amplitude ; a 64 px elle se voit, la photo semble tirer sur
       le texte. Ici les deux bougent sur la meme image. */
    if(this.lenis){
      this.lenis.on('scroll', rhythm);
      this.cleanups.push(() => { if(this.lenis) this.lenis.off('scroll', rhythm); });
    }
    rhythm();
    setTimeout(rhythm, 500);
  }

  /* ==========================================================================
     ENVOI DU FORMULAIRE — 28/08

     AVANT : on fabriquait un lien `mailto:` et on poussait le visiteur dans sa
     messagerie avec le message pre-rempli. Ca paraissait malin, ca ne l'etait
     pas. Sur telephone sans appli mail configuree, il ne se passe rien du
     tout. Sur ordinateur chez quelqu'un qui lit son courrier dans son
     navigateur, rien non plus. Et meme quand ca marche, il reste au visiteur
     un « Envoyer » a cliquer dans SA messagerie — beaucoup ne le font pas.
     Autrement dit : des demandes perdues sans qu'aucune erreur ne s'affiche,
     ni pour lui ni pour nous. En prime l'adresse etait en clair dans le code,
     donc aspirable par les robots.

     MAINTENANT : un vrai envoi, en arriere-plan, vers Web3Forms — un relais
     qui poste le message dans la boite Gmail de Redha. Le visiteur ne quitte
     jamais la page et n'a plus rien a faire.

     La cle d'acces est PUBLIQUE par construction : sur un site statique il n'y
     a pas de serveur ou la cacher, et c'est le modele assume du service. Elle
     ne donne acces a rien — elle ne fait que router vers une adresse qui, elle,
     n'apparait nulle part. Le seul risque est le spam : c'est le role du champ
     piege `botcheck` pose dans le formulaire.
     ========================================================================== */
  submit(e){
    e.preventDefault();
    const form = e.target, f = form.elements, msg = this.q('[data-formmsg]');
    const bad = [];
    ['nom','prenom','email','message'].forEach(n => {
      const el = f[n];
      const ok = el.value.trim() !== '' && (n !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim()));
      el.style.borderBottomColor = ok ? 'rgba(255,255,255,.18)' : '#FF4D4D';
      if(!ok) bad.push(el);
    });
    if(bad.length){
      msg.textContent = 'Merci de remplir les champs en rouge.';
      msg.style.color = '#FF6B6B';
      bad[0].focus();
      return;
    }
    /* Le robot est tombe dans le piege : on fait comme si tout allait bien.
       Lui dire qu'il a ete repere, c'est lui apprendre a contourner. */
    if(f.botcheck && f.botcheck.checked){
      msg.style.color = 'var(--pink-b)';
      msg.textContent = 'Message envoyé.';
      form.reset();
      return;
    }
    /* Double envoi : le bouton est desarme le temps de la requete. Sans ca,
       un double clic sur une connexion lente envoie deux fois le meme
       message — et c'est exactement ce que fait quelqu'un quand rien ne
       repond dans la seconde. */
    const btn = form.querySelector('button[type="submit"]');
    if(btn && btn.disabled) return;
    const libelle = btn ? btn.innerHTML : '';
    if(btn){ btn.disabled = true; btn.style.opacity = '.6'; btn.style.cursor = 'wait'; btn.textContent = 'Envoi…'; }
    msg.style.color = 'var(--pink-b)';
    msg.textContent = 'Envoi en cours…';

    const rendreLeBouton = () => {
      if(!btn) return;
      btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = '';
      btn.innerHTML = libelle;
      /* le bouton porte l'effet magnetique : son transform vit dans --mx,
         ecrit par parallax(). innerHTML le recree a l'identique, il n'y a
         donc rien a raccrocher — l'ecouteur est sur le bouton, pas sur son
         contenu. */
    };

    const donnees = {
      access_key: '90de4956-bb6f-4bb1-a6a0-e516828e6bc4',
      /* `subject` est le sujet du mail que Redha recoit : on prefixe pour que
         ces messages se reperent d'un coup d'oeil dans une boite Gmail. */
      subject: 'Pixovery — ' + (f.sujet.value.trim() || 'Nouveau message du site'),
      from_name: 'Site Pixovery',
      /* `name` et `email` sont les deux champs que le service reconnait :
         email devient le « Repondre a » du mail, donc un clic sur Repondre
         ecrit directement au visiteur. */
      name: (f.nom.value.trim() + ' ' + f.prenom.value.trim()).trim(),
      email: f.email.value.trim(),
      Sujet: f.sujet.value.trim() || '(non precise)',
      message: f.message.value.trim()
    };

    /* Pas de `mode:'no-cors'` : on VEUT lire la reponse. Sans elle on ne
       saurait pas distinguer un envoi reussi d'un echec, et on afficherait
       « message envoye » a quelqu'un dont le message s'est perdu. */
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: JSON.stringify(donnees)
    })
    .then(r => r.json())
    .then(d => {
      rendreLeBouton();
      if(d && d.success){
        msg.style.color = 'var(--pink-b)';
        msg.textContent = 'Message envoyé.';
        form.reset();
      } else {
        echec(msg);
      }
    })
    .catch(() => { rendreLeBouton(); echec(msg); });

    /* Un echec ne doit JAMAIS etre un cul-de-sac : si le relais est en panne
       ou si le visiteur est hors ligne, on lui donne l'adresse en clair pour
       qu'il puisse ecrire quand meme. C'est le seul endroit du site ou elle
       apparait, et seulement en cas de panne. */
    function echec(m){
      m.style.color = '#FF6B6B';
      m.textContent = "L'envoi a échoué. Écrivez-moi directement à pixovery@gmail.com.";
    }
  }


  render(){
    return (
      <div ref={this.rootRef} style={{background: "#000", position: "relative"}}>

        <div data-intro="1" style={{position: "fixed", inset: "0", zIndex: "1000", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "calc(26*var(--u))", transition: "opacity .6s ease, visibility .6s"}}>
          <div><img src="/assets/img01.webp" alt="Pixovery" style={{height: "calc(34*var(--u))", width: "auto", opacity: "0", transform: "translateY(calc(14*var(--u)))", animation: "intro-mark .9s cubic-bezier(.16,1,.3,1) .15s forwards"}} width="1106" height="220" decoding="async" /></div>
          <div style={{width: "calc(150*var(--u))", height: "1px", background: "rgba(255,255,255,.14)", overflow: "hidden"}}><i style={{display: "block", height: "100%", width: "100%", background: "linear-gradient(90deg,var(--violet-b),var(--pink))", transform: "scaleX(0)", transformOrigin: "left", animation: "intro-bar 1.15s cubic-bezier(.65,0,.35,1) .2s forwards"}}></i></div>
        </div>

        <div aria-hidden="true" style={{position: "fixed", inset: "-50%", zIndex: "900", pointerEvents: "none", opacity: ".055", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")", animation: "grain-shift 8s steps(6) infinite", left: "-788px", top: "-474px"}}></div>

        <div data-hotzone="1" aria-hidden="true" style={{position: "fixed", top: "0", left: "0", right: "0", height: "calc(70*var(--u))", zIndex: "99"}}></div>
        <header data-hdr="1" style={{position: "fixed", top: "0", left: "0", right: "0", zIndex: "100", height: "calc(76*var(--u))", display: "flex", alignItems: "center", transform: "translateY(-110%)", opacity: "0", transition: "transform .35s cubic-bezier(.22,1,.36,1), opacity .3s ease, background .3s ease, backdrop-filter .3s ease"}}>
          <div data-progress="1" aria-hidden="true" style={{position: "absolute", left: "0", right: "0", bottom: "0", height: "1px", background: "rgba(255,255,255,.07)", transition: "opacity .4s ease"}}><i data-bar="1" style={{display: "block", height: "100%", width: "0", background: "linear-gradient(90deg,var(--violet-b),var(--pink))"}}></i></div>
          <div style={{width: "calc(1024*var(--u))", margin: "0 auto", position: "relative", display: "grid", alignItems: "center", gridTemplateColumns: "1fr auto 1fr", boxSizing: "border-box", paddingLeft: "calc(82*var(--u))", paddingRight: "calc(82*var(--u))"}}>
            <span style={{display: "block", lineHeight: "0"}}><img src="/assets/logo-pixovery.webp" alt="Pixovery" style={{display: "block", height: "calc(22*var(--u))", width: "auto"}} width="1106" height="220" decoding="async" /></span>
            <nav data-nav="1" onClick={() => { document.documentElement.classList.remove('menu-ouvert'); const b = document.querySelector('[data-burger]'); if(b) b.setAttribute('aria-expanded','false'); }} style={{display: "flex", alignItems: "center", justifyContent: "center", gap: "calc(22*var(--u))"}}>
              <a href="#accueil" style={{position: "relative", fontSize: "calc(9.5*var(--tu))", fontWeight: "500", letterSpacing: "calc(1.1*var(--u))", textTransform: "uppercase", color: "var(--nav)", transition: "color .25s ease"}}>Accueil<i style={{position: "absolute", left: "0", right: "0", bottom: "calc(-6*var(--u))", height: "1px", background: "var(--pink-b)", transform: "scaleX(0)", transformOrigin: "right", transition: "transform .45s cubic-bezier(.16,1,.3,1)"}}></i></a>
              <a href="#services" style={{position: "relative", fontSize: "calc(9.5*var(--tu))", fontWeight: "500", letterSpacing: "calc(1.1*var(--u))", textTransform: "uppercase", color: "var(--nav)", transition: "color .25s ease"}}>Services<i style={{position: "absolute", left: "0", right: "0", bottom: "calc(-6*var(--u))", height: "1px", background: "var(--pink-b)", transform: "scaleX(0)", transformOrigin: "right", transition: "transform .45s cubic-bezier(.16,1,.3,1)"}}></i></a>
              <a href="#portfolio" style={{position: "relative", fontSize: "calc(9.5*var(--tu))", fontWeight: "500", letterSpacing: "calc(1.1*var(--u))", textTransform: "uppercase", color: "var(--nav)", transition: "color .25s ease"}}>Portfolio<i style={{position: "absolute", left: "0", right: "0", bottom: "calc(-6*var(--u))", height: "1px", background: "var(--pink-b)", transform: "scaleX(0)", transformOrigin: "right", transition: "transform .45s cubic-bezier(.16,1,.3,1)"}}></i></a>
              <a href="#apropos" style={{position: "relative", fontSize: "calc(9.5*var(--tu))", fontWeight: "500", letterSpacing: "calc(1.1*var(--u))", textTransform: "uppercase", color: "var(--nav)", transition: "color .25s ease"}}>À propos<i style={{position: "absolute", left: "0", right: "0", bottom: "calc(-6*var(--u))", height: "1px", background: "var(--pink-b)", transform: "scaleX(0)", transformOrigin: "right", transition: "transform .45s cubic-bezier(.16,1,.3,1)"}}></i></a>
              <a href="#contact" style={{position: "relative", fontSize: "calc(9.5*var(--tu))", fontWeight: "500", letterSpacing: "calc(1.1*var(--u))", textTransform: "uppercase", color: "var(--nav)", transition: "color .25s ease"}}>Contact<i style={{position: "absolute", left: "0", right: "0", bottom: "calc(-6*var(--u))", height: "1px", background: "var(--pink-b)", transform: "scaleX(0)", transformOrigin: "right", transition: "transform .45s cubic-bezier(.16,1,.3,1)"}}></i></a>
            </nav>
              {/* Menu mobile. Le bouton n'existe visuellement que sous 769px
                  (CSS : bloc « MENU MOBILE » de global.css). Il bascule la classe
                  menu-ouvert sur <html> — pas d'etat React, donc aucun rendu
                  supplementaire et aucune interaction avec les methodes de la
                  classe. Le onClick du <nav> ci-dessus la retire : choisir une
                  entree ferme le panneau et laisse l'ancre faire son travail. */}
              <button data-burger="1" type="button" aria-label="Menu" aria-expanded="false"
                onClick={(e) => { const ouvert = document.documentElement.classList.toggle('menu-ouvert'); e.currentTarget.setAttribute('aria-expanded', ouvert ? 'true' : 'false'); }}>
                <i></i><i></i><i></i>
              </button>
          </div>
        </header>

        <i data-lightveil="1" aria-hidden="true" style={{position: "fixed", inset: "0", zIndex: "990", pointerEvents: "none", opacity: "0"}}></i>
        <i data-lightwarm="1" aria-hidden="true" style={{position: "fixed", inset: "0", zIndex: "991", pointerEvents: "none", mixBlendMode: "screen", opacity: "0"}}></i>

        <div data-heropiste="1">
        <section id="accueil" data-hero="1" data-screen-label="Hero" style={{height: "100vh", minHeight: "calc(560*var(--u))", background: "#000", scrollMarginTop: "0"}}>
          <i data-plane="1" data-k=".2" aria-hidden="true" style={{position: "absolute", inset: "-14%", pointerEvents: "none", zIndex: "0", filter: "blur(calc(36*var(--u)))", willChange: "transform", background: "radial-gradient(50% 60% at 71% 47%, rgba(122,1,255,.20) 0%, rgba(122,1,255,.07) 38%, rgba(0,0,0,0) 65%)"}}></i>
          <i data-floor="1" data-plane="1" data-k=".36" aria-hidden="true" style={{position: "absolute", left: "0", right: "0", bottom: "0", height: "46%", pointerEvents: "none", zIndex: "0", background: "radial-gradient(72% 100% at 62% 118%, rgba(122,1,255,.30) 0%, rgba(122,1,255,.13) 34%, rgba(122,1,255,.04) 60%, rgba(0,0,0,0) 82%)"}}></i>
          <i data-floor="2" aria-hidden="true" style={{position: "absolute", left: "0", right: "0", bottom: "0", height: "20%", pointerEvents: "none", zIndex: "0", background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,.55) 55%, #000 100%)"}}></i>
          <div style={{width: "calc(1024*var(--u))", margin: "0 auto", position: "relative", height: "100%"}}>
            <div data-herocopy="1" style={{position: "absolute", left: "calc(82*var(--u))", top: "50%", width: "calc(370*var(--u))", transform: "translateY(calc(-50% + var(--cpy,0px)))", willChange: "transform"}}>
              <h1 style={{margin: "0", fontWeight: "800", fontSize: "calc(67*var(--tu))", lineHeight: "calc(70*var(--tu))", textTransform: "uppercase", color: "#fff", letterSpacing: "0"}}>
                <span style={{display: "block", overflow: "hidden", paddingBottom: ".04em"}}><i data-ln="1" style={{display: "block", fontStyle: "normal", transform: "translateY(112%)", transition: "transform 1.15s cubic-bezier(.16,1,.3,1) .05s"}}>Faisons</i></span>
                <span style={{display: "block", overflow: "hidden", paddingBottom: ".04em"}}><i data-ln="2" style={{display: "block", fontStyle: "normal", transform: "translateY(112%)", transition: "transform 1.15s cubic-bezier(.16,1,.3,1) .15s"}}>décoller</i></span>
                <span style={{display: "block", overflow: "hidden", paddingBottom: ".04em"}}><i data-ln="3" style={{display: "block", fontStyle: "normal", transform: "translateY(112%)", transition: "transform 1.15s cubic-bezier(.16,1,.3,1) .25s"}}>vos <em style={{fontStyle: "normal", color: "var(--violet-b)"}}>idées</em></i></span>
              </h1>
              <p data-heroline="p" style={{margin: "calc(28*var(--u)) 0 0", maxWidth: "calc(370*var(--u))", fontSize: "calc(14.5*var(--tu))", lineHeight: "calc(24*var(--tu))", color: "rgba(255,255,255,.95)", opacity: "0", transform: "translateY(calc(16*var(--u)))", transition: "opacity .9s ease .45s, transform .9s cubic-bezier(.16,1,.3,1) .45s"}}>
                Graphiste freelance — Genève, France et à distance.<br />
                Logo, identité visuelle et direction artistique.
              </p>
              <a href="#portfolio" data-heroline="btn" style={{display: "inline-flex", alignItems: "center", justifyContent: "space-between", background: "#E2006B", color: "#fff", borderRadius: "calc(12*var(--u))", whiteSpace: "nowrap", fontSize: "calc(12*var(--tu))", fontWeight: "600", letterSpacing: "calc(.8*var(--u))", textTransform: "uppercase", marginTop: "calc(38*var(--u))", minWidth: "calc(223*var(--u))", height: "calc(44*var(--u))", padding: "0 calc(24*var(--u))", opacity: "0", transform: "translate(var(--mx,0px),calc(16*var(--u)))", transition: "opacity .9s ease .58s, transform .9s cubic-bezier(.16,1,.3,1) .58s, background .25s ease, box-shadow .3s cubic-bezier(.16,1,.3,1)"}}>Voir mes projets <span style={{marginLeft: "calc(14*var(--u))", fontSize: "calc(13*var(--tu))", lineHeight: "1"}}>→</span></a>
            </div>

            <div data-herovisual="1" style={{position: "absolute", left: "calc(431*var(--u))", top: "50%", width: "calc(566*var(--u))", height: "calc(566*var(--u))", transform: "translate(var(--px,0px), calc(-50% + var(--py,0px))) scale(var(--sc,1))", willChange: "transform"}}>
              <i data-spot="1" data-plane="1" data-k="-.45" aria-hidden="true" style={{position: "absolute", inset: "-25%", pointerEvents: "none", willChange: "transform", zIndex: "0", background: "radial-gradient(34% 34% at 64.7% 53%, rgba(143,43,255,.22) 0%, rgba(122,1,255,.11) 36%, rgba(122,1,255,.04) 60%, rgba(0,0,0,0) 80%)", filter: "blur(calc(22*var(--u)))"}}></i>
            <i data-ground="1" aria-hidden="true" style={{position: "absolute", left: "-24%", right: "-24%", top: "84%", height: "42%", pointerEvents: "none", zIndex: "0", background: "radial-gradient(46% 44% at 50% 22%, rgba(158,74,255,.24) 0%, rgba(126,10,255,.11) 40%, rgba(122,1,255,.035) 64%, rgba(0,0,0,0) 82%)", filter: "blur(calc(18*var(--u)))"}}></i>
            <i data-shade="pot-soft" aria-hidden="true" style={{position: "absolute", left: "1%", top: "86.4%", width: "44%", height: "7.8%", pointerEvents: "none", zIndex: "0", background: "radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,.50) 0%, rgba(0,0,0,.27) 42%, rgba(0,0,0,.11) 64%, rgba(0,0,0,0) 80%)", filter: "blur(calc(9*var(--u)))"}}></i>
            <i data-shade="feet-soft" aria-hidden="true" style={{position: "absolute", left: "48.5%", top: "86.6%", width: "38%", height: "7.4%", pointerEvents: "none", zIndex: "0", background: "radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,.50) 0%, rgba(0,0,0,.27) 42%, rgba(0,0,0,.11) 64%, rgba(0,0,0,0) 80%)", filter: "blur(calc(8*var(--u)))"}}></i>
            <i data-shade="pot-core" aria-hidden="true" style={{position: "absolute", left: "8.5%", top: "87.5%", width: "29%", height: "3.4%", pointerEvents: "none", zIndex: "0", background: "radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,.66) 0%, rgba(0,0,0,.34) 45%, rgba(0,0,0,0) 78%)", filter: "blur(calc(4*var(--u)))"}}></i>
            <i data-shade="feet-core" aria-hidden="true" style={{position: "absolute", left: "55.5%", top: "87.7%", width: "24%", height: "3.2%", pointerEvents: "none", zIndex: "0", background: "radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,.66) 0%, rgba(0,0,0,.34) 45%, rgba(0,0,0,0) 78%)", filter: "blur(calc(3.5*var(--u)))"}}></i>
              <img className="potSolide" src="/assets/pot-solide.webp" alt="" width="1100" height="1100" decoding="async" fetchpriority="high" />
              <canvas data-ch="a" data-perso="plein" className="scanSolid" width="550" height="550" role="img" aria-label="Pixovery — la figurine de Redha Devarenne et son pot à crayons"></canvas>
              <div className="scanWrap" aria-hidden="true"><canvas className="scanWire" data-perso="fil" width="550" height="550"></canvas><i className="scanGrid"></i></div>
              <svg width="0" height="0" aria-hidden="true" style={{position: "absolute"}}>
                <filter id="pxRouge" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" /></filter>
                <filter id="pxCyan"  colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" /></filter>
              </svg>
              <i className="scanSparks" data-scansparks="1" aria-hidden="true"></i>
              <i className="scanLineGlow" aria-hidden="true"></i>
              <i className="scanLine" aria-hidden="true"></i>
              <i data-verre="g" aria-hidden="true"></i>
              <i data-verre="d" aria-hidden="true"></i>
              <i data-ampoule="1" aria-hidden="true"></i>
            </div>

          {/* L'INVITE A DEFILER. Tout le hero est desormais pilote par le
              scroll : au premier pixel, la scene est vide. Sans un signe
              explicite, on peut croire que la page n'a pas fini de charger.
              Elle s'efface d'elle-meme des les premiers pour cent — une
              invite qui reste affichee pendant qu'on defile devient un
              element de decor, et on cesse de la voir. */}
          <i data-cue="1" aria-hidden="true" style={{position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "calc(12*var(--u))", zIndex: "8", pointerEvents: "none", opacity: "1"}}>
            <svg width="21" height="33" viewBox="0 0 21 33" fill="none">
              <rect x="1" y="1" width="19" height="31" rx="9.5" stroke="rgba(255,255,255,.42)" strokeWidth="1.4" />
              <circle className="cueBille" cx="10.5" cy="9.5" r="2.4" fill="#fff" />
            </svg>
            <span style={{fontSize: "calc(9*var(--tu))", fontWeight: "600", letterSpacing: "calc(2.6*var(--u))", textTransform: "uppercase", color: "rgba(255,228,203,.55)"}}>Scroll</span>
          </i>
          </div>
        </section>
        </div>

        <section id="services" data-screen-label="Services" data-piste="services" style={{position: "relative", background: "#000", height: "400vh", scrollMarginTop: "0"}}>
          <div data-colle="1" style={{position: "sticky", top: "0", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center"}}>
          <i aria-hidden="true" style={{position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0", background: "radial-gradient(ellipse calc(460*var(--u)) calc(330*var(--u)) at calc(50% - 145*var(--u)) calc(50% + 15*var(--u)), rgba(143,43,255,.085) 0%, rgba(143,43,255,.032) 42%, rgba(0,0,0,0) 100%)"}}></i>
          <div data-svctete="1" style={{position: "absolute", left: "0", right: "0", top: "calc(84*var(--u))", zIndex: "3", width: "calc(1024*var(--u))", margin: "0 auto"}}>
            <header data-chapter="1" style={{display: "grid", gridTemplateColumns: "calc(52*var(--u)) 1fr", alignItems: "center", columnGap: "calc(20*var(--u))", rowGap: "calc(22*var(--u))", padding: "0 calc(82*var(--u))"}}>
              <span style={{fontSize: "calc(11*var(--tu))", fontWeight: "600", letterSpacing: "calc(2.6*var(--u))", color: "var(--pink-b)"}}>01</span>
              <span data-rule="1" style={{height: "1px", background: "rgba(255,255,255,.16)", transform: "scaleX(0)", transformOrigin: "left", transition: "transform 1.2s cubic-bezier(.16,1,.3,1) .1s"}}></span>
              <h2 style={{margin: "0", gridColumn: "1 / -1", fontWeight: "800", fontSize: "calc(46*var(--tu))", lineHeight: "calc(45*var(--tu))", textTransform: "uppercase", color: "#fff", letterSpacing: "calc(-.4*var(--u))"}}>Mes <em style={{fontStyle: "normal", color: "var(--violet-b)"}}>services</em></h2>
            </header>

            </div>
            <div data-svcrail="1" style={{display: "flex", width: "400vw", willChange: "transform"}}>
              <article data-svc="1" data-panneau="1" style={{flex: "0 0 100vw", width: "100vw", height: "100vh", position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1fr) calc(240*var(--u))", gridAutoRows: "min-content", alignContent: "center", alignItems: "center", columnGap: "calc(50*var(--u))", padding: "calc(150*var(--u)) calc((100vw - 1024*var(--u))/2 + 82*var(--u)) calc(120*var(--u))", boxSizing: "border-box"}}>
                <i data-svcwash="1" style={{position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "0", background: "radial-gradient(ellipse calc(300*var(--u)) calc(330*var(--u)) at calc(50% + 315*var(--u)) calc(50% + 15*var(--u)), rgba(143,43,255,.26) 0%, rgba(122,1,255,.13) 34%, rgba(122,1,255,.045) 62%, rgba(0,0,0,0) 100%)", opacity: "0", transition: "opacity 1s ease"}}></i>
                <span data-svcnum="1" style={{position: "relative", zIndex: "1", gridColumn: "1", fontWeight: "800", fontSize: "calc(110*var(--tu))", lineHeight: ".8", letterSpacing: "calc(-3*var(--u))", color: "var(--pink-b)", WebkitTextStroke: "0", display: "block", marginBottom: "calc(16*var(--u))", transition: "color .8s ease"}}>01</span>
                <h3 data-svch="1" style={{position: "relative", zIndex: "1", fontWeight: "700", fontSize: "calc(38*var(--tu))", lineHeight: "1.04", color: "#fff", letterSpacing: "calc(-.6*var(--u))", gridColumn: "1", margin: "0 0 calc(18*var(--u))", transition: "transform .55s cubic-bezier(.16,1,.3,1)"}}>Identité visuelle &amp; logo</h3>
                <p data-svcp="1" style={{position: "relative", zIndex: "1", margin: "0", fontSize: "calc(14*var(--tu))", lineHeight: "calc(24*var(--tu))", color: "rgba(255,255,255,.48)", maxWidth: "calc(390*var(--u))", gridColumn: "1", transition: "color .45s ease"}}><strong>Je crée des identités visuelles qui rendent votre marque immédiatement reconnaissable.</strong> Logo, couleurs, typographies, éléments graphiques : chaque composant est pensé pour construire un univers cohérent, distinctif et facilement déclinable sur l’ensemble de vos supports de communication.</p>
                <div data-svcico="1" style={{position: "relative", zIndex: "1", width: "calc(230*var(--u))", height: "calc(230*var(--u))", gridColumn: "2", gridRow: "1 / span 3", alignSelf: "center", justifySelf: "end", perspective: "1200px", willChange: "transform"}}><span data-floppydepth="1"><span data-floppyfloat="1" style={{animationDelay: "0s"}}><span data-floppy="1" style={{animationDelay: "0s"}}><img src="/assets/floppy/floppy-identite-visuelle.webp" alt="" style={{opacity: "1", transition: "transform .5s cubic-bezier(.22,1,.36,1), opacity .45s ease"}} width="576" height="576" decoding="async" loading="eager" fetchpriority="low" /></span></span></span></div>
              </article>
              <article data-svc="1" data-panneau="1" style={{flex: "0 0 100vw", width: "100vw", height: "100vh", position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1fr) calc(240*var(--u))", gridAutoRows: "min-content", alignContent: "center", alignItems: "center", columnGap: "calc(50*var(--u))", padding: "calc(150*var(--u)) calc((100vw - 1024*var(--u))/2 + 82*var(--u)) calc(120*var(--u))", boxSizing: "border-box"}}>
                <i data-svcwash="1" style={{position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "0", background: "radial-gradient(ellipse calc(300*var(--u)) calc(330*var(--u)) at calc(50% + 315*var(--u)) calc(50% + 15*var(--u)), rgba(143,43,255,.26) 0%, rgba(122,1,255,.13) 34%, rgba(122,1,255,.045) 62%, rgba(0,0,0,0) 100%)", opacity: "0", transition: "opacity 1s ease"}}></i>
                <span data-svcnum="1" style={{position: "relative", zIndex: "1", gridColumn: "1", fontWeight: "800", fontSize: "calc(110*var(--tu))", lineHeight: ".8", letterSpacing: "calc(-3*var(--u))", color: "var(--pink-b)", WebkitTextStroke: "0", display: "block", marginBottom: "calc(16*var(--u))", transition: "color .8s ease"}}>02</span>
                <h3 data-svch="1" style={{position: "relative", zIndex: "1", fontWeight: "700", fontSize: "calc(38*var(--tu))", lineHeight: "1.04", color: "#fff", letterSpacing: "calc(-.6*var(--u))", gridColumn: "1", margin: "0 0 calc(18*var(--u))", transition: "transform .55s cubic-bezier(.16,1,.3,1)"}}>Design graphique &amp; print</h3>
                <p data-svcp="1" style={{position: "relative", zIndex: "1", margin: "0", fontSize: "calc(14*var(--tu))", lineHeight: "calc(24*var(--tu))", color: "rgba(255,255,255,.48)", maxWidth: "calc(390*var(--u))", gridColumn: "1", transition: "color .45s ease"}}><strong>Je conçois des supports graphiques qui donnent du caractère à votre communication.</strong> Affiches, flyers, packaging, cartes de visite, contenus pour les réseaux sociaux : chaque création est pensée pour attirer l’attention et rester cohérente avec votre identité.</p>
                <div data-svcico="1" style={{position: "relative", zIndex: "1", width: "calc(230*var(--u))", height: "calc(230*var(--u))", gridColumn: "2", gridRow: "1 / span 3", alignSelf: "center", justifySelf: "end", perspective: "1200px", willChange: "transform"}}><span data-floppydepth="1"><span data-floppyfloat="1" style={{animationDelay: "-2.4s"}}><span data-floppy="1" style={{animationDelay: "-.35s"}}><img src="/assets/floppy/floppy-print.webp" alt="" style={{opacity: "1", transition: "transform .5s cubic-bezier(.22,1,.36,1), opacity .45s ease"}} width="576" height="576" decoding="async" loading="eager" fetchpriority="low" /></span></span></span></div>
              </article>
              <article data-svc="1" data-panneau="1" style={{flex: "0 0 100vw", width: "100vw", height: "100vh", position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1fr) calc(240*var(--u))", gridAutoRows: "min-content", alignContent: "center", alignItems: "center", columnGap: "calc(50*var(--u))", padding: "calc(150*var(--u)) calc((100vw - 1024*var(--u))/2 + 82*var(--u)) calc(120*var(--u))", boxSizing: "border-box"}}>
                <i data-svcwash="1" style={{position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "0", background: "radial-gradient(ellipse calc(300*var(--u)) calc(330*var(--u)) at calc(50% + 315*var(--u)) calc(50% + 15*var(--u)), rgba(143,43,255,.26) 0%, rgba(122,1,255,.13) 34%, rgba(122,1,255,.045) 62%, rgba(0,0,0,0) 100%)", opacity: "0", transition: "opacity 1s ease"}}></i>
                <span data-svcnum="1" style={{position: "relative", zIndex: "1", gridColumn: "1", fontWeight: "800", fontSize: "calc(110*var(--tu))", lineHeight: ".8", letterSpacing: "calc(-3*var(--u))", color: "var(--pink-b)", WebkitTextStroke: "0", display: "block", marginBottom: "calc(16*var(--u))", transition: "color .8s ease"}}>03</span>
                <h3 data-svch="1" style={{position: "relative", zIndex: "1", fontWeight: "700", fontSize: "calc(38*var(--tu))", lineHeight: "1.04", color: "#fff", letterSpacing: "calc(-.6*var(--u))", gridColumn: "1", margin: "0 0 calc(18*var(--u))", transition: "transform .55s cubic-bezier(.16,1,.3,1)"}}>Web design</h3>
                <p data-svcp="1" style={{position: "relative", zIndex: "1", margin: "0", fontSize: "calc(14*var(--tu))", lineHeight: "calc(24*var(--tu))", color: "rgba(255,255,255,.48)", maxWidth: "calc(390*var(--u))", gridColumn: "1", transition: "color .45s ease"}}><strong>Je conçois des sites web qui donnent envie de découvrir votre marque.</strong> Site vitrine ou interface sur mesure : je travaille le design, l’expérience utilisateur et la structure de chaque page pour créer une expérience claire, fluide et mémorable.</p>
                <div data-svcico="1" style={{position: "relative", zIndex: "1", width: "calc(230*var(--u))", height: "calc(230*var(--u))", gridColumn: "2", gridRow: "1 / span 3", alignSelf: "center", justifySelf: "end", perspective: "1200px", willChange: "transform"}}><span data-floppydepth="1"><span data-floppyfloat="1" style={{animationDelay: "-4.8s"}}><span data-floppy="1" style={{animationDelay: "-.7s"}}><img src="/assets/floppy/floppy-web.webp" alt="" style={{opacity: "1", transition: "transform .5s cubic-bezier(.22,1,.36,1), opacity .45s ease"}} width="576" height="576" decoding="async" loading="eager" fetchpriority="low" /></span></span></span></div>
              </article>
              <article data-svc="1" data-panneau="1" style={{flex: "0 0 100vw", width: "100vw", height: "100vh", position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1fr) calc(240*var(--u))", gridAutoRows: "min-content", alignContent: "center", alignItems: "center", columnGap: "calc(50*var(--u))", padding: "calc(150*var(--u)) calc((100vw - 1024*var(--u))/2 + 82*var(--u)) calc(120*var(--u))", boxSizing: "border-box"}}>
                <i data-svcwash="1" style={{position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "0", background: "radial-gradient(ellipse calc(300*var(--u)) calc(330*var(--u)) at calc(50% + 315*var(--u)) calc(50% + 15*var(--u)), rgba(143,43,255,.26) 0%, rgba(122,1,255,.13) 34%, rgba(122,1,255,.045) 62%, rgba(0,0,0,0) 100%)", opacity: "0", transition: "opacity 1s ease"}}></i>
                <span data-svcnum="1" style={{position: "relative", zIndex: "1", gridColumn: "1", fontWeight: "800", fontSize: "calc(110*var(--tu))", lineHeight: ".8", letterSpacing: "calc(-3*var(--u))", color: "var(--pink-b)", WebkitTextStroke: "0", display: "block", marginBottom: "calc(16*var(--u))", transition: "color .8s ease"}}>04</span>
                <h3 data-svch="1" style={{position: "relative", zIndex: "1", fontWeight: "700", fontSize: "calc(38*var(--tu))", lineHeight: "1.04", color: "#fff", letterSpacing: "calc(-.6*var(--u))", gridColumn: "1", margin: "0 0 calc(18*var(--u))", transition: "transform .55s cubic-bezier(.16,1,.3,1)"}}>Illustration</h3>
                <p data-svcp="1" style={{position: "relative", zIndex: "1", margin: "0", fontSize: "calc(14*var(--tu))", lineHeight: "calc(24*var(--tu))", color: "rgba(255,255,255,.48)", maxWidth: "calc(390*var(--u))", gridColumn: "1", transition: "color .45s ease"}}><strong>Je crée des illustrations sur mesure pour donner une personnalité unique à votre communication.</strong> Personnages, visuels de marque, illustrations éditoriales : chaque création est pensée pour s’intégrer à votre univers et apporter une touche originale, cohérente et reconnaissable à vos supports.</p>
                <div data-svcico="1" style={{position: "relative", zIndex: "1", width: "calc(230*var(--u))", height: "calc(230*var(--u))", gridColumn: "2", gridRow: "1 / span 3", alignSelf: "center", justifySelf: "end", perspective: "1200px", willChange: "transform"}}><span data-floppydepth="1"><span data-floppyfloat="1" style={{animationDelay: "-7.2s"}}><span data-floppy="1" style={{animationDelay: "-1.05s"}}><img src="/assets/floppy/floppy-illustration.webp" alt="" style={{opacity: "1", transition: "transform .5s cubic-bezier(.22,1,.36,1), opacity .45s ease"}} width="576" height="576" decoding="async" loading="eager" fetchpriority="low" /></span></span></span></div>
              </article>
            </div>
            <div data-svcjauge="1" style={{position: "absolute", left: "0", right: "0", bottom: "calc(56*var(--u))", zIndex: "3", width: "calc(1024*var(--u))", margin: "0 auto", padding: "0 calc(82*var(--u))", display: "flex", alignItems: "center", gap: "calc(18*var(--u))"}}>
              <span style={{fontSize: "calc(11*var(--tu))", fontWeight: "600", letterSpacing: "calc(2*var(--u))", color: "rgba(255,255,255,.42)"}}><em data-svcn="1" style={{fontStyle: "normal", color: "var(--pink-b)"}}>01</em> / 04</span>
              <span style={{flex: "1", height: "1px", background: "rgba(255,255,255,.12)", position: "relative"}}><i data-svcbarre="1" style={{position: "absolute", left: "0", top: "0", height: "100%", width: "25%", background: "linear-gradient(90deg,var(--violet-b),var(--pink))", transition: "left .25s ease"}}></i></span>
            </div>
          </div>
        </section><section id="portfolio" data-gallery="1" data-screen-label="Portfolio" style={{position: "relative", background: "#000", scrollMarginTop: "calc(76*var(--u))"}}>
          <i data-ambient="1" aria-hidden="true" style={{position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0", background: "radial-gradient(34% 34% at 36% 40%, var(--accent, rgba(143,43,255,.075)) 0%, rgba(0,0,0,0) 100%)", transition: "background 1.1s ease"}}></i>
          <div style={{position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden", zIndex: "1", padding: "calc(12*var(--u)) 0 calc(30*var(--u))"}}>
            <header data-galhead="1" style={{display: "grid", gridTemplateColumns: "calc(52*var(--u)) 1fr auto", alignItems: "center", columnGap: "calc(20*var(--u))", rowGap: "calc(22*var(--u))", width: "calc(1024*var(--u))", boxSizing: "border-box", margin: "0 auto", padding: "0 calc(82*var(--u)) calc(22*var(--u))"}}>
              <span data-chapnum="1" style={{gridColumn: "1", fontSize: "calc(11*var(--tu))", fontWeight: "600", letterSpacing: "calc(2.6*var(--u))", color: "var(--pink-b)"}}>02</span>
              <span data-rule="1" style={{gridColumn: "2", height: "1px", background: "rgba(255,255,255,.16)", transform: "scaleX(0)", transformOrigin: "left", transition: "transform 1.2s cubic-bezier(.16,1,.3,1) .1s"}}></span>
              <div style={{gridColumn: "3", gridRow: "2", alignSelf: "center", display: "flex", alignItems: "center", gap: "calc(26*var(--u))"}}>
                <span style={{fontSize: "calc(13*var(--tu))", letterSpacing: "calc(1.5*var(--u))", color: "rgba(255,255,255,.4)"}}><em data-galindex="1" style={{fontStyle: "normal", color: "#fff", fontWeight: "600"}}>01</em> / <i data-galtotal="1" style={{fontStyle: "normal"}}>11</i></span>
                <div style={{display: "flex", gap: "calc(8*var(--u))"}}>
                  <button data-galprev="1" aria-label="Projet précédent" data-magnetic="1" style={{width: "calc(44*var(--u))", height: "calc(44*var(--u))", borderRadius: "50%", border: "1px solid rgba(255,255,255,.18)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "calc(15*var(--tu))", transition: "border-color .3s ease,background .3s ease,transform .3s ease"}}>←</button>
                  <button data-galnext="1" aria-label="Projet suivant" data-magnetic="1" style={{width: "calc(44*var(--u))", height: "calc(44*var(--u))", borderRadius: "50%", border: "1px solid rgba(255,255,255,.18)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "calc(15*var(--tu))", transition: "border-color .3s ease,background .3s ease,transform .3s ease"}}>→</button>
                </div>
              </div>
              <div style={{gridColumn: "1 / 3", gridRow: "2", alignSelf: "center"}}>
                <h2 style={{margin: "0", fontWeight: "800", fontSize: "calc(46*var(--tu))", lineHeight: "calc(45*var(--tu))", textTransform: "uppercase", color: "#fff", letterSpacing: "calc(-.4*var(--u))"}}>Mes <em style={{fontStyle: "normal", color: "var(--violet-b)"}}>projets</em></h2>
              </div>
                <p style={{margin: "0", gridColumn: "1 / -1", maxWidth: "calc(520*var(--u))", fontSize: "calc(13.5*var(--tu))", lineHeight: "calc(22*var(--tu))", color: "rgba(255,255,255,.58)"}}>Logos, identités complètes et packagings pour des restaurants, des bars et des marques indépendantes.</p>
            </header>

            <div data-galtrack="1" style={{display: "flex", alignItems: "center", gap: "calc(46*var(--u))", padding: "calc(46*var(--u)) calc(82*var(--u)) 0", willChange: "transform", cursor: "grab", touchAction: "pan-y"}}>
              <article data-piece="violet" data-sujet="Disco, funk &amp; synthwave" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>01</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/affiche-soiree-funky-night-another-world.webp" alt="Affiche de soirée Funky Night : illustration néon rétro années 80, soirée funk disco house à Toulouse" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--violet-b)", marginBottom: "calc(8*var(--u))"}}>Affiche événementielle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Funky Night</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Affiche et supports réseaux</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Funky Night est une soirée événementielle organisée au bar L’Autruche à Toulouse, autour des univers disco, funk et synthwave. L’affiche a été conçue pour donner à l’événement une identité visuelle forte et immédiatement reconnaissable.</p>
                    <h4>Concept graphique</h4>
                    <p>La création repose sur un photomontage mettant en scène une femme au code vestimentaire rétro-futuriste, inspiré des années 80 et de l’esthétique synthwave. La tenue, les lunettes, la coiffure et le traitement de l’image construisent un personnage directement associé à cet univers.</p>
                    <p>La composition est renforcée par une palette de couleurs néon, des formes géométriques, des effets lumineux et une typographie inspirée des codes graphiques de la période. L’ensemble crée une ambiance nocturne et festive tout en évoquant l’univers musical de la soirée.</p>
                    <h4>Supports</h4>
                    <p>L’affiche a été conçue pour assurer la promotion de l’événement, aussi bien en affichage qu’en communication numérique.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Affiche événementielle · Photomontage · Direction artistique · Retouche photo · Typographie · Composition graphique</p>
                  </div>
                </div>
              </article>
              <article data-piece="pink" data-sujet="Restaurant japonais" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>02</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/identite-visuelle-restaurant-sushi-kabuki-sushi.webp" alt="Identité visuelle Kabuki Sushi : logo mascotte, enseigne, packaging et menu de restaurant japonais" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--pink-b)", marginBottom: "calc(8*var(--u))"}}>Identité visuelle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Kabuki Sushi</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo, packaging et menu</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Pour Kabuki Sushi, l’identité visuelle joue sur un univers japonais à la fois marqué et accessible. Le rouge et le noir donnent à la marque une présence forte, tandis que le personnage central apporte une touche plus légère et originale.</p>
                    <h4>Concept du logo</h4>
                    <p>Le logo met en scène un personnage chibi inspiré du théâtre kabuki, volontairement caricatural et comique. Ses proportions exagérées et son expression lui donnent un côté sympathique et mémorable, tout en créant un lien immédiat avec l’univers japonais. La typographie, inspirée du geste du pinceau, complète cette direction graphique plus spontanée et artisanale.</p>
                    <h4>Déclinaisons</h4>
                    <p>L’identité a été adaptée à différents supports, notamment l’enseigne, les sacs et les emballages. Le personnage permet également de donner une vraie personnalité à la marque et de créer un fil conducteur entre les différents supports.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle · Packaging · Supports de communication</p>
                  </div>
                </div>
              </article>
              <article data-piece="violet" data-sujet="Restaurant de smash burgers" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>03</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/creation-logo-burger-fast-food-top-bun.webp" alt="Création de logo Top Bun : déclinaisons du logo et packaging pour un fast-food burger" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--violet-b)", marginBottom: "calc(8*var(--u))"}}>Création de logo</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Top Bun</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo et packaging fast-food</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Pour Top Bun, l’identité visuelle reprend les codes d’un restaurant de burgers artisanaux à travers une direction graphique simple, colorée et immédiatement identifiable. Le rose et le jaune apportent une présence énergique, tout en donnant à la marque un univers visuel cohérent avec son offre.</p>
                    <h4>Concept du logo</h4>
                    <p>Le logo repose sur une construction typographique compacte autour du nom TOP BUN. Le O devient l’élément central du symbole : ses formes horizontales évoquent directement les différentes couches d’un burger, tandis que sa couleur jaune rappelle le pain et les ingrédients du produit. Cette transformation permet d’intégrer l’univers du smash burger directement dans le nom, sans avoir besoin d’ajouter une illustration indépendante.</p>
                    <h4>Déclinaisons</h4>
                    <p>L’identité a été pensée pour fonctionner aussi bien sur des fonds clairs que foncés. Elle se décline notamment sur les emballages, les sacs et les gobelets, où la construction compacte du logo reste facilement reconnaissable.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle · Packaging · Supports de communication</p>
                  </div>
                </div>
              </article>
              <article data-piece="pink" data-sujet="Vente et réparation de vélos" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>04</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/identite-visuelle-marque-sport-cyclisme-ashkan-sports.webp" alt="Identité visuelle Ashkan Sports : logo, étiquettes et accessoires pour une marque de sport et cyclisme" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--pink-b)", marginBottom: "calc(8*var(--u))"}}>Identité visuelle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Ashkan Sports</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo et déclinaisons boutique</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Pour Ashkan Sports, l’identité visuelle a été pensée autour de l’univers du vélo, avec un symbole simple qui permet d’identifier rapidement l’activité. Le rouge, le noir et le blanc donnent à la marque une identité sportive et marquée, adaptée à une enseigne spécialisée dans la vente et la réparation de vélos.</p>
                    <h4>Concept du logo</h4>
                    <p>Le symbole associe les deux initiales de la marque à des éléments directement inspirés du vélo. La partie rouge forme à la fois une roue et un guidon, tandis que sa courbe évoque également la lettre S de « Sports ». La partie blanche reprend quant à elle la lettre A de « Ashkan », dont les lignes suggèrent le cadre d’un vélo.</p>
                    <p>L’ensemble réunit ainsi les initiales de la marque et son activité dans un symbole compact, sans représenter un vélo de manière littérale.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle · Direction artistique</p>
                  </div>
                </div>
              </article>
              <article data-piece="violet" data-sujet="Pâtisseries florales &amp; inspirations asiatiques" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>05</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/identite-visuelle-patisserie-florale-asiatique-petale-imperial.webp" alt="Identité visuelle Pétale Impérial : logo dragon et rose, sac, coffret, boîte à thé et affiche pour une pâtisserie florale" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--violet-b)", marginBottom: "calc(8*var(--u))"}}>Identité visuelle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Pétale Impérial</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo, packaging et print</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Pétale Impérial développe un univers autour de la pâtisserie florale et des influences asiatiques. L’identité associe une esthétique raffinée à des références graphiques inspirées de l’imaginaire asiatique, avec une palette dominée par le rouge, le blanc et des touches plus chaleureuses.</p>
                    <h4>Concept du logo</h4>
                    <p>Le logo associe un dragon et une rose dans une même composition. Le dragon évoque directement l’univers asiatique, tandis que la fleur fait référence à l’approche florale de la marque. Leur interaction crée un symbole à la fois élégant et facilement identifiable, qui résume les deux principales inspirations du projet.</p>
                    <h4>Déclinaisons</h4>
                    <p>L’identité a été pensée pour fonctionner sur différents supports de communication et de présentation : packaging, sacs, supports imprimés et éléments de décoration. L’illustration du dragon et de la rose permet de conserver une présence visuelle forte tout en s’adaptant aux différents formats.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle · Illustration · Print</p>
                  </div>
                </div>
              </article>
              <article data-piece="pink" data-sujet="Bar lounge &amp; cocktails" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>06</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/identite-visuelle-bar-cocktails-bikini-bar.webp" alt="Identité visuelle Bikini Bar : logo néon rose, carte de cocktails et signalétique de bar" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--pink-b)", marginBottom: "calc(8*var(--u))"}}>Identité visuelle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Bikini Bar</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo, carte et signalétique</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Bikini Bar est un concept de bar lounge à l’ambiance sensuelle, pensé autour des cocktails, de la nuit et d’une identité visuelle assumée. L’univers graphique joue sur des contrastes forts entre le noir et le rose pour créer une atmosphère intimiste et sophistiquée.</p>
                    <h4>Concept du logo</h4>
                    <p>Le logo repose sur une double lecture graphique : la silhouette d’un pubis féminin se fond dans la forme d’un verre à cocktail. Le triangle central suggère à la fois le verre et son contenu, tandis que les courbes extérieures reprennent subtilement les lignes du corps.</p>
                    <p>Cette association permet de relier directement l’univers féminin, sensuel et festif du concept à celui du bar et des cocktails, avec un symbole qui reste simple et facilement identifiable.</p>
                    <h4>Déclinaisons</h4>
                    <p>L’identité a été appliquée à différents éléments de l’univers du bar, notamment la signalétique, le menu et les supports présents au comptoir. Le contraste entre le rose vif et les fonds sombres renforce l’atmosphère nocturne du concept.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle · Direction artistique · Supports de communication</p>
                  </div>
                </div>
              </article>
              <article data-piece="violet" data-sujet="Livraison de repas" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>07</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/creation-logo-livraison-repas-bring-eat.webp" alt="Création de logo Bring Eat : identité et supports pour un service de livraison de repas" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--violet-b)", marginBottom: "calc(8*var(--u))"}}>Création de logo</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Bring Eat</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo et supports livraison</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Bring Eat est un concept de food court virtuel permettant de commander des plats provenant de plusieurs restaurants partenaires au sein d’une seule commande. Le projet réunissait différentes cuisines sous un même toit, avec notamment la participation du chef Danny Khezzar.</p>
                    <h4>Concept du logo</h4>
                    <p>Le logo représente un livreur à scooter, avec des roues dessinées sous la forme d’un signe infini. Cette construction apporte une sensation de vitesse et de mouvement au symbole, et évoque naturellement le déplacement rapide du livreur entre les cuisines et les clients.</p>
                    <p>Le personnage et le scooter permettent d’identifier immédiatement l’univers de la livraison, tandis que la forme des roues donne au logo un élément graphique distinctif. L’ensemble reste volontairement simple afin de conserver une bonne lisibilité sur les différents supports.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Direction artistique</p>
                  </div>
                </div>
              </article>
              <article data-piece="pink" data-sujet="Restaurant chinois" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>08</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/identite-visuelle-restaurant-chinois-jung-fu.webp" alt="Identité visuelle Jung Fu : logo, enseigne et packaging pour un restaurant chinois" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--pink-b)", marginBottom: "calc(8*var(--u))"}}>Identité visuelle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Jung Fu</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo et packaging restaurant</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Jung Fu était un concept de restauration chinoise développé au sein de Bring Eat, spécialisé dans les plats à base de canard. L’identité devait évoquer la cuisine chinoise tout en donnant à la marque une image contemporaine et facilement identifiable.</p>
                    <h4>Concept du logo</h4>
                    <p>Le logo repose sur un symbole qui associe un canard stylisé à un bol de nouilles, accompagné de baguettes. La silhouette du canard permet d’identifier immédiatement la spécialité du restaurant, tandis que le bol et les baguettes renforcent la référence à la cuisine asiatique.</p>
                    <p>Le choix d’un jaune doré sur fond noir donne à l’ensemble une présence forte et rappelle certains codes graphiques traditionnels chinois, tout en conservant une esthétique moderne et épurée.</p>
                    <h4>Déclinaisons</h4>
                    <p>L’identité a été déclinée sur différents supports liés à la restauration et à la livraison : enseignes, boîtes, gobelets, pochettes pour baguettes et supports imprimés. Des motifs inspirés des codes graphiques asiatiques viennent compléter l’univers visuel.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle · Packaging · Supports de communication</p>
                  </div>
                </div>
              </article>
              <article data-piece="violet" data-sujet="Mode responsable &amp; seconde main" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>09</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/identite-visuelle-friperie-mode-seconde-main-o-bonheur-demy.webp" alt="Identité visuelle Ô Bonheur D'Emy : logo, étiquettes et tote bag pour une friperie de mode seconde main" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--violet-b)", marginBottom: "calc(8*var(--u))"}}>Identité visuelle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Ô Bonheur D'Emy</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo, étiquettes et textile</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Ô Bonheur d’Emy est une marque spécialisée dans la vente de vêtements de seconde main, créée autour d’une volonté de consommer différemment, de manière plus écologique et locale. La marque propose une sélection de vêtements pour femmes, hommes et enfants, avec une attention particulière portée au choix et à la qualité des articles.</p>
                    <h4>Concept du logo</h4>
                    <p>Le logo s’articule autour d’un trèfle à quatre feuilles, choisi pour faire directement écho au mot « Bonheur » présent dans le nom de la marque. Les quatre feuilles forment un symbole simple et facilement reconnaissable.</p>
                    <p>Deux petits yeux et un sourire sont intégrés au centre du trèfle, lui donnant une expression chaleureuse et sympathique. Cette personnification apporte une dimension plus humaine au logo et fait écho à l’esprit familial de la marque.</p>
                    <p>La palette composée de lilas, bleu-vert et rose vient compléter cet univers doux et coloré, tout en donnant à l’identité une personnalité propre.</p>
                    <h4>Déclinaisons</h4>
                    <p>L’identité a été adaptée à différents supports liés à l’univers de la marque, notamment les vêtements, sacs et étiquettes. Le logo conserve ainsi sa lisibilité et son caractère lorsqu’il est appliqué sur différents formats.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle · Supports de communication · Illustration</p>
                  </div>
                </div>
              </article>
              <article data-piece="pink" data-sujet="Visites virtuelles &amp; photographie" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>10</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/identite-visuelle-visite-virtuelle-matterport-neometris.webp" alt="Identité visuelle Neometris : logo, plaquette et interface pour un studio de visites virtuelles Matterport" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--pink-b)", marginBottom: "calc(8*var(--u))"}}>Création de logo</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Neometris</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo, plaquette et interface</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Neometris évolue dans le domaine des visites virtuelles et de la photographie professionnelle, avec un univers tourné vers les nouvelles technologies et la représentation numérique des espaces.</p>
                    <h4>Concept du logo</h4>
                    <p>Le symbole associe une planète inspirée de Saturne à un réseau de carrés qui se détache progressivement de sa forme. Cette construction fait référence à la représentation numérique et à la transformation d’un espace réel en données virtuelles.</p>
                    <p>La planète apporte une dimension spatiale et immersive, tandis que le réseau de carrés évoque la modélisation, la numérisation et la construction d’un espace en trois dimensions. La couleur violette renforce cette dimension technologique et contemporaine.</p>
                    <h4>Livrable</h4>
                    <p data-lbliste="1">Création du logo · Symbole · Déclinaisons colorimétriques</p>
                  </div>
                </div>
              </article>
              <article data-piece="violet" data-sujet="Pâtisserie / Donuts" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>11</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/creation-logo-identite-visuelle-donuts-crazy-donutz.webp" alt="Création de logo et identité visuelle Crazy Donutz : packaging, boîtes et carte pour une boutique de donuts" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--violet-b)", marginBottom: "calc(8*var(--u))"}}>Identité visuelle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Crazy Donutz</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo, packaging et carte</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Pour Crazy Donutz, l’identité visuelle cherche à créer un univers gourmand, fun et facilement reconnaissable. Le jaune, le noir et le blanc donnent à la marque une présence forte, tout en conservant un côté accessible et ludique.</p>
                    <h4>Concept du logo</h4>
                    <p>Le logo repose sur un jeu graphique autour de la lettre C, qui évoque une mâchoire ouverte venant croquer dans un donut. Cette idée donne directement au symbole son caractère gourmand et décalé, tout en créant une association simple entre le nom de la marque et son produit. Le style volontairement irrégulier renforce le côté spontané et artisanal de l’identité.</p>
                    <h4>Déclinaisons</h4>
                    <p>L’identité a été adaptée à différents supports, notamment les boîtes, le packaging, la carte et les gobelets. Le motif de donut est également repris sur certains supports afin de créer une continuité graphique entre les différents éléments de la marque.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle · Packaging · Supports de communication</p>
                  </div>
                </div>
              </article>
              <article data-piece="pink" data-sujet="Photographie de paysage" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>12</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/identite-visuelle-photographe-nature-aldo-viola.webp" alt="Identité visuelle Aldo Viola photographe : logo hibou doré à diaphragmes sur pochette noire, tirages noir et blanc et boîtier reflex" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--pink-b)", marginBottom: "calc(8*var(--u))"}}>Identité visuelle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Aldo Viola</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo et identité visuelle</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Aldo Viola est un photographe indépendant spécialisé dans les paysages. L’identité visuelle a été pensée autour de la photographie et de l’observation, avec un symbole capable de donner au nom une véritable personnalité.</p>
                    <h4>Concept du logo</h4>
                    <p>Le logo représente un hibou stylisé, dont les yeux sont remplacés par des objectifs d’appareil photo. Cette association crée un lien direct entre l’animal, symbole d’observation et de précision, et l’activité de photographe.</p>
                    <p>Les objectifs intégrés aux yeux renforcent l’idée d’un regard attentif porté sur le monde et plus particulièrement sur les paysages. La construction très épurée du symbole permet au logo de rester identifiable aussi bien en grand format que sur des supports plus petits.</p>
                    <p>Le trait doré sur fond sombre apporte une dimension élégante et premium, en cohérence avec l’univers de la photographie de paysage et la volonté de mettre en valeur les images capturées.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle</p>
                  </div>
                </div>
              </article>
              <article data-piece="violet" data-sujet="Accessoires de mode" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>13</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/identite-visuelle-accessoires-mode-pimp-up-paris.webp" alt="Identité visuelle Pimp'Up Paris : logo, coffret et campagne pour une marque d'accessoires de mode" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--violet-b)", marginBottom: "calc(8*var(--u))"}}>Identité visuelle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Pimp'Up</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo, packaging et campagne</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Pimp’Up est un projet créé par Candice Maury à Genève, né d’un constat personnel autour des cuissardes : difficulté à trouver des modèles adaptés, talons trop hauts, mollets trop serrés ou encore prix élevés. Le concept propose un accessoire permettant de transformer une paire de chaussures en cuissardes, en s’adaptant aux différents styles et aux différentes morphologies.</p>
                    <h4>Concept du logo</h4>
                    <p>Le symbole est construit à partir du nom Pimp’Up : il reprend le début du premier « P » et la terminaison en « P » du nom, formant deux lettres qui se font face et créent un symbole parfaitement symétrique.</p>
                    <p>Les prolongements verticaux sous ces deux formes évoquent deux jambes, tandis que leur terminaison rappelle visuellement des chaussures. Le logo fait ainsi directement référence au principe du produit : transformer une paire de chaussures et prolonger la silhouette jusqu’à la cuisse.</p>
                    <h4>Déclinaisons</h4>
                    <p>L’identité a été pensée pour être facilement appliquée aux différents supports de la marque, notamment les accessoires, les emballages et les pochons.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle · Packaging · Supports de communication</p>
                  </div>
                </div>
              </article>
              <article data-piece="pink" data-sujet="Massage &amp; Wellness" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>14</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/creation-logo-massage-bien-etre-relax-wellness.webp" alt="Identité visuelle Relax Massage &amp; Wellness : logo lotus turquoise, cartes de visite, étiquettes et serviettes" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--pink-b)", marginBottom: "calc(8*var(--u))"}}>Identité visuelle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Relax</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo, papeterie et supports bien-être</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <p>L’objectif était de créer une identité visuelle évoquant immédiatement le bien-être, la détente et l’harmonie.</p>
                    <p>Le symbole associe subtilement la lettre R, initiale de Relax, à une fleur de lotus — symbole de sérénité, d’équilibre et d’épanouissement. Cette fusion donne un signe à la fois identifiable, élégant et directement lié à l’univers du bien-être.</p>
                    <p>La palette de bleu-vert profond et de turquoise renforce cette sensation de calme tout en apportant une dimension contemporaine et premium à l’identité.</p>
                    <p>L’ensemble a ensuite été décliné sur différents supports afin de construire une image de marque cohérente, apaisante et facilement reconnaissable.</p>
                  </div>
                </div>
              </article>
              <article data-piece="violet" data-sujet="Restauration" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>15</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/creation-logo-packaging-bretzel-restauration-bretzelle.webp" alt="Identité visuelle Bretzelle : logo bretzel doré, sacs kraft, sachets et affiche pour un concept de restauration" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--violet-b)", marginBottom: "calc(8*var(--u))"}}>Identité visuelle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Bretzelle</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo, packaging et supports</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Bretzelle est un concept de restauration centré autour du bretzel, avec une identité pensée pour être immédiatement reconnaissable et donner au produit une véritable personnalité.</p>
                    <h4>Concept du logo</h4>
                    <p>Le logo repose sur un symbole qui fusionne directement la forme du bretzel avec la lettre « B », créant un signe à la fois figuratif et typographique. Les détails du bretzel, comme les petits points qui évoquent le sel, renforcent la lecture du symbole et son lien avec le produit.</p>
                    <p>La typographie manuscrite apporte un aspect plus chaleureux et spontané, tandis que l’association du jaune et du brun rappelle les couleurs du bretzel fraîchement cuit. L’ensemble construit une identité gourmande, facilement identifiable et adaptée à l’univers de la restauration.</p>
                    <h4>Déclinaisons</h4>
                    <p>L’identité a été pensée pour différents supports liés à la marque, notamment les sacs en papier et les emballages, en permettant au logo de rester très visible et reconnaissable sur différents formats.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle · Illustration · Supports de communication</p>
                  </div>
                </div>
              </article>
              <article data-piece="pink" data-sujet="Restaurant de livraison" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>16</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/creation-logo-packaging-fish-and-chips-mr-fish.webp" alt="Création de logo Mr. Fish : packaging fish and chips à emporter, sachet et gobelet" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--pink-b)", marginBottom: "calc(8*var(--u))"}}>Création de logo</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Mr. Fish</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Logo et packaging à emporter</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Mr. Fish était un ancien concept de restauration spécialisé dans le fish and chips, développé pour la livraison dans le cadre de Bring Eat. L’identité devait donner au nom une personnalité forte tout en faisant immédiatement référence à l’univers du poisson.</p>
                    <h4>Concept du logo</h4>
                    <p>Le logo associe une typographie manuscrite et expressive à un symbole placé à ses côtés. Celui-ci fusionne la silhouette d’un poisson avec un haut-de-forme, créant ainsi une représentation visuelle directe du nom « Mr. Fish » : le poisson évoque Fish, tandis que le chapeau apporte le côté Mr.</p>
                    <p>Cette association donne au logo un caractère à la fois original et facilement mémorisable, tout en établissant un lien immédiat avec l’activité de restauration. Le jaune et le noir renforcent son impact visuel et permettent au logo de fonctionner efficacement sur différents supports.</p>
                    <h4>Déclinaisons</h4>
                    <p>Le logo a été appliqué sur différents supports liés à la livraison, notamment les boîtes, sacs, gobelets et contenants, afin de conserver une identité cohérente à travers les différents éléments de la marque.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Logo · Identité visuelle · Supports de communication · Packaging</p>
                  </div>
                </div>
              </article>
              <article data-piece="violet" data-sujet="Bar L’Autruche, Toulouse" style={{flex: "0 0 auto", width: "calc(360*var(--u))", position: "relative"}}>
                <span data-piecenum="1" style={{position: "absolute", top: "calc(-26*var(--u))", left: "calc(-14*var(--u))", fontWeight: "800", fontSize: "calc(74*var(--tu))", lineHeight: "1", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,.16)", zIndex: "3", pointerEvents: "none", transition: "-webkit-text-stroke-color .5s ease"}}>17</span>
                <div data-pieceframe="1" style={{position: "relative", overflow: "hidden", aspectRatio: "1/1", borderRadius: "calc(4*var(--u))", background: "linear-gradient(150deg,#1B1020 0%,#0B0B10 55%,#150F1C 100%)", transition: "transform .8s cubic-bezier(.16,1,.3,1)"}}>
                  <img data-piecemedia="1" src="/assets/portfolio/affiche-soiree-oldschool-tropical-mix-another-world.webp" alt="Affiche de soirée Oldschool Tropical Mix : collage tropical, toucan et flamants roses sur abribus, soirée reggae et calypso à Toulouse" width="1000" height="1000" loading="lazy" decoding="async" style={{position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", transition: "transform .9s cubic-bezier(.16,1,.3,1)"}} />
                  <i data-piecesweep="1" style={{position: "absolute", top: "0", left: "-30%", width: "30%", height: "100%", background: "linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.13),rgba(255,255,255,0))", transform: "skewX(-16deg)", opacity: "0", zIndex: "2"}}></i>
                  <i data-pieceveil="1" style={{position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)", opacity: ".9", transition: "opacity .6s ease"}}></i>
                </div>
                <div style={{marginTop: "calc(20*var(--u))"}}>
                  <span style={{display: "inline-block", fontSize: "calc(9.5*var(--tu))", letterSpacing: "calc(1.6*var(--u))", textTransform: "uppercase", color: "var(--violet-b)", marginBottom: "calc(8*var(--u))"}}>Affiche événementielle</span>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(26*var(--tu))", lineHeight: "1.05", color: "#fff"}}>Oldschool Tropical Mix</h3>
                  <p style={{margin: "calc(6*var(--u)) 0 0", fontSize: "calc(12*var(--tu))", color: "rgba(255,255,255,.45)"}}>Affiche et supports réseaux</p>
                  {/* Presentation lue par openLb : le plein ecran passe alors en
                      fiche deux colonnes. Cachee ici, la vignette garde sa legende. */}
                  <div data-piecetexte="1" hidden>
                    <h4>Présentation</h4>
                    <p>Oldschool Tropical Mix est une soirée événementielle organisée au bar L’Autruche à Toulouse, autour d’un univers musical mêlant reggae, calypso, soca et sonorités tropicales. L’affiche cherche à retranscrire cette ambiance chaleureuse et festive tout en s’éloignant des codes classiques de l’affiche de soirée.</p>
                    <h4>Concept graphique</h4>
                    <p>La création repose sur un photomontage mêlant un portrait en noir et blanc à une composition tropicale très colorée. Le personnage central est intégré à un décor composé de feuillages, de fleurs exotiques, de flamants roses et d’un toucan, créant un contraste entre la photographie monochrome et la richesse des éléments végétaux.</p>
                    <p>La direction artistique s’inspire de l’imagerie tropicale et rétro, avec une palette de verts profonds, de jaunes et de couleurs vives. La typographie et les différents niveaux d’information sont organisés pour conserver une lecture claire tout en participant à l’esthétique générale de l’affiche.</p>
                    <h4>Mise en situation</h4>
                    <p>L’affiche a été présentée dans une mise en situation de mobilier urbain, afin de montrer son rendu dans un contexte réel d’affichage et de mettre en valeur son impact visuel à distance.</p>
                    <h4>Prestations</h4>
                    <p data-lbliste="1">Affiche événementielle · Photomontage · Direction artistique · Retouche photo · Composition graphique · Typographie</p>
                  </div>
                </div>
              </article>
            </div>
            <div data-galrail="1" aria-hidden="true" style={{width: "calc(860*var(--u))", margin: "calc(38*var(--u)) auto 0", height: "1px", background: "rgba(255,255,255,.12)", position: "relative"}}>
              <i data-galrailbar="1" style={{position: "absolute", left: "0", top: "calc(-1*var(--u))", height: "calc(3*var(--u))", width: "22%", background: "linear-gradient(90deg,var(--violet-b),var(--pink))", transition: "left .25s cubic-bezier(.16,1,.3,1)"}}></i>
            </div>
          </div>
        </section>

        {/* COUPE AU NOIR DU MENU. Un lien de menu ne traverse plus la page :
            l'ecran passe au noir en 260 ms, la page est POSEE d'un coup sur la
            section, puis le noir se retire en 500 ms et la section apparait.
            Traverser 6000 px en 1,15 s ne montrait rien de lisible, declenchait
            au passage toutes les animations au scroll, et se battait avec le
            recadrage de Services. z-index 130 : au-dessus de tout, header
            compris — une coupe qui laisserait un element a l'ecran n'est plus
            une coupe. */}
        <div data-voile="1" aria-hidden="true" style={{position: "fixed", inset: "0", zIndex: "130", background: "#000", opacity: "0", pointerEvents: "none", transition: "opacity .26s ease"}}></div>
        <div data-lightbox="1" data-lenis-prevent="1" aria-hidden="true" style={{position: "fixed", inset: "0", zIndex: "120", display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(26*var(--u))", opacity: "0", visibility: "hidden", transition: "opacity .5s ease, visibility .5s ease"}}>
          <i aria-hidden="true" style={{position: "absolute", inset: "0", background: "rgba(5,2,10,.93)", backdropFilter: "blur(calc(12*var(--u)))"}}></i>
          <i aria-hidden="true" style={{position: "absolute", inset: "0", pointerEvents: "none", background: "radial-gradient(52% 52% at 50% 46%, rgba(143,43,255,.14) 0%, rgba(0,0,0,0) 72%)"}}></i>
          <button data-lbclose="1" aria-label="Fermer le visuel" style={{position: "absolute", top: "calc(26*var(--u))", right: "calc(30*var(--u))", width: "calc(46*var(--u))", height: "calc(46*var(--u))", borderRadius: "50%", border: "1px solid rgba(255,255,255,.22)", background: "rgba(0,0,0,.4)", color: "#fff", fontSize: "calc(15*var(--tu))", lineHeight: "1", zIndex: "3", cursor: "pointer", transition: "border-color .3s ease,background .3s ease"}} style-hover="border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.08)">&#10005;</button>
          <figure data-lbbox="1" style={{position: "relative", zIndex: "2", margin: "0", maxWidth: "min(1320px,94vw)", display: "flex", flexDirection: "column", alignItems: "center", gap: "calc(20*var(--u))", transform: "scale(.94) translateY(calc(16*var(--u)))", transition: "transform .65s cubic-bezier(.16,1,.3,1)"}}>
            {/* La scene tient l'image et, quand la piece porte une presentation,
                le panneau de texte a sa droite. Sans texte elle ne contient que
                l'image et se comporte comme avant. Le passage d'un mode a
                l'autre se fait par [data-lbmode] sur le plein ecran : la mise
                en page de la fiche est dans global.css, bloc « PLEIN ECRAN ». */}
            <div data-lbstage="1">
              <img data-lbimg="1" alt="" style={{display: "block", maxWidth: "100%", maxHeight: "82vh", objectFit: "contain", borderRadius: "calc(4*var(--u))", cursor: "zoom-in"}} />
              <aside data-lbpanel="1">
                <span data-lbmeta2="1"></span>
                <h3 data-lbtitle2="1"></h3>
                <i data-lbrule="1" aria-hidden="true"></i>
                <div data-lbtexte="1"></div>
              </aside>
            </div>
            <figcaption data-lbcap="1" style={{display: "flex", alignItems: "baseline", justifyContent: "center", gap: "calc(16*var(--u))", flexWrap: "wrap"}}>
              <span data-lbtitle="1" style={{fontWeight: "700", fontSize: "calc(21*var(--tu))", color: "#fff"}}></span>
              <span data-lbmeta="1" style={{fontSize: "calc(11*var(--tu))", letterSpacing: "calc(1.5*var(--u))", textTransform: "uppercase", color: "rgba(255,255,255,.45)"}}></span>
            </figcaption>

          </figure>
        </div>


        <section id="processus" data-screen-label="Processus" style={{position: "relative", background: "#000", padding: "calc(45*var(--u)) 0 calc(50*var(--u))", scrollMarginTop: "calc(76*var(--u))"}}>
          <div style={{width: "calc(1024*var(--u))", margin: "0 auto", position: "relative"}}>
            <header data-chapter="1" style={{display: "grid", gridTemplateColumns: "calc(52*var(--u)) 1fr", alignItems: "center", columnGap: "calc(20*var(--u))", rowGap: "calc(22*var(--u))", padding: "0 calc(82*var(--u))"}}>
              <span style={{fontSize: "calc(11*var(--tu))", fontWeight: "600", letterSpacing: "calc(2.6*var(--u))", color: "var(--pink-b)"}}>03</span>
              <span data-rule="1" style={{height: "1px", background: "rgba(255,255,255,.16)", transform: "scaleX(0)", transformOrigin: "left", transition: "transform 1.2s cubic-bezier(.16,1,.3,1) .1s"}}></span>
              <h2 style={{margin: "0", gridColumn: "1 / -1", fontWeight: "800", fontSize: "calc(46*var(--tu))", lineHeight: "calc(45*var(--tu))", textTransform: "uppercase", color: "#fff", letterSpacing: "calc(-.4*var(--u))"}}>Mon <em style={{fontStyle: "normal", color: "var(--violet-b)"}}>processus</em></h2>
            </header>

            <div data-procrail="1" style={{display: "grid", gridTemplateColumns: "minmax(0,1fr) calc(338*var(--u))", columnGap: "calc(60*var(--u))", alignItems: "start", padding: "0 calc(82*var(--u))", marginTop: "calc(64*var(--u))"}}>
            <ol data-steps="1" style={{position: "relative", listStyle: "none", margin: "0", padding: "0"}}>
              <i data-draw="1" style={{position: "absolute", left: "calc(37.25*var(--u))", top: "calc(38*var(--u))", width: "calc(1.5*var(--u))", height: "calc(100% - 76*var(--u))", background: "var(--pink)", transform: "scaleY(var(--draw,0))", transformOrigin: "top", transition: "transform .1s linear"}}></i>
              <li data-step="1" style={{position: "relative", display: "grid", gridTemplateColumns: "calc(76*var(--u)) minmax(0,1fr)", columnGap: "calc(40*var(--u))", alignItems: "start", padding: "calc(30*var(--u)) 0"}}>
                <span data-stepnum="1" style={{width: "calc(76*var(--u))", height: "calc(76*var(--u))", boxSizing: "border-box", borderRadius: "50%", border: "calc(1.5*var(--u)) solid var(--pink)", background: "var(--dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "calc(24*var(--tu))", color: "#fff", transition: "background .5s ease,color .5s ease,transform .5s cubic-bezier(.16,1,.3,1)"}}>01</span>
                <div style={{paddingTop: "calc(12*var(--u))", maxWidth: "calc(330*var(--u))"}}>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(24*var(--tu))", lineHeight: "1.1", color: "#fff"}}>Parlons de votre projet</h3>
                  <p style={{margin: "calc(12*var(--u)) 0 0", fontSize: "calc(13.5*var(--tu))", lineHeight: "calc(23*var(--tu))", color: "rgba(255,255,255,.88)"}}>Vous me présentez votre projet, vos idées et vos envies, même lorsqu’elles sont encore floues. Je vous pose les bonnes questions pour comprendre ce que vous voulez vraiment créer.</p>
                </div>
              </li>
              <li data-step="1" style={{position: "relative", display: "grid", gridTemplateColumns: "calc(76*var(--u)) minmax(0,1fr)", columnGap: "calc(40*var(--u))", alignItems: "start", padding: "calc(30*var(--u)) 0"}}>
                <span data-stepnum="1" style={{width: "calc(76*var(--u))", height: "calc(76*var(--u))", boxSizing: "border-box", borderRadius: "50%", border: "calc(1.5*var(--u)) solid var(--pink)", background: "var(--dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "calc(24*var(--tu))", color: "#fff", transition: "background .5s ease,color .5s ease,transform .5s cubic-bezier(.16,1,.3,1)"}}>02</span>
                <div style={{paddingTop: "calc(12*var(--u))", maxWidth: "calc(330*var(--u))"}}>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(24*var(--tu))", lineHeight: "1.1", color: "#fff"}}>Direction créative</h3>
                  <p style={{margin: "calc(12*var(--u)) 0 0", fontSize: "calc(13.5*var(--tu))", lineHeight: "calc(23*var(--tu))", color: "rgba(255,255,255,.88)"}}>Je transforme vos idées en une direction visuelle claire. Références, intentions, pistes créatives : on construit ensemble un univers cohérent avant de passer à la création.</p>
                </div>
              </li>
              <li data-step="1" style={{position: "relative", display: "grid", gridTemplateColumns: "calc(76*var(--u)) minmax(0,1fr)", columnGap: "calc(40*var(--u))", alignItems: "start", padding: "calc(30*var(--u)) 0"}}>
                <span data-stepnum="1" style={{width: "calc(76*var(--u))", height: "calc(76*var(--u))", boxSizing: "border-box", borderRadius: "50%", border: "calc(1.5*var(--u)) solid var(--pink)", background: "var(--dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "calc(24*var(--tu))", color: "#fff", transition: "background .5s ease,color .5s ease,transform .5s cubic-bezier(.16,1,.3,1)"}}>03</span>
                <div style={{paddingTop: "calc(12*var(--u))", maxWidth: "calc(330*var(--u))"}}>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(24*var(--tu))", lineHeight: "1.1", color: "#fff"}}>Création</h3>
                  <p style={{margin: "calc(12*var(--u)) 0 0", fontSize: "calc(13.5*var(--tu))", lineHeight: "calc(23*var(--tu))", color: "rgba(255,255,255,.88)"}}>Je donne vie à la direction définie, puis j’ajuste chaque détail avec vos retours. Le projet évolue au fil des échanges jusqu’à trouver le bon équilibre entre idée et réalisation.</p>
                </div>
              </li>
              <li data-step="1" style={{position: "relative", display: "grid", gridTemplateColumns: "calc(76*var(--u)) minmax(0,1fr)", columnGap: "calc(40*var(--u))", alignItems: "start", padding: "calc(30*var(--u)) 0"}}>
                <span data-stepnum="1" style={{width: "calc(76*var(--u))", height: "calc(76*var(--u))", boxSizing: "border-box", borderRadius: "50%", border: "calc(1.5*var(--u)) solid var(--pink)", background: "var(--dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "calc(24*var(--tu))", color: "#fff", transition: "background .5s ease,color .5s ease,transform .5s cubic-bezier(.16,1,.3,1)"}}>04</span>
                <div style={{paddingTop: "calc(12*var(--u))", maxWidth: "calc(330*var(--u))"}}>
                  <h3 style={{margin: "0", fontWeight: "700", fontSize: "calc(24*var(--tu))", lineHeight: "1.1", color: "#fff"}}>Livraison</h3>
                  <p style={{margin: "calc(12*var(--u)) 0 0", fontSize: "calc(13.5*var(--tu))", lineHeight: "calc(23*var(--tu))", color: "rgba(255,255,255,.88)"}}>Je vous livre tous les éléments finalisés, déclinés dans les bons formats et prêts à être utilisés sur tous vos supports. Et si vos besoins évoluent, je reste disponible pour la suite.</p>
                </div>
              </li>
            </ol>

              {/* La figurine du Processus. 72 poses sur deux planches webp.
                  Collante, elle tourne pendant qu'on lit les quatre etapes.
                  mix-blend-mode:screen -> le fond noir des images disparait.

                  Elle ne sort QUE sur mobile : masquee en CSS sous 769 px, et
                  spin() refuse d'y demarrer, sinon les deux planches (1,3 Mo)
                  se telechargeraient sur telephone pour un element invisible. */}
              <div data-tour="1" style={{position: "sticky", top: "calc(50vh - 242*var(--u))", justifySelf: "end", width: "calc(338*var(--u))", height: "calc(484*var(--u))", willChange: "opacity, transform"}} aria-hidden="true">
                <canvas data-spin="1" width="352" height="503" style={{position: "absolute", inset: "0", width: "100%", height: "100%"}}></canvas>
              </div>
            </div>
          </div>
        </section>

        <section id="apropos" data-screen-label="À propos" style={{position: "relative", overflow: "hidden", background: "#000", minHeight: "100vh", display: "flex", alignItems: "center", padding: "calc(40*var(--u)) 0 calc(32*var(--u))", scrollMarginTop: "0"}}>
          <div style={{width: "calc(1024*var(--u))", margin: "0 auto", position: "relative"}}>
            <header data-chapter="1" style={{display: "grid", gridTemplateColumns: "calc(52*var(--u)) 1fr", alignItems: "center", columnGap: "calc(20*var(--u))", rowGap: "0", padding: "0 calc(82*var(--u))", marginBottom: "calc(30*var(--u))"}}>
              <span style={{fontSize: "calc(11*var(--tu))", fontWeight: "600", letterSpacing: "calc(2.6*var(--u))", color: "var(--pink-b)"}}>04</span>
              <span data-rule="1" style={{height: "1px", background: "rgba(255,255,255,.16)", transform: "scaleX(0)", transformOrigin: "left", transition: "transform 1.2s cubic-bezier(.16,1,.3,1) .1s"}}></span>
            </header>
            <div data-aboutrow="1" style={{display: "flex", alignItems: "flex-start", gap: "calc(20*var(--u))", paddingLeft: "calc(82*var(--u))", paddingRight: "calc(82*var(--u))"}}>
              <div data-par="-34" style={{flex: "1", minWidth: "0", transform: "translateY(var(--ty,0px))", willChange: "transform"}}>
                <h2 data-reveal="1" style={{margin: "0", fontSize: "calc(28*var(--tu))", fontWeight: "800", lineHeight: "calc(33*var(--tu))", textTransform: "uppercase", letterSpacing: "calc(.5*var(--u))", color: "#fff"}}>Explorateur<br />d'idées à votre <em style={{fontStyle: "normal", color: "var(--violet-b)"}}>service</em></h2>
                <div data-abouttext="1" style={{marginTop: "calc(30*var(--u))", width: "100%", textAlign: "justify", hyphens: "auto"}}>
                  <p data-reveal="1" style={{margin: "0", fontSize: "calc(13.5*var(--tu))", lineHeight: "calc(23*var(--tu))", color: "rgba(255,255,255,.88)", maxWidth: "calc(400*var(--u))"}}>J’aime trouver des idées là où on ne les attend pas. Je suis Redha Devarenne, graphiste freelance et illustrateur. Mon travail commence souvent par une question simple : comment rendre une idée plus intéressante, plus évidente ou complètement différente ?</p>
                  <p data-reveal="1" style={{margin: "calc(18*var(--u)) 0 0", fontSize: "calc(13.5*var(--tu))", lineHeight: "calc(23*var(--tu))", color: "rgba(255,255,255,.88)", maxWidth: "calc(400*var(--u))"}}>Je cherche des concepts, j’imagine des univers, j’associe des images, des formes, des couleurs et des mots jusqu’à trouver ce petit déclic qui donne une direction au projet. J’aime expérimenter, faire des détours et mélanger les références.</p>
                  <p data-reveal="1" style={{margin: "calc(18*var(--u)) 0 0", fontSize: "calc(13.5*var(--tu))", lineHeight: "calc(23*var(--tu))", color: "rgba(255,255,255,.88)", maxWidth: "calc(400*var(--u))"}}>Identité visuelle, logo, illustration, direction artistique ou création digitale : je ne me contente pas de mettre une idée en forme. Je cherche d’abord la bonne idée à mettre en forme, quitte à prendre un chemin qui n’était pas prévu.</p>
                  <p data-reveal="1" style={{margin: "calc(18*var(--u)) 0 0", fontSize: "calc(13.5*var(--tu))", lineHeight: "calc(23*var(--tu))", color: "rgba(255,255,255,.88)", maxWidth: "calc(400*var(--u))"}}>Parce qu’une bonne idée n’arrive pas toujours en suivant la ligne droite. Mon objectif : créer des identités et des images qui ont quelque chose à dire, quelque chose à montrer et surtout, quelque chose à faire ressentir.</p>
                  <p data-reveal="1" style={{margin: "calc(18*var(--u)) 0 0", fontSize: "calc(13.5*var(--tu))", lineHeight: "calc(23*var(--tu))", color: "rgba(255,255,255,.88)", maxWidth: "calc(400*var(--u))"}}>Bienvenue dans mon univers.</p>
                </div>
                <img data-signature="1" src="/assets/img08.webp" alt="Signature Pixovery" style={{marginTop: "calc(14*var(--u))", width: "calc(176*var(--u))", height: "auto", mixBlendMode: "screen"}} width="620" height="237" decoding="async" loading="lazy" />
              </div>
              <div data-floater="1" data-par="88" data-aboutphoto="1" style={{flex: "none", width: "calc(510*var(--u))", position: "relative", top: "calc(61*var(--u))", marginRight: "calc(-40*var(--u))", transform: "translateY(var(--ty,0px))", willChange: "transform"}}>
                <video ref={this.setVideoRef} src="/assets/about-anim.mp4" autoPlay={true} muted={true} defaultmuted="" loop={true} playsInline={true} webkit-playsinline="true" preload="auto" poster="/assets/img09.webp" aria-label="Redha Devarenne au travail" style={{display: "block", width: "100%", height: "auto", mixBlendMode: "screen"}}></video>
                <i aria-hidden="true" style={{position: "absolute", left: "0", right: "0", bottom: "0", height: "calc(190*var(--u))", pointerEvents: "none", background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,.30) 40%, rgba(0,0,0,.75) 70%, #000 92%)"}}></i>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" data-screen-label="Contact" style={{position: "relative", background: "#000", padding: "calc(45*var(--u)) 0 calc(50*var(--u))", scrollMarginTop: "calc(76*var(--u))"}}>
          <div style={{width: "calc(1024*var(--u))", margin: "0 auto", position: "relative", marginBottom: "calc(30*var(--u))"}}>
            <header data-chapter="1" style={{display: "grid", gridTemplateColumns: "calc(52*var(--u)) 1fr", alignItems: "center", columnGap: "calc(20*var(--u))", padding: "0 calc(82*var(--u))"}}>
              <span style={{fontSize: "calc(11*var(--tu))", fontWeight: "600", letterSpacing: "calc(2.6*var(--u))", color: "var(--pink-b)"}}>05</span>
              <span data-rule="1" style={{height: "1px", background: "rgba(255,255,255,.16)", transform: "scaleX(0)", transformOrigin: "left", transition: "transform 1.2s cubic-bezier(.16,1,.3,1) .1s"}}></span>
            </header>
          </div>
          <div data-contactrow="1" style={{width: "calc(1024*var(--u))", boxSizing: "border-box", margin: "0 auto", position: "relative", display: "flex", alignItems: "center", gap: "calc(44*var(--u))", paddingLeft: "calc(82*var(--u))", paddingRight: "calc(82*var(--u))"}}>
            <div data-floater="1" data-par="72" data-contactphoto="1" style={{flex: "none", width: "calc(470*var(--u))", position: "relative", transform: "translateY(var(--ty,0px))", willChange: "transform"}}>
              {/* La lueur au sol. Elle debordait : posee a 74 % de haut sur 30 %, large
                  de 88 %, elle eclairait le BUREAU DEVANT la machine et pas son socle.
                  Et comme l'image est en mix-blend-mode:screen, le plateau sombre de la
                  photo est quasiment transparent : la lueur le traversait entierement.
                  Ce qu'on lisait sous le clavier n'etait donc pas un reflet mais un
                  nuage violet sans forme. Resserree sous la machine, et affaiblie. */}
              <i aria-hidden="true" style={{position: "absolute", left: "6%", right: "6%", top: "76%", height: "30%", pointerEvents: "none", zIndex: "0", background: "radial-gradient(50% 46% at 50% 34%, rgba(158,74,255,.30) 0%, rgba(126,10,255,.14) 38%, rgba(122,1,255,.05) 62%, rgba(0,0,0,0) 82%)", filter: "blur(calc(22*var(--u)))"}}></i>
              <i aria-hidden="true" style={{position: "absolute", left: "22%", right: "22%", top: "84%", height: "7%", pointerEvents: "none", zIndex: "0", background: "radial-gradient(50% 50% at 50% 50%, rgba(255,45,190,.20) 0%, rgba(226,0,107,.07) 46%, rgba(0,0,0,0) 78%)", filter: "blur(calc(14*var(--u)))"}}></i>
              {/* VRAI DETOURAGE, 26/08. img10.webp etait une photo sur fond
                  noir rendue transparente par mix-blend-mode:screen. Ca marche
                  tant que ce qui est DERRIERE est noir — or un blend ne se
                  melange pas avec la page mais avec le fond de son contexte
                  d'empilement, et ce conteneur en cree un (transform +
                  will-change). Le fond du contexte est vide, donc le noir de
                  la photo restait noir : un bloc opaque, invisible sur la
                  section noire, mais qui masquait la barre « 05 » des qu'il
                  passait dessus sur telephone.
                  img10-cut.webp porte une VRAIE couche alpha (masque du sujet,
                  trous interieurs rebouches pour que l'ecran et les ombres du
                  clavier restent opaques, frange d'1 px modulee par la
                  luminance). Plus de blend, donc plus de contexte a menager :
                  le visuel se pose sur n'importe quel fond.
                  92 Ko au lieu de 61 — l'alpha se paie, c'est le prix du
                  detourage. Garder l'original a cote : il sert de source si le
                  masque doit etre refait. */}
              {/* LE MASQUE DEGRADE DU BAS A SAUTE, et il le fallait. Il
                  commencait a 89 % de la hauteur pour estomper le reflet du
                  plateau — un reflet magenta, etale et sale, que le detourage
                  a retire pour de bon. Le sujet descend maintenant jusqu'a
                  95 % : garder le masque aurait fait disparaitre le bas du
                  clavier et la souris, pas un reflet. Si tu remets un reflet
                  dans l'image un jour, remets le masque avec. */}
              <img src="/assets/img10-cut.webp" alt="Pixovery — contact" style={{position: "relative", zIndex: "1", width: "100%", height: "auto"}} width="1000" height="1023" decoding="async" loading="lazy" />
              <div aria-hidden="true" style={{position: "absolute", left: "28.5%", top: "44.9%", width: "28.8%", height: "17.1%", overflow: "hidden", display: "flex", alignItems: "center", pointerEvents: "none", zIndex: "3", transformOrigin: "50% 50%", transform: "rotate(3.2deg)", animation: "crt-flicker 3.4s steps(1) infinite"}}>
                <div style={{display: "flex", flex: "none", animation: "crt-scroll 5.5s linear infinite", willChange: "transform"}}>
                  <span style={{fontFamily: "'VT323',monospace", fontSize: "calc(59*var(--tu))", lineHeight: "1", letterSpacing: "calc(-0.5*var(--u))", color: "#3A0233", paddingRight: "calc(26*var(--u))", whiteSpace: "nowrap", wordSpacing: "calc(-6*var(--u))"}}>SO CALL ME MAYBE</span>
                  <span style={{fontFamily: "'VT323',monospace", fontSize: "calc(59*var(--tu))", lineHeight: "1", letterSpacing: "calc(-0.5*var(--u))", color: "#3A0233", paddingRight: "calc(26*var(--u))", whiteSpace: "nowrap", wordSpacing: "calc(-6*var(--u))"}}>SO CALL ME MAYBE</span>
                </div>
                <i style={{position: "absolute", inset: "0", background: "repeating-linear-gradient(to bottom, rgba(0,0,0,.62) 0 1px, rgba(0,0,0,.16) 1px 2px, rgba(0,0,0,0) 2px 3px)", opacity: ".95", animation: "crt-roll .12s linear infinite"}}></i>
                <i style={{position: "absolute", left: "0", right: "0", top: "0", height: "38%", background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,180,240,.10) 45%, rgba(255,255,255,.22) 60%, rgba(255,180,240,.08) 75%, rgba(255,255,255,0) 100%)", mixBlendMode: "screen", animation: "crt-sweep 2.6s linear infinite", willChange: "transform"}}></i>
                <i style={{position: "absolute", inset: "0", background: "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,.08) 0%, rgba(0,0,0,0) 60%, rgba(0,0,0,.35) 100%)", mixBlendMode: "overlay"}}></i>
              </div>
              <div data-lens="l" style={{position: "absolute", overflow: "hidden", borderRadius: "30% 26% 38% 34% / 34% 34% 42% 42%", transform: "rotate(15deg) translateZ(0)", pointerEvents: "none", zIndex: "3", left: "57.95%", top: "13.20%", width: "4.55%", height: "2.80%"}}>
                <i style={{position: "absolute", left: "14%", top: "16%", width: "34%", height: "30%", borderRadius: "50%", background: "radial-gradient(ellipse at 35% 30%,rgba(255,255,255,.22),transparent 70%)", filter: "blur(calc(1.2*var(--u)))", opacity: ".55", animation: "sheen 6.5s ease-in-out infinite"}}></i>
                <i style={{position: "absolute", top: "-30%", left: "0", width: "44%", height: "160%", background: "linear-gradient(102deg, transparent 0%, rgba(217,200,255,.28) 26%, rgba(255,255,255,.95) 50%, rgba(217,200,255,.28) 74%, transparent 100%)", filter: "blur(calc(1*var(--u)))", transform: "translateX(-170%)", opacity: "0", animation: "glint 3s cubic-bezier(.35,.05,.2,1) infinite"}}></i>
                <i data-streak="1" style={{position: "absolute", top: "-30%", left: "0", width: "52%", height: "160%", background: "linear-gradient(102deg, transparent 0%, rgba(217,200,255,.22) 26%, rgba(255,255,255,.92) 50%, rgba(217,200,255,.22) 74%, transparent 100%)", filter: "blur(calc(1*var(--u)))", transform: "translateX(-160%)", opacity: "0"}}></i>
              </div>
              <div data-lens="r" style={{position: "absolute", overflow: "hidden", borderRadius: "30% 26% 38% 34% / 34% 34% 42% 42%", transform: "rotate(15deg) translateZ(0)", pointerEvents: "none", zIndex: "3", left: "64.75%", top: "14.60%", width: "4.95%", height: "3.30%"}}>
                <i style={{position: "absolute", left: "14%", top: "16%", width: "34%", height: "30%", borderRadius: "50%", background: "radial-gradient(ellipse at 35% 30%,rgba(255,255,255,.22),transparent 70%)", filter: "blur(calc(1.2*var(--u)))", opacity: ".55", animation: "sheen 6.5s ease-in-out infinite -2.7s"}}></i>
                <i style={{position: "absolute", top: "-30%", left: "0", width: "44%", height: "160%", background: "linear-gradient(102deg, transparent 0%, rgba(217,200,255,.28) 26%, rgba(255,255,255,.95) 50%, rgba(217,200,255,.28) 74%, transparent 100%)", filter: "blur(calc(1*var(--u)))", transform: "translateX(-170%)", opacity: "0", animation: "glint 3s cubic-bezier(.35,.05,.2,1) .14s infinite"}}></i>
                <i data-streak="1" style={{position: "absolute", top: "-30%", left: "0", width: "52%", height: "160%", background: "linear-gradient(102deg, transparent 0%, rgba(217,200,255,.22) 26%, rgba(255,255,255,.92) 50%, rgba(217,200,255,.22) 74%, transparent 100%)", filter: "blur(calc(1*var(--u)))", transform: "translateX(-160%)", opacity: "0"}}></i>
              </div>
            </div>
            <div data-par="-28" style={{flex: "1", minWidth: "0", maxWidth: "calc(400*var(--u))", transform: "translateY(var(--ty,0px))", willChange: "transform"}}>
              <h2 data-reveal="1" style={{margin: "0", fontWeight: "700", fontSize: "calc(40*var(--tu))", lineHeight: "calc(40*var(--tu))", textTransform: "uppercase", color: "#fff", letterSpacing: "calc(-.4*var(--u))"}}>Discutons de<br /><em style={{fontStyle: "normal", color: "var(--violet-b)"}}>votre projet</em></h2>
              <p data-reveal="1" style={{margin: "calc(18*var(--u)) 0 0", fontSize: "calc(13*var(--tu))", lineHeight: "calc(19.5*var(--tu))", color: "rgba(255,255,255,.88)"}}>Vous avez un projet, une envie ou simplement une idée qui mérite d’être explorée ? On peut commencer par en parler, sans brief compliqué ni grand discours. Le reste viendra ensuite.</p>
              <form data-form="1" noValidate={true} onSubmit={this.handleSubmit} style={{marginTop: "calc(22*var(--u))", display: "flex", flexDirection: "column", gap: "calc(14*var(--u))"}}>
                {/* CHAMP PIEGE. Invisible pour un humain, rempli par la plupart
                    des robots a spam qui remplissent tout ce qu'ils trouvent. Si
                    « botcheck » revient non vide, on jette silencieusement — on ne
                    dit pas au robot qu'il a ete repere.
                    `display:none` plutot qu'un deport hors ecran : c'est ce que
                    recommande Web3Forms, et un champ en display:none n'est jamais
                    atteint par la navigation au clavier ni annonce par un lecteur
                    d'ecran. tabIndex -1 et autoComplete off par precaution. */}
                <input type="checkbox" name="botcheck" tabIndex="-1" autoComplete="off" aria-hidden="true" style={{display: "none"}} />
                <div data-reveal="1" style={{display: "flex", gap: "calc(18*var(--u))"}}>
                  <input type="text" name="nom" placeholder="Nom" autoComplete="family-name" style={{flex: "1", minWidth: "0", width: "100%", background: "transparent", border: "0", borderBottom: "1px solid rgba(255,255,255,.18)", borderRadius: "0", color: "#fff", fontSize: "calc(15*var(--tu))", padding: "0 0 calc(8*var(--u))", height: "calc(36*var(--u))", transition: "border-color .35s ease"}} />
                  <input type="text" name="prenom" placeholder="Prénom" autoComplete="given-name" style={{flex: "1", minWidth: "0", width: "100%", background: "transparent", border: "0", borderBottom: "1px solid rgba(255,255,255,.18)", borderRadius: "0", color: "#fff", fontSize: "calc(15*var(--tu))", padding: "0 0 calc(8*var(--u))", height: "calc(36*var(--u))", transition: "border-color .35s ease"}} />
                </div>
                <input data-reveal="1" type="email" name="email" placeholder="Email" autoComplete="email" style={{width: "100%", background: "transparent", border: "0", borderBottom: "1px solid rgba(255,255,255,.18)", borderRadius: "0", color: "#fff", fontSize: "calc(15*var(--tu))", padding: "0 0 calc(8*var(--u))", height: "calc(36*var(--u))", transition: "border-color .35s ease"}} />
                <input data-reveal="1" type="text" name="sujet" placeholder="Sujet" style={{width: "100%", background: "transparent", border: "0", borderBottom: "1px solid rgba(255,255,255,.18)", borderRadius: "0", color: "#fff", fontSize: "calc(15*var(--tu))", padding: "0 0 calc(8*var(--u))", height: "calc(36*var(--u))", transition: "border-color .35s ease"}} />
                <textarea data-reveal="1" name="message" placeholder="Votre message" rows="3" style={{width: "100%", background: "transparent", border: "0", borderBottom: "1px solid rgba(255,255,255,.18)", borderRadius: "0", color: "#fff", fontSize: "calc(15*var(--tu))", height: "calc(68*var(--u))", padding: "calc(4*var(--u)) 0 calc(8*var(--u))", lineHeight: "calc(22*var(--tu))", resize: "vertical", transition: "border-color .35s ease"}}></textarea>
                <button data-reveal="1" type="submit" data-magnetic="1" style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "calc(11*var(--u))", width: "100%", height: "calc(44*var(--u))", marginTop: "calc(6*var(--u))", background: "linear-gradient(90deg,var(--pink) 0%,#FF3D8F 100%)", borderRadius: "calc(6*var(--u))", color: "#fff", fontSize: "calc(12*var(--tu))", fontWeight: "600", letterSpacing: "calc(.8*var(--u))", textTransform: "uppercase", transform: "translate(var(--mx,0px),var(--my,0px))", transition: "transform .35s cubic-bezier(.16,1,.3,1), background .25s ease"}}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" style={{width: "calc(17*var(--u))", height: "calc(17*var(--u))", fill: "#fff"}}><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"></path></svg>
                  Envoyer
                </button>
                <p data-formmsg="1" role="status" aria-live="polite" style={{margin: "0", minHeight: "calc(18*var(--u))", fontSize: "calc(12*var(--tu))", color: "var(--pink-b)"}}></p>
              </form>
            </div>
          </div>
        </section>

        <footer style={{position: "relative", background: "#000", borderTop: "1px solid rgba(255,255,255,.07)"}}>
          <div style={{width: "calc(1024*var(--u))", maxWidth: "100%", margin: "0 auto", boxSizing: "border-box", padding: "calc(30*var(--u)) calc(82*var(--u))", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "calc(12*var(--u)) calc(32*var(--u))"}}>
            <p style={{margin: "0", fontSize: "max(calc(11*var(--tu)),9px)", lineHeight: "calc(18*var(--tu))", letterSpacing: "calc(.2*var(--u))", color: "#6A6C71"}}>© 2026 Pixovery — Tous droits réservés.</p>
            <p data-legal="1" style={{margin: "0", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "calc(4*var(--u)) calc(12*var(--u))", fontSize: "max(calc(11*var(--tu)),9px)", lineHeight: "calc(18*var(--tu))", letterSpacing: "calc(.2*var(--u))"}}>
              <a href="/mentions-legales.html">Mentions légales</a>
              <span aria-hidden="true" style={{color: "rgba(255,255,255,.20)"}}>·</span>
              <a href="/confidentialite.html">Politique de confidentialité</a>
            </p>
          </div>
        </footer>
      </div>
    );
  }
}
