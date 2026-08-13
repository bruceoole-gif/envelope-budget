import { state, saveMeta } from '../state.js';
import { STORES, dbGetAll, dbPut } from '../db.js';
import { formatCents, parseDollarsToCents } from '../money.js';
import { todayISO, formatDateHuman } from '../period.js';
import { openModal, confirmModal } from './modal.js';
import { showToast } from './toast.js';
import { rerender } from '../bus.js';
import * as sync from '../sync.js';
import { loadState } from '../state.js';

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportJSON() {
  const data = { version: 1, exportedAt: new Date().toISOString(), stores: {} };
  for (const s of STORES) data.stores[s] = await dbGetAll(s);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `envelope-budget-${todayISO()}.json`);
  await saveMeta({ lastExportAt: new Date().toISOString() });
  rerender();
}

function exportCSV() {
  const rows = [['Date', 'Type', 'Amount', 'Accounts', 'Category', 'Payee', 'Note', 'Tags']];
  for (const t of state.transactions) {
    if (t.voided) continue;
    const accts = [...new Set(t.entries.map((e) => e.acctType + ':' + e.acctId))].join('; ');
    rows.push([t.dateISO, t.type, (t.amountCents / 100).toFixed(2), accts, t.category || '', t.payee || '', t.note || '', (t.tags || []).join(' ')]);
  }
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  triggerDownload(blob, `envelope-budget-transactions-${todayISO()}.csv`);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importJSON(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    showToast('That file is not valid JSON.', { kind: 'error' });
    return;
  }
  if (!data.stores) {
    showToast('Unrecognized backup format.', { kind: 'error' });
    return;
  }
  const ok = await confirmModal({
    title: 'Import backup?',
    body: 'This replaces all local data with the contents of this file. This cannot be undone.',
    confirmLabel: 'Import & replace', danger: true,
  });
  if (!ok) return;
  for (const s of STORES) {
    const records = data.stores[s] || [];
    for (const rec of records) await dbPut(s, { ...rec, dirty: true });
  }
  await loadState();
  rerender();
  showToast('Backup imported.');
}

