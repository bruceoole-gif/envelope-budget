import { state, addGoal, updateGoal, deleteGoal, getBalance, listAllAccounts, accountName } from '../state.js';
import { formatCents, parseDollarsToCents } from '../money.js';
import { todayISO, daysBetween, getPeriodBounds, currentPeriodId } from '../period.js';
import { openModal, confirmModal } from './modal.js';
import { rerender } from '../bus.js';
import { emptyState } from './dashboard.js';

export function renderGoals(root) {
  const goals = state.goals;
  root.innerHTML = `
    <div class="page-head"><h1>Goals</h1><button class="btn btn-primary" data-new>+ New goal</button></div>
    ${goals.length === 0 ? emptyState('No goals yet.', 'Sinking funds for a target amount by a target date — a trip, a repair, a new laptop.') : `
      <div class="list">
        ${goals.map((g) => {
          const bal = g.folderId ? getBalance('folder', g.folderId) : 0;
          const pct = Math.min(100, (bal / Math.max(1, g.targetCents)) * 100);
          const days = Math.max(1, daysBetween(todayISO(), g.targetDate));
          const { lengthDays } = getPeriodBounds(state.meta, currentPeriodId(state.meta));
          const periodsLeft = Math.max(1, Math.ceil(days / lengthDays));
          const remaining = Math.max(0, g.targetCents - bal);
          const perPeriod = Math.ceil(remaining / periodsLeft);
          return `<div class="list-row goal-row">
            <div class="row-main">
              <span class="row-title">${g.name}</span>
              <span class="row-sub">${formatCents(bal)} of ${formatCents(g.targetCents)} by ${g.targetDate} · need ${formatCents(perPeriod)}/period</span>
              <div class="progress-track"><div class="progress-fill fill-positive" style="width:${pct}%"></div></div>
            </div>
            <div class="btn-group">
              <button class="btn" data-edit="${g.id}">Edit</button>
              <button class="btn btn-danger" data-delete="${g.id}">Delete</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}
  `;
  root.querySelector('[data-new]').addEventListener('click', () => openGoalForm());
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openGoalForm(state.goals.find((g) => g.id === b.dataset.edit))));
  root.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Delete goal?', body: 'This only removes the tracker, not the folder or its money.', confirmLabel: 'Delete', danger: true });
    if (ok) { await deleteGoal(b.dataset.delete); rerender(); }
  }));
}

function openGoalForm(goal = null) {
  const folders = listAllAccounts().filter((a) => a.type === 'folder');
  openModal(
    `<form data-goal-form>
      <label>Name<input required name="name" value="${goal?.name || ''}"></label>
      <label>Tracked folder<select name="folderId">${folders.map((f) => `<option value="${f.id}" ${goal?.folderId === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label>
      <div class="field-row">
        <label>Target amount<input required inputmode="decimal" name="target" value="${goal ? (goal.targetCents / 100).toFixed(2) : ''}"></label>
        <label>Target date<input required type="date" name="date" value="${goal?.targetDate || ''}"></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary">${goal ? 'Save' : 'Add goal'}</button>
      </div>
    </form>`,
    {
      title: goal ? 'Edit goal' : 'New goal',
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const cents = parseDollarsToCents(e.target.target.value);
          const data = { name: e.target.name.value.trim(), folderId: e.target.folderId.value, targetCents: cents, targetDate: e.target.date.value };
          if (goal) await updateGoal(goal.id, data);
          else await addGoal(data);
          close();
          rerender();
        });
      },
    }
  );
}
