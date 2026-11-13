// Trace un graphique multi-courbes (dates en abscisse, valeurs en pourcentage en ordonnée).
// Le zoom se règle depuis les axes, au moyen d'une scrollbarre à deux poignées par axe :
//   - sous l'axe des abscisses : choix de la date de début et de la date de fin affichées ;
//   - à gauche de l'axe des ordonnées : choix du pourcentage de début et du pourcentage de fin affichés.
// Le graphique est redessiné pour remplir exactement la fenêtre ainsi choisie.

//   tracerGraphique(listeDeCourbes, listeDeLegendes);
//      listeDeCourbes  : tableau de courbes ; chaque courbe est un tableau de points [date, valeur], où date est une Date ou une chaîne interprétable par `new Date()`, et valeur un nombre (%).
//      listeDeLegendes : tableau de chaînes, une légende par courbe, dans le même ordre que listeDeCourbes.

const DIMENSIONS_BASE = {
  pixelsParJour: 3,      // (conservé pour référence, la largeur s'adapte désormais à la fenêtre choisie)
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

const JOUR = 1000 * 60 * 60 * 24;
const ECART_FENETRE_MIN = 0.5;  // écart minimal (%) entre les deux poignées de l'axe Y

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
  bornes: null,   // bornes globales des données : { dateMin, dateMax, valeurMin, valeurMax }
  fenetre: null   // fenêtre affichée : { dateDebut, dateFin, valeurDebut, valeurFin }
};

let ecouteurRedimensionnementInstalle = false;

// ---- Fonction principale : orchestre l'ensemble du tracé ----
export function tracerGraphique(listeDeCourbes, listeDeLegendes) {
  etat.courbes = listeDeCourbes;
  etat.legendes = listeDeLegendes;

  const elements = recupererElementsHtml();
  preparerZones(elements);
  const bornes = calculerEchelles(normaliserCourbes(etat.courbes));
  etat.bornes = bornes;
  etat.fenetre = fenetreParDefaut(bornes);
  creerCurseurs(elements, bornes);
  dessinerTout();

  // La largeur du SVG est mesurée au tracé : on redessine quand la fenêtre du navigateur change
  if (!ecouteurRedimensionnementInstalle) {
    window.addEventListener('resize', () => {if (etat.courbes) {dessinerTout();}});
    ecouteurRedimensionnementInstalle = true;
  }
}

// Tout ce qui dépend de la fenêtre choisie : appelé au premier tracé et à chaque réglage des curseurs
function dessinerTout() {
  const elements = recupererElementsHtml();
  const couleurs = genererCouleurs(etat.legendes);
  const courbesNormalisees = normaliserCourbes(etat.courbes);
  const courbesMoyennees = courbesNormalisees.map(moyennerPointsParDate);
  const fenetre = contraindreFenetre(etat.fenetre, etat.bornes);
  const dimensions = calculerDimensions(elements);
  const echelles = {
    dateMin: fenetre.dateDebut,
    dateMax: fenetre.dateFin,
    valeurMin: fenetre.valeurDebut,
    valeurMax: fenetre.valeurFin
  };
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
    legendeGraphique: document.getElementById('legende_graphique'),
    axeFixe: document.getElementById('axe_fixe'),
    graphique: document.getElementById('graphique'),
    curseurX: document.getElementById('curseur_x'),
    curseurY: document.getElementById('curseur_y'),
    zoneSurvol: document.getElementById('survol_points')
  };
}

