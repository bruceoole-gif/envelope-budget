import { state, addDebt, updateDebt, deleteDebt, logDebtPayment, listAllAccounts } from '../state.js';
import { formatCents, parseDollarsToCents } from '../money.js';
import { todayISO, addDays, formatDateHuman } from '../period.js';
import { openModal, confirmModal } from './modal.js';
import { showToast } from './toast.js';
import { rerender } from '../bus.js';
import { emptyState } from './dashboard.js';

function projectPayoff(balanceCents, aprPercent, minPaymentCents) {
  const monthlyRate = aprPercent / 100 / 12;
  if (minPaymentCents <= balanceCents * monthlyRate) return { neverPaysOff: true };
  let bal = balanceCents;
  let months = 0;
  while (bal > 0 && months < 600) {
    bal += bal * monthlyRate;
    bal -= minPaymentCents;
    months++;
  }
  return { neverPaysOff: false, months };
}

export function renderDebts(root) {
  const debts = state.debts;
  root.innerHTML = `
    <div class="page-head"><h1>Debts</h1><button class="btn btn-primary" data-new>+ New debt</button></div>
    ${debts.length === 0 ? emptyState('No debts tracked.', 'Add a balance, APR, and minimum payment to see a payoff projection.') : `
      <div class="list">
        ${debts.map((d) => {
          const proj = projectPayoff(d.balanceCents, d.aprPercent, d.minPaymentCents);
          return `<div class="list-row debt-row">
            <div class="row-main">
              <span class="row-title">${d.name}</span>
              <span class="row-sub">${d.aprPercent}% APR · min ${formatCents(d.minPaymentCents)}</span>
              <span class="row-sub ${proj.neverPaysOff ? 'text-negative' : ''}">${proj.neverPaysOff ? 'At this minimum, the balance will not shrink — increase your payment.' : `Paid off in ~${proj.months} months (${formatDateHuman(addDays(todayISO(), proj.months * 30))})`}</span>
            </div>
            <span class="num row-amount text-negative">${formatCents(d.balanceCents)}</span>
            <div class="btn-group">
              <button class="btn" data-pay="${d.id}">Log payment</button>
              <button class="btn" data-edit="${d.id}">Edit</button>
              <button class="btn btn-danger" data-delete="${d.id}">Delete</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}
  `;
  root.querySelector('[data-new]').addEventListener('click', () => openDebtForm());
  root.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => openPaymentForm(state.debts.find((d) => d.id === b.dataset.pay))));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openDebtForm(state.debts.find((d) => d.id === b.dataset.edit))));
  root.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Delete debt?', body: 'This removes the tracker and its payment history.', confirmLabel: 'Delete', danger: true });
    if (ok) { await deleteDebt(b.dataset.delete); rerender(); }
  }));
}

function openDebtForm(debt = null) {
  openModal(
    `<form data-debt-form>
      <label>Name<input required name="name" value="${debt?.name || ''}"></label>
      <div class="field-row">
        <label>Balance<input required inputmode="decimal" name="balance" value="${debt ? (debt.balanceCents / 100).toFixed(2) : ''}"></label>
        <label>APR %<input required inputmode="decimal" name="apr" value="${debt?.aprPercent ?? ''}"></label>
      </div>
      <label>Minimum payment<input required inputmode="decimal" name="min" value="${debt ? (debt.minPaymentCents / 100).toFixed(2) : ''}"></label>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary">${debt ? 'Save' : 'Add debt'}</button>
      </div>
    </form>`,
    {
      title: debt ? 'Edit debt' : 'New debt',
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const data = {
            name: e.target.name.value.trim(),
            balanceCents: parseDollarsToCents(e.target.balance.value),
            aprPercent: parseFloat(e.target.apr.value),
            minPaymentCents: parseDollarsToCents(e.target.min.value),
          };
          if (debt) await updateDebt(debt.id, data);
          else await addDebt(data);
          close();
          rerender();
        });
      },
    }
  );
}

function openPaymentForm(debt) {
  const accts = listAllAccounts();
  openModal(
    `<form data-payment-form>
      <label>Amount<input required inputmode="decimal" name="amount" value="${(debt.minPaymentCents / 100).toFixed(2)}"></label>
      <label>Date<input required type="date" name="date" value="${todayISO()}"></label>
      <label>Pay from (optional — also records an expense)<select name="acct"><option value="">Don't record an expense</option>${accts.map((a) => `<option value="${a.type}:${a.id}">${a.name}</option>`).join('')}</select></label>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary">Log payment</button>
      </div>
    </form>`,
    {
      title: `Log payment — ${debt.name}`,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const cents = parseDollarsToCents(e.target.amount.value);
          if (isNaN(cents) || cents <= 0) return showToast('Enter a valid amount.', { kind: 'error' });
          let fromAccount = null;
          if (e.target.acct.value) {
            const [type, id] = e.target.acct.value.split(':');
            fromAccount = { type, id };
          }
          await logDebtPayment(debt.id, { amountCents: cents, dateISO: e.target.date.value, fromAccount });
          close();
          rerender();
          showToast('Payment logged.');
        });
      },
    }
  );
}
