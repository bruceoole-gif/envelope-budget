// Persistent app chrome that lives outside the router's view-root: the nav bar itself (built
// dynamically from the user's chosen order/count so it can be customized), the profile
// button/menu (top right), and the "More" sheet for whatever doesn't fit in the main bar.

import { state, saveMeta, onChange } from '../state.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import * as sync from '../sync.js';
import { applyTheme } from './settings.js';
import { currentNavKey } from '../router.js';

export const ALL_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '▢', hash: '#/dashboard' },
  { id: 'transactions', label: 'Transactions', icon: '≡', hash: '#/transactions' },
  { id: 'folders', label: 'Folders', icon: '▤', hash: '#/folders' },
  { id: 'reports', label: 'Reports', icon: '▲', hash: '#/reports' },
  { id: 'essentials', label: 'Essentials', icon: '✓', hash: '#/essentials' },
  { id: 'bills', label: 'Bills', icon: '◷', hash: '#/bills' },
  { id: 'goals', label: 'Goals', icon: '◎', hash: '#/goals' },
  { id: 'debts', label: 'Debts', icon: '−', hash: '#/debts' },
];

function itemById(id) {
  return ALL_NAV_ITEMS.find((i) => i.id === id);
}

function navOrder() {
  const order = state.meta.navOrder || ALL_NAV_ITEMS.map((i) => i.id);
  // Tolerate items that don't exist (renamed/removed) and include any new ones not yet in the saved order.
  const known = order.filter((id) => itemById(id));
  const missing = ALL_NAV_ITEMS.map((i) => i.id).filter((id) => !known.includes(id));
  return [...known, ...missing];
}

let lastNavKey = null;

export function initChrome() {
  renderProfileButton();
  renderNavBar();
  document.getElementById('profile-btn').addEventListener('click', openProfilePanel);
  onChange(() => {
    renderProfileButton();
    renderNavBar();
  });
}

function renderProfileButton() {
  const btn = document.getElementById('profile-btn');
  const email = state.meta?.sync?.email;
  if (email) {
    btn.textContent = email[0].toUpperCase();
    btn.classList.add('profile-btn-signed-in');
  } else {
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    btn.classList.remove('profile-btn-signed-in');
  }
}

function renderNavBar() {
  const order = navOrder();
  const primaryCount = state.meta.navPrimaryCount || 4;
  const key = JSON.stringify([order, primaryCount]);
  if (key === lastNavKey) {
    applyActiveNav();
    return;
  }
  lastNavKey = key;

  const primary = order.slice(0, primaryCount).map(itemById);
  const overflow = order.slice(primaryCount).map(itemById);

  const navEl = document.getElementById('nav');
  navEl.innerHTML = `
    ${primary.map((i) => `<a href="${i.hash}" data-nav="${i.id}" class="nav-item"><span class="nav-icon" aria-hidden="true">${i.icon}</span>${i.label}</a>`).join('')}
    ${overflow.length ? `<button type="button" id="more-btn" data-nav="more" class="nav-item"><span class="nav-icon" aria-hidden="true">⋯</span>More</button>` : ''}
  `;
  navEl.querySelectorAll('a[data-nav]').forEach((el) => el.addEventListener('click', () => (location.hash = el.getAttribute('href'))));
  const moreBtn = document.getElementById('more-btn');
  if (moreBtn) moreBtn.addEventListener('click', () => openMorePanel(overflow));

  applyActiveNav();
}

function applyActiveNav() {
  const active = currentNavKey();
  const navEl = document.getElementById('nav');
  navEl.hidden = !state.meta.onboardingComplete;
  navEl.querySelectorAll('[data-nav]').forEach((el) => el.classList.toggle('nav-active', el.dataset.nav === active));
  document.getElementById('profile-btn')?.classList.toggle('profile-btn-active', location.hash === '#/settings');
}

// Called by the router after every navigation (structure doesn't need rebuilding, just the
// active highlight — rebuilding only happens when the user's chosen order/count actually changes).
export function refreshNavActiveState() {
  applyActiveNav();
}

function openMorePanel(overflowItems) {
  const items = overflowItems || navOrder().slice(state.meta.navPrimaryCount || 4).map(itemById);
  openModal(
    `<div class="sheet-list">
      ${items.map((i) => `<button type="button" class="sheet-row" data-go="${i.hash}">
        <span class="nav-icon" aria-hidden="true">${i.icon}</span>
        <span class="row-main"><span class="row-title">${i.label}</span></span>
      </button>`).join('')}
      <button type="button" class="sheet-row" data-customize>
        <span class="nav-icon" aria-hidden="true">⇅</span>
        <span class="row-main"><span class="row-title">Customize navigation…</span><span class="row-sub">Choose what's in the bar and reorder it</span></span>
      </button>
    </div>`,
    {
      title: 'More',
      onMount: (el, close) => {
        el.querySelectorAll('[data-go]').forEach((btn) =>
          btn.addEventListener('click', () => {
            location.hash = btn.dataset.go;
            close();
          })
        );
        el.querySelector('[data-customize]').addEventListener('click', () => {
          close();
          openCustomizeNav();
        });
      },
    }
  );
}

