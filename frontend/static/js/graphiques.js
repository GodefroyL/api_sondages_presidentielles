// Trace un graphique multi-courbes (dates en abscisse, valeurs en pourcentage en ordonnée), avec un axe des ordonnées fixe et une zone de tracé qui défile horizontalement.

//   tracerGraphique(listeDeCourbes, listeDeLegendes);
//      listeDeCourbes  : tableau de courbes ; chaque courbe est un tableau de points [date, valeur], où date est une Date ou une chaîne interprétable par `new Date()`, et valeur un nombre (%).
//      listeDeLegendes : tableau de chaînes, une légende par courbe, dans le même ordre que listeDeCourbes.

const DIMENSIONS_BASE = {
  pixelsParJour: 3,      // largeur horizontale allouée à chaque jour
  largeurAxeY: 50,
  hauteur: 380,
  margeHaut: 20,
  margeBas: 30,
  margeGauche: 20,
  margeDroite: 20,
  nombreGraduationsY: 5
};
if (screen.width < 1000) {
  DIMENSIONS_BASE.pixelsParJour = 2;
  DIMENSIONS_BASE.largeurAxeY = 32;
  DIMENSIONS_BASE.hauteur =200;
  DIMENSIONS_BASE.margeHaut = 10;
  DIMENSIONS_BASE.margeBas = 20;
  DIMENSIONS_BASE.margeGauche = 5;
  DIMENSIONS_BASE.margeDroite = 5;
}

const ZOOM_X_MIN = 0.3;
const ZOOM_X_MAX = 10;
const ZOOM_Y_MIN = 1;   // 1 = le graphique tient exactement dans la hauteur de base
const ZOOM_Y_MAX = 20;

// Mapping des couleurs politiques pour les principaux partis français
const COULEURS_POLITIQUES = {
  // Extrême gauche
  "LO": "hsl(0, 100%, 45%)",       // Rouge (Lutte Ouvrière)
  "NPA": "hsl(0, 100%, 45%)",      // Rouge
  "PCF": "hsl(0, 100%, 45%)",      // Rouge (Parti Communiste)
  "LFI": "hsl(0, 100%, 40%)",      // Rouge foncé (La France Insoumise)
  "PS": "hsl(330, 100%, 50%)",     // Rose (Parti Socialiste)
  "PP": "hsl(15, 100%, 50%)",      // Orange-rouge (Place Publique/Glucksmann)
  "EELV": "hsl(140, 70%, 35%)",    // Vert (Europe Écologie Les Verts)
  "REN": "hsl(30, 100%, 50%)",     // Orange (Renaissance/Macron)
  "RE": "hsl(30, 100%, 50%)",      // Orange
  "HOR": "hsl(200, 100%, 45%)",    // Bleu clair (Horizons/Philippe)
  "MoDem": "hsl(45, 100%, 50%)",   // Jaune-orange (Bayrou)
  "LR": "hsl(220, 100%, 40%)",     // Bleu (Les Républicains)
  "DLF": "hsl(220, 100%, 35%)",    // Bleu foncé (Debout la France)
  "RN": "hsl(220, 100%, 20%)",     // Bleu marine (Rassemblement National)
  "REC": "hsl(220, 100%, 10%)",    // Bleu marine (Reconquête/Zemmour)
};

// Styles de courbe par année d'élection
const STYLES_PAR_ANNEE = {
  2017: { strokeWidth: 2, strokeDasharray: "5,3", opacity: 0.7 },  // Pointillés, moins opaque
  2022: { strokeWidth: 2, strokeDasharray: "5,3", opacity: 0.7 },  // Pointillés
  2027: { strokeWidth: 3, strokeDasharray: "none", opacity: 1.0 }, // Trait plein, plus épais
};


const etat = {
  courbes: null,
  legendes: null,
  zoomX: 1,
  zoomY: 1,
  ecouteursInstalles: false
};