// Hauteurs des zones : le graphique, son axe Y et le curseur vertical gardent la hauteur de base, la fenêtre choisie y tient en entier
function preparerZones(elements) {
  elements.graphique.style.height = DIMENSIONS_BASE.hauteur + 'px';
  elements.axeFixe.style.height = DIMENSIONS_BASE.hauteur + 'px';
  elements.curseurY.style.height = DIMENSIONS_BASE.hauteur + 'px';
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

// Fenêtre correspondant à l'ensemble des données (état initial des curseurs)
function fenetreParDefaut(bornes) {
  return {
    dateDebut: new Date(bornes.dateMin),
    dateFin: new Date(bornes.dateMax),
    valeurDebut: bornes.valeurMin,
    valeurFin: bornes.valeurMax
  };
}

// Recadre la fenêtre choisie dans les bornes des données, avec un écart minimal entre les deux bornes
function contraindreFenetre(fenetre, bornes) {
  const tMin = bornes.dateMin.getTime();
  const tMax = bornes.dateMax.getTime();

  let dateDebut = Math.min(Math.max(fenetre.dateDebut.getTime(), tMin), tMax);
  let dateFin = Math.min(Math.max(fenetre.dateFin.getTime(), dateDebut + JOUR), tMax);
  if (dateFin - dateDebut < JOUR) {dateDebut = Math.max(tMin, dateFin - JOUR);}

  let valeurDebut = Math.min(Math.max(fenetre.valeurDebut, bornes.valeurMin), bornes.valeurMax);
  let valeurFin = Math.min(Math.max(fenetre.valeurFin, valeurDebut + ECART_FENETRE_MIN), bornes.valeurMax);
  if (valeurFin - valeurDebut < ECART_FENETRE_MIN) {valeurDebut = Math.max(bornes.valeurMin, valeurFin - ECART_FENETRE_MIN);}

  return { dateDebut: new Date(dateDebut), dateFin: new Date(dateFin), valeurDebut, valeurFin };
}

// Calcul des dimensions : le SVG remplit exactement la zone visible, la fenêtre choisie s'y adapte
function calculerDimensions(elements) {
  const largeurTotale = Math.max(200, elements.graphique.clientWidth || 0);
  return { ...DIMENSIONS_BASE, hauteur: DIMENSIONS_BASE.hauteur, largeurTotale };
}

// Fonction d'échelle : date (dans la fenêtre) -> position horizontale en pixels
function creerFonctionPositionX(echelles, dimensions) {
  const largeurUtile = dimensions.largeurTotale - dimensions.margeGauche - dimensions.margeDroite;
  const joursFenetre = Math.max(1, (echelles.dateMax - echelles.dateMin) / JOUR);
  return function positionX(date) {
    const jours = (date - echelles.dateMin) / JOUR;
    return dimensions.margeGauche + (jours / joursFenetre) * largeurUtile;
  };
}

// Fonction d'échelle : valeur (dans la fenêtre) -> position verticale en pixels
function creerFonctionPositionY(echelles, dimensions) {
  const hauteurUtile = dimensions.hauteur - dimensions.margeHaut - dimensions.margeBas;
  const plage = echelles.valeurMax - echelles.valeurMin;
  return function positionY(valeur) {
    return dimensions.margeHaut + hauteurUtile
      - ((valeur - echelles.valeurMin) / plage) * hauteurUtile;
  };
}

// Construction du SVG de l'axe Y (fixe)
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

// Construction du SVG principal (zone visible)
function dessinerGraphiquePrincipal(elementGraphique, courbesNormalisees, courbesMoyennees, listeDeLegendes, couleurs, echelles, dimensions, positionX, positionY) {
  const svgPrincipal = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgPrincipal.setAttribute('id', 'svg_graphique');
  svgPrincipal.setAttribute('width', dimensions.largeurTotale);
  svgPrincipal.setAttribute('height', dimensions.hauteur);
  svgPrincipal.setAttribute('viewBox', `0 0 ${dimensions.largeurTotale} ${dimensions.hauteur}`);

  const largeurUtile = dimensions.largeurTotale - dimensions.margeGauche - dimensions.margeDroite;
  const hauteurUtile = dimensions.hauteur - dimensions.margeHaut - dimensions.margeBas;

  let contenu = '';
  contenu += `<clipPath id="fenetre_trace"><rect x="${dimensions.margeGauche}" y="${dimensions.margeHaut}" width="${largeurUtile}" height="${hauteurUtile}" /></clipPath>`;
  contenu += dessinerGrilleHorizontale(echelles, dimensions, positionY);
  contenu += dessinerGraduationsAxeX(echelles, dimensions, positionX);
  contenu += dessinerLigneAxeX(dimensions);
  contenu += `<g clip-path="url(#fenetre_trace)">`;
  contenu += dessinerCourbes(courbesMoyennees, couleurs, positionX, positionY, etat.legendes);
  contenu += dessinerPointsSurvolables(courbesNormalisees, listeDeLegendes, couleurs, positionX, positionY);
  contenu += `</g>`;

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

// Graduations et étiquettes de l'axe X : en jours pour les fenêtres courtes, sinon en mois,
// avec un pas adapté à la largeur de la fenêtre pour que les étiquettes restent lisibles et toujours présentes
function dessinerGraduationsAxeX(echelles, dimensions, positionX) {
  const parJour = (echelles.dateMax - echelles.dateMin) / JOUR < 31;
  const pas = parJour ? choisirPasJours(echelles, dimensions) : choisirPasMois(echelles, dimensions);
  const dates = parJour ? datesGraduationsParJour(echelles, pas) : datesGraduationsParMois(echelles, pas);
  const formater = parJour
    ? date => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    : date => (pas >= 12 ? `${date.getFullYear()}` : date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }));

  let contenu = '';
  dates.forEach(date => {
    const x = positionX(date);
    contenu += `<line class="grille" x1="${x}" y1="${dimensions.margeHaut}" x2="${x}" y2="${dimensions.hauteur - dimensions.margeBas}" />`;
    contenu += `<text class="etiquette_axe" x="${x}" y="${dimensions.hauteur - dimensions.margeBas + 16}" text-anchor="middle">${formater(date)}</text>`;
  });
  return contenu;
}

// Graduations mensuelles : un début de mois toutes les `pasMois` années-mois, dans la fenêtre
function datesGraduationsParMois(echelles, pasMois) {
  const dates = [];
  const dateCourante = new Date(echelles.dateMin);
  dateCourante.setDate(1);
  dateCourante.setHours(0, 0, 0, 0);

  while (dateCourante <= echelles.dateMax) {
    const moisGlobal = dateCourante.getFullYear() * 12 + dateCourante.getMonth();
    if (dateCourante >= echelles.dateMin && moisGlobal % pasMois === 0) {dates.push(new Date(dateCourante));}
    dateCourante.setMonth(dateCourante.getMonth() + 1);
  }
  return dates;
}

// Graduations journalières, alignées sur un multiple entier de `pasJours` jours
function datesGraduationsParJour(echelles, pasJours) {
  const pasMs = pasJours * JOUR;
  const dates = [];
  for (let t = Math.ceil(echelles.dateMin.getTime() / pasMs) * pasMs; t <= echelles.dateMax.getTime(); t += pasMs) {
    dates.push(new Date(t));
  }
  return dates;
}

// Choix du pas des graduations (en jours) pour que les étiquettes ne se chevauchent pas
function choisirPasJours(echelles, dimensions) {
  const largeurUtile = dimensions.largeurTotale - dimensions.margeGauche - dimensions.margeDroite;
  const joursFenetre = Math.max(1, (echelles.dateMax - echelles.dateMin) / JOUR);
  const candidats = [1, 2, 5, 10, 15];
  for (const pas of candidats) {
    if ((largeurUtile * pas) / joursFenetre >= 55) {return pas;}
  }
  return 15;
}

// Choix du pas des graduations (en mois) pour que les étiquettes ne se chevauchent pas
function choisirPasMois(echelles, dimensions) {
  const largeurUtile = dimensions.largeurTotale - dimensions.margeGauche - dimensions.margeDroite;
  const nombreMois = (echelles.dateMax - echelles.dateMin) / (JOUR * 30.44);
  const pixelsParMois = largeurUtile / Math.max(1, nombreMois);
  const candidats = [1, 2, 3, 6, 12, 24, 48, 96];
  for (const pas of candidats) {
    if (pixelsParMois * pas >= 55) {return pas;}
  }
  return 192;
}

// Ligne horizontale du bas (axe X)
function dessinerLigneAxeX(dimensions) {
  return `<line class="trait_axe" x1="0" y1="${dimensions.hauteur - dimensions.margeBas}" x2="${dimensions.largeurTotale}" y2="${dimensions.hauteur - dimensions.margeBas}" />`;
}

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

// ---- Curseurs de réglage du zoom : une scrollbarre à deux poignées par axe ----
function creerCurseurs(elements, bornes) {
  creerCurseurDouble(elements.curseurX, {
    min: bornes.dateMin.getTime(),
    max: bornes.dateMax.getTime(),
    pas: JOUR,
    vertical: false,
    valeurs: [etat.fenetre.dateDebut.getTime(), etat.fenetre.dateFin.getTime()],
    formater: timestamp => new Date(timestamp).toLocaleDateString('fr-FR'),
    auChangement: (debut, fin) => {
      etat.fenetre.dateDebut = new Date(debut);
      etat.fenetre.dateFin = new Date(fin);
      dessinerTout();
    }
  });

  creerCurseurDouble(elements.curseurY, {
    min: bornes.valeurMin,
    max: bornes.valeurMax,
    pas: 1,
    vertical: true,
    valeurs: [etat.fenetre.valeurDebut, etat.fenetre.valeurFin],
    formater: valeur => `${valeur} %`,
    auChangement: (debut, fin) => {
      etat.fenetre.valeurDebut = debut;
      etat.fenetre.valeurFin = fin;
      dessinerTout();
    }
  });
}

