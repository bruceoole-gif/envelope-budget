import { formatCentsCompact } from './money.js';

export function svgEl(tag, attrs) {
  const s = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
  return `<${tag} ${s}/>`;
}

// data: [{label, value(cents)}]
export function barChart(data, { width = 560, height = 200, formatValue = formatCentsCompact } = {}) {
  if (!data.length) return `<div class="chart-empty">Nothing to show yet.</div>`;
  const padL = 8, padR = 8, padT = 16, padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const bw = plotW / data.length;
  let bars = '';
  let labels = '';
  data.forEach((d, i) => {
    const x = padL + i * bw + bw * 0.15;
    const w = bw * 0.7;
    const h = (Math.abs(d.value) / max) * (plotH - 4);
    const y = padT + (plotH - 4) - h;
    const cls = d.value < 0 ? 'bar-negative' : 'bar-positive';
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" class="${cls}" rx="2"><title>${d.label}: ${formatValue(d.value)}</title></rect>`;
    if (data.length <= 14) {
      labels += `<text x="${(x + w / 2).toFixed(1)}" y="${height - 8}" class="chart-label" text-anchor="middle">${d.label}</text>`;
    }
  });
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" preserveAspectRatio="xMidYMid meet">${bars}${labels}</svg>`;
}

// series: [{name, points:[{x label, y cents}], color}]
export function lineChart(series, { width = 560, height = 200 } = {}) {
  const allPoints = series.flatMap((s) => s.points);
  if (!allPoints.length) return `<div class="chart-empty">Nothing to show yet.</div>`;
  const padL = 8, padR = 8, padT = 12, padB = 24;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = Math.max(...series.map((s) => s.points.length));
  const maxY = Math.max(1, ...allPoints.map((p) => p.y));
  const minY = Math.min(0, ...allPoints.map((p) => p.y));
  const range = maxY - minY || 1;
  const xFor = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yFor = (v) => padT + plotH - ((v - minY) / range) * plotH;
  let paths = '';
  series.forEach((s) => {
    const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.y).toFixed(1)}`).join(' ');
    paths += `<path d="${d}" fill="none" class="line-series" style="stroke:${s.color || 'var(--accent)'}" stroke-width="2"/>`;
  });
  const zeroY = yFor(0);
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" preserveAspectRatio="xMidYMid meet">
    <line x1="${padL}" x2="${width - padR}" y1="${zeroY.toFixed(1)}" y2="${zeroY.toFixed(1)}" class="chart-zero"/>
    ${paths}
  </svg>`;
}

// segments: [{label, value(cents), color}]
export function donutChart(segments, { size = 180, thickness = 26, formatValue = formatCentsCompact, centerLabel = 'Total' } = {}) {
  const filtered = segments.filter((s) => s.value > 0);
  const total = filtered.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return `<div class="chart-empty">Nothing to show yet.</div>`;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  let circles = '';
  filtered.forEach((seg) => {
    const frac = seg.value / total;
    const dash = frac * circumference;
    const gap = circumference - dash;
    circles += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${thickness}" stroke-linecap="butt"
      stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${c} ${c})">
      <title>${seg.label}: ${formatValue(seg.value)} (${Math.round(frac * 100)}%)</title>
    </circle>`;
    offset += dash;
  });
  const svg = `<svg viewBox="0 0 ${size} ${size}" class="donut" role="img" aria-label="Breakdown chart">
    ${circles}
    <text x="${c}" y="${c - 3}" text-anchor="middle" class="donut-center-value">${formatValue(total)}</text>
    <text x="${c}" y="${c + 16}" text-anchor="middle" class="donut-center-label">${centerLabel}</text>
  </svg>`;
  const legend = `<ul class="donut-legend">
    ${filtered.map((seg) => `<li><span class="color-dot" style="background:${seg.color}"></span><span class="legend-label">${seg.label}</span><span class="legend-value num">${formatValue(seg.value)}</span><span class="legend-pct muted">${Math.round((seg.value / total) * 100)}%</span></li>`).join('')}
  </ul>`;
  return `<div class="donut-wrap">${svg}${legend}</div>`;
}

export function sparkline(values, { width = 160, height = 40, color = 'var(--accent)' } = {}) {
  if (values.length < 2) return `<svg viewBox="0 0 ${width} ${height}" class="sparkline"></svg>`;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" class="sparkline"><path d="${d}" fill="none" style="stroke:${color}" stroke-width="2"/></svg>`;
}
