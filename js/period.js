// Period helpers. Two period types: 'calendar' (calendar month) or 'rolling30' (30-day windows from an anchor date).

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO() {
  return isoDate(new Date());
}

export function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00');
  const b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

export function formatDateHuman(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getPeriodId(meta, dateISO) {
  if (meta.periodType === 'rolling30') {
    const days = daysBetween(meta.rollingAnchor, dateISO);
    const idx = Math.floor(days / 30);
    return 'r' + idx;
  }
  return dateISO.slice(0, 7);
}

export function getPeriodBounds(meta, periodId) {
  if (periodId.startsWith('r')) {
    const idx = parseInt(periodId.slice(1), 10);
    const start = addDays(meta.rollingAnchor, idx * 30);
    const end = addDays(start, 29);
    return { start, end, lengthDays: 30 };
  }
  const [y, m] = periodId.split('-').map(Number);
  const start = `${y}-${pad2(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${pad2(m)}-${pad2(lastDay)}`;
  return { start, end, lengthDays: lastDay };
}

export function currentPeriodId(meta) {
  return getPeriodId(meta, todayISO());
}

export function previousPeriodId(meta, periodId) {
  if (periodId.startsWith('r')) {
    const idx = parseInt(periodId.slice(1), 10);
    return 'r' + (idx - 1);
  }
  const [y, m] = periodId.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function periodLabel(meta, periodId) {
  const { start, end } = getPeriodBounds(meta, periodId);
  if (periodId.startsWith('r')) {
    return `${formatDateShort(start)} – ${formatDateShort(end)}`;
  }
  const d = new Date(start + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
