// ===================================================================
// data.js — Chargement des sondages et déduction des dates.
// Expose un unique objet global : PollData.
// ===================================================================
window.PollData = (function () {
  "use strict";

  const API_BASE = "https://api-sondages-presidentielles.fastapicloud.dev";

  const MONTHS_FR = {
    "janvier": 0, "février": 1, "fevrier": 1, "mars": 2, "avril": 3,
    "mai": 4, "juin": 5, "juillet": 6, "août": 7, "aout": 7,
    "septembre": 8, "octobre": 9, "novembre": 10, "décembre": 11, "decembre": 11
  };

  // Dates connues (ou annoncées) du 1er/2nd tour de chaque élection.
  // Pour une élection dont la date réelle n'est pas encore fixée, on
  // utiliserait "aujourd'hui" comme repère de secours (voir getReferenceDate) :
  // les sondages les plus récents datent alors "de quelques jours au plus".
  const ELECTION_REFERENCE_DATES = {
    premier_tour: { 2017: new Date(2017, 3, 23), 2022: new Date(2022, 3, 10), 2027: new Date(2027, 3, 18) },
    second_tour: { 2017: new Date(2017, 4, 7), 2022: new Date(2022, 3, 24), 2027: new Date(2027, 4, 2) }
  };

  const DAY_MS = 24 * 60 * 60 * 1000;

  const electionsCache = new Map(); // clé "tour_annee" -> dataset

  // -----------------------------------------------------------------
  // Dates en français : extraction jour/mois, puis déduction de l'année
  // -----------------------------------------------------------------
  function parseFrenchDateParts(raw) {
    if (!raw) return { month: null, day: null };
    const s = raw.trim().toLowerCase().replace("1er", "1");
    const parts = s.split(/\s+/);
    if (parts.length < 2) return { month: null, day: null };
    const day = parseInt(parts[0], 10);
    const month = MONTHS_FR[parts[1]];
    if (Number.isNaN(day) || month === undefined) return { month: null, day: null };
    return { month, day };
  }

  function getReferenceDate(tour, annee) {
    const known = ELECTION_REFERENCE_DATES[tour] && ELECTION_REFERENCE_DATES[tour][annee];
    return known || new Date(); // élection future / en cours sans date connue : on s'aligne sur aujourd'hui
  }

  // Les sondages sont fournis du plus récent (id 1) au plus ancien.
  // On déduit l'année de chaque date en partant du repère (le plus récent
  // sondage date "de quelques jours au plus" avant la référence), puis, en
  // avançant vers le passé, on décrémente l'année à chaque fois que le mois
  // "remonte" (ex. on passe de janvier à décembre : on vient de franchir un
  // 1er janvier en reculant dans le temps).
  function inferPollDates(parts, referenceDate) {
    let runningYear = null;
    let prevMonth = null;

    return parts.map(({ month, day }, idx) => {
      if (month === null) return null;

      if (idx === 0 || runningYear === null) {
        runningYear = referenceDate.getFullYear();
        const candidate = new Date(runningYear, month, day);
        if (candidate.getTime() > referenceDate.getTime()) runningYear -= 1;
      } else if (month > prevMonth) {
        runningYear -= 1;
      }

      prevMonth = month;
      return new Date(runningYear, month, day);
    });
  }

  // -----------------------------------------------------------------
  // Construction d'un jeu de données pour une élection (tour + année)
  // -----------------------------------------------------------------
  function buildElectionDataset(raw, tour, annee) {
    const referenceDate = getReferenceDate(tour, annee);
    const sondages = raw.sondages || {};
    const ids = Object.keys(sondages); // clés numériques -> déjà triées, du plus récent au plus ancien

    const parts = ids.map((id) => parseFrenchDateParts(sondages[id].date));
    const dates = inferPollDates(parts, referenceDate);

    const pollEntries = ids.map((id, i) => {
      const s = sondages[id];
      const resultsArr = (s.resultat && s.resultat[0]) ? s.resultat[0] : [];
      const resultsMap = new Map(resultsArr.map((r) => [r.nom, r.valeur]));
      return { id, institut: s.institut, dateRaw: s.date, date: dates[i], resultsMap };
    });

    const freq = new Map();
    pollEntries.forEach((p) => p.resultsMap.forEach((_v, nom) => freq.set(nom, (freq.get(nom) || 0) + 1)));

    const candidatsBase = raw["liste candidats"] || raw.liste_candidats || [];
    const candidats = candidatsBase.filter((c) => freq.has(c));
    freq.forEach((_v, nom) => { if (!candidats.includes(nom)) candidats.push(nom); });

    const institutsBase = raw.liste_instituts || [];
    const instituts = institutsBase.filter((i) => pollEntries.some((p) => p.institut === i));
    pollEntries.forEach((p) => { if (p.institut && !instituts.includes(p.institut)) instituts.push(p.institut); });

    return { tour, annee, referenceDate, pollEntries, candidats, instituts, freq };
  }

  // -----------------------------------------------------------------
  // Chargement réseau (avec cache en mémoire)
  // -----------------------------------------------------------------
  async function ensureElectionLoaded(tour, annee) {
    const key = `${tour}_${annee}`;
    if (electionsCache.has(key)) return electionsCache.get(key);
    const res = await fetch(`${API_BASE}/${tour}/${annee}`);
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status} pour ${key}`);
    const raw = await res.json();
    const dataset = buildElectionDataset(raw, tour, annee);
    electionsCache.set(key, dataset);
    return dataset;
  }

  function clearCachedElection(tour, annee) {
    electionsCache.delete(`${tour}_${annee}`);
  }

  // -----------------------------------------------------------------
  // API publique
  // -----------------------------------------------------------------
  return {
    DAY_MS,
    ensureElectionLoaded,
    clearCachedElection
  };
})();