function openProfilePanel() {
  const s = state.meta.sync || {};
  const signedIn = !!s.userId;
  openModal(
    `<div class="sheet-list">
      <p class="muted">${signedIn ? `Signed in as <strong>${s.email}</strong>` : 'Not signed in — set up sync in Settings to use this app on more than one device.'}</p>
      <button type="button" class="sheet-row" data-go="#/settings">
        <span class="nav-icon" aria-hidden="true">⚙</span>
        <span class="row-main"><span class="row-title">Settings</span><span class="row-sub">Sync, backup, PIN, theme, periods</span></span>
      </button>
      <button type="button" class="sheet-row" data-customize-nav>
        <span class="nav-icon" aria-hidden="true">⇅</span>
        <span class="row-main"><span class="row-title">Customize navigation</span><span class="row-sub">Choose what's in the bottom bar and reorder it</span></span>
      </button>
      <button type="button" class="sheet-row" data-theme-cycle>
        <span class="nav-icon" aria-hidden="true">◐</span>
        <span class="row-main"><span class="row-title">Theme</span><span class="row-sub">Currently: ${state.meta.theme}</span></span>
      </button>
      <button type="button" class="sheet-row" data-hide-toggle>
        <span class="nav-icon" aria-hidden="true">👁</span>
        <span class="row-main"><span class="row-title">Hide amounts</span><span class="row-sub">${state.meta.hideAmounts ? 'On' : 'Off'}</span></span>
      </button>
      ${signedIn ? `<button type="button" class="sheet-row" data-sign-out>
        <span class="nav-icon" aria-hidden="true">⇥</span>
        <span class="row-main"><span class="row-title">Sign out</span></span>
      </button>` : ''}
    </div>`,
    {
      title: 'Account',
      onMount: (el, close) => {
        el.querySelector('[data-go]').addEventListener('click', (e) => {
          location.hash = e.currentTarget.dataset.go;
          close();
        });
        el.querySelector('[data-customize-nav]').addEventListener('click', () => {
          close();
          openCustomizeNav();
        });
        el.querySelector('[data-theme-cycle]').addEventListener('click', async () => {
          const order = ['system', 'light', 'dark'];
          const next = order[(order.indexOf(state.meta.theme) + 1) % order.length];
          await saveMeta({ theme: next });
          applyTheme();
          close();
          openProfilePanel();
        });
        el.querySelector('[data-hide-toggle]').addEventListener('click', async () => {
          await saveMeta({ hideAmounts: !state.meta.hideAmounts });
          document.body.classList.toggle('hide-amounts', state.meta.hideAmounts);
          close();
          openProfilePanel();
        });
        const signOutBtn = el.querySelector('[data-sign-out]');
        if (signOutBtn) signOutBtn.addEventListener('click', async () => {
          await sync.signOut();
          close();
          showToast('Signed out.');
        });
      },
    }
  );
}

function openCustomizeNav() {
  let order = navOrder();
  let primaryCount = state.meta.navPrimaryCount || 4;

  function draw(el) {
    el.innerHTML = `
      <p class="muted small">The first ${primaryCount} show in the main bar. Everything below the line lives under "More". Reorder with the arrows.</p>
      <label>Items in the main bar<select data-primary-count>
        ${[3, 4, 5].map((n) => `<option value="${n}" ${n === primaryCount ? 'selected' : ''}>${n}</option>`).join('')}
      </select></label>
      <div class="reorder-list">
        ${order.map((id, i) => {
          const item = itemById(id);
          return `<div class="reorder-row ${i === primaryCount ? 'reorder-divider' : ''}" data-row="${id}">
            <span class="nav-icon" aria-hidden="true">${item.icon}</span>
            <span class="row-main"><span class="row-title">${item.label}</span></span>
            <div class="reorder-col">
              <button class="icon-btn" data-up="${id}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
              <button class="icon-btn" data-down="${id}" ${i === order.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-primary" data-done>Done</button></div>
    `;
    el.querySelector('[data-primary-count]').addEventListener('change', (e) => {
      primaryCount = Number(e.target.value);
      persist();
      draw(el);
    });
    el.querySelectorAll('[data-up]').forEach((btn) => btn.addEventListener('click', () => {
      const idx = order.indexOf(btn.dataset.up);
      if (idx > 0) { [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]]; persist(); draw(el); }
    }));
    el.querySelectorAll('[data-down]').forEach((btn) => btn.addEventListener('click', () => {
      const idx = order.indexOf(btn.dataset.down);
      if (idx < order.length - 1) { [order[idx + 1], order[idx]] = [order[idx], order[idx + 1]]; persist(); draw(el); }
    }));
  }

  function persist() {
    saveMeta({ navOrder: order, navPrimaryCount: primaryCount });
  }

  openModal('', {
    title: 'Customize navigation',
    onMount: (el, close) => {
      draw(el);
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-done]')) close();
      });
    },
  });
}
