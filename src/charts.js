/* Inline SVG-grafieken, met de hand opgebouwd uit data in JS — geen
 * Chart.js, geen D3, geen canvas-library, geen extern lettertype. Elke
 * functie geeft een HTML-string terug (SVG + eventueel een HTML-legenda)
 * op basis van pure data + opties, zodat dit ook zonder DOM te testen is.
 *
 * Kleuren volgen het ontwerp: mint + licht mint + twee neutrale tinten voor
 * series, NOOIT statuskleuren (rood/oranje/groen) — dit zijn hoeveelheden,
 * geen signalen. */

const CHART_SERIE_KLEUREN = ["#4ADE80", "#86EFAC", "#8189A8", "#5B6178"];

function svgEsc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Gestapelde staafgrafiek. `weeks` = uitvoer van computeActiviteitPerWeek()
 * (buckets), `seriesKeys`/`seriesLabels` bepalen volgorde en kleur.
 * Weken zonder activiteit (leeg=true) worden getekend als een gedimd,
 * gestippeld streepje met het label "geen" erboven — het gat IS het
 * signaal, dus nooit gewoon leeg laten of weglaten.
 */
function buildStackedBarChart({ buckets, seriesKeys, seriesLabels, width = 760, height = 230 }) {
  const padLeft = 30, padBottom = 30, padTop = 14, padRight = 6;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const n = buckets.length;
  const gap = Math.max(2, Math.min(8, plotW / n * 0.18));
  const barW = Math.max(4, (plotW - gap * (n - 1)) / n);
  const maxTotal = Math.max(1, ...buckets.map(b => b.totaal));

  let bars = "";
  let axisLabels = "";
  buckets.forEach((b, i) => {
    const x = padLeft + i * (barW + gap);
    if (b.leeg) {
      const y = padTop + plotH - 8;
      bars += `<rect x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="8" fill="none" stroke="#6B7280" stroke-width="1.2" stroke-dasharray="3,2" opacity="0.7" rx="2"><title>Week van ${svgEsc(b.label)}: geen activiteit</title></rect>`;
      axisLabels += `<text x="${(x + barW / 2).toFixed(1)}" y="${padTop + plotH - 14}" text-anchor="middle" font-size="8.5" fill="#9CA3AF" font-style="italic">geen</text>`;
    } else {
      let yCursor = padTop + plotH;
      seriesKeys.forEach((k, si) => {
        const v = b.values[k] || 0;
        if (!v) return;
        const h = (v / maxTotal) * plotH;
        yCursor -= h;
        bars += `<rect x="${x.toFixed(1)}" y="${yCursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${CHART_SERIE_KLEUREN[si]}"><title>Week van ${svgEsc(b.label)} — ${svgEsc(seriesLabels[si])}: ${v}</title></rect>`;
      });
    }
    axisLabels += `<text x="${(x + barW / 2).toFixed(1)}" y="${height - padBottom + 14}" text-anchor="middle" font-size="8.5" fill="#9CA3AF">${svgEsc(b.label)}</text>`;
  });

  const axis = `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#3f3f5c" stroke-width="1"></line>
    <line x1="${padLeft}" y1="${(padTop + plotH).toFixed(1)}" x2="${width - padRight}" y2="${(padTop + plotH).toFixed(1)}" stroke="#3f3f5c" stroke-width="1"></line>
    <text x="${padLeft - 5}" y="${padTop + 4}" text-anchor="end" font-size="9" fill="#9CA3AF">${maxTotal}</text>
    <text x="${padLeft - 5}" y="${(padTop + plotH).toFixed(1)}" text-anchor="end" font-size="9" fill="#9CA3AF">0</text>`;

  const legend = seriesKeys.map((k, i) =>
    `<span class="chart-legend-item"><span class="dot" style="background:${CHART_SERIE_KLEUREN[i]}"></span>${svgEsc(seriesLabels[i])}</span>`
  ).join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Activiteit per week, gestapeld per bron">${axis}${bars}${axisLabels}</svg>
    <div class="chart-legend">${legend}</div>`;
}

/** Gerangschikte horizontale staafgrafiek. `items` = [{label, emoji, value, totaal}],
 * al gesorteerd (hoogste eerst). Gebruikt mint als hoeveelheids-kleur (geen
 * statuskleur — dit is een ranking, geen oordeel over goed/fout). */
function buildHorizontalBarChart({ items, width = 680, barHeight = 20, gap = 7 }) {
  const maxVal = Math.max(1, ...items.map(i => i.value));
  const labelW = 200;
  const valueColW = 34;
  const plotW = width - labelW - valueColW;
  const height = items.length * (barHeight + gap);
  let rowsHtml = "";
  items.forEach((it, i) => {
    const y = i * (barHeight + gap);
    const w = it.value > 0 ? Math.max(3, (it.value / maxVal) * plotW) : 0;
    const titel = it.totaal !== undefined && it.totaal !== it.value
      ? `${svgEsc(it.label)}: ${it.value} in de gekozen periode (${it.totaal} totaal in de bundel)`
      : `${svgEsc(it.label)}: ${it.value}`;
    rowsHtml += `<text x="${labelW - 8}" y="${(y + barHeight / 2 + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#FFFFFF">${svgEsc(it.emoji || "")} ${svgEsc(it.label)}</text>`;
    if (w > 0) {
      rowsHtml += `<rect x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="${barHeight}" rx="4" fill="#4ADE80"><title>${titel}</title></rect>`;
    } else {
      rowsHtml += `<rect x="${labelW}" y="${y + barHeight / 2 - 1}" width="10" height="2" fill="#6B7280" opacity="0.6"><title>${titel}</title></rect>`;
    }
    rowsHtml += `<text x="${labelW + w + 6}" y="${(y + barHeight / 2 + 4).toFixed(1)}" font-size="10.5" fill="#9CA3AF">${it.value}</text>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Gebruik per agent, gerangschikt">${rowsHtml}</svg>`;
}

if (typeof module !== "undefined") {
  module.exports = { buildStackedBarChart, buildHorizontalBarChart, CHART_SERIE_KLEUREN, svgEsc };
}
