// Persistent app chrome that lives outside the router's view-root: the profile button/menu
// (top right) and the "More" sheet (the 5th bottom-nav slot for the less-frequent screens).

import { state, saveMeta, onChange } from '../state.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import * as sync from '../sync.js';
import { applyTheme } from './settings.js';

const MORE_ITEMS = [
  { hash: '#/essentials', icon: '✓', label: 'Essentials', desc: 'Tier 1 must-fund list' },
  { hash: '#/bills', icon: '◷', label: 'Bills', desc: 'Recurring, with due dates' },
  { hash: '#/goals', icon: '◎', label: 'Goals', desc: 'Sinking funds & targets' },
  { hash: '#/debts', icon: '−', label: 'Debts', desc: 'Balances & payoff projection' },
];

export function initChrome() {
  renderProfileButton();
  onChange(renderProfileButton);

  document.getElementById('more-btn').addEventListener('click', openMorePanel);
  document.getElementById('profile-btn').addEventListener('click', openProfilePanel);
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

function openMorePanel() {
  openModal(
    `<div class="sheet-list">
      ${MORE_ITEMS.map((i) => `<button type="button" class="sheet-row" data-go="${i.hash}">
        <span class="nav-icon" aria-hidden="true">${i.icon}</span>
        <span class="row-main"><span class="row-title">${i.label}</span><span class="row-sub">${i.desc}</span></span>
      </button>`).join('')}
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