// ---- Fonction principale : orchestre l'ensemble du tracé ----
export function tracerGraphique(listeDeCourbes, listeDeLegendes) {
  etat.courbes = listeDeCourbes;
  etat.legendes = listeDeLegendes;
  etat.zoomX = 1;
  etat.zoomY = 1;

  const elements = recupererElementsHtml();
  preparerZonesDefilement(elements);
  dessinerTout();

  if (!etat.ecouteursInstalles) {
    activerDefilementParGlissement(elements.graphique);
    activerSynchronisationAxeY(elements.graphique, elements.axeFixe);
    activerZoom(elements.graphique);
    etat.ecouteursInstalles = true;
  }
}

// Tout ce qui dépend du zoom est ici : appelé au premier tracé et à chaque zoom
function dessinerTout() {
  const elements = recupererElementsHtml();
  const couleurs = genererCouleurs(etat.legendes);
  const courbesNormalisees = normaliserCourbes(etat.courbes);
  const courbesMoyennees = courbesNormalisees.map(moyennerPointsParDate);
  const echelles = calculerEchelles(courbesNormalisees);
  const dimensions = calculerDimensions(echelles);
  const positionX = creerFonctionPositionX(echelles, dimensions);
  const positionY = creerFonctionPositionY(echelles, dimensions);

  dessinerAxeY(elements.axeFixe, echelles, dimensions, positionY);
  const svgPrincipal = dessinerGraphiquePrincipal(
    elements.graphique, courbesNormalisees, courbesMoyennees, etat.legendes, couleurs, echelles, dimensions, positionX, positionY
  );
  dessinerLegende(elements.legendeGraphique, etat.legendes, couleurs);
  activerInfoBulle(svgPrincipal, elements.zoneSurvol); // nouveau SVG à chaque fois, donc on réattache
}

// ---- Récupération des éléments HTML cibles (par id) ----
function recupererElementsHtml() {
  return {
    zoneGraphique: document.getElementById('zone_graphique'),
    legendeGraphique: document.getElementById('legende_graphique'),
    axeFixe: document.getElementById('axe_fixe'),
    graphique: document.getElementById('graphique'),
    zoneSurvol: document.getElementById('survol_points')
  };
}

// Génère une couleur pour un candidat en fonction de son parti
function genererCouleurPourCandidat(nom) {
  // Extraire le parti entre parenthèses (ex: "Le Pen (RN)" -> "RN")
  const match = nom.match(/\(([A-Z]+)\)/);
  const parti = match ? match[1] : null;

  // Si le parti est connu, utiliser sa couleur
  if (parti && COULEURS_POLITIQUES[parti]) {
    return COULEURS_POLITIQUES[parti];
  }

  // Sinon, générer une couleur basée sur le nom (pour les candidats sans parti identifié)
  let hash = 0;
  for (let i = 0; i < nom.length; i++) {
    hash = nom.charCodeAt(i) + ((hash << 5) - hash);
  }
  const teinte = Math.abs(hash) % 360;
  return `hsl(${teinte}, 70%, 45%)`;
}

function genererCouleurs(listeDeLegendes) {
  return listeDeLegendes.map(nom => genererCouleurPourCandidat(nom));
}

// Tous les points sont conservés (y compris plusieurs points à la même date) : ils servent ensuite pour l'affichage au survol.
function normaliserCourbes(listeDeCourbes) {
  return listeDeCourbes.map(courbe =>
    courbe
      .map(([date, valeur]) => ({ date: date instanceof Date ? date : new Date(date), valeur }))
      .sort((pointA, pointB) => pointA.date - pointB.date)
  );
}

// Quand plusieurs points partagent la même date, la ligne tracée doit passer par leur valeur moyenne.
function moyennerPointsParDate(courbe) {
  const groupesParDate = new Map();

  courbe.forEach(point => {
    const cle = point.date.getTime();
    if (!groupesParDate.has(cle)) {
      groupesParDate.set(cle, { date: point.date, valeurs: [] });
    }
    groupesParDate.get(cle).valeurs.push(point.valeur);
  });

  return Array.from(groupesParDate.values()).map(groupe => ({
    date: groupe.date,
    valeur: groupe.valeurs.reduce((somme, valeur) => somme + valeur, 0) / groupe.valeurs.length
  }));
}

