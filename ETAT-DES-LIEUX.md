# État des lieux — 18 août 2026 (soir)

Le point de reprise. Court volontairement : la carte technique est dans
`CLAUDE.md`, ce fichier ne dit que **où on en est**.

## À FAIRE EN PREMIER — commiter

Le dépôt n'a toujours qu'**un seul commit** (`f1e30bd`). Tout le travail de
la journée est sur le disque, non versionné.

```powershell
cd "$HOME\OneDrive\Bureau\pixonaute"
git add pixovery-app/src/components/PixoveryPage.jsx ETAT-DES-LIEUX.md
git commit -m "Services : vol disquette, opacite, intro conditionnelle"
```

Jamais `git add -A` : ça embarquerait `Pixovery Website.html` (6,6 Mo),
`_to_delete/`, `uploads/` et `screenshots/`. Fichier par fichier.

## Fait dans cette session — non revu par Redha

Tout est écrit sur le disque mais **rien n'a été validé à l'œil**. À vérifier
en premier sur `localhost:5173/?motion=full`.

- **Vol de la première disquette restauré.** Une session antérieure avait
  écrasé deux valeurs mesurées : hauteur de départ 18 vh → 4 (elle arrivait
  à plat, plus de plongeon) et zoom 2,0× → 2,8× (elle débordait du cadre et
  se faisait rogner). Les deux sont rétablies. Fenêtre `0,86 / 0,14`
  inchangée.
- **Disquettes pleines en permanence.** Elles étaient à 55 % hors survol,
  donc à moitié transparentes pendant tout leur vol. Corrigé dans le markup
  des quatre `<img>` et dans le `mouseleave`.
- **L'intro ne se joue plus qu'en arrivant par le haut.** Au rechargement
  sur Services ou Contact, elle rembobinait la page (`scrollTo(0,0)` +
  `lenis.stop()`) et imposait son écran noir. Garde `yInitial > 4` en tête
  de `intro()`.
- **Processus, étape 01** : « On se parle » → « Parlons de votre projet ».

## Quatre pièges vérifiés à la dure — ne pas les rejouer

**1. `cadence()` ne doit JAMAIS être branchée sur `gsap.ticker`.** Elle
contient le recalage d'entrée de la section (`scrollTo` + verrou). Appelée à
chaque frame, elle recale soixante fois par seconde et **le scroll de tout le
site meurt.** Un commentaire le dit dans le code.

**2. Ne pas élargir `FENETRE` pour « ralentir » le vol.** Ça ne le ralentit
pas, ça **déforme sa trajectoire** : la disquette bouge pendant que la page
monte, changer le rapport entre les deux change la courbe vue à l'écran.
Testé à 0,24 puis 0,40, rejeté à l'œil par Redha. `0,86 / 0,14` est la bonne
valeur. Pour un vol réellement plus lent il faudrait agir sur Lenis, pas ici.

**3. Un vol cadencé par le temps est condamné à être rogné.** `[data-colle]`
est un cadre `sticky top:0; height:100vh; overflow:hidden` — c'est lui qui
cache les disquettes 2 à 4 qui attendent à droite, il ne peut pas être
retiré. Il ne coïncide avec l'écran qu'une fois la section collée. **Redha
veut le pilotage au scroll : c'est tranché.**

**4. Le bloc `panneaux.forEach` contient un commentaire ouvert jamais
refermé** (« On efface tout de suite en quittant. On ne LANCE rien ici : »).
Plusieurs lignes qui suivent sont du code mort — dont un `ico.style.opacity`
qui n'a jamais rien piloté. Insérer un commentaire dedans referme le bloc au
mauvais endroit, réactive une ligne dont la variable reste commentée, et **la
page devient blanche**. Le build esbuild passe au vert malgré tout.

**Le contrôle qui attrape ça** — compiler, puis vérifier que le code est bien
dans le bundle et non noyé dans un commentaire :

```bash
cd pixovery-app/src/components
npx esbuild PixoveryPage.jsx --outfile=/tmp/out.js
grep -c "MON_IDENTIFIANT" /tmp/out.js    # 0 = c'est du commentaire
```

À faire après **chaque** édition de ce fichier.

## Abandonné, ne pas y revenir sans demander

Une **frappe caractère par caractère** sur les sous-textes de Services a été
construite puis **entièrement retirée** à la demande de Redha. Il n'en reste
rien dans le code — malgré la section que `CLAUDE.md` lui consacre encore,
qui est périmée.

## En attente de décision

- **L'intro à l'ampoule.** Diagnostic fait et validé, rien codé. La nappe
  `[data-lightwarm]` a une couleur fixe et ne varie que d'opacité, alors
  qu'un filament passe de ~1200 K à ~2700 K en 150-200 ms. Direction
  retenue : une variable `k` (température) d'où dérivent teinte, alpha et
  rayon. **Redha n'a jamais donné le feu vert.**
- **Témoignages** : les trois textes sont des remplissages et les noms sont
  inventés — à remplacer avant mise en ligne. Section absente du menu, non
  tranché (ça ferait six items).
- **Avertissement React** : `fetchPriority` sur une `<img>` du portfolio
  devrait s'écrire `fetchpriority`. Cosmétique.

## Note de méthode

`CLAUDE.md` décrit par endroits du code qui n'existe pas. **Vérifier par grep
avant de faire confiance à la doc.** Une session a rédigé la documentation
d'un correctif sans jamais l'appliquer.
