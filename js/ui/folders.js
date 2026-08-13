import { state, activeFolders, getBalance, addFolder, updateFolder, deleteFolderWithSweep, foldersPercentTotal, listAllAccounts, createTransfer } from '../state.js';
import { formatCents, parseDollarsToCents } from '../money.js';
import { formatDateHuman } from '../period.js';
import { openModal, confirmModal } from './modal.js';
import { showToast } from './toast.js';
import { rerender } from '../bus.js';
import { emptyState } from './dashboard.js';
import { folderHistory, folderBalanceSeries } from '../stats.js';
import { sparkline } from '../charts.js';

export function renderFolders(root, params) {
  if (params?.id) return renderFolderDetail(root, params.id);
  const folders = activeFolders();
  const total = foldersPercentTotal();
  root.innerHTML = `
    <div class="page-head">
      <h1>Folders</h1>
      <button class="btn btn-primary" data-new>+ New folder</button>
    </div>
    <p class="muted">Percentages total <strong class="${total === 100 ? 'text-positive' : 'text-negative'}">${total}%</strong>${total !== 100 ? ' — should be 100%.' : ''}</p>
    ${folders.length === 0 ? emptyState('No folders yet.', 'Folders hold money by percentage after essentials are funded — savings, fun, business, taxes.') : `
      <div class="list">
        ${folders.map((f) => {
          const bal = getBalance('folder', f.id);
          return `<a class="list-row" href="#/folders/${f.id}">
            <div class="row-main"><span class="row-title">${f.name}</span><span class="row-sub">${f.percent}%${f.capCents ? ' · cap ' + formatCents(f.capCents) : ' · uncapped'} · ${f.overflowRule}</span></div>
            <span class="num row-amount ${bal < 0 ? 'text-negative' : ''}">${formatCents(bal)}</span>
          </a>`;
        }).join('')}
      </div>`}
  `;
  root.querySelector('[data-new]').addEventListener('click', () => openFolderForm());
}

function overflowFields(folder, folders) {
  const cascadeOptions = folders.filter((f) => f.id !== folder?.id).map((f) => `<option value="${f.id}" ${folder?.cascadeTargetId === f.id ? 'selected' : ''}>${f.name}</option>`).join('');
  return `
    <label>When this folder hits its cap<select name="overflowRule">
      <option value="redistribute" ${folder?.overflowRule !== 'cascade' ? 'selected' : ''}>Redistribute to other uncapped folders</option>
      <option value="cascade" ${folder?.overflowRule === 'cascade' ? 'selected' : ''}>Cascade to a specific folder</option>
    </select></label>
    <label data-cascade-target style="display:${folder?.overflowRule === 'cascade' ? '' : 'none'}">Cascade target<select name="cascadeTargetId">${cascadeOptions}</select></label>
  `;
}

function openFolderForm(folder = null) {
  const folders = activeFolders();
  const others = folders.filter((f) => f.id !== folder?.id);
  const othersTotal = others.reduce((s, f) => s + f.percent, 0);
  openModal(
    `<form data-folder-form>
      <label>Name<input required name="name" value="${folder?.name || ''}"></label>
      <label>Percent of remainder<input required inputmode="decimal" name="percent" value="${folder?.percent ?? ''}"></label>
      <p class="muted">Other folders total ${othersTotal}%. <span data-drift></span></p>
      <label class="checkbox-label"><input type="checkbox" name="hasCap" ${folder?.capCents != null ? 'checked' : ''}> Set a dollar cap</label>
      <label data-cap-field style="display:${folder?.capCents != null ? '' : 'none'}">Cap<input inputmode="decimal" name="cap" value="${folder?.capCents != null ? (folder.capCents / 100).toFixed(2) : ''}"></label>
      ${overflowFields(folder, folders)}
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary">${folder ? 'Save' : 'Create folder'}</button>
      </div>
    </form>`,
    {
      title: folder ? 'Edit folder' : 'New folder',
      onMount: (el, close) => {
        const form = el.querySelector('form');
        const driftEl = el.querySelector('[data-drift]');
        function updateDrift() {
          const p = parseFloat(form.percent.value) || 0;
          const total = othersTotal + p;
          driftEl.textContent = `This folder + others = ${total}%.`;
          driftEl.className = total === 100 ? 'text-positive' : 'text-negative';
        }
        form.percent.addEventListener('input', updateDrift);
        updateDrift();
        form.hasCap.addEventListener('change', () => (el.querySelector('[data-cap-field]').style.display = form.hasCap.checked ? '' : 'none'));
        form.overflowRule.addEventListener('change', () => (el.querySelector('[data-cascade-target]').style.display = form.overflowRule.value === 'cascade' ? '' : 'none'));
        el.querySelector('[data-cancel]').addEventListener('click', close);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const percent = parseFloat(form.percent.value);
          if (isNaN(percent) || percent <= 0) return showToast('Enter a valid percent.', { kind: 'error' });
          const capCents = form.hasCap.checked ? parseDollarsToCents(form.cap.value) : null;
          const data = {
            name: form.name.value.trim(), percent,
            capCents: form.hasCap.checked && !isNaN(capCents) ? capCents : null,
            overflowRule: form.overflowRule.value,
            cascadeTargetId: form.overflowRule.value === 'cascade' ? form.cascadeTargetId.value : null,
          };
          if (folder) await updateFolder(folder.id, data);
          else await addFolder(data);
          close();
          rerender();
          const total = othersTotal + percent;
          if (total !== 100) showToast(`Folders now total ${total}% — adjust others to keep it at 100%.`, { kind: 'warn', timeout: 7000 });
        });
      },
    }
  );
}

