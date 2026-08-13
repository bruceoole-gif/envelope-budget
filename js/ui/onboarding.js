import { state, saveMeta, addEssential, addFolder, createIncome, activeEssentials, activeFolders, foldersPercentTotal } from '../state.js';
import { formatCents, parseDollarsToCents } from '../money.js';
import { todayISO } from '../period.js';
import { showToast } from '../ui/toast.js';

export function renderOnboarding(root) {
  const step = state.meta.onboardingStep || 0;
  const steps = [stepWelcome, stepEssentials, stepFolders, stepDone];
  root.innerHTML = `<div class="onboarding-wrap"><div class="onboarding-progress">${steps.map((_, i) => `<span class="dot ${i <= step ? 'dot-active' : ''}"></span>`).join('')}</div><div data-step></div></div>`;
  steps[Math.min(step, steps.length - 1)](root.querySelector('[data-step]'), root);
}

async function goToStep(n, root) {
  await saveMeta({ onboardingStep: n });
  renderOnboarding(root);
}

function skip(root) {
  saveMeta({ onboardingComplete: true, onboardingStep: 0 }).then(() => (location.hash = '#/dashboard'));
}

function stepWelcome(el, root) {
  el.innerHTML = `
    <h1>Welcome</h1>
    <p class="muted">This is an envelope budget for irregular income. Money you enter fills your essentials first, then splits by percentage into folders. Let's set up the basics — it takes a couple minutes, and you can always change it later in Settings.</p>
    <label>Cash on hand right now<input inputmode="decimal" data-cash placeholder="0.00"></label>
    <p class="muted">We'll record this as your starting balance and run it through the waterfall once essentials and folders are set up.</p>
    <div class="modal-actions">
      <button class="btn-link" data-skip>Skip for now</button>
      <button class="btn btn-primary" data-next>Continue</button>
    </div>`;
  el.querySelector('[data-skip]').addEventListener('click', () => skip(root));
  el.querySelector('[data-next]').addEventListener('click', async () => {
    const cents = parseDollarsToCents(el.querySelector('[data-cash]').value);
    await saveMeta({ startingCashCents: isNaN(cents) ? 0 : cents });
    goToStep(1, root);
  });
}

function stepEssentials(el, root) {
  let rows = activeEssentials().length ? activeEssentials().map((e) => ({ name: e.name, target: (e.targetCents / 100).toFixed(2) })) : [{ name: '', target: '' }];
  function draw() {
    el.innerHTML = `
      <h1>Essentials</h1>
      <p class="muted">The bare minimum that must get funded first, in order — rent, utilities, phone, insurance, gas, a grocery floor.</p>
      <div data-rows>
        ${rows.map((r, i) => `<div class="field-row" data-row="${i}">
          <input placeholder="Name" data-name value="${r.name}">
          <input placeholder="Target / period" inputmode="decimal" data-target value="${r.target}">
          ${rows.length > 1 ? `<button type="button" class="icon-btn" data-remove>✕</button>` : ''}
        </div>`).join('')}
      </div>
      <button type="button" class="btn-link" data-add>+ Add essential</button>
      <div class="modal-actions">
        <button class="btn" data-back>Back</button>
        <button class="btn btn-primary" data-next>Continue</button>
      </div>`;
    el.querySelector('[data-add]').addEventListener('click', () => { sync(); rows.push({ name: '', target: '' }); draw(); });
    el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => { sync(); rows.splice(Number(b.closest('[data-row]').dataset.row), 1); draw(); }));
    el.querySelector('[data-back]').addEventListener('click', () => goToStep(0, root));
    el.querySelector('[data-next]').addEventListener('click', async () => {
      sync();
      for (const r of rows) {
        if (!r.name.trim()) continue;
        const cents = parseDollarsToCents(r.target);
        await addEssential({ name: r.name.trim(), targetCents: isNaN(cents) ? 0 : cents });
      }
      goToStep(2, root);
    });
  }
  function sync() {
    rows = [...el.querySelectorAll('[data-row]')].map((row) => ({ name: row.querySelector('[data-name]').value, target: row.querySelector('[data-target]').value }));
  }
  draw();
}

function stepFolders(el, root) {
  let rows = [{ name: 'Savings', percent: '50' }, { name: 'Fun money', percent: '30' }, { name: 'Business', percent: '20' }];
  function draw() {
    const total = rows.reduce((s, r) => s + (parseFloat(r.percent) || 0), 0);
    el.innerHTML = `
      <h1>Folders</h1>
      <p class="muted">Whatever's left after essentials splits by percentage into these. Edit the starter template or start fresh.</p>
      <div data-rows>
        ${rows.map((r, i) => `<div class="field-row" data-row="${i}">
          <input placeholder="Name" data-name value="${r.name}">
          <input placeholder="%" inputmode="decimal" data-percent value="${r.percent}">
          <button type="button" class="icon-btn" data-remove>✕</button>
        </div>`).join('')}
      </div>
      <button type="button" class="btn-link" data-add>+ Add folder</button>
      <p class="${total === 100 ? 'text-positive' : 'text-negative'}">Total: ${total}%${total !== 100 ? ' — should be 100%, but you can adjust this later' : ''}</p>
      <div class="modal-actions">
        <button class="btn" data-back>Back</button>
        <button class="btn btn-primary" data-next>Continue</button>
      </div>`;
    el.querySelector('[data-add]').addEventListener('click', () => { sync(); rows.push({ name: '', percent: '' }); draw(); });
    el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => { sync(); rows.splice(Number(b.closest('[data-row]').dataset.row), 1); draw(); }));
    el.querySelectorAll('[data-name],[data-percent]').forEach((inp) => inp.addEventListener('input', () => {
      sync();
      const t = rows.reduce((s, r) => s + (parseFloat(r.percent) || 0), 0);
      const totalEl = el.querySelector('.modal-actions').previousElementSibling;
      totalEl.textContent = `Total: ${t}%${t !== 100 ? ' — should be 100%, but you can adjust this later' : ''}`;
      totalEl.className = t === 100 ? 'text-positive' : 'text-negative';
    }));
    el.querySelector('[data-back]').addEventListener('click', () => goToStep(1, root));
    el.querySelector('[data-next]').addEventListener('click', async () => {
      sync();
      for (const r of rows) {
        if (!r.name.trim()) continue;
        const p = parseFloat(r.percent);
        await addFolder({ name: r.name.trim(), percent: isNaN(p) ? 0 : p, capCents: null, overflowRule: 'redistribute' });
      }
      goToStep(3, root);
    });
  }
  function sync() {
    rows = [...el.querySelectorAll('[data-row]')].map((row) => ({ name: row.querySelector('[data-name]').value, percent: row.querySelector('[data-percent]').value }));
  }
  draw();
}

async function stepDone(el, root) {
  el.innerHTML = `<h1>All set</h1><p class="muted">Recording your starting balance and running it through the waterfall…</p>`;
  const cash = state.meta.startingCashCents || 0;
  if (cash > 0) {
    await createIncome({ amountCents: cash, dateISO: todayISO(), payee: 'Starting balance', note: 'Onboarding' });
  }
  await saveMeta({ onboardingComplete: true, onboardingStep: 0 });
  el.innerHTML = `<h1>All set</h1><p class="muted">${cash > 0 ? formatCents(cash) + ' allocated across your essentials and folders.' : 'You can add income any time — it will flow through the waterfall automatically.'}</p>
    <div class="modal-actions"><button class="btn btn-primary" data-go>Go to dashboard</button></div>`;
  el.querySelector('[data-go]').addEventListener('click', () => (location.hash = '#/dashboard'));
}