// Curseur double : une piste, un intervalle surligné et deux poignées (début / fin), réglables au pointeur et au clavier
function creerCurseurDouble(conteneur, options) {
  const { min, max, pas, vertical, valeurs, formater, auChangement } = options;

  conteneur.innerHTML = '';
  conteneur.classList.add('curseur_double');
  if (vertical) {conteneur.classList.add('curseur_double--vertical');}

  const piste = document.createElement('div');
  piste.className = 'curseur_piste';

  const intervalle = document.createElement('div');
  intervalle.className = 'curseur_intervalle';
  piste.appendChild(intervalle);

  const poignees = [0, 1].map(() => {
    const poignee = document.createElement('div');
    poignee.className = 'curseur_poignee';
    poignee.tabIndex = 0;
    poignee.setAttribute('role', 'slider');
    piste.appendChild(poignee);
    return poignee;
  });

  conteneur.appendChild(piste);

  const quantifier = valeur => {
    const borne = Math.min(max, Math.max(min, valeur));
    return min + Math.round((borne - min) / pas) * pas;
  };

  const valeurDepuisPointeur = evenement => {
    const rect = piste.getBoundingClientRect();
    const fraction = vertical
      ? (rect.bottom - evenement.clientY) / rect.height
      : (evenement.clientX - rect.left) / rect.width;
    return quantifier(min + Math.min(1, Math.max(0, fraction)) * (max - min));
  };

  function deplacer(indice, valeur) {
    if (indice === 0) {valeurs[0] = Math.min(valeur, valeurs[1] - pas);}
    else {valeurs[1] = Math.max(valeur, valeurs[0] + pas);}
    positionner();
    auChangement(valeurs[0], valeurs[1]);
  }

  function positionner() {
    const f0 = (valeurs[0] - min) / (max - min);
    const f1 = (valeurs[1] - min) / (max - min);
    if (vertical) {
      intervalle.style.bottom = (f0 * 100) + '%';
      intervalle.style.height = ((f1 - f0) * 100) + '%';
      poignees[0].style.bottom = `calc(${f0 * 100}% - 7px)`;
      poignees[1].style.bottom = `calc(${f1 * 100}% - 7px)`;
    } else {
      intervalle.style.left = (f0 * 100) + '%';
      intervalle.style.width = ((f1 - f0) * 100) + '%';
      poignees[0].style.left = `calc(${f0 * 100}% - 7px)`;
      poignees[1].style.left = `calc(${f1 * 100}% - 7px)`;
    }
    poignees.forEach((poignee, indice) => {
      poignee.setAttribute('aria-valuemin', min);
      poignee.setAttribute('aria-valuemax', max);
      poignee.setAttribute('aria-valuenow', valeurs[indice]);
      poignee.setAttribute('aria-valuetext', formater(valeurs[indice]));
      poignee.title = formater(valeurs[indice]);
    });
  }

  poignees.forEach((poignee, indice) => {
    poignee.addEventListener('pointerdown', evenement => {
      evenement.preventDefault();
      poignee.setPointerCapture(evenement.pointerId);
      const bouger = ev => deplacer(indice, valeurDepuisPointeur(ev));
      const relacher = () => {
        poignee.removeEventListener('pointermove', bouger);
        poignee.removeEventListener('pointerup', relacher);
        poignee.removeEventListener('pointercancel', relacher);
      };
      poignee.addEventListener('pointermove', bouger);
      poignee.addEventListener('pointerup', relacher);
      poignee.addEventListener('pointercancel', relacher);
    });

    poignee.addEventListener('keydown', evenement => {
      const delta = { ArrowLeft: -pas, ArrowDown: -pas, ArrowRight: pas, ArrowUp: pas }[evenement.key];
      if (!delta) {return;}
      evenement.preventDefault();
      deplacer(indice, valeurs[indice] + delta);
    });
  });

  // Un clic sur la piste déplace la poignée la plus proche
  piste.addEventListener('pointerdown', evenement => {
    if (evenement.target !== piste && evenement.target !== intervalle) {return;}
    const valeur = valeurDepuisPointeur(evenement);
    const indice = Math.abs(valeur - valeurs[0]) <= Math.abs(valeur - valeurs[1]) ? 0 : 1;
    deplacer(indice, valeur);
  });

  positionner();
}

// Étiquettes de l'axe Y : des décimales apparaissent quand la fenêtre est étroite
function formaterValeurAxeY(valeur, pas) {
  const decimales = pas >= 1 ? 0 : (pas >= 0.1 ? 1 : 2);
  return valeur.toFixed(decimales);
}
