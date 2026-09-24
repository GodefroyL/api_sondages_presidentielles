// ============================================================
// graphique.js
//
// Trace un graphique multi-courbes (dates en abscisse, valeurs
// en pourcentage en ordonnée), avec un axe des ordonnées fixe
// et une zone de tracé qui défile horizontalement.
//
// Structure HTML attendue :
//   <div id="zone_graphique">
//     <div id="axe_fixe"></div>
//     <div id="graphique"></div>
//   </div>
//   <div id="survol_points"></div>
//
// Le style est géré par graphique.css (à inclure dans la page).
//
// Utilisation :
//   tracerGraphique(listeDeCourbes, listeDeLegendes);
//
//   listeDeCourbes  : tableau de courbes ; chaque courbe est un
//                     tableau de points [date, valeur], où date
//                     est une Date ou une chaîne interprétable
//                     par `new Date()`, et valeur un nombre (%).
//   listeDeLegendes : tableau de chaînes, une légende par courbe,
//                     dans le même ordre que listeDeCourbes.
// ============================================================

const DIMENSIONS_BASE = {
  pixelsParJour: 4,      // largeur horizontale allouée à chaque jour
  largeurAxeY: 50,
  hauteur: 380,
  margeHaut: 20,
  margeBas: 30,
  margeDroite: 20,
  nombreGraduationsY: 5
};

// ---- Fonction principale : orchestre l'ensemble du tracé ----
export function tracerGraphique(listeDeCourbes, listeDeLegendes) {
  const elements = recupererElementsHtml();
  const couleurs = genererCouleurs(listeDeLegendes.length);
  const courbesNormalisees = normaliserCourbes(listeDeCourbes);
  const courbesMoyennees = courbesNormalisees.map(moyennerPointsParDate);
  const echelles = calculerEchelles(courbesNormalisees);
  const dimensions = calculerDimensions(echelles);
  const positionX = creerFonctionPositionX(echelles, dimensions);
  const positionY = creerFonctionPositionY(echelles, dimensions);

  dessinerAxeY(elements.axeFixe, echelles, dimensions, positionY);
  const svgPrincipal = dessinerGraphiquePrincipal(
    elements.graphique, courbesNormalisees, courbesMoyennees, listeDeLegendes, couleurs, echelles, dimensions, positionX, positionY
  );

  dessinerLegende(elements.legendeGraphique, listeDeLegendes, couleurs);
  activerInfoBulle(svgPrincipal, elements.zoneSurvol);
  activerDefilementParGlissement(elements.graphique);
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

// ---- Attribution d'une couleur par courbe ----
// Les teintes sont réparties uniformément sur le cercle chromatique (360°),
// ce qui garantit des couleurs toujours distinctes quel que soit le nombre
// de courbes (contrairement à une palette fixe, limitée en nombre de couleurs).
function genererCouleurs(nombreCourbes) {
  const couleurs = [];
  for (let indice = 0; indice < nombreCourbes; indice++) {
    const teinte = Math.round((indice * 360) / nombreCourbes);
    couleurs.push(`hsl(${teinte}, 70%, 45%)`);
  }
  return couleurs;
}

// ---- Conversion des dates + tri chronologique de chaque courbe ----
// Tous les points sont conservés (y compris plusieurs points à la même date) :
// ils servent ensuite pour l'affichage au survol.
function normaliserCourbes(listeDeCourbes) {
  return listeDeCourbes.map(courbe =>
    courbe
      .map(([date, valeur]) => ({ date: date instanceof Date ? date : new Date(date), valeur }))
      .sort((pointA, pointB) => pointA.date - pointB.date)
  );
}

// ---- Calcul d'une courbe "moyennée" : un seul point par date ----
// Quand plusieurs points partagent la même date, la ligne tracée doit passer
// par leur valeur moyenne plutôt que de zigzaguer entre eux.
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

// ---- Calcul des bornes globales (dates et valeurs, toutes courbes confondues) ----
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

// ---- Calcul des dimensions du graphique en fonction de la plage de dates ----
function calculerDimensions(echelles) {
  const nombreJours = Math.max(1, Math.round((echelles.dateMax - echelles.dateMin) / (1000 * 60 * 60 * 24)));
  const largeurGraphique = nombreJours * DIMENSIONS_BASE.pixelsParJour;
  const largeurTotale = largeurGraphique + DIMENSIONS_BASE.margeDroite;
  return { ...DIMENSIONS_BASE, largeurTotale };
}

// ---- Fonction d'échelle : date -> position horizontale en pixels ----
function creerFonctionPositionX(echelles, dimensions) {
  return function positionX(date) {
    const jours = (date - echelles.dateMin) / (1000 * 60 * 60 * 24);
    return jours * dimensions.pixelsParJour;
  };
}

// ---- Fonction d'échelle : valeur -> position verticale en pixels ----
function creerFonctionPositionY(echelles, dimensions) {
  return function positionY(valeur) {
    const hauteurUtile = dimensions.hauteur - dimensions.margeHaut - dimensions.margeBas;
    return dimensions.margeHaut + hauteurUtile
      - ((valeur - echelles.valeurMin) / (echelles.valeurMax - echelles.valeurMin)) * hauteurUtile;
  };
}

// ---- Construction du SVG de l'axe Y (fixe, hors zone de défilement) ----
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

// ---- Construction des graduations et du trait vertical de l'axe Y ----
function construireGraduationsAxeY(echelles, dimensions, positionY) {
  let contenu = '';
  for (let i = 0; i <= dimensions.nombreGraduationsY; i++) {
    const valeur = echelles.valeurMin + (i / dimensions.nombreGraduationsY) * (echelles.valeurMax - echelles.valeurMin);
    const y = positionY(valeur);
    contenu += `<text class="etiquette_axe" x="${dimensions.largeurAxeY - 10}" y="${y + 4}" text-anchor="end">${Math.round(valeur)}%</text>`;
    contenu += `<line class="trait_axe" x1="${dimensions.largeurAxeY - 4}" y1="${y}" x2="${dimensions.largeurAxeY}" y2="${y}" />`;
  }
  contenu += `<line class="trait_axe" x1="${dimensions.largeurAxeY}" y1="${dimensions.margeHaut}" x2="${dimensions.largeurAxeY}" y2="${dimensions.hauteur - dimensions.margeBas}" />`;
  return contenu;
}

// ---- Construction du SVG principal (zone défilante) ----
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
  contenu += dessinerCourbes(courbesMoyennees, couleurs, positionX, positionY);
  contenu += dessinerPointsSurvolables(courbesNormalisees, listeDeLegendes, couleurs, positionX, positionY);

  svgPrincipal.innerHTML = contenu;
  elementGraphique.innerHTML = '';
  elementGraphique.appendChild(svgPrincipal);

  return svgPrincipal;
}

