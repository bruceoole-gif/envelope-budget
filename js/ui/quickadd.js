import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { formatCents, parseDollarsToCents } from '../money.js';
import { todayISO } from '../period.js';
import { rerender } from '../bus.js';
import {
  state, listAllAccounts, simulateIncome, createIncome, createExpense, createTransfer,
  createAdjustment, createRefund, getBalance, frequentPayees, recentPayees, knownCategories,
  activeEssentials, accountName,
} from '../state.js';

function accountOptions(selectedType, selectedId, { includeUnassigned = true } = {}) {
  const accts = listAllAccounts().filter((a) => includeUnassigned || a.type !== 'unassigned');
  return accts
    .map((a) => `<option value="${a.type}:${a.id}" ${a.type === selectedType && a.id === selectedId ? 'selected' : ''}>${a.name}${a.type === 'essential' ? ' (essential)' : ''}</option>`)
    .join('');
}

function chipRow(items, cls = 'chip-row') {
  if (!items.length) return '';
  return `<div class="${cls}">${items.map((p) => `<button type="button" class="chip" data-fill-payee>${p}</button>`).join('')}</div>`;
}

export function openQuickAdd(defaultType = 'income') {
  let type = defaultType;
  let modalClose = () => {};

  openModal('', {
    title: 'Add',
    wide: true,
    onMount: (el, close) => {
      modalClose = close;
      render(el);
    },
  });

  function render(el) {
    el.innerHTML = `
      <div class="tab-row" role="tablist">
        ${['income', 'expense', 'transfer', 'refund', 'adjustment'].map(
          (t) => `<button type="button" class="tab ${t === type ? 'tab-active' : ''}" data-type="${t}" role="tab">${label(t)}</button>`
        ).join('')}
      </div>
      <div class="tab-panel"></div>
    `;
    el.querySelectorAll('[data-type]').forEach((btn) =>
      btn.addEventListener('click', () => {
        type = btn.dataset.type;
        render(el);
      })
    );
    const panel = el.querySelector('.tab-panel');
    if (type === 'income') renderIncome(panel);
    else if (type === 'expense') renderExpense(panel);
    else if (type === 'transfer') renderTransfer(panel);
    else if (type === 'refund') renderRefund(panel);
    else if (type === 'adjustment') renderAdjustment(panel);
  }

  function label(t) {
    return { income: 'Income', expense: 'Expense', transfer: 'Transfer', refund: 'Refund', adjustment: 'Adjust' }[t];
  }

  function renderIncome(panel) {
    panel.innerHTML = `
      <form data-form="income">
        <div class="field-row">
          <label>Amount<input required inputmode="decimal" name="amount" placeholder="0.00" autofocus></label>
          <label>Date<input required type="date" name="date" value="${todayISO()}"></label>
        </div>
        <label>Source<input name="payee" list="payee-list" placeholder="e.g. Cash job, gift, tip"></label>
        <datalist id="payee-list">${[...new Set([...frequentPayees(), ...recentPayees()])].map((p) => `<option value="${p}">`).join('')}</datalist>
        ${chipRow([...new Set([...frequentPayees(4), ...recentPayees(4)])])}
        <label>Note<input name="note" placeholder="Optional"></label>
        <label class="checkbox-label"><input type="checkbox" name="override"> Override the split for this deposit only</label>
        <div class="waterfall-preview" data-preview></div>
        <div class="modal-actions">
          <button type="button" class="btn" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Add income</button>
        </div>
      </form>`;
    const form = panel.querySelector('form');
    const amountInput = form.amount;
    const overrideBox = form.override;
    let overrideRows = null; // {essentialAlloc, folderAlloc, unassignedCents} while overriding

    function updatePreview() {
      const cents = parseDollarsToCents(amountInput.value);
      const preview = form.querySelector('[data-preview]');
      if (isNaN(cents) || cents <= 0) {
        preview.innerHTML = '';
        return;
      }
      const result = simulateIncome(cents);
      if (overrideBox.checked) {
        preview.innerHTML = overrideEditorHTML(cents, result);
        wireOverrideEditor(preview);
      } else {
        preview.innerHTML = previewHTML(cents, result);
      }
    }

    function previewHTML(cents, result) {
      const essentialsRows = result.essentialAlloc
        .map((a) => {
          const e = activeEssentials().find((x) => x.id === a.essentialId);
          return `<div class="preview-row"><span>${e?.name || ''}</span><span class="num">+${formatCents(a.amountCents)}</span></div>`;
        })
        .join('');
      const folderRows = result.folderAlloc
        .map((a) => `<div class="preview-row"><span>${accountName('folder', a.folderId)}</span><span class="num">+${formatCents(a.amountCents)}</span></div>`)
        .join('');
      const note = result.remainderAfterEssentials <= 0 && result.folderAlloc.length === 0 && cents > 0
        ? `<p class="preview-note">Essentials still need funding, so folders got nothing from this deposit.</p>` : '';
      const unassignedRow = result.unassignedCents > 0
        ? `<div class="preview-row"><span>Unassigned</span><span class="num">+${formatCents(result.unassignedCents)}</span></div>` : '';
      const log = (result.log || []).map((l) => `<p class="preview-warning">${l}</p>`).join('');
      return `<div class="preview-block"><h4>Essentials</h4>${essentialsRows || '<p class="muted">Nothing needed funding.</p>'}</div>
        <div class="preview-block"><h4>Folders</h4>${folderRows || '<p class="muted">No remainder reached folders.</p>'}${unassignedRow}</div>
        ${note}${log}`;
    }

    function overrideEditorHTML(cents, result) {
      const rows = [
        ...activeEssentials().map((e) => ({ type: 'essential', id: e.id, name: e.name, amount: result.essentialAlloc.find((a) => a.essentialId === e.id)?.amountCents || 0 })),
        ...listAllAccounts().filter((a) => a.type === 'folder').map((f) => ({ type: 'folder', id: f.id, name: f.name, amount: result.folderAlloc.find((a) => a.folderId === f.id)?.amountCents || 0 })),
      ];
      overrideRows = rows;
      return `<p class="muted">Edit this deposit's split. Must total ${formatCents(cents)}.</p>
        ${rows.map((r, i) => `<div class="field-row"><label>${r.name}<input data-override-idx="${i}" inputmode="decimal" value="${(r.amount / 100).toFixed(2)}"></label></div>`).join('')}
        <div class="preview-row" data-override-total><strong>Total</strong><strong class="num" data-override-total-val></strong></div>`;
    }

    function wireOverrideEditor(preview) {
      const inputs = [...preview.querySelectorAll('[data-override-idx]')];
      const totalEl = preview.querySelector('[data-override-total-val]');
      function recalc() {
        const cents = parseDollarsToCents(amountInput.value);
        const sum = inputs.reduce((s, inp) => s + (parseDollarsToCents(inp.value) || 0), 0);
        totalEl.textContent = formatCents(sum) + (sum === cents ? '' : ` (need ${formatCents(cents)})`);
        totalEl.classList.toggle('text-negative', sum !== cents);
      }
      inputs.forEach((inp) => inp.addEventListener('input', recalc));
      recalc();
    }

    amountInput.addEventListener('input', updatePreview);
    overrideBox.addEventListener('change', updatePreview);
    form.querySelector('[data-cancel]').addEventListener('click', () => modalClose());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cents = parseDollarsToCents(amountInput.value);
      if (isNaN(cents) || cents <= 0) return showToast('Enter a valid amount.', { kind: 'error' });
      let overrideResult;
      if (overrideBox.checked && overrideRows) {
        const inputs = [...form.querySelectorAll('[data-override-idx]')];
        const amounts = inputs.map((i) => parseDollarsToCents(i.value) || 0);
        const sum = amounts.reduce((a, b) => a + b, 0);
        if (sum !== cents) return showToast('Override split must total the deposit amount.', { kind: 'error' });
        overrideResult = {
          essentialAlloc: overrideRows.filter((r) => r.type === 'essential').map((r) => ({ essentialId: r.id, amountCents: amounts[overrideRows.indexOf(r)] })).filter((a) => a.amountCents > 0),
          folderAlloc: overrideRows.filter((r) => r.type === 'folder').map((r) => ({ folderId: r.id, amountCents: amounts[overrideRows.indexOf(r)] })).filter((a) => a.amountCents > 0),
          unassignedCents: 0,
          log: ['Manual override applied for this deposit.'],
        };
      }
      await createIncome({ amountCents: cents, dateISO: form.date.value, payee: form.payee.value, note: form.note.value, overrideResult });
      modalClose();
      rerender();
      showToast('Income added.');
    });
    panel.querySelectorAll('[data-fill-payee]').forEach((btn) => btn.addEventListener('click', () => (form.payee.value = btn.textContent)));
  }

  function renderExpense(panel) {
    let splits = [{ acct: listAllAccounts()[0] ? `${listAllAccounts()[0].type}:${listAllAccounts()[0].id}` : '', category: '', amount: '' }];
    function draw() {
      panel.innerHTML = `
        <form data-form="expense">
          <div class="field-row">
            <label>Date<input required type="date" name="date" value="${todayISO()}"></label>
            <label>Payee<input name="payee" list="exp-payee-list"></label>
          </div>
          <datalist id="exp-payee-list">${[...new Set([...frequentPayees(), ...recentPayees()])].map((p) => `<option value="${p}">`).join('')}</datalist>
          ${chipRow([...new Set([...frequentPayees(4), ...recentPayees(4)])])}
          <div data-splits>
            ${splits.map((s, i) => `
              <div class="field-row split-row" data-split="${i}">
                <label>Folder<select data-s-acct>${accountOptions(...(s.acct ? s.acct.split(':') : []))}</select></label>
                <label>Category<input data-s-cat value="${s.category}" list="cat-list"></label>
                <label>Amount<input data-s-amt value="${s.amount}" inputmode="decimal"></label>
                ${splits.length > 1 ? '<button type="button" class="icon-btn" data-remove-split>✕</button>' : ''}
              </div>`).join('')}
          </div>
          <datalist id="cat-list">${knownCategories().map((c) => `<option value="${c}">`).join('')}</datalist>
          <button type="button" class="btn-link" data-add-split>+ Split across another folder</button>
          <div class="preview-row"><strong>Total</strong><strong class="num" data-total>$0.00</strong></div>
          <label>Note<input name="note"></label>
          <label>Tags<input name="tags" placeholder="comma, separated"></label>
          <div class="modal-actions">
            <button type="button" class="btn" data-cancel>Cancel</button>
            <button type="submit" class="btn btn-primary">Add expense</button>
          </div>
        </form>`;
      wire();
    }
    function readSplits() {
      return [...panel.querySelectorAll('.split-row')].map((row) => {
        const [acctType, acctId] = row.querySelector('[data-s-acct]').value.split(':');
        return { acctType, acctId, category: row.querySelector('[data-s-cat]').value, amountCents: parseDollarsToCents(row.querySelector('[data-s-amt]').value) || 0 };
      });
    }
    function updateTotal() {
      const total = readSplits().reduce((s, r) => s + r.amountCents, 0);
      panel.querySelector('[data-total]').textContent = formatCents(total);
    }
    function wire() {
      const form = panel.querySelector('form');
      panel.querySelectorAll('[data-s-amt], [data-s-acct], [data-s-cat]').forEach((inp) => inp.addEventListener('input', updateTotal));
      panel.querySelector('[data-add-split]').addEventListener('click', () => {
        splits = readSplits().map((s) => ({ acct: `${s.acctType}:${s.acctId}`, category: s.category, amount: s.amountCents ? (s.amountCents / 100).toFixed(2) : '' }));
        splits.push({ acct: '', category: '', amount: '' });
        draw();
      });
      panel.querySelectorAll('[data-remove-split]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const idx = Number(btn.closest('.split-row').dataset.split);
          splits = readSplits().map((s) => ({ acct: `${s.acctType}:${s.acctId}`, category: s.category, amount: s.amountCents ? (s.amountCents / 100).toFixed(2) : '' }));
          splits.splice(idx, 1);
          draw();
        })
      );
      form.querySelector('[data-cancel]').addEventListener('click', () => modalClose());
      panel.querySelectorAll('[data-fill-payee]').forEach((btn) => btn.addEventListener('click', () => (form.payee.value = btn.textContent)));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rows = readSplits();
        if (rows.some((r) => !r.acctType || !r.amountCents)) return showToast('Every split needs an account and amount.', { kind: 'error' });
        await createExpense({
          dateISO: form.date.value, splits: rows, payee: form.payee.value, note: form.note.value,
          tags: form.tags.value.split(',').map((t) => t.trim()).filter(Boolean),
        });
        modalClose();
        rerender();
        showToast('Expense added.');
      });
      updateTotal();
    }
    draw();
  }

  function renderTransfer(panel) {
    const accts = listAllAccounts();
    panel.innerHTML = `
      <form data-form="transfer">
        <div class="field-row">
          <label>From<select name="from">${accountOptions(accts[0]?.type, accts[0]?.id)}</select></label>
          <label>To<select name="to">${accountOptions(accts[1]?.type, accts[1]?.id)}</select></label>
        </div>
        <div class="field-row">
          <label>Amount<input required inputmode="decimal" name="amount"></label>
          <label>Date<input required type="date" name="date" value="${todayISO()}"></label>
        </div>
        <label>Reason (required)<input required name="reason" placeholder="e.g. Cover overspend"></label>
        <div class="modal-actions">
          <button type="button" class="btn" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Transfer</button>
        </div>
      </form>`;
    const form = panel.querySelector('form');
    form.querySelector('[data-cancel]').addEventListener('click', () => modalClose());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cents = parseDollarsToCents(form.amount.value);
      if (isNaN(cents) || cents <= 0) return showToast('Enter a valid amount.', { kind: 'error' });
      const [fromType, fromId] = form.from.value.split(':');
      const [toType, toId] = form.to.value.split(':');
      try {
        await createTransfer({ dateISO: form.date.value, from: { type: fromType, id: fromId }, to: { type: toType, id: toId }, amountCents: cents, reason: form.reason.value });
        modalClose();
        rerender();
        showToast('Transfer complete.');
      } catch (err) {
        showToast(err.message, { kind: 'error' });
      }
    });
  }

  function renderRefund(panel) {
    const accts = listAllAccounts();
    panel.innerHTML = `
      <form data-form="refund">
        <div class="field-row">
          <label>Refund to<select name="acct">${accountOptions(accts[0]?.type, accts[0]?.id, { includeUnassigned: false })}</select></label>
          <label>Amount<input required inputmode="decimal" name="amount"></label>
        </div>
        <div class="field-row">
          <label>Category<input name="category" list="cat-list"></label>
          <label>Date<input required type="date" name="date" value="${todayISO()}"></label>
        </div>
        <datalist id="cat-list">${knownCategories().map((c) => `<option value="${c}">`).join('')}</datalist>
        <label>Payee<input name="payee"></label>
        <label>Note<input name="note" placeholder="Returns money to its original folder"></label>
        <div class="modal-actions">
          <button type="button" class="btn" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Add refund</button>
        </div>
      </form>`;
    const form = panel.querySelector('form');
    form.querySelector('[data-cancel]').addEventListener('click', () => modalClose());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cents = parseDollarsToCents(form.amount.value);
      if (isNaN(cents) || cents <= 0) return showToast('Enter a valid amount.', { kind: 'error' });
      const [acctType, acctId] = form.acct.value.split(':');
      await createRefund({ dateISO: form.date.value, acctType, acctId, amountCents: cents, category: form.category.value, payee: form.payee.value, note: form.note.value });
      modalClose();
      rerender();
      showToast('Refund recorded.');
    });
  }

  function renderAdjustment(panel) {
    const accts = listAllAccounts();
    const first = accts[0];
    panel.innerHTML = `
      <form data-form="adjustment">
        <label>Account<select name="acct">${accountOptions(first?.type, first?.id)}</select></label>
        <p class="muted">Current balance: <span class="num" data-current>${formatCents(getBalance(first?.type, first?.id))}</span></p>
        <label>New actual balance<input required inputmode="decimal" name="newBalance"></label>
        <label>Date<input required type="date" name="date" value="${todayISO()}"></label>
        <label>Audit note (required)<input required name="note" placeholder="Why is this being corrected?"></label>
        <div class="modal-actions">
          <button type="button" class="btn" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Reconcile</button>
        </div>
      </form>`;
    const form = panel.querySelector('form');
    form.acct.addEventListener('change', () => {
      const [t, id] = form.acct.value.split(':');
      panel.querySelector('[data-current]').textContent = formatCents(getBalance(t, id));
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => modalClose());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cents = parseDollarsToCents(form.newBalance.value);
      if (isNaN(cents)) return showToast('Enter a valid amount.', { kind: 'error' });
      const [acctType, acctId] = form.acct.value.split(':');
      try {
        await createAdjustment({ dateISO: form.date.value, acctType, acctId, newBalanceCents: cents, note: form.note.value });
        modalClose();
        rerender();
        showToast('Balance reconciled.');
      } catch (err) {
        showToast(err.message, { kind: 'error' });
      }
    });
  }
}
