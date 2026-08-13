import { state, addBill, updateBill, deleteBill, markBillPaid, listAllAccounts, accountName } from '../state.js';
import { formatCents, parseDollarsToCents } from '../money.js';
import { todayISO } from '../period.js';
import { openModal, confirmModal } from './modal.js';
import { showToast } from './toast.js';
import { rerender } from '../bus.js';
import { emptyState } from './dashboard.js';

function nextDueDate(dueDay) {
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (d < now) d = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
  return d;
}

export function renderBills(root) {
  const bills = state.bills.filter((b) => b.active !== false);
  const upcoming = bills.slice().sort((a, b) => nextDueDate(a.dueDay) - nextDueDate(b.dueDay));
  root.innerHTML = `
    <div class="page-head"><h1>Recurring bills</h1><button class="btn btn-primary" data-new>+ New bill</button></div>
    ${bills.length === 0 ? emptyState('No recurring bills yet.', 'Track due dates for rent, subscriptions, insurance, and more.') : `
      <div class="list">
        ${upcoming.map((b) => {
          const due = nextDueDate(b.dueDay);
          const daysAway = Math.round((due - new Date()) / 86400000);
          return `<div class="list-row">
            <div class="row-main"><span class="row-title">${b.name}</span><span class="row-sub">Due day ${b.dueDay} · in ${daysAway}d · from ${accountName(b.acctType, b.acctId)}</span></div>
            <span class="num row-amount">${formatCents(b.amountCents)}</span>
            <div class="btn-group">
              <button class="btn" data-pay="${b.id}">Mark paid</button>
              <button class="btn" data-edit="${b.id}">Edit</button>
              <button class="btn btn-danger" data-delete="${b.id}">Delete</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}
  `;
  root.querySelector('[data-new]').addEventListener('click', () => openBillForm());
  root.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', async () => { await markBillPaid(b.dataset.pay, todayISO()); rerender(); showToast('Bill marked paid.'); }));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openBillForm(state.bills.find((x) => x.id === b.dataset.edit))));
  root.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Delete bill?', body: 'This only removes the recurring reminder, not past payments.', confirmLabel: 'Delete', danger: true });
    if (ok) { await deleteBill(b.dataset.delete); rerender(); }
  }));
}

function openBillForm(bill = null) {
  const accts = listAllAccounts().filter((a) => a.type !== 'unassigned');
  openModal(
    `<form data-bill-form>
      <label>Name<input required name="name" value="${bill?.name || ''}"></label>
      <div class="field-row">
        <label>Amount<input required inputmode="decimal" name="amount" value="${bill ? (bill.amountCents / 100).toFixed(2) : ''}"></label>
        <label>Due day of month<input required type="number" min="1" max="31" name="dueDay" value="${bill?.dueDay || ''}"></label>
      </div>
      <label>Pay from<select name="acct">${accts.map((a) => `<option value="${a.type}:${a.id}" ${bill?.acctType === a.type && bill?.acctId === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary">${bill ? 'Save' : 'Add bill'}</button>
      </div>
    </form>`,
    {
      title: bill ? 'Edit bill' : 'New bill',
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const cents = parseDollarsToCents(e.target.amount.value);
          const [acctType, acctId] = e.target.acct.value.split(':');
          const data = { name: e.target.name.value.trim(), amountCents: cents, dueDay: Number(e.target.dueDay.value), acctType, acctId };
          if (bill) await updateBill(bill.id, data);
          else await addBill(data);
          close();
          rerender();
        });
      },
    }
  );
}
