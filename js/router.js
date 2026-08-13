import { state } from './state.js';
import { setRerender } from './bus.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderTransactions } from './ui/transactions.js';
import { renderFolders } from './ui/folders.js';
import { renderEssentials } from './ui/essentials.js';
import { renderBills } from './ui/bills.js';
import { renderGoals } from './ui/goals.js';
import { renderDebts } from './ui/debts.js';
import { renderReports } from './ui/reports.js';
import { renderSettings } from './ui/settings.js';
import { renderOnboarding } from './ui/onboarding.js';

const routes = [
  { pattern: /^#\/dashboard$/, render: renderDashboard, nav: 'dashboard' },
  { pattern: /^#\/transactions$/, render: renderTransactions, nav: 'transactions' },
  { pattern: /^#\/folders$/, render: renderFolders, nav: 'folders' },
  { pattern: /^#\/folders\/(.+)$/, render: renderFolders, nav: 'folders' },
  { pattern: /^#\/essentials$/, render: renderEssentials, nav: 'essentials' },
  { pattern: /^#\/bills$/, render: renderBills, nav: 'bills' },
  { pattern: /^#\/goals$/, render: renderGoals, nav: 'goals' },
  { pattern: /^#\/debts$/, render: renderDebts, nav: 'debts' },
  { pattern: /^#\/reports$/, render: renderReports, nav: 'reports' },
  { pattern: /^#\/settings$/, render: renderSettings, nav: 'settings' },
  { pattern: /^#\/onboarding$/, render: renderOnboarding, nav: null },
];

const root = () => document.getElementById('view-root');

function currentRoute() {
  const hash = location.hash || '#/dashboard';
  for (const r of routes) {
    const m = hash.match(r.pattern);
    if (m) return { route: r, match: m };
  }
  return { route: routes[0], match: null };
}

function renderNav(activeNav) {
  const navEl = document.getElementById('nav');
  if (!navEl) return;
  navEl.hidden = !state.meta.onboardingComplete;
  navEl.querySelectorAll('[data-nav]').forEach((el) => el.classList.toggle('nav-active', el.dataset.nav === activeNav));
}

export function renderCurrentRoute() {
  if (!state.meta.onboardingComplete && location.hash !== '#/onboarding') {
    location.hash = '#/onboarding';
    return;
  }
  const { route, match } = currentRoute();
  root().scrollTop = 0;
  route.render(root(), match ? { id: match[1] } : undefined);
  renderNav(route.nav);
}

export function initRouter() {
  setRerender(renderCurrentRoute);
  window.addEventListener('hashchange', renderCurrentRoute);
  renderCurrentRoute();
}