// Calcul des bornes globales (dates et valeurs, toutes courbes confondues)
function calculerEchelles(courbesNormalisees) {
  const tousLesPoints = courbesNormalisees.flat();
  const toutesLesDates = tousLesPoints.map(point => point.date.getTime());
  const toutesLesValeurs = tousLesPoints.map(point => point.valeur);

  const dateMin = new Date(Math.min(...toutesLesDates));
  const dateMax = new Date(Math.max(...toutesLesDates));
  const valeurMinBrute = Math.min(...toutesLesValeurs);
  const valeurMaxBrute = Math.max(...toutesLesValeurs);

  // Marge visuelle de 10% au-dessus/en dessous des valeurs, bornée à [0, 100]
  const ecartValeurs = (valeurMaxBrute - valeurMinBrute) || 1;
  const valeurMin = Math.max(0, Math.floor(valeurMinBrute - ecartValeurs * 0.1));
  const valeurMax = Math.min(100, Math.ceil(valeurMaxBrute + ecartValeurs * 0.1));

  return { dateMin, dateMax, valeurMin, valeurMax };
}

// Calcul des dimensions du graphique en fonction de la plage de dates et du zoom
function calculerDimensions(echelles) {
  const pixelsParJour = DIMENSIONS_BASE.pixelsParJour * etat.zoomX;
  const nombreJours = Math.max(1, Math.round((echelles.dateMax - echelles.dateMin) / (1000 * 60 * 60 * 24)));
  const largeurGraphique = nombreJours * pixelsParJour;
  const largeurTotale = DIMENSIONS_BASE.margeGauche + largeurGraphique + DIMENSIONS_BASE.margeDroite;

  // Le zoom vertical agrandit la hauteur du SVG ; on ajoute des graduations pour garder un espacement constant
  const hauteur = DIMENSIONS_BASE.hauteur * etat.zoomY;
  const nombreGraduationsY = Math.max(DIMENSIONS_BASE.nombreGraduationsY, Math.round(DIMENSIONS_BASE.nombreGraduationsY * etat.zoomY));

  return { ...DIMENSIONS_BASE, pixelsParJour, hauteur, nombreGraduationsY, largeurTotale };
}

// Fonction d'échelle : date -> position horizontale en pixels
function creerFonctionPositionX(echelles, dimensions) {
  return function positionX(date) {
    const jours = (date - echelles.dateMin) / (1000 * 60 * 60 * 24);
    return DIMENSIONS_BASE.margeGauche + jours * dimensions.pixelsParJour;
  };
}

// Fonction d'échelle : valeur -> position verticale en pixels
function creerFonctionPositionY(echelles, dimensions) {
  return function positionY(valeur) {
    const hauteurUtile = dimensions.hauteur - dimensions.margeHaut - dimensions.margeBas;
    return dimensions.margeHaut + hauteurUtile
      - ((valeur - echelles.valeurMin) / (echelles.valeurMax - echelles.valeurMin)) * hauteurUtile;
  };
}

// Construction du SVG de l'axe Y (fixe, hors zone de défilement)
function dessinerAxeY(axeFixe, echelles, dimensions, positionY) {
  const svgAxeY = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgAxeY.setAttribute('id', 'svg_axe_y');
  svgAxeY.setAttribute('width', dimensions.largeurAxeY);
  svgAxeY.setAttribute('height', dimensions.hauteur);
  svgAxeY.setAttribute('viewBox', `0 0 ${dimensions.largeurAxeY} ${dimensions.hauteur}`);
  svgAxeY.innerHTML = construireGraduationsAxeY(echelles, dimensions, positionY);

  axeFixe.innerHTML = '';
  axeFixe.appendChild(svgAxeY);
}

