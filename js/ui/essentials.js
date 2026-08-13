import { state, activeEssentials, getBalance, addEssential, updateEssential, reorderEssential, archiveEssential, listAllAccounts, createTransfer } from '../state.js';
import { formatCents, parseDollarsToCents } from '../money.js';
import { openModal, confirmModal } from './modal.js';
import { showToast } from './toast.js';
import { rerender } from '../bus.js';
import { emptyState } from './dashboard.js';

export function renderEssentials(root) {
  const essentials = activeEssentials();
  root.innerHTML = `
    <div class="page-head">
      <h1>Essentials <span class="muted">— Tier 1</span></h1>
      <button class="btn btn-primary" data-new>+ New essential</button>
    </div>
    <p class="muted">Funded in this priority order, dollar for dollar, before anything reaches folders. Targets reset each period.</p>
    ${essentials.length === 0 ? emptyState('No essentials yet.', 'Add rent, utilities, phone, insurance, gas, groceries — whatever must get funded first.') : `
      <div class="list">
        ${essentials.map((e, i) => {
          const bal = getBalance('essential', e.id);
          return `<div class="list-row essential-edit-row">
            <div class="reorder-col">
              <button class="icon-btn" data-up="${e.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
              <button class="icon-btn" data-down="${e.id}" ${i === essentials.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            </div>
            <div class="row-main"><span class="row-title">${e.name}</span><span class="row-sub">Target <span class="num">${formatCents(e.targetCents)}</span> per period · balance <span class="num">${formatCents(bal)}</span></span></div>
            <div class="btn-group">
              <button class="btn" data-edit="${e.id}">Edit</button>
              <button class="btn btn-danger" data-delete="${e.id}">Delete</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}
  `;
  root.querySelector('[data-new]').addEventListener('click', () => openEssentialForm());
  root.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', async () => { await reorderEssential(b.dataset.up, -1); rerender(); }));
  root.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', async () => { await reorderEssential(b.dataset.down, 1); rerender(); }));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEssentialForm(state.essentials.find((e) => e.id === b.dataset.edit))));
  root.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => handleDelete(b.dataset.delete)));
}

function openEssentialForm(essential = null) {
  openModal(
    `<form data-essential-form>
      <label>Name<input required name="name" value="${essential?.name || ''}"></label>
      <label>Target per period<input required inputmode="decimal" name="target" value="${essential ? (essential.targetCents / 100).toFixed(2) : ''}"></label>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary">${essential ? 'Save' : 'Add'}</button>
      </div>
    </form>`,
    {
      title: essential ? 'Edit essential' : 'New essential',
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const cents = parseDollarsToCents(e.target.target.value);
          if (isNaN(cents) || cents < 0) return showToast('Enter a valid target amount.', { kind: 'error' });
          const data = { name: e.target.name.value.trim(), targetCents: cents };
          if (essential) await updateEssential(essential.id, data);
          else await addEssential(data);
          close();
          rerender();
        });
      },
    }
  );
}

async function handleDelete(id) {
  const e = state.essentials.find((x) => x.id === id);
  const bal = getBalance('essential', id);
  if (bal !== 0) {
    openModal(
      `<p>"${e.name}" holds <span class="num">${formatCents(bal)}</span>. Choose where it goes before deleting.</p>
       <select data-dest>${listAllAccounts().filter((a) => !(a.type === 'essential' && a.id === id)).map((a) => `<option value="${a.type}:${a.id}">${a.name}</option>`).join('')}</select>
       <div class="modal-actions"><button class="btn" data-cancel>Cancel</button><button class="btn btn-danger" data-confirm>Move & delete</button></div>`,
      {
        title: 'Delete essential',
        onMount: (el, close) => {
          el.querySelector('[data-cancel]').addEventListener('click', close);
          el.querySelector('[data-confirm]').addEventListener('click', async () => {
            const [type, destId] = el.querySelector('[data-dest]').value.split(':');
            await createTransfer({ dateISO: new Date().toISOString().slice(0, 10), from: { type: 'essential', id }, to: { type, id: destId }, amountCents: bal, reason: 'Essential deleted — balance swept' });
            await archiveEssential(id);
            close();
            rerender();
            showToast('Essential deleted.');
          });
        },
      }
    );
  } else {
    const ok = await confirmModal({ title: 'Delete essential?', body: `Delete "${e.name}"?`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await archiveEssential(id);
    rerender();
  }
}
