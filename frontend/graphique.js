// ===================================================================
// chart.js — Rendu du graphique en Canvas 2D natif, sans librairie.
// Expose un unique objet global : PollChart.
// ===================================================================
window.PollChart = (function () {
  "use strict";

  const COLORS = {
    grid: "#eceadf",
    gridSoft: "#f2f0e8",
    axis: "#cac6b8",
    tickText: "#545a72",
    axisLabel: "#1B2036"
  };

  const DASH_BY_YEAR = { 2017: [7, 4], 2022: [2, 3], 2027: [] };

  // Angle doré : répartition stable et bien étalée quel que soit le
  // nombre de candidats découverts au fil des élections chargées.
  const colorMap = new Map();
  function colorFor(name) {
    if (!colorMap.has(name)) {
      const idx = colorMap.size;
      const hue = (idx * 137.508) % 360;
      colorMap.set(name, `hsl(${hue.toFixed(1)}, 62%, 45%)`);
    }
    return colorMap.get(name);
  }

  function dashFor(annee) {
    return DASH_BY_YEAR[annee] || [];
  }

  // -----------------------------------------------------------------
  // "Nice numbers" pour des graduations lisibles de l'axe Y
  // -----------------------------------------------------------------
  function niceNum(range, round) {
    const exponent = Math.floor(Math.log10(range || 1));
    const fraction = range / Math.pow(10, exponent);
    let niceFraction;
    if (round) {
      if (fraction < 1.5) niceFraction = 1;
      else if (fraction < 3) niceFraction = 2;
      else if (fraction < 7) niceFraction = 5;
      else niceFraction = 10;
    } else {
      if (fraction <= 1) niceFraction = 1;
      else if (fraction <= 2) niceFraction = 2;
      else if (fraction <= 5) niceFraction = 5;
      else niceFraction = 10;
    }
    return niceFraction * Math.pow(10, exponent);
  }

  function niceTicks(min, max, targetCount) {
    if (min === max) { min -= 1; max += 1; }
    const range = niceNum(max - min, false);
    const step = niceNum(range / Math.max(targetCount - 1, 1), true);
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = niceMin; v <= niceMax + step * 1e-6; v += step) {
      ticks.push(Math.round(v * 1000) / 1000);
    }
    return ticks;
  }

  function evenTicks(min, max, count) {
    const ticks = [];
    for (let i = 0; i <= count; i++) ticks.push(min + ((max - min) * i) / count);
    return ticks;
  }

  function formatXTick(v, xType) {
    if (xType === "time") {
      return new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
    }
    const r = Math.round(v);
    return r === 0 ? "0" : (r > 0 ? "+" + r : String(r));
  }

  function formatXFull(v, xType) {
    if (xType === "time") {
      return new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    }
    const r = Math.round(v);
    if (r === 0) return "Jour du tour";
    return r < 0 ? `${Math.abs(r)} jour(s) avant le tour` : `${r} jour(s) après le tour`;
  }

  // -----------------------------------------------------------------
  // Constructeur du graphique
  // -----------------------------------------------------------------
  function create(canvas, tooltipEl, legendEl, emptyEl) {
    let datasets = [];
    let config = { xType: "time", xLabel: "", yLabel: "", yMin: null, yMax: null, xMin: null, xMax: null };
    let lastLayout = null;

    function setData(newDatasets, newConfig) {
      datasets = newDatasets;
      config = Object.assign({}, config, newConfig);
      const hasData = datasets.some((ds) => ds.points.length > 0);
      if (emptyEl) emptyEl.hidden = hasData;
      renderLegend();
      render();
    }

    function computeDomain() {
      let xMin = config.xMin, xMax = config.xMax;
      if (xMin == null || xMax == null) {
        let allX = [];
        datasets.forEach((ds) => ds.points.forEach((p) => allX.push(p.x)));
        if (allX.length) {
          if (xMin == null) xMin = Math.min.apply(null, allX);
          if (xMax == null) xMax = Math.max.apply(null, allX);
        } else { xMin = 0; xMax = 1; }
      }
      if (xMin === xMax) xMax = xMin + 1;

      let yMin = config.yMin, yMax = config.yMax;
      if (yMin == null || yMax == null) {
        let allY = [];
        datasets.forEach((ds) => ds.points.forEach((p) => allY.push(p.y)));
        if (allY.length) {
          const dataMin = Math.min.apply(null, allY);
          const dataMax = Math.max.apply(null, allY);
          const pad = Math.max((dataMax - dataMin) * 0.12, 1);
          if (yMin == null) yMin = Math.max(0, dataMin - pad);
          if (yMax == null) yMax = dataMax + pad;
        } else { yMin = 0; yMax = 10; }
      }
      if (yMin === yMax) yMax = yMin + 1;
      return { xMin, xMax, yMin, yMax };
    }

    function resizeCanvasToDisplaySize() {
      const dpr = window.devicePixelRatio || 1;
      const displayW = Math.max(1, Math.round(canvas.clientWidth));
      const displayH = Math.max(1, Math.round(canvas.clientHeight));
      if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
        canvas.width = displayW * dpr;
        canvas.height = displayH * dpr;
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: displayW, h: displayH, ctx };
    }

    function render() {
      const { w, h, ctx } = resizeCanvasToDisplaySize();
      ctx.clearRect(0, 0, w, h);

      const hasData = datasets.some((ds) => ds.points.length > 0);
      if (!hasData) { lastLayout = null; return; }

      const domain = computeDomain();
      const padding = { left: 54, right: 16, top: 14, bottom: 34 };
      const plotW = Math.max(10, w - padding.left - padding.right);
      const plotH = Math.max(10, h - padding.top - padding.bottom);

      const xScale = (x) => padding.left + ((x - domain.xMin) / (domain.xMax - domain.xMin)) * plotW;
      const yScale = (y) => padding.top + (1 - (y - domain.yMin) / (domain.yMax - domain.yMin)) * plotH;

      // Grille + graduations Y
      const yTicks = niceTicks(domain.yMin, domain.yMax, 6);
      ctx.font = "11px Inter, sans-serif";
      ctx.lineWidth = 1;
      yTicks.forEach((t) => {
        if (t < domain.yMin - 1e-6 || t > domain.yMax + 1e-6) return;
        const py = yScale(t);
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(padding.left, py);
        ctx.lineTo(w - padding.right, py);
        ctx.stroke();
        ctx.fillStyle = COLORS.tickText;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(Math.round(t * 10) / 10 + "%", padding.left - 8, py);
      });

      // Grille + graduations X
      const xTicks = evenTicks(domain.xMin, domain.xMax, 6);
      xTicks.forEach((t) => {
        const px = xScale(t);
        ctx.strokeStyle = COLORS.gridSoft;
        ctx.beginPath();
        ctx.moveTo(px, padding.top);
        ctx.lineTo(px, h - padding.bottom);
        ctx.stroke();
        ctx.fillStyle = COLORS.tickText;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(formatXTick(t, config.xType), px, h - padding.bottom + 8);
      });

      // Axes
      ctx.strokeStyle = COLORS.axis;
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top);
      ctx.lineTo(padding.left, h - padding.bottom);
      ctx.lineTo(w - padding.right, h - padding.bottom);
      ctx.stroke();

      // Libellés d'axes
      ctx.fillStyle = COLORS.axisLabel;
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      if (config.xLabel) ctx.fillText(config.xLabel, padding.left + plotW / 2, h - 4);
      if (config.yLabel) {
        ctx.save();
        ctx.translate(12, padding.top + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(config.yLabel, 0, 0);
        ctx.restore();
      }

      // Séries
      datasets.forEach((ds) => {
        if (ds.points.length === 0) return;
        ctx.beginPath();
        ctx.strokeStyle = ds.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(ds.dash || []);
        ds.points.forEach((p, i) => {
          const px = xScale(p.x), py = yScale(p.y);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = ds.color;
        ds.points.forEach((p) => {
          const px = xScale(p.x), py = yScale(p.y);
          ctx.beginPath();
          ctx.arc(px, py, 2.6, 0, Math.PI * 2);
          ctx.fill();
        });
      });

      lastLayout = { domain, padding, w, h, plotW, plotH, xScale, yScale };
    }

    function renderLegend() {
      if (!legendEl) return;
      legendEl.innerHTML = "";
      datasets.forEach((ds) => {
        if (ds.points.length === 0) return;
        const item = document.createElement("div");
        item.className = "legend-item";

        const swatch = document.createElement("span");
        swatch.className = "legend-swatch";
        swatch.style.borderTopColor = ds.color;
        swatch.style.borderTopStyle = (ds.dash && ds.dash.length) ? "dashed" : "solid";

        const label = document.createElement("span");
        label.textContent = ds.label;

        item.append(swatch, label);
        legendEl.appendChild(item);
      });
    }

    function handleMouseMove(evt) {
      if (!lastLayout || !tooltipEl) return;
      const rect = canvas.getBoundingClientRect();
      const mx = evt.clientX - rect.left;
      const my = evt.clientY - rect.top;

      let best = null, bestDist = Infinity;
      datasets.forEach((ds) => {
        ds.points.forEach((p) => {
          const px = lastLayout.xScale(p.x), py = lastLayout.yScale(p.y);
          const d = Math.hypot(px - mx, py - my);
          if (d < bestDist) { bestDist = d; best = { ds, p, px, py }; }
        });
      });

      if (best && bestDist < 26) {
        const dateLabel = formatXFull(best.p.x, config.xType);
        tooltipEl.innerHTML =
          `<strong>${best.ds.label}</strong><br>` +
          `${best.p.y}% — ${best.p.institut || ""}<br>` +
          `<span class="tooltip-date">${dateLabel}</span>`;
        tooltipEl.style.left = best.px + "px";
        tooltipEl.style.top = best.py + "px";
        tooltipEl.hidden = false;
      } else {
        tooltipEl.hidden = true;
      }
    }

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", () => { if (tooltipEl) tooltipEl.hidden = true; });
    window.addEventListener("resize", () => render());

    return { setData, render };
  }

  return { create, colorFor, dashFor };
})();