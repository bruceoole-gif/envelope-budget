import { state, activeEssentials, activeFolders, getBalance, getPeriodFunded, getCache } from './state.js';
import { currentPeriodId, previousPeriodId, getPeriodBounds, daysBetween, todayISO, addDays } from './period.js';

export function totalOnHand() {
  let total = getBalance('unassigned', 'unassigned');
  activeEssentials().forEach((e) => (total += getBalance('essential', e.id)));
  activeFolders().forEach((f) => (total += getBalance('folder', f.id)));
  return total;
}

export function periodTotals(periodId) {
  let income = 0, expense = 0;
  for (const t of state.transactions) {
    if (t.voided || t.periodId !== periodId) continue;
    if (t.type === 'income') income += t.amountCents;
    else if (t.type === 'expense') expense += t.amountCents;
  }
  return { income, expense, net: income - expense };
}

export function essentialsStatus(periodId) {
  return activeEssentials().map((e) => {
    const funded = getPeriodFunded(e.id, periodId);
    return { ...e, fundedCents: funded, remainingCents: Math.max(0, e.targetCents - funded), isFullyFunded: funded >= e.targetCents };
  });
}

export function runwayEstimate() {
  const essentials = activeEssentials();
  if (essentials.length === 0) return null;
  const meta = state.meta;
  const periodId = currentPeriodId(meta);
  const { lengthDays } = getPeriodBounds(meta, periodId);
  const dailyBurn = essentials.reduce((s, e) => s + e.targetCents, 0) / lengthDays;
  if (dailyBurn <= 0) return null;
  const onHand = totalOnHand();
  if (onHand <= 0) return { days: 0, date: todayISO() };
  const days = Math.floor(onHand / dailyBurn);
  return { days, date: addDays(todayISO(), days) };
}

export function periodComparison() {
  const meta = state.meta;
  const cur = currentPeriodId(meta);
  const prev = previousPeriodId(meta, cur);
  return { current: { id: cur, ...periodTotals(cur) }, previous: { id: prev, ...periodTotals(prev) } };
}

export function folderHistory(folderId) {
  const rows = [];
  let running = 0;
  const sorted = state.transactions
    .filter((t) => !t.voided && t.entries.some((e) => e.acctType === 'folder' && e.acctId === folderId))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.createdAt - b.createdAt);
  for (const t of sorted) {
    const delta = t.entries.filter((e) => e.acctType === 'folder' && e.acctId === folderId).reduce((s, e) => s + e.deltaCents, 0);
    running += delta;
    rows.push({ tx: t, delta, balanceAfter: running });
  }
  return rows.reverse();
}

export function spendingByCategory(fromISO, toISO) {
  const totals = {};
  for (const t of state.transactions) {
    if (t.voided || t.type !== 'expense') continue;
    if (t.dateISO < fromISO || t.dateISO > toISO) continue;
    for (const e of t.entries) {
      const cat = e.category || t.category || 'Uncategorized';
      totals[cat] = (totals[cat] || 0) + Math.abs(e.deltaCents);
    }
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
}

export function incomeByPeriod(count = 6) {
  const meta = state.meta;
  let pid = currentPeriodId(meta);
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.unshift({ label: getPeriodBounds(meta, pid).start.slice(5), value: periodTotals(pid).income });
    pid = previousPeriodId(meta, pid);
  }
  return rows;
}

export function folderBalanceSeries(folderId, points = 12) {
  const rows = folderHistory(folderId).slice().reverse();
  if (rows.length === 0) return [];
  const step = Math.max(1, Math.floor(rows.length / points));
  const out = [];
  for (let i = 0; i < rows.length; i += step) out.push(rows[i].balanceAfter);
  out.push(rows[rows.length - 1].balanceAfter);
  return out;
}
