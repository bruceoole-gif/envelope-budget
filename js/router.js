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
import { refreshNavActiveState } from './ui/chrome.js';

const routes = [
  { pattern: /^#\/dashboard$/, render: renderDashboard, nav: 'dashboard' },
  { pattern: /^#\/transactions$/, render: renderTransactions, nav: 'transactions' },
  { pattern: /^#\/folders$/, render: renderFolders, nav: 'folders' },
  { pattern: /^#\/folders\/(.+)$/, render: renderFolders, nav: 'folders' },
  { pattern: /^#\/essentials$/, render: renderEssentials, nav: 'more' },
  { pattern: /^#\/bills$/, render: renderBills, nav: 'more' },
  { pattern: /^#\/goals$/, render: renderGoals, nav: 'more' },
  { pattern: /^#\/debts$/, render: renderDebts, nav: 'more' },
  { pattern: /^#\/reports$/, render: renderReports, nav: 'reports' },
  { pattern: /^#\/settings$/, render: renderSettings, nav: null },
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

export function currentNavKey() {
  return currentRoute().route.nav;
}

export function renderCurrentRoute() {
  if (!state.meta.onboardingComplete && location.hash !== '#/onboarding') {
    location.hash = '#/onboarding';
    return;
  }
  const { route, match } = currentRoute();
  root().scrollTop = 0;
  route.render(root(), match ? { id: match[1] } : undefined);
  refreshNavActiveState();
}

export function initRouter() {
  setRerender(renderCurrentRoute);
  window.addEventListener('hashchange', renderCurrentRoute);
  renderCurrentRoute();
}