// ---- Grille horizontale, alignée sur les graduations de l'axe Y fixe ----
function dessinerGrilleHorizontale(echelles, dimensions, positionY) {
  let contenu = '';
  for (let i = 0; i <= dimensions.nombreGraduationsY; i++) {
    const valeur = echelles.valeurMin + (i / dimensions.nombreGraduationsY) * (echelles.valeurMax - echelles.valeurMin);
    const y = positionY(valeur);
    contenu += `<line class="grille" x1="0" y1="${y}" x2="${dimensions.largeurTotale}" y2="${y}" />`;
  }
  return contenu;
}

// ---- Grille verticale et étiquettes de l'axe X : une graduation par mois ----
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

// ---- Ligne horizontale du bas (axe X) ----
function dessinerLigneAxeX(dimensions) {
  return `<line class="trait_axe" x1="0" y1="${dimensions.hauteur - dimensions.margeBas}" x2="${dimensions.largeurTotale}" y2="${dimensions.hauteur - dimensions.margeBas}" />`;
}

// ---- Tracé de la ligne (polyline) de chaque courbe, à partir des points moyennés par date ----
function dessinerCourbes(courbesMoyennees, couleurs, positionX, positionY) {
  let contenu = '';
  courbesMoyennees.forEach((courbe, indiceCourbe) => {
    const pointsLigne = courbe.map(point => `${positionX(point.date)},${positionY(point.valeur)}`).join(' ');
    contenu += `<polyline class="courbe" points="${pointsLigne}" stroke="${couleurs[indiceCourbe]}" data-courbe="${indiceCourbe}" />`;
  });
  return contenu;
}

// ---- Cercles semi-transparents servant au survol (tous les points) ----
function dessinerPointsSurvolables(courbesNormalisees, listeDeLegendes, couleurs, positionX, positionY) {
  let contenu = '';
  let indiceGlobal = 0;

  courbesNormalisees.forEach((courbe, indiceCourbe) => {
    courbe.forEach((point) => {
      const x = positionX(point.date);
      const y = positionY(point.valeur);
      contenu += `<circle class="point_survol" id="point_${indiceGlobal}" cx="${x}" cy="${y}" r="3" fill="${couleurs[indiceCourbe]}"
        data-date="${point.date.toLocaleDateString('fr-FR')}" data-valeur="${point.valeur}" data-legende="${listeDeLegendes[indiceCourbe]}" />`;
      indiceGlobal++;
    });
  });

  return contenu;
}

// ---- Construction (ou mise à jour) de la légende des courbes ----
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

// ---- Mise en place des écouteurs pour l'info-bulle au survol des points ----
function activerInfoBulle(svgPrincipal, zoneSurvol) {
  svgPrincipal.addEventListener('mousemove', evenement => afficherInfoBulle(evenement, zoneSurvol));
  svgPrincipal.addEventListener('mouseleave', () => masquerInfoBulle(zoneSurvol));
}

// ---- Affichage de l'info-bulle si la souris survole un point ----
function afficherInfoBulle(evenement, zoneSurvol) {
  if (!evenement.target.classList.contains('point_survol')) {
    masquerInfoBulle(zoneSurvol);
    return;
  }
  const cible = evenement.target.dataset;
  zoneSurvol.classList.add('visible');
  zoneSurvol.style.left = (evenement.clientX + 12) + 'px';
  zoneSurvol.style.top = (evenement.clientY - 10) + 'px';
  zoneSurvol.textContent = `${cible.legende} — ${cible.date} : ${cible.valeur}%`;
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

  elementGraphique.addEventListener('mousedown', evenement => {
    clicEnfonce = true;
    positionDepart = evenement.pageX;
    defilementDepart = elementGraphique.scrollLeft;
  });

  window.addEventListener('mouseup', () => {
    clicEnfonce = false;
  });

  elementGraphique.addEventListener('mousemove', evenement => {
    if (!clicEnfonce) return;
    evenement.preventDefault();
    elementGraphique.scrollLeft = defilementDepart - (evenement.pageX - positionDepart);
  });
}