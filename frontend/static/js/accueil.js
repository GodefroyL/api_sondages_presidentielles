// accueil.js
// Page d'accueil : sélection des instituts, des années et des candidats.
// À chaque changement de sélection :
//   preparation_courbes(candidats, instituts, sondages)  ->  graphique(retour)
//
// Dépendances (à charger AVANT ce fichier) :
//   - charger_donnees(annee, tour)   (gestion_api.js)
//   - preparation_courbes(...)
//   - graphique(...)

// ---------------------------------------------------------------------------
// Configuration et import des fonctions externes
// ---------------------------------------------------------------------------

import { charger_donnees } from "./gestion_api.js";
import { preparation_courbes } from "./gestion_donnees.js";
import { tracerGraphique } from "./graphiques.js"

const ANNEES = [2027, 2022];
const TOUR = 'premier_tour/';

// Candidats cochés par défaut, par année.
// Les noms absents des données sont simplement ignorés.
const CANDIDATS_PAR_DEFAUT = {
    2027: ["Le Pen(RN)", "Mélenchon(LFI)", "Philippe(HOR)", "Glucksmann(PP)", "Attal(RE)", "Retailleau(LR)"],
};

// ---------------------------------------------------------------------------
// État de la page
// ---------------------------------------------------------------------------

const etat = {
    sondages: {},           // { annee: sondages }
    candidats: {},          // { annee: [noms des candidats] }
    instituts: [],          // liste complète des instituts (toutes années confondues)
    instituts_coches: new Set(),
    candidats_coches: {},   // { annee: Set des noms cochés }
};

// ---------------------------------------------------------------------------
// Chargement des données
// ---------------------------------------------------------------------------

async function charger_annee(annee) {
    try {
        // Promise.resolve : fonctionne que charger_donnees soit synchrone ou asynchrone
        let url = TOUR+annee
        const donnees = await Promise.resolve(charger_donnees(url));
        return donnees;
    } catch (erreur) {
        console.error(`Impossible de charger les données ${annee} :`, erreur);
        return null;
    }
}

async function charger_toutes_les_annees() {
    const resultats = await Promise.all(ANNEES.map(charger_annee));

    ANNEES.forEach((annee, i) => {
        const donnees = resultats[i];
        etat.candidats_coches[annee] = new Set();

        if (!donnees) {
            etat.candidats[annee] = [];
            return;
        }

        etat.sondages[annee] = donnees.sondages;
        etat.candidats[annee] = donnees["liste candidats"] ?? donnees.liste_candidats ?? [];

        // Union des instituts, en conservant l'ordre d'apparition
        (donnees.liste_instituts ?? []).forEach(institut => {
            if (!etat.instituts.includes(institut)) {
                etat.instituts.push(institut);
            }
        });
    });
}

function initialiser_selection_par_defaut() {
    etat.instituts_coches = new Set(etat.instituts);

    ANNEES.forEach(annee => {
        const defaut = CANDIDATS_PAR_DEFAUT[annee] ?? [];
        defaut
            .filter(nom => etat.candidats[annee].includes(nom))
            .forEach(nom => etat.candidats_coches[annee].add(nom));
    });
}

// ---------------------------------------------------------------------------
// Construction des éléments HTML
// ---------------------------------------------------------------------------

// <label><input type="checkbox"> libellé</label>
function creer_case(libelle, coche, au_changement) {
    const label = document.createElement("label");
    label.className = "case";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = coche;
    input.addEventListener("change", () => au_changement(input.checked));

    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + libelle));
    return { label, input };
}

// ---------------------------------------------------------------------------
// Instituts
// ---------------------------------------------------------------------------

function afficher_instituts() {
    const zone = document.getElementById("instituts");
    zone.innerHTML = "";

    const cases_instituts = [];

    // Option « Tous »
    const tous = creer_case("Tous", true, coche => {
        etat.instituts_coches = coche ? new Set(etat.instituts) : new Set();
        cases_instituts.forEach(c => { c.checked = coche; });
        mettre_a_jour();
    });
    tous.label.classList.add("case--tous");
    zone.appendChild(tous.label);

    // Un institut = une case
    etat.instituts.forEach(institut => {
        const c = creer_case(institut, etat.instituts_coches.has(institut), coche => {
            if (coche) {
                etat.instituts_coches.add(institut);
            } else {
                etat.instituts_coches.delete(institut);
            }
            tous.input.checked = etat.instituts_coches.size === etat.instituts.length;
            mettre_a_jour();
        });
        cases_instituts.push(c.input);
        zone.appendChild(c.label);
    });

    tous.input.checked = etat.instituts_coches.size === etat.instituts.length;
}

// ---------------------------------------------------------------------------
// Années et candidats
// ---------------------------------------------------------------------------

function afficher_panneau_annees() {
    const panneau = document.getElementById("panneau_droite");
    panneau.innerHTML = "";

    ANNEES.forEach(annee => {
        const bloc = document.createElement("div");
        bloc.className = "bloc_annee";

        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "bouton_annee";
        bouton.textContent = annee;
        bouton.setAttribute("aria-expanded", "false");

        // Liste des candidats, en ligne, masquée tant qu'on n'a pas cliqué sur l'année
        const liste = document.createElement("div");
        liste.className = "liste_candidats";
        liste.style.display = "none";
        liste.style.flexWrap = "wrap";
        liste.style.gap = "4px 12px";

        if (etat.candidats[annee].length === 0) {
            bouton.disabled = true;
            bouton.title = "Données indisponibles";
        }

        etat.candidats[annee].forEach(nom => {
            const c = creer_case(nom, etat.candidats_coches[annee].has(nom), coche => {
                if (coche) {
                    etat.candidats_coches[annee].add(nom);
                } else {
                    etat.candidats_coches[annee].delete(nom);
                }
                mettre_a_jour();
            });
            liste.appendChild(c.label);
        });

        bouton.addEventListener("click", () => {
            const ouvrir = liste.style.display === "none";
            liste.style.display = ouvrir ? "flex" : "none";
            bouton.setAttribute("aria-expanded", String(ouvrir));
            bouton.classList.toggle("actif", ouvrir);
        });

        bloc.appendChild(bouton);
        bloc.appendChild(liste);
        panneau.appendChild(bloc);
    });
}

// ---------------------------------------------------------------------------
// Mise à jour du graphique
// ---------------------------------------------------------------------------

// Candidats cochés, avec l'année de l'élection : [{ nom, annee }, ...]
function lister_candidats_coches() {
    const candidats = [];
    ANNEES.forEach(annee => {
        etat.candidats[annee].forEach(nom => {
            if (etat.candidats_coches[annee].has(nom)) {
                candidats.push({ nom, annee });
            }
        });
    });
    return candidats;
}

function mettre_a_jour() {
    const candidats = lister_candidats_coches();
    const instituts = etat.instituts.filter(i => etat.instituts_coches.has(i));

    const info_graphique = preparation_courbes(candidats, instituts, etat.sondages);
    console.log('courbes', info_graphique[0])
    console.log('legendes', info_graphique[1])
    tracerGraphique(info_graphique[0], info_graphique[1]);
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

async function initialiser_accueil() {
    await charger_toutes_les_annees();
    initialiser_selection_par_defaut();
    afficher_instituts();
    afficher_panneau_annees();
    mettre_a_jour();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiser_accueil);
} else {
    initialiser_accueil();
}