// Construction des graduations et du trait vertical de l'axe Y
function construireGraduationsAxeY(echelles, dimensions, positionY) {
  let contenu = '';
  for (let i = 0; i <= dimensions.nombreGraduationsY; i++) {
    const valeur = echelles.valeurMin + (i / dimensions.nombreGraduationsY) * (echelles.valeurMax - echelles.valeurMin);
    const y = positionY(valeur);
    contenu += `<text class="etiquette_axe" x="${dimensions.largeurAxeY - 10}" y="${y + 4}" text-anchor="end">${formaterValeurAxeY(valeur, (echelles.valeurMax - echelles.valeurMin) / dimensions.nombreGraduationsY)}%</text>`;
    contenu += `<line class="trait_axe" x1="${dimensions.largeurAxeY - 4}" y1="${y}" x2="${dimensions.largeurAxeY}" y2="${y}" />`;
  }
  contenu += `<line class="trait_axe" x1="${dimensions.largeurAxeY}" y1="${dimensions.margeHaut}" x2="${dimensions.largeurAxeY}" y2="${dimensions.hauteur - dimensions.margeBas}" />`;
  return contenu;
}

// Construction du SVG principal (zone défilante)
function dessinerGraphiquePrincipal(elementGraphique, courbesNormalisees, courbesMoyennees, listeDeLegendes, couleurs, echelles, dimensions, positionX, positionY) {
  const svgPrincipal = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgPrincipal.setAttribute('id', 'svg_graphique');
  svgPrincipal.setAttribute('width', dimensions.largeurTotale);
  svgPrincipal.setAttribute('height', dimensions.hauteur);
  svgPrincipal.setAttribute('viewBox', `0 0 ${dimensions.largeurTotale} ${dimensions.hauteur}`);

  let contenu = '';
  contenu += dessinerGrilleHorizontale(echelles, dimensions, positionY);
  contenu += dessinerGraduationsMensuellesAxeX(echelles, dimensions, positionX);
  contenu += dessinerLigneAxeX(dimensions);
  contenu += dessinerCourbes(courbesMoyennees, couleurs, positionX, positionY, etat.legendes);
  contenu += dessinerPointsSurvolables(courbesNormalisees, listeDeLegendes, couleurs, positionX, positionY);

  svgPrincipal.innerHTML = contenu;
  elementGraphique.innerHTML = '';
  elementGraphique.appendChild(svgPrincipal);

  return svgPrincipal;
}

// Grille horizontale, alignée sur les graduations de l'axe Y fixe
function dessinerGrilleHorizontale(echelles, dimensions, positionY) {
  let contenu = '';
  for (let i = 0; i <= dimensions.nombreGraduationsY; i++) {
    const valeur = echelles.valeurMin + (i / dimensions.nombreGraduationsY) * (echelles.valeurMax - echelles.valeurMin);
    const y = positionY(valeur);
    contenu += `<line class="grille" x1="0" y1="${y}" x2="${dimensions.largeurTotale}" y2="${y}" />`;
  }
  return contenu;
}

// Grille verticale et étiquettes de l'axe X : une graduation par mois
function dessinerGraduationsMensuellesAxeX(echelles, dimensions, positionX) {
  let contenu = '';
  let moisPrecedent = null;
  const dateCourante = new Date(echelles.dateMin);

  while (dateCourante <= echelles.dateMax) {
    const cleMois = dateCourante.getFullYear() * 12 + dateCourante.getMonth();
    if (cleMois !== moisPrecedent) {
      const x = positionX(dateCourante);
      contenu += `<line class="grille" x1="${x}" y1="${dimensions.margeHaut}" x2="${x}" y2="${dimensions.hauteur - dimensions.margeBas}" />`;
      const etiquette = dateCourante.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      contenu += `<text class="etiquette_axe" x="${x}" y="${dimensions.hauteur - dimensions.margeBas + 16}" text-anchor="middle">${etiquette}</text>`;
      moisPrecedent = cleMois;
    }
    dateCourante.setDate(dateCourante.getDate() + 1);
  }

  return contenu;
}

// Ligne horizontale du bas (axe X)
function dessinerLigneAxeX(dimensions) {
  return `<line class="trait_axe" x1="0" y1="${dimensions.hauteur - dimensions.margeBas}" x2="${dimensions.largeurTotale}" y2="${dimensions.hauteur - dimensions.margeBas}" />`;
}

