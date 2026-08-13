import { openDatabase } from './db.js';
import { state, loadState, saveMeta } from './state.js';
import { initRouter, renderCurrentRoute } from './router.js';
import { applyTheme } from './ui/settings.js';
import { openQuickAdd } from './ui/quickadd.js';
import { initChrome } from './ui/chrome.js';
import * as sync from './sync.js';

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function checkPinLock() {
  if (!state.meta.pinHash) return true;
  if (sessionStorage.getItem('eb_unlocked') === '1') return true;
  return new Promise((resolve) => {
    const overlay = document.getElementById('lock-screen');
    overlay.hidden = false;
    const form = overlay.querySelector('form');
    const errorEl = overlay.querySelector('.lock-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hash = await sha256Hex(form.pin.value);
      if (hash === state.meta.pinHash) {
        sessionStorage.setItem('eb_unlocked', '1');
        overlay.hidden = true;
        resolve(true);
      } else {
        errorEl.textContent = 'Incorrect PIN.';
        form.pin.value = '';
        form.pin.focus();
      }
    });
  });
}

function wireGlobalUI() {
  document.getElementById('fab-add').addEventListener('click', () => openQuickAdd('income'));
  initChrome();

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'n' && !typing && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      openQuickAdd('income');
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      if (location.hash !== '#/transactions') location.hash = '#/transactions';
      setTimeout(() => document.getElementById('tx-search')?.focus(), 50);
    } else if (e.key === 't' && !typing && !e.metaKey && !e.ctrlKey) {
      const order = ['system', 'light', 'dark'];
      const next = order[(order.indexOf(state.meta.theme) + 1) % order.length];
      saveMeta({ theme: next }).then(applyTheme);
    }
  });

  document.body.classList.toggle('hide-amounts', !!state.meta.hideAmounts);
}

async function boot() {
  await openDatabase();
  await loadState();
  applyTheme();

  const unlocked = await checkPinLock();
  if (!unlocked) return;

  wireGlobalUI();
  initRouter();

  if (sync.isConfigured() && sync.isSignedIn()) sync.startAutoSync();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
