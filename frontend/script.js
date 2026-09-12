// ===================================================================
// app.js — Orchestration : relie PollData (chargement) et PollChart
// (rendu) aux panneaux de filtres et aux contrôles d'échelle.
// ===================================================================
(function () {
  "use strict";

  // -----------------------------------------------------------------
  // État
  // -----------------------------------------------------------------
  let currentTour = "premier_tour";
  let selectedYears = new Set([2027]);
  let activeDatasets = [];        // datasets chargés et sélectionnés, triés par année

  let allCandidats = [];          // union des candidats des élections actives
  let allInstituts = [];          // union des instituts des élections actives
  let knownInstituts = new Set(); // pour auto-cocher les nouveaux instituts découverts
  let selectedCandidats = new Set();
  let selectedInstituts = new Set();

  // -----------------------------------------------------------------
  // Éléments DOM
  // -----------------------------------------------------------------
  const el = {
    status: document.getElementById("load-status"),
    instituts: document.getElementById("instituts-list"),
    candidats: document.getElementById("candidats-list"),
    candidatSearch: document.getElementById("candidat-search"),
    yAuto: document.getElementById("y-auto"),
    yMin: document.getElementById("y-min"),
    yMax: document.getElementById("y-max"),
    xMin: document.getElementById("x-min"),
    xMax: document.getElementById("x-max"),
    title: document.getElementById("page-title"),
    subtitle: document.getElementById("page-subtitle"),
    btnRecharger: document.getElementById("btn-recharger")
  };

  const chart = PollChart.create(
    document.getElementById("poll-chart"),
    document.getElementById("chart-tooltip"),
    document.getElementById("chart-legend"),
    document.getElementById("chart-empty")
  );

  function setStatus(text) { el.status.textContent = text; }

  // -----------------------------------------------------------------
  // Chargement
  // -----------------------------------------------------------------
  async function refreshSelection() {
    if (selectedYears.size === 0) {
      activeDatasets = [];
      rebuildFilterPanels();
      updateHeader();
      renderChart();
      setStatus("Aucune élection sélectionnée.");
      return;
    }

    setStatus("Chargement…");
    try {
      const loaded = await Promise.all(
        [...selectedYears].map((annee) => PollData.ensureElectionLoaded(currentTour, annee))
      );
      activeDatasets = loaded.sort((a, b) => a.annee - b.annee);
      rebuildFilterPanels();
      updateHeader();
      renderChart();
      const totalPolls = activeDatasets.reduce((s, d) => s + d.pollEntries.length, 0);
      setStatus(`${totalPolls} sondages chargés sur ${activeDatasets.length} élection(s).`);
    } catch (err) {
      console.error(err);
      setStatus("Échec du chargement (réseau ou API indisponible).");
    }
  }

  // -----------------------------------------------------------------
  // Panneaux de filtres
  // -----------------------------------------------------------------
  function rebuildFilterPanels() {
    const candidatSet = new Set();
    const institutSet = new Set();
    activeDatasets.forEach((ds) => {
      ds.candidats.forEach((c) => candidatSet.add(c));
      ds.instituts.forEach((i) => institutSet.add(i));
    });
    allCandidats = [...candidatSet];
    allInstituts = [...institutSet];

    if (selectedCandidats.size === 0 && allCandidats.length > 0) {
      const globalFreq = new Map();
      activeDatasets.forEach((ds) => ds.freq.forEach((v, nom) => globalFreq.set(nom, (globalFreq.get(nom) || 0) + v)));
      const top = allCandidats.slice()
        .sort((a, b) => (globalFreq.get(b) || 0) - (globalFreq.get(a) || 0))
        .slice(0, 8);
      selectedCandidats = new Set(top);
    }

    // Tout nouvel institut jamais rencontré est coché par défaut.
    allInstituts.forEach((i) => { if (!knownInstituts.has(i)) selectedInstituts.add(i); });
    knownInstituts = new Set(allInstituts);

    renderInstitutList();
    renderCandidatList(el.candidatSearch.value);
    populateDateRangeSelectors();
  }

  function renderInstitutList() {
    el.instituts.innerHTML = "";
    allInstituts.forEach((inst) => {
      const count = activeDatasets.reduce(
        (s, ds) => s + ds.pollEntries.filter((p) => p.institut === inst).length, 0
      );

      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedInstituts.has(inst);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedInstituts.add(inst); else selectedInstituts.delete(inst);
        renderChart();
      });

      const name = document.createElement("span");
      name.textContent = inst;

      const countEl = document.createElement("span");
      countEl.className = "candidat-count";
      countEl.textContent = count;

      label.append(checkbox, name, countEl);
      el.instituts.appendChild(label);
    });
  }

  function renderCandidatList(filterText) {
    el.candidats.innerHTML = "";
    const term = (filterText || "").trim().toLowerCase();

    allCandidats
      .filter((c) => !term || c.toLowerCase().includes(term))
      .forEach((c) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedCandidats.has(c);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selectedCandidats.add(c); else selectedCandidats.delete(c);
          renderChart();
        });

        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = PollChart.colorFor(c);

        const name = document.createElement("span");
        name.textContent = c;

        label.append(checkbox, swatch, name);
        el.candidats.appendChild(label);
      });
  }

  function populateDateRangeSelectors() {
    el.xMin.innerHTML = "";
    el.xMax.innerHTML = "";
    if (activeDatasets.length === 0) return;

    if (activeDatasets.length > 1) {
      const offsets = new Set();
      activeDatasets.forEach((ds) => ds.pollEntries.forEach((p) => {
        if (p.date) offsets.add(Math.round((p.date.getTime() - ds.referenceDate.getTime()) / PollData.DAY_MS));
      }));
      const sorted = [...offsets].sort((a, b) => a - b);
      sorted.forEach((o) => {
        const label = formatDayOffset(o);
        el.xMin.appendChild(new Option(label, o));
        el.xMax.appendChild(new Option(label, o));
      });
      if (sorted.length) {
        el.xMin.value = String(sorted[0]);
        el.xMax.value = String(sorted[sorted.length - 1]);
      }
    } else {
      const ds = activeDatasets[0];
      const uniqueDates = [...new Set(ds.pollEntries.filter((p) => p.date).map((p) => p.date.getTime()))]
        .sort((a, b) => a - b);
      uniqueDates.forEach((t) => {
        const label = formatDateLabel(new Date(t));
        el.xMin.appendChild(new Option(label, t));
        el.xMax.appendChild(new Option(label, t));
      });
      if (uniqueDates.length) {
        el.xMin.value = String(uniqueDates[0]);
        el.xMax.value = String(uniqueDates[uniqueDates.length - 1]);
      }
    }
  }

  function formatDateLabel(d) {
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatDayOffset(offset) {
    if (offset === 0) return "Jour du tour";
    return offset < 0 ? `${Math.abs(offset)} j avant` : `${offset} j après`;
  }

  function updateHeader() {
    const tourLabel = currentTour === "second_tour" ? "second tour" : "premier tour";
    const years = activeDatasets.map((d) => d.annee);

    if (years.length === 0) {
      el.title.textContent = "Sondages — aucune élection sélectionnée";
      el.subtitle.textContent = "Cochez au moins une année dans le panneau de gauche.";
      return;
    }

    el.title.textContent = years.length > 1
      ? `Sondages — ${tourLabel} — ${years.join(", ")} (superposés)`
      : `Sondages — ${tourLabel}, ${years[0]}`;

    const totalPolls = activeDatasets.reduce((s, d) => s + d.pollEntries.length, 0);
    let subtitleText = `${totalPolls} sondages · ${allInstituts.length} instituts · ${allCandidats.length} candidats`;
    if (years.length > 1) subtitleText += " · axe aligné sur le nombre de jours avant le tour";
    el.subtitle.textContent = subtitleText;
  }

  // -----------------------------------------------------------------
  // Graphique
  // -----------------------------------------------------------------
  function buildSeries() {
    const relative = activeDatasets.length > 1;
    const series = [];

    activeDatasets.forEach((ds) => {
      selectedCandidats.forEach((cand) => {
        const points = [];
        ds.pollEntries.forEach((p) => {
          if (!p.date || !selectedInstituts.has(p.institut)) return;
          if (!p.resultsMap.has(cand)) return;
          const x = relative
            ? (p.date.getTime() - ds.referenceDate.getTime()) / PollData.DAY_MS
            : p.date.getTime();
          points.push({ x, y: p.resultsMap.get(cand), institut: p.institut, annee: ds.annee });
        });
        if (points.length === 0) return;
        points.sort((a, b) => a.x - b.x);

        series.push({
          label: activeDatasets.length > 1 ? `${cand} — ${ds.annee}` : cand,
          points,
          color: PollChart.colorFor(cand),
          dash: PollChart.dashFor(ds.annee)
        });
      });
    });

    return series;
  }

  function renderChart() {
    const relative = activeDatasets.length > 1;
    const yAuto = el.yAuto.checked;
    const yMin = parseFloat(el.yMin.value);
    const yMax = parseFloat(el.yMax.value);
    const xMinVal = el.xMin.value;
    const xMaxVal = el.xMax.value;

    const cfg = {
      xType: relative ? "linear" : "time",
      xLabel: relative ? "Jours avant le tour (0 = jour du scrutin)" : "Date de publication",
      yLabel: "Intentions de vote (%)",
      yMin: (!yAuto && !Number.isNaN(yMin)) ? yMin : null,
      yMax: (!yAuto && !Number.isNaN(yMax)) ? yMax : null,
      xMin: xMinVal !== "" ? (relative ? parseFloat(xMinVal) : parseInt(xMinVal, 10)) : null,
      xMax: xMaxVal !== "" ? (relative ? parseFloat(xMaxVal) : parseInt(xMaxVal, 10)) : null
    };

    chart.setData(buildSeries(), cfg);
  }

  // -----------------------------------------------------------------
  // Événements
  // -----------------------------------------------------------------
  document.querySelectorAll('input[name="tour"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      currentTour = e.target.value;
      refreshSelection();
    });
  });

  document.querySelectorAll(".annee-toggle").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const annee = parseInt(e.target.value, 10);
      if (e.target.checked) selectedYears.add(annee); else selectedYears.delete(annee);
      refreshSelection();
    });
  });

  el.btnRecharger.addEventListener("click", () => {
    selectedYears.forEach((annee) => PollData.clearCachedElection(currentTour, annee));
    refreshSelection();
  });

  el.candidatSearch.addEventListener("input", (e) => renderCandidatList(e.target.value));

  document.querySelectorAll(".mini-actions button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { target, action } = btn.dataset;
      if (target === "instituts") {
        selectedInstituts = action === "all" ? new Set(allInstituts) : new Set();
        renderInstitutList();
      } else {
        selectedCandidats = action === "all" ? new Set(allCandidats) : new Set();
        renderCandidatList(el.candidatSearch.value);
      }
      renderChart();
    });
  });

  el.yAuto.addEventListener("change", () => {
    el.yMin.disabled = el.yAuto.checked;
    el.yMax.disabled = el.yAuto.checked;
    renderChart();
  });
  el.yMin.disabled = el.yAuto.checked;
  el.yMax.disabled = el.yAuto.checked;

  ["y-min", "y-max", "x-min", "x-max"].forEach((id) => {
    document.getElementById(id).addEventListener("change", renderChart);
  });

  // -----------------------------------------------------------------
  // Démarrage
  // -----------------------------------------------------------------
  refreshSelection();
})();