// Tracé de la ligne (polyline) de chaque courbe, à partir des points moyennés par date
// Tracé de la ligne (polyline) de chaque courbe, à partir des points moyennés par date
function dessinerCourbes(courbesMoyennees, couleurs, positionX, positionY, legendes) {
  let contenu = '';
  courbesMoyennees.forEach((courbe, indiceCourbe) => {
    const pointsLigne = courbe.map(point => `${positionX(point.date)},${positionY(point.valeur)}`).join(' ');
    
    // Extraire l'année depuis le nom du candidat (ex: "Le Pen (RN) 2027" -> 2027)
    const nomCandidat = legendes[indiceCourbe];
    const anneeMatch = nomCandidat.match(/(\d{4})/);
    const annee = anneeMatch ? parseInt(anneeMatch[0]) : 2027;
    
    // Récupérer le style pour cette année
    const style = STYLES_PAR_ANNEE[annee] || STYLES_PAR_ANNEE[2027];
    
    contenu += `<polyline 
      class="courbe" 
      points="${pointsLigne}" 
      stroke="${couleurs[indiceCourbe]}"
      stroke-width="${style.strokeWidth}"
      stroke-dasharray="${style.strokeDasharray}"
      opacity="${style.opacity}"
      data-courbe="${indiceCourbe}"
    />`;
  });
  return contenu;
}

// Cercles semi-transparents servant au survol (tous les points)
function dessinerPointsSurvolables(courbesNormalisees, listeDeLegendes, couleurs, positionX, positionY) {
  let contenu = '';
  let indiceGlobal = 0;

  courbesNormalisees.forEach((courbe, indiceCourbe) => {
    courbe.forEach((point) => {
      const x = positionX(point.date);
      const y = positionY(point.valeur);
      let r = 3;
      if (screen.width < 1000) {r = 1.5;}
      contenu += `<circle class="point_survol" id="point_${indiceGlobal}" cx="${x}" cy="${y}" r="${r}" fill="${couleurs[indiceCourbe]}"
        data-date="${point.date.toLocaleDateString('fr-FR')}" data-valeur="${point.valeur}" data-legende="${listeDeLegendes[indiceCourbe]}" />`;
      indiceGlobal++;
    });
  });

  return contenu;
}

// Construction (ou mise à jour) de la légende des courbes
function dessinerLegende(legendeGraphique, listeDeLegendes, couleurs) {
  legendeGraphique.innerHTML = listeDeLegendes
    .map((nom, indice) => `
      <span class="item_legende">
        <span class="pastille_legende" style="background:${couleurs[indice]};"></span>
        ${nom}
      </span>
    `)
    .join('');
}

// Mise en place des écouteurs pour l'info-bulle au survol des points
function activerInfoBulle(svgPrincipal, zoneSurvol) {
  svgPrincipal.addEventListener('mousemove', evenement => afficherInfoBulle(evenement, zoneSurvol));
  svgPrincipal.addEventListener('mouseleave', () => masquerInfoBulle(zoneSurvol));
}

// Affichage de l'info-bulle si la souris survole un point
function afficherInfoBulle(evenement, zoneSurvol) {
  if (!evenement.target.classList.contains('point_survol')) {
    masquerInfoBulle(zoneSurvol);
    return;
  }
  const cible = evenement.target.dataset;
  let date = cible.date.slice(-4);
  // Ajustement de la date pour corriger le décalage de date : 2022 -> -5 ans, 2017 -> -10 ans
  if (cible.legende.includes('2022')) {date = cible.date.slice(0, 6) + String(Number(date) - 5);}
  if(cible.legende.includes('2017')) {date = cible.date.slice(0, 6) + String(Number(date) - 10);}
  if(cible.legende.includes('2027')) {date = cible.date}

  zoneSurvol.classList.add('visible');
  zoneSurvol.style.left = (evenement.clientX + 12) + 'px';
  zoneSurvol.style.top = (evenement.clientY - 10) + 'px';
  zoneSurvol.textContent = `${cible.legende} — ${date} : ${cible.valeur}%`;
}

