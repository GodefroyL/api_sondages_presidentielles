// preparation_courbes.js
//
// preparation_courbes(candidats, instituts, sondages) -> [courbes, legendes]
//
// Paramètres :
//   candidats : [{ nom: "Le Pen(RN)", annee: 2027 }, ...]   (candidats cochés)
//   instituts : ["Ifop", "Elabe", ...]                       (instituts cochés)
//   sondages  : { 2027: { "1": {institut, date, candidats, resultat}, ... }, 2022: {...}, ... }
//
// Sortie : deux listes de même longueur
//   courbes  : [ [[date, pourcentage], [date, pourcentage], ...], ... ]  (une courbe par candidat)
//   legendes : [ "Le Pen(RN) 2027", ... ]
//
// Les dates sont renvoyées sous forme d'objets Date (UTC, minuit), points triés par date.
// Un candidat sans aucun point (institut décoché, jamais testé...) n'apparaît pas.

// "10/09/2026" ou "1er/09/2026" -> Date (ou null si le format est inconnu)
function convertir_date(texte) {
    const m = /^(\d{1,2})(?:er)?\/(\d{1,2})\/(\d{4})$/.exec((texte ?? "").trim());
    if (!m) {
        console.warn("Date de sondage illisible :", texte);
        return null;
    }
    const [, jour, mois, annee] = m;
    return new Date(Date.UTC(Number(annee), Number(mois) - 1, Number(jour)));
}

export function preparation_courbes(candidats, instituts, sondages) {
    const instituts_choisis = new Set(instituts);
    const courbes = [];
    const legendes = [];

    candidats.forEach(({ nom, annee }) => {
        const sondages_annee = Object.values(sondages[annee] ?? {});
        const points = [];

        sondages_annee.forEach(sondage => {
            if (!instituts_choisis.has(sondage.institut)) return;

            const date = convertir_date(sondage.date);
            if (!date) return;

            // resultat = [ [ {nom, valeur}, ... ], { dictionnaires... } ]
            const lignes = sondage.resultat?.[0] ?? [];

            // find : un seul point par sondage même si le candidat est dupliqué dans la liste
            const ligne = lignes.find(l => l.nom === nom);
            if (ligne) {
                points.push([date, ligne.valeur]);
            }
        });

        if (points.length === 0) return;

        points.sort((a, b) => a[0] - b[0]);
        courbes.push(points);
        legendes.push(`${nom} ${annee}`);
    });

    return [courbes, legendes];
}