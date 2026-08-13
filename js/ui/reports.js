import { state, activeFolders } from '../state.js';
import { formatCents } from '../money.js';
import { todayISO, addDays, periodLabel } from '../period.js';
import { spendingByCategory, incomeByPeriod, periodComparison, folderBalanceSeries } from '../stats.js';
import { barChart, sparkline, donutChart } from '../charts.js';
import { colorForIndex } from '../palette.js';
import { emptyState } from './dashboard.js';

export function renderReports(root) {
  const to = todayISO();
  const from = addDays(to, -90);
  const catData = spendingByCategory(from, to).map((d, i) => ({ ...d, color: colorForIndex(i) }));
  const incomeData = incomeByPeriod(6);
  const cmp = periodComparison();
  const folders = activeFolders();

  root.innerHTML = `
    <div class="page-head"><h1>Reports</h1></div>

    <section class="section">
      <h2>Where it's going <span class="muted">— spending by category, last 90 days</span></h2>
      <div class="card chart-card">${catData.length === 0 ? emptyState('No expenses yet.', 'Once you log some expenses, this breaks down where the money goes.') : donutChart(catData, { centerLabel: 'Spent' })}</div>
    </section>

    <section class="section">
      <h2>Income variability</h2>
      <div class="card chart-card">${incomeData.every((d) => d.value === 0) ? emptyState('No income recorded yet.', '') : barChart(incomeData)}</div>
    </section>

    <section class="section">
      <h2>Folder balances</h2>
      ${folders.length === 0 ? emptyState('No folders yet.', '') : `
        <div class="list">
          ${folders.map((f, i) => `<div class="list-row"><span class="color-dot" style="background:${colorForIndex(i)}"></span><div class="row-main"><span class="row-title">${f.name}</span></div>${sparkline(folderBalanceSeries(f.id), { width: 160, height: 36, color: colorForIndex(i) })}</div>`).join('')}
        </div>`}
    </section>

    <section class="section">
      <h2>Period over period</h2>
      <div class="card">
        <table class="compare-table">
          <thead><tr><th></th><th>${periodLabel(state.meta, cmp.previous.id)}</th><th>${periodLabel(state.meta, cmp.current.id)}</th></tr></thead>
          <tbody>
            <tr><td>Income</td><td class="num">${formatCents(cmp.previous.income)}</td><td class="num">${formatCents(cmp.current.income)}</td></tr>
            <tr><td>Expenses</td><td class="num">${formatCents(cmp.previous.expense)}</td><td class="num">${formatCents(cmp.current.expense)}</td></tr>
            <tr><td>Net</td><td class="num">${formatCents(cmp.previous.net)}</td><td class="num">${formatCents(cmp.current.net)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}
