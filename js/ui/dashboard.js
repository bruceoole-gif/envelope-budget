import { state, activeFolders, getBalance } from '../state.js';
import { formatCents } from '../money.js';
import { currentPeriodId, periodLabel, formatDateHuman, daysBetween, todayISO } from '../period.js';
import { totalOnHand, periodTotals, essentialsStatus, runwayEstimate } from '../stats.js';
import { openQuickAdd } from './quickadd.js';
import { rerender } from '../bus.js';

function backupBanner() {
  const last = state.meta.lastExportAt;
  const days = last ? daysBetween(last.slice(0, 10), todayISO()) : 9999;
  if (days < 30) return '';
  return `<div class="banner" data-backup-banner>
    <span>You haven't backed up in ${last ? days + ' days' : 'a while'} — export your data for safekeeping.</span>
    <button class="btn-link" data-goto="#/settings">Export now</button>
  </div>`;
}

export function renderDashboard(root) {
  const meta = state.meta;
  const periodId = currentPeriodId(meta);
  const onHand = totalOnHand();
  const totals = periodTotals(periodId);
  const essentials = essentialsStatus(periodId);
  const runway = runwayEstimate();
  const folders = activeFolders();
  const unassigned = getBalance('unassigned', 'unassigned');

  root.innerHTML = `
    ${backupBanner()}
    <div class="page-head">
      <div>
        <p class="eyebrow">${periodLabel(meta, periodId)}</p>
        <h1 class="figure-xl ${onHand < 0 ? 'text-negative' : ''}">${formatCents(onHand)}</h1>
        <p class="muted">on hand</p>
      </div>
      <button class="btn btn-primary" data-quick-add>+ Add</button>
    </div>

    <div class="stat-grid">
      <div class="card stat-card">
        <p class="label">In this period</p>
        <p class="figure-lg text-positive">${formatCents(totals.income)}</p>
      </div>
      <div class="card stat-card">
        <p class="label">Out this period</p>
        <p class="figure-lg">${formatCents(totals.expense)}</p>
      </div>
      <div class="card stat-card">
        <p class="label">Runway</p>
        <p class="figure-lg">${runway ? runway.days + 'd' : '—'}</p>
        <p class="muted small">${runway ? 'Essentials covered through ' + formatDateHuman(runway.date) : 'Add essentials to estimate'}</p>
      </div>
    </div>

    <section class="section">
      <h2>Essentials <span class="muted">— Tier 1</span></h2>
      ${essentials.length === 0 ? emptyState('No essentials yet.', 'Set up your must-fund list in Settings → Essentials.') : `
        <div class="list">
          ${essentials.map((e) => `
            <div class="list-row essential-row">
              <div class="row-main">
                <span class="row-title">${e.name}</span>
                <span class="row-sub">${formatCents(e.fundedCents)} of ${formatCents(e.targetCents)}</span>
              </div>
              <div class="progress-track"><div class="progress-fill ${e.isFullyFunded ? 'fill-positive' : 'fill-warning'}" style="width:${Math.min(100, (e.fundedCents / Math.max(1, e.targetCents)) * 100)}%"></div></div>
            </div>`).join('')}
        </div>`}
    </section>

    <section class="section">
      <h2>Folders <span class="muted">— Tier 2</span></h2>
      ${folders.length === 0 ? emptyState('No folders yet.', 'Create savings, fun, or business folders in Settings → Folders.') : `
        <div class="list">
          ${folders.map((f) => {
            const bal = getBalance('folder', f.id);
            const pct = f.capCents ? Math.min(100, (bal / f.capCents) * 100) : null;
            return `<a class="list-row" href="#/folders/${f.id}">
              <div class="row-main">
                <span class="row-title">${f.name}</span>
                <span class="row-sub">${f.percent}%${f.capCents ? ' · cap ' + formatCents(f.capCents) : ''}</span>
              </div>
              <span class="num row-amount ${bal < 0 ? 'text-negative' : ''}">${formatCents(bal)}</span>
              ${pct != null ? `<div class="progress-track"><div class="progress-fill ${pct >= 100 ? 'fill-warning' : 'fill-positive'}" style="width:${pct}%"></div></div>` : ''}
            </a>`;
          }).join('')}
          <a class="list-row" href="#/folders">
            <div class="row-main"><span class="row-title">Unassigned</span><span class="row-sub">Sweep manually into a folder</span></div>
            <span class="num row-amount">${formatCents(unassigned)}</span>
          </a>
        </div>`}
    </section>
  `;

  root.querySelector('[data-quick-add]').addEventListener('click', () => openQuickAdd('income'));
  root.querySelectorAll('[data-goto]').forEach((btn) => btn.addEventListener('click', () => (location.hash = btn.dataset.goto)));
}

export function emptyState(title, body) {
  return `<div class="empty-state"><p class="empty-title">${title}</p><p class="muted">${body}</p></div>`;
}
