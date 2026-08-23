import { openDatabase } from './db.js';
import { state, loadState, saveMeta } from './state.js';
import { initRouter, renderCurrentRoute } from './router.js';
import { applyTheme } from './ui/settings.js';
import { openQuickAdd } from './ui/quickadd.js';
import { initChrome } from './ui/chrome.js';
import { initLock, requireInitialUnlock } from './ui/lock.js';
import * as sync from './sync.js';

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

  initLock();
  await requireInitialUnlock();

  wireGlobalUI();
  initRouter();

  if (sync.isConfigured() && sync.isSignedIn()) sync.startAutoSync();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