// ---- Masquage de l'info-bulle ----
function masquerInfoBulle(zoneSurvol) {
  zoneSurvol.classList.remove('visible');
}

// ---- Mise en place du glisser-déplacer pour faire défiler horizontalement ----
function activerDefilementParGlissement(elementGraphique) {
  let clicEnfonce = false;
  let positionDepart = 0;
  let defilementDepart = 0;
  let positionDepartY = 0;
  let defilementDepartY = 0;

  elementGraphique.addEventListener('mousedown', evenement => {
    clicEnfonce = true;
    positionDepart = evenement.pageX;
    defilementDepart = elementGraphique.scrollLeft;
    positionDepartY = evenement.pageY;
    defilementDepartY = elementGraphique.scrollTop;
  });

  window.addEventListener('mouseup', () => {
    clicEnfonce = false;
  });

  elementGraphique.addEventListener('mousemove', evenement => {
    if (!clicEnfonce) return;
    evenement.preventDefault();
    elementGraphique.scrollLeft = defilementDepart - (evenement.pageX - positionDepart);
    elementGraphique.scrollTop = defilementDepartY - (evenement.pageY - positionDepartY);
  });
}

// ---- Zones de défilement : hauteur fixe, défilement dans les deux sens, axe Y synchronisé ----
function preparerZonesDefilement(elements) {
  if (!document.getElementById('style_graphique_zoom')) {
    const style = document.createElement('style');
    style.id = 'style_graphique_zoom';
    style.textContent = `
      #graphique::-webkit-scrollbar { display: none; }
      #svg_graphique, #svg_axe_y { display: block; }
    `;
    document.head.appendChild(style);
  }
  // Fenêtre visible = hauteur de base ; le SVG, lui, grandit avec le zoom vertical
  elements.graphique.style.height = DIMENSIONS_BASE.hauteur + 'px';
  elements.graphique.style.overflow = 'auto';
  elements.graphique.style.scrollbarWidth = 'none';
  elements.axeFixe.style.height = DIMENSIONS_BASE.hauteur + 'px';
  elements.axeFixe.style.overflow = 'hidden';
}

// L'axe Y reste fixe horizontalement mais suit le défilement vertical du graphique
function activerSynchronisationAxeY(elementGraphique, axeFixe) {
  elementGraphique.addEventListener('scroll', () => {
    axeFixe.scrollTop = elementGraphique.scrollTop;
  });
}

// Étiquettes de l'axe Y : des décimales apparaissent quand le zoom est fort
function formaterValeurAxeY(valeur, pas) {
  const decimales = pas >= 1 ? 0 : (pas >= 0.1 ? 1 : 2);
  return valeur.toFixed(decimales);
}

// ---- Zoom horizontal et vertical ----
// ancreX / ancreY : position (en pixels, dans la zone visible) du point qui doit rester immobile
function appliquerZoom(nouveauZoomX, nouveauZoomY, ancreX, ancreY) {
  const elementGraphique = document.getElementById('graphique');
  const axeFixe = document.getElementById('axe_fixe');
  const zoomX = Math.min(ZOOM_X_MAX, Math.max(ZOOM_X_MIN, nouveauZoomX));
  const zoomY = Math.min(ZOOM_Y_MAX, Math.max(ZOOM_Y_MIN, nouveauZoomY));
  if (zoomX === etat.zoomX && zoomY === etat.zoomY) return;

  // Ce qui se trouve sous l'ancre avant le zoom : un nombre de jours (X) et une fraction de hauteur utile (Y)
  const pxJourAvant = DIMENSIONS_BASE.pixelsParJour * etat.zoomX;
  const joursSousAncre = (elementGraphique.scrollLeft + ancreX - DIMENSIONS_BASE.margeGauche) / pxJourAvant;
  const hauteurUtile = zoom => DIMENSIONS_BASE.hauteur * zoom - DIMENSIONS_BASE.margeHaut - DIMENSIONS_BASE.margeBas;
  const fractionSousAncre = (elementGraphique.scrollTop + ancreY - DIMENSIONS_BASE.margeHaut) / hauteurUtile(etat.zoomY);

  etat.zoomX = zoomX;
  etat.zoomY = zoomY;
  dessinerTout();

  // On recale le défilement pour que ces mêmes points restent sous l'ancre
  const pxJourApres = DIMENSIONS_BASE.pixelsParJour * zoomX;
  elementGraphique.scrollLeft = DIMENSIONS_BASE.margeGauche + joursSousAncre * pxJourApres - ancreX;
  elementGraphique.scrollTop = DIMENSIONS_BASE.margeHaut + fractionSousAncre * hauteurUtile(zoomY) - ancreY;
  axeFixe.scrollTop = elementGraphique.scrollTop;
}