function renderFolderDetail(root, id) {
  const f = state.folders.find((x) => x.id === id);
  if (!f) {
    root.innerHTML = emptyState('Folder not found.', '');
    return;
  }
  const bal = getBalance('folder', id);
  const history = folderHistory(id);
  const series = folderBalanceSeries(id);
  root.innerHTML = `
    <div class="page-head">
      <div><a class="back-link" href="#/folders">← Folders</a><h1>${f.name}</h1></div>
      <div class="btn-group">
        <button class="btn" data-edit>Edit</button>
        <button class="btn btn-danger" data-delete>Delete</button>
      </div>
    </div>
    <p class="figure-xl ${bal < 0 ? 'text-negative' : ''}">${formatCents(bal)}</p>
    <p class="muted">${f.percent}% of remainder${f.capCents ? ' · cap ' + formatCents(f.capCents) : ' · uncapped'} · overflow: ${f.overflowRule}${f.overflowRule === 'cascade' ? ' → ' + (state.folders.find((x) => x.id === f.cascadeTargetId)?.name || '?') : ''}</p>
    ${series.length > 1 ? sparkline(series, { width: 320, height: 60 }) : ''}
    ${bal < 0 ? `<button class="btn btn-warning" data-cover>Cover this from…</button>` : ''}
    <section class="section">
      <h2>History</h2>
      ${history.length === 0 ? emptyState('No activity yet.', '') : `<div class="list">
        ${history.map((r) => `<div class="list-row"><div class="row-main"><span class="row-title">${r.tx.payee || r.tx.type}</span><span class="row-sub">${formatDateHuman(r.tx.dateISO)}</span></div><span class="num ${r.delta < 0 ? 'text-negative' : 'text-positive'}">${r.delta >= 0 ? '+' : ''}${formatCents(r.delta)}</span></div>`).join('')}
      </div>`}
    </section>
  `;
  root.querySelector('[data-edit]').addEventListener('click', () => openFolderForm(f));
  root.querySelector('[data-delete]').addEventListener('click', () => handleDelete(f));
  const coverBtn = root.querySelector('[data-cover]');
  if (coverBtn) coverBtn.addEventListener('click', () => openCoverModal(f, bal));
}

async function handleDelete(f) {
  const bal = getBalance('folder', f.id);
  if (bal !== 0) {
    const others = activeFolders().filter((x) => x.id !== f.id);
    if (others.length === 0) {
      showToast('Move this balance somewhere first — create another folder or sweep to Unassigned.', { kind: 'error' });
      return;
    }
    openModal(
      `<p>This folder holds ${formatCents(bal)}. Choose where it goes before deleting.</p>
       <select data-dest>${listAllAccounts().filter((a) => !(a.type === 'folder' && a.id === f.id)).map((a) => `<option value="${a.type}:${a.id}">${a.name}</option>`).join('')}</select>
       <div class="modal-actions"><button class="btn" data-cancel>Cancel</button><button class="btn btn-danger" data-confirm>Move & delete</button></div>`,
      {
        title: 'Delete folder',
        onMount: (el, close) => {
          el.querySelector('[data-cancel]').addEventListener('click', close);
          el.querySelector('[data-confirm]').addEventListener('click', async () => {
            const [type, id] = el.querySelector('[data-dest]').value.split(':');
            await deleteFolderWithSweep(f.id, { type, id });
            close();
            location.hash = '#/folders';
            rerender();
            showToast('Folder deleted.');
          });
        },
      }
    );
  } else {
    const ok = await confirmModal({ title: 'Delete folder?', body: `Delete "${f.name}"? Its balance is already zero.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await deleteFolderWithSweep(f.id, null);
    location.hash = '#/folders';
    rerender();
  }
}

function openCoverModal(f, bal) {
  const need = Math.abs(bal);
  const sources = listAllAccounts().filter((a) => !(a.type === 'folder' && a.id === f.id));
  openModal(
    `<p>Cover ${formatCents(need)} for "${f.name}" from:</p>
     <select data-src>${sources.map((a) => `<option value="${a.type}:${a.id}">${a.name}</option>`).join('')}</select>
     <label>Amount<input data-amt inputmode="decimal" value="${(need / 100).toFixed(2)}"></label>
     <div class="modal-actions"><button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm>Transfer</button></div>`,
    {
      title: 'Cover overspend',
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('[data-confirm]').addEventListener('click', async () => {
          const [type, id] = el.querySelector('[data-src]').value.split(':');
          const cents = parseDollarsToCents(el.querySelector('[data-amt]').value);
          if (isNaN(cents) || cents <= 0) return showToast('Enter a valid amount.', { kind: 'error' });
          await createTransfer({ dateISO: new Date().toISOString().slice(0, 10), from: { type, id }, to: { type: 'folder', id: f.id }, amountCents: cents, reason: 'Cover overspend' });
          close();
          rerender();
          showToast('Covered.');
        });
      },
    }
  );
}
