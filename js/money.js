// Integer-cents money utilities. Never use floating point for currency math.

export function formatCents(cents, { hide = false } = {}) {
  if (hide) return '••••••';
  const n = Math.round(cents);
  const neg = n < 0;
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const c = String(abs % 100).padStart(2, '0');
  return `${neg ? '−' : ''}$${dollars}.${c}`;
}

export function formatCentsCompact(cents) {
  const n = Math.round(cents);
  const neg = n < 0;
  const abs = Math.abs(n);
  const dollars = abs / 100;
  let str;
  if (dollars >= 1000000) str = (dollars / 1000000).toFixed(1) + 'M';
  else if (dollars >= 1000) str = (dollars / 1000).toFixed(1) + 'k';
  else str = dollars.toFixed(0);
  return `${neg ? '−' : ''}$${str}`;
}

// Parses free-form dollar input ("1,234.5", "$40", "-12") into integer cents. Returns NaN if invalid.
export function parseDollarsToCents(input) {
  if (input == null) return NaN;
  const cleaned = String(input).trim().replace(/[$,\s]/g, '');
  if (cleaned === '' || cleaned === '-' || isNaN(Number(cleaned))) return NaN;
  const neg = cleaned.startsWith('-');
  const abs = Math.abs(Number(cleaned));
  return (neg ? -1 : 1) * Math.round(abs * 100);
}

// Splits totalCents across weights, integer cents, exact sum, largest-remainder method.
export function splitCentsByWeights(totalCents, weights) {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0 || totalCents === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalCents * w) / sumW);
  const floors = raw.map(Math.floor);
  const allocated = floors.reduce((a, b) => a + b, 0);
  let remainder = Math.round(totalCents - allocated);
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const result = floors.slice();
  for (let k = 0; k < remainder; k++) {
    result[order[k % order.length].i]++;
  }
  return result;
}

export function clampCents(cents, min, max) {
  let v = cents;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
}