function activerZoom(elementGraphique) {
  // --- Ordinateur : Ctrl + molette, et pincement sur pavé tactile (envoyé comme Ctrl + molette) ---
  // Par défaut les deux axes zooment ; Alt = axe Y seul ; Maj = axe X seul
  elementGraphique.addEventListener('wheel', evenement => {
    if (!evenement.ctrlKey) return; // sans Ctrl : défilement normal
    evenement.preventDefault();     // empêche le zoom de la page entière

    const delta = Math.max(-100, Math.min(100, evenement.deltaY));
    const facteur = Math.exp(-delta * 0.005);
    const rect = elementGraphique.getBoundingClientRect();
    const zoomerX = !evenement.altKey;
    const zoomerY = !evenement.shiftKey;
    appliquerZoom(
      zoomerX ? etat.zoomX * facteur : etat.zoomX,
      zoomerY ? etat.zoomY * facteur : etat.zoomY,
      evenement.clientX - rect.left,
      evenement.clientY - rect.top
    );
  }, { passive: false });

  // --- Téléphone : pincement à deux doigts ---
  // Doigts surtout alignés verticalement -> zoom Y ; horizontalement -> zoom X ; en diagonale -> les deux
  let depart = null;

  const mesurer = touches => ({
    dx: Math.abs(touches[0].clientX - touches[1].clientX),
    dy: Math.abs(touches[0].clientY - touches[1].clientY),
    distance: Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  });

  elementGraphique.addEventListener('touchstart', evenement => {
    if (evenement.touches.length === 2) {
      const mesure = mesurer(evenement.touches);
      let mode = 'les_deux';
      if (mesure.dy > 2 * mesure.dx) mode = 'y';
      else if (mesure.dx > 2 * mesure.dy) mode = 'x';
      depart = { ...mesure, mode, zoomX: etat.zoomX, zoomY: etat.zoomY };
    }
  }, { passive: true });

  elementGraphique.addEventListener('touchmove', evenement => {
    if (evenement.touches.length !== 2 || !depart) return;
    evenement.preventDefault(); // pas de zoom de page ni de défilement pendant le pincement

    const mesure = mesurer(evenement.touches);
    const rect = elementGraphique.getBoundingClientRect();
    const ancreX = (evenement.touches[0].clientX + evenement.touches[1].clientX) / 2 - rect.left;
    const ancreY = (evenement.touches[0].clientY + evenement.touches[1].clientY) / 2 - rect.top;

    let nouveauZoomX = depart.zoomX;
    let nouveauZoomY = depart.zoomY;
    if (depart.mode === 'x') {
      nouveauZoomX = depart.zoomX * (mesure.dx / depart.dx);
    } else if (depart.mode === 'y') {
      nouveauZoomY = depart.zoomY * (mesure.dy / depart.dy);
    } else {
      const ratio = mesure.distance / depart.distance;
      nouveauZoomX = depart.zoomX * ratio;
      nouveauZoomY = depart.zoomY * ratio;
    }
    appliquerZoom(nouveauZoomX, nouveauZoomY, ancreX, ancreY);
  }, { passive: false });

  elementGraphique.addEventListener('touchend', evenement => {
    if (evenement.touches.length < 2) depart = null;
  }, { passive: true });
}