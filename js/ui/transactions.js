import { state, listAllAccounts, accountName, previewEditTransaction, commitEditTransaction, previewVoid, voidTransaction, knownCategories } from '../state.js';
import { formatCents, parseDollarsToCents } from '../money.js';
import { formatDateHuman, todayISO } from '../period.js';
import { openModal, confirmModal, closeTopModal } from './modal.js';
import { showToast } from './toast.js';
import { rerender } from '../bus.js';
import { emptyState } from './dashboard.js';

let filters = { text: '', acct: '', category: '', type: '', from: '', to: '', minAmt: '', maxAmt: '' };
let pageSize = 50;
let shown = 50;

function typeLabel(t) {
  return { income: 'Income', expense: 'Expense', transfer: 'Transfer', refund: 'Refund', adjustment: 'Adjustment' }[t] || t;
}

function matches(t) {
  if (t.voided) return false;
  if (filters.type && t.type !== filters.type) return false;
  if (filters.acct) {
    const [ty, id] = filters.acct.split(':');
    if (!t.entries.some((e) => e.acctType === ty && e.acctId === id)) return false;
  }
  if (filters.category && t.category !== filters.category && !t.entries.some((e) => e.category === filters.category)) return false;
  if (filters.from && t.dateISO < filters.from) return false;
  if (filters.to && t.dateISO > filters.to) return false;
  const minC = parseDollarsToCents(filters.minAmt);
  const maxC = parseDollarsToCents(filters.maxAmt);
  if (!isNaN(minC) && t.amountCents < minC) return false;
  if (!isNaN(maxC) && t.amountCents > maxC) return false;
  if (filters.text) {
    const hay = `${t.payee} ${t.note} ${t.category} ${(t.tags || []).join(' ')}`.toLowerCase();
    if (!hay.includes(filters.text.toLowerCase())) return false;
  }
  return true;
}

export function renderTransactions(root) {
  shown = pageSize;
  draw(root);
}

function draw(root) {
  const all = state.transactions.slice().sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.createdAt - a.createdAt);
  const filtered = all.filter(matches);
  const accts = listAllAccounts();

  root.innerHTML = `
    <div class="page-head"><h1>Transactions</h1></div>
    <div class="filter-bar">
      <input type="search" placeholder="Search…" value="${filters.text}" data-f="text" id="tx-search">
      <select data-f="type"><option value="">All types</option>${['income', 'expense', 'transfer', 'refund', 'adjustment'].map((t) => `<option value="${t}" ${filters.type === t ? 'selected' : ''}>${typeLabel(t)}</option>`).join('')}</select>
      <select data-f="acct"><option value="">All accounts</option>${accts.map((a) => `<option value="${a.type}:${a.id}" ${filters.acct === `${a.type}:${a.id}` ? 'selected' : ''}>${a.name}</option>`).join('')}</select>
      <select data-f="category"><option value="">All categories</option>${knownCategories().map((c) => `<option value="${c}" ${filters.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <input type="date" data-f="from" value="${filters.from}">
      <input type="date" data-f="to" value="${filters.to}">
      <input type="text" inputmode="decimal" placeholder="Min $" data-f="minAmt" value="${filters.minAmt}">
      <input type="text" inputmode="decimal" placeholder="Max $" data-f="maxAmt" value="${filters.maxAmt}">
      ${Object.values(filters).some(Boolean) ? '<button class="btn-link" data-clear>Clear filters</button>' : ''}
    </div>
    ${filtered.length === 0 ? emptyState('No transactions match.', 'Try adjusting filters, or add your first transaction.') : `
      <div class="list tx-list">
        ${filtered.slice(0, shown).map(rowHTML).join('')}
      </div>
      ${filtered.length > shown ? `<button class="btn" data-load-more>Load more (${filtered.length - shown} more)</button>` : ''}
    `}
  `;

  root.querySelectorAll('[data-f]').forEach((inp) => {
    const evt = inp.tagName === 'SELECT' || inp.type === 'date' ? 'change' : 'input';
    inp.addEventListener(evt, () => {
      filters[inp.dataset.f] = inp.value;
      shown = pageSize;
      draw(root);
      if (inp.id === 'tx-search') root.querySelector('#tx-search')?.focus();
    });
  });
  const clearBtn = root.querySelector('[data-clear]');
  if (clearBtn) clearBtn.addEventListener('click', () => { filters = { text: '', acct: '', category: '', type: '', from: '', to: '', minAmt: '', maxAmt: '' }; draw(root); });
  const loadMore = root.querySelector('[data-load-more]');
  if (loadMore) loadMore.addEventListener('click', () => { shown += pageSize; draw(root); });

  root.querySelectorAll('[data-tx]').forEach((el) => el.addEventListener('click', () => openTxDetail(el.dataset.tx, root)));
}

function rowHTML(t) {
  const sign = t.type === 'expense' ? '−' : t.type === 'income' || t.type === 'refund' ? '+' : '';
  const cls = t.type === 'expense' ? 'text-negative' : t.type === 'income' || t.type === 'refund' ? 'text-positive' : '';
  const accts = [...new Set(t.entries.map((e) => accountName(e.acctType, e.acctId)))].join(', ');
  return `<button type="button" class="list-row tx-row" data-tx="${t.id}">
    <div class="row-main">
      <span class="row-title">${t.payee || typeLabel(t.type)}</span>
      <span class="row-sub">${formatDateHuman(t.dateISO)} · ${accts}${t.note ? ' · ' + t.note : ''}</span>
    </div>
    <span class="num row-amount ${cls}">${sign}${formatCents(t.amountCents)}</span>
  </button>`;
}

function openTxDetail(id, root) {
  const t = state.transactions.find((x) => x.id === id);
  if (!t) return;
  openModal(
    `<div class="tx-detail">
      <p class="muted">${typeLabel(t.type)} · ${formatDateHuman(t.dateISO)}</p>
      <div class="list">
        ${t.entries.map((e) => `<div class="preview-row"><span>${accountName(e.acctType, e.acctId)}${e.category ? ' · ' + e.category : ''}</span><span class="num ${e.deltaCents < 0 ? 'text-negative' : 'text-positive'}">${e.deltaCents >= 0 ? '+' : ''}${formatCents(e.deltaCents)}</span></div>`).join('')}
      </div>
      ${t.note ? `<p class="muted">Note: ${t.note}</p>` : ''}
      ${(t.waterfallLog || []).map((l) => `<p class="preview-warning">${l}</p>`).join('')}
      <div class="modal-actions">
        <button class="btn btn-danger" data-void>Delete</button>
        <button class="btn" data-edit>Edit</button>
      </div>
    </div>`,
    {
      title: t.payee || typeLabel(t.type),
      onMount: (el, close) => {
        el.querySelector('[data-void]').addEventListener('click', async () => {
          const preview = previewVoid(id);
          const ok = await confirmModal({
            title: 'Delete transaction?',
            body: `This reverses: ${preview.beforeEntries.map((e) => `${accountName(e.acctType, e.acctId)} ${e.deltaCents >= 0 ? '−' : '+'}${formatCents(Math.abs(e.deltaCents))}`).join(', ')}.`,
            confirmLabel: 'Delete', danger: true,
          });
          if (!ok) return;
          await voidTransaction(id);
          close();
          rerender();
          showToast('Transaction deleted.', { actionLabel: 'Undo', onAction: async () => { await commitEditTransaction(id, { ...t, voided: false }); rerender(); } });
        });
        el.querySelector('[data-edit]').addEventListener('click', () => {
          close();
          openEditForm(t, root);
        });
      },
    }
  );
}

function openEditForm(t, root) {
  const isIncome = t.type === 'income';
  openModal(
    `<form data-edit-form>
      <div class="field-row">
        <label>Date<input type="date" name="date" value="${t.dateISO}"></label>
        ${!isIncome ? `<label>Amount<input inputmode="decimal" name="amount" value="${(t.amountCents / 100).toFixed(2)}"></label>` : `<label>Amount<input inputmode="decimal" name="amount" value="${(t.amountCents / 100).toFixed(2)}"></label>`}
      </div>
      <label>Payee<input name="payee" value="${t.payee || ''}"></label>
      <label>Note<input name="note" value="${t.note || ''}"></label>
      ${isIncome ? `<label class="checkbox-label"><input type="checkbox" name="reallocate"> Re-run the waterfall using current rules (default: keep original allocation rules)</label>` : ''}
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary">Preview changes</button>
      </div>
    </form>`,
    {
      title: 'Edit transaction',
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          const form = e.target;
          const patch = { dateISO: form.date.value, payee: form.payee.value, note: form.note.value };
          const cents = parseDollarsToCents(form.amount.value);
          if (!isNaN(cents)) patch.amountCents = cents;
          if (isIncome) patch.reallocate = form.reallocate.checked;
          close();
          showDiff(t.id, patch, root);
        });
      },
    }
  );
}

function showDiff(id, patch, root) {
  const preview = previewEditTransaction(id, patch);
  if (!preview) return;
  const before = {};
  preview.beforeEntries.forEach((e) => (before[`${e.acctType}:${e.acctId}`] = (before[`${e.acctType}:${e.acctId}`] || 0) + e.deltaCents));
  const after = {};
  preview.afterEntries.forEach((e) => (after[`${e.acctType}:${e.acctId}`] = (after[`${e.acctType}:${e.acctId}`] || 0) + e.deltaCents));
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const rows = keys.map((k) => {
    const [ty, id2] = k.split(':');
    const b = before[k] || 0, a = after[k] || 0;
    return `<div class="preview-row"><span>${accountName(ty, id2)}</span><span class="num">${formatCents(b)} → <strong class="${a !== b ? (a > b ? 'text-positive' : 'text-negative') : ''}">${formatCents(a)}</strong></span></div>`;
  }).join('');
  openModal(
    `<div class="list">${rows}</div>
     <p class="muted">Downstream balances recalculate automatically once you save.</p>
     <div class="modal-actions">
       <button class="btn" data-cancel>Cancel</button>
       <button class="btn btn-primary" data-save>Save changes</button>
     </div>`,
    {
      title: 'Review changes',
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('[data-save]').addEventListener('click', async () => {
          await commitEditTransaction(id, preview.patchedTx);
          close();
          rerender();
          showToast('Transaction updated.');
        });
      },
    }
  );
}