export function renderSettings(root) {
  const meta = state.meta;
  const s = meta.sync || {};
  root.innerHTML = `
    <div class="page-head"><h1>Settings</h1></div>

    <section class="section">
      <h2>Appearance</h2>
      <label>Theme<select data-theme>
        <option value="system" ${meta.theme === 'system' ? 'selected' : ''}>Match system</option>
        <option value="light" ${meta.theme === 'light' ? 'selected' : ''}>Light</option>
        <option value="dark" ${meta.theme === 'dark' ? 'selected' : ''}>Dark</option>
      </select></label>
      <label class="checkbox-label"><input type="checkbox" data-hide ${meta.hideAmounts ? 'checked' : ''}> Hide amounts (blur figures)</label>
    </section>

    <section class="section">
      <h2>Periods</h2>
      <label>Budget period<select data-period-type>
        <option value="calendar" ${meta.periodType === 'calendar' ? 'selected' : ''}>Calendar month</option>
        <option value="rolling30" ${meta.periodType === 'rolling30' ? 'selected' : ''}>Rolling 30 days</option>
      </select></label>
      <p class="muted">Changing this only affects how future dates are grouped into periods.</p>
    </section>

    <section class="section">
      <h2>Security</h2>
      ${meta.pinHash ? `<button class="btn" data-remove-pin>Remove PIN lock</button>` : `<button class="btn" data-set-pin>Set a PIN lock</button>`}
      <p class="muted">Your data never leaves this device unless you set up sync below, under your own account.</p>
    </section>

    <section class="section">
      <h2>Backup</h2>
      <p class="muted">${meta.lastExportAt ? 'Last exported ' + formatDateHuman(meta.lastExportAt.slice(0, 10)) : 'Never exported.'}</p>
      <div class="btn-group">
        <button class="btn" data-export-json>Export JSON (full backup)</button>
        <button class="btn" data-export-csv>Export CSV (transactions)</button>
        <label class="btn" for="import-file">Import JSON</label>
        <input id="import-file" type="file" accept="application/json" style="display:none">
      </div>
    </section>

    <section class="section">
      <h2>Sync across devices</h2>
      <p class="muted">Optional. Create a free project at supabase.com, run the SQL in <code>supabase/schema.sql</code> from this app's folder in its SQL editor, then paste your Project URL and anon public key below (Settings → API in Supabase).</p>
      <label>Project URL<input data-sync-url value="${s.url || ''}" placeholder="https://xxxx.supabase.co"></label>
      <label>Anon public key<input data-sync-key value="${s.anonKey || ''}" placeholder="eyJ..."></label>
      <button class="btn" data-sync-save>Save connection</button>
      ${s.userId ? `
        <p class="muted">Signed in as ${s.email || s.userId}.</p>
        <div class="btn-group">
          <button class="btn btn-primary" data-sync-now>Sync now</button>
          <button class="btn" data-sign-out>Sign out</button>
        </div>
        <p class="muted" data-sync-status></p>
      ` : `
        <div class="field-row">
          <label>Email<input data-auth-email type="email"></label>
          <label>Password<input data-auth-pass type="password" minlength="6"></label>
        </div>
        <p class="muted small">Password needs at least 6 characters. This account is just for this app — separate from your Supabase login.</p>
        <div class="btn-group">
          <button class="btn" data-sign-in>Sign in</button>
          <button class="btn btn-primary" data-sign-up>Create account</button>
        </div>
        <p class="auth-msg" data-auth-msg hidden></p>
      `}
    </section>

    <section class="section">
      <h2>Setup</h2>
      <button class="btn" data-rerun-onboarding>Re-run setup wizard</button>
    </section>
  `;

  root.querySelector('[data-theme]').addEventListener('change', async (e) => {
    await saveMeta({ theme: e.target.value });
    applyTheme();
  });
  root.querySelector('[data-hide]').addEventListener('change', async (e) => {
    await saveMeta({ hideAmounts: e.target.checked });
    document.body.classList.toggle('hide-amounts', e.target.checked);
  });
  root.querySelector('[data-period-type]').addEventListener('change', async (e) => {
    await saveMeta({ periodType: e.target.value });
    rerender();
  });
  root.querySelector('[data-export-json]').addEventListener('click', exportJSON);
  root.querySelector('[data-export-csv]').addEventListener('click', exportCSV);
  root.querySelector('#import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
  });
  root.querySelector('[data-rerun-onboarding]').addEventListener('click', async () => {
    await saveMeta({ onboardingComplete: false, onboardingStep: 0 });
    location.hash = '#/onboarding';
  });

  const pinBtn = root.querySelector('[data-set-pin]');
  if (pinBtn) pinBtn.addEventListener('click', () => openPinForm());
  const removePinBtn = root.querySelector('[data-remove-pin]');
  if (removePinBtn) removePinBtn.addEventListener('click', async () => { await saveMeta({ pinHash: null }); rerender(); });

  root.querySelector('[data-sync-save]').addEventListener('click', async () => {
    const url = root.querySelector('[data-sync-url]').value;
    const key = root.querySelector('[data-sync-key]').value;
    if (!url || !key) return showToast('Enter both the URL and anon key.', { kind: 'error' });
    await sync.configure(url, key);
    showToast('Connection saved.');
    rerender();
  });
  const authMsgEl = root.querySelector('[data-auth-msg]');
  function setAuthMsg(text, isError) {
    if (!authMsgEl) return;
    authMsgEl.textContent = text;
    authMsgEl.hidden = !text;
    authMsgEl.classList.toggle('text-negative', !!isError);
    authMsgEl.classList.toggle('text-positive', !isError && !!text);
  }
  const signInBtn = root.querySelector('[data-sign-in]');
  if (signInBtn) signInBtn.addEventListener('click', async () => {
    if (!sync.isConfigured()) return setAuthMsg('Save your Supabase connection above first.', true);
    setAuthMsg('Signing in…', false);
    try {
      await sync.signIn(root.querySelector('[data-auth-email]').value, root.querySelector('[data-auth-pass]').value);
      showToast('Signed in.');
      sync.startAutoSync();
      rerender();
    } catch (err) {
      setAuthMsg(err.message, true);
      showToast(err.message, { kind: 'error' });
    }
  });
  const signUpBtn = root.querySelector('[data-sign-up]');
  if (signUpBtn) signUpBtn.addEventListener('click', async () => {
    if (!sync.isConfigured()) return setAuthMsg('Save your Supabase connection above first.', true);
    setAuthMsg('Creating account…', false);
    try {
      const res = await sync.signUp(root.querySelector('[data-auth-email]').value, root.querySelector('[data-auth-pass]').value);
      if (res.needsEmailConfirmation) {
        setAuthMsg('Check your email to confirm the account, then sign in here.', false);
      } else {
        showToast('Account created and signed in.');
        sync.startAutoSync();
        rerender();
      }
    } catch (err) {
      setAuthMsg(err.message, true);
      showToast(err.message, { kind: 'error' });
    }
  });
  const syncNowBtn = root.querySelector('[data-sync-now]');
  if (syncNowBtn) syncNowBtn.addEventListener('click', async () => {
    await sync.syncAll();
    rerender();
  });
  const signOutBtn = root.querySelector('[data-sign-out]');
  if (signOutBtn) signOutBtn.addEventListener('click', async () => { await sync.signOut(); rerender(); });

  const statusEl = root.querySelector('[data-sync-status]');
  if (statusEl) {
    sync.onSyncStatus((st) => {
      statusEl.textContent = st.state === 'error' ? 'Sync error: ' + st.message : st.state === 'syncing' ? 'Syncing…' : st.lastSyncAt ? 'Synced' : '';
    });
  }
}

function openPinForm() {
  openModal(
    `<form data-pin-form>
      <label>Choose a 4+ digit PIN<input required inputmode="numeric" name="pin" minlength="4"></label>
      <div class="modal-actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">Set PIN</button></div>
    </form>`,
    {
      title: 'Set PIN lock',
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const hash = await sha256Hex(e.target.pin.value);
          await saveMeta({ pinHash: hash });
          close();
          rerender();
        });
      },
    }
  );
}

export function applyTheme() {
  const theme = state.meta.theme;
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}
