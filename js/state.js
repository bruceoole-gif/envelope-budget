import { dbGetAll, dbPut, newId, STORES } from './db.js';
import { getPeriodId } from './period.js';
import { runWaterfall, allocateEssentials, allocateFolders, validatePercentTotal } from './waterfall.js';

export const state = {
  meta: null,
  essentials: [],
  folders: [],
  transactions: [],
  bills: [],
  debts: [],
  goals: [],
};

let cache = null; // {balances, periodFunded} keyed by "type:id" — invalidated on every mutation
const listeners = new Set();

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((fn) => fn());
}
export function invalidateCache() {
  cache = null;
}

function defaultMeta() {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    id: 'meta',
    theme: 'system',
    periodType: 'calendar',
    rollingAnchor: iso,
    onboardingComplete: false,
    onboardingStep: 0,
    pinHash: null,
    hideAmounts: false,
    lastExportAt: null,
    createdAt: iso,
    sync: { url: '', anonKey: '', accessToken: null, refreshToken: null, userId: null, email: null, lastSyncAt: null, lastCursor: {} },
    navOrder: ['dashboard', 'transactions', 'folders', 'reports', 'essentials', 'bills', 'goals', 'debts'],
    navPrimaryCount: 4,
  };
}

export async function loadState() {
  const [metaArr, essentials, folders, transactions, bills, debts, goals] = await Promise.all(
    STORES.map((s) => dbGetAll(s))
  );
  state.meta = metaArr.find((m) => m.id === 'meta') || defaultMeta();
  if (!state.meta.sync) state.meta.sync = defaultMeta().sync;
  if (!state.meta.navOrder) state.meta.navOrder = defaultMeta().navOrder;
  if (!state.meta.navPrimaryCount) state.meta.navPrimaryCount = defaultMeta().navPrimaryCount;
  state.essentials = essentials;
  state.folders = folders;
  state.transactions = transactions.filter((t) => !t.deleted);
  state.bills = bills.filter((b) => !b.deleted);
  state.debts = debts.filter((d) => !d.deleted);
  state.goals = goals.filter((g) => !g.deleted);
  invalidateCache();
  notify();
}

export async function saveMeta(patch) {
  state.meta = { ...state.meta, ...patch };
  await dbPut('meta', state.meta);
  notify();
}

// Persists meta without marking it dirty for sync (used when applying settings that are purely local, like hideAmounts UI state persisting is fine to sync too actually — kept simple, always syncs).
export async function persistCollection(store) {
  // no-op placeholder for symmetry; individual records are persisted directly via dbPut in actions below
}

function computeCache(excludeTxId = null) {
  const balances = {};
  const periodFunded = {};
  for (const t of state.transactions) {
    if (t.voided || t.id === excludeTxId) continue;
    for (const e of t.entries) {
      const k = `${e.acctType}:${e.acctId}`;
      balances[k] = (balances[k] || 0) + e.deltaCents;
      if (e.acctType === 'essential' && e.isFunding) {
        const pk = `${e.acctId}:${t.periodId}`;
        periodFunded[pk] = (periodFunded[pk] || 0) + e.deltaCents;
      }
    }
  }
  return { balances, periodFunded };
}

export function getCache(excludeTxId = null) {
  if (excludeTxId) return computeCache(excludeTxId);
  if (!cache) cache = computeCache();
  return cache;
}

export function getBalance(acctType, acctId) {
  return getCache().balances[`${acctType}:${acctId}`] || 0;
}

export function getPeriodFunded(essentialId, periodId) {
  return getCache().periodFunded[`${essentialId}:${periodId}`] || 0;
}

export function activeEssentials() {
  return state.essentials.filter((e) => !e.archived).sort((a, b) => a.priority - b.priority);
}
export function activeFolders() {
  return state.folders.filter((f) => !f.archived);
}
export function findEssential(id) {
  return state.essentials.find((e) => e.id === id);
}
export function findFolder(id) {
  return state.folders.find((f) => f.id === id);
}
export function accountName(acctType, acctId) {
  if (acctType === 'unassigned') return 'Unassigned';
  if (acctType === 'essential') return findEssential(acctId)?.name || 'Deleted essential';
  if (acctType === 'folder') return findFolder(acctId)?.name || 'Deleted folder';
  return acctId;
}
export function listAllAccounts() {
  return [
    ...activeEssentials().map((e) => ({ type: 'essential', id: e.id, name: e.name })),
    ...activeFolders().map((f) => ({ type: 'folder', id: f.id, name: f.name })),
    { type: 'unassigned', id: 'unassigned', name: 'Unassigned' },
  ];
}

function buildRuleSnapshot() {
  return {
    essentials: activeEssentials().map((e) => ({ id: e.id, name: e.name, targetCents: e.targetCents, priority: e.priority })),
    folders: activeFolders().map((f) => ({ id: f.id, name: f.name, percent: f.percent, capCents: f.capCents, overflowRule: f.overflowRule, cascadeTargetId: f.cascadeTargetId })),
  };
}

export function currentSnapshotInputs(excludeTxId = null) {
  const snapshot = buildRuleSnapshot();
  const { balances, periodFunded } = getCache(excludeTxId);
  const periodId = getPeriodId(state.meta, new Date().toISOString().slice(0, 10));
  const pf = {};
  snapshot.essentials.forEach((e) => (pf[e.id] = periodFunded[`${e.id}:${periodId}`] || 0));
  const fb = {};
  snapshot.folders.forEach((f) => (fb[f.id] = balances[`folder:${f.id}`] || 0));
  return { snapshot, pf, fb, periodId };
}

// What-if simulator: preview only, never persisted.
export function simulateIncome(amountCents) {
  const { snapshot, pf, fb } = currentSnapshotInputs();
  return runWaterfall(amountCents, snapshot, pf, fb);
}

function entriesFromWaterfall(result) {
  const entries = [];
  result.essentialAlloc.forEach((a) => entries.push({ acctType: 'essential', acctId: a.essentialId, deltaCents: a.amountCents, isFunding: true }));
  result.folderAlloc.forEach((a) => entries.push({ acctType: 'folder', acctId: a.folderId, deltaCents: a.amountCents }));
  if (result.unassignedCents > 0) entries.push({ acctType: 'unassigned', acctId: 'unassigned', deltaCents: result.unassignedCents });
  return entries;
}

async function persistTx(tx) {
  await dbPut('transactions', tx);
  invalidateCache();
  notify();
  return tx;
}

export async function createIncome({ amountCents, dateISO, payee, note, tags, overrideResult }) {
  const periodId = getPeriodId(state.meta, dateISO);
  const snapshot = buildRuleSnapshot();
  const { balances, periodFunded } = getCache();
  const pf = {};
  snapshot.essentials.forEach((e) => (pf[e.id] = periodFunded[`${e.id}:${periodId}`] || 0));
  const fb = {};
  snapshot.folders.forEach((f) => (fb[f.id] = balances[`folder:${f.id}`] || 0));
  const result = overrideResult || runWaterfall(amountCents, snapshot, pf, fb);
  const entries = entriesFromWaterfall(result);
  const tx = {
    id: newId(), type: 'income', dateISO, amountCents, payee: payee || '', category: '',
    tags: tags || [], note: note || '', entries, ruleSnapshot: snapshot, periodId,
    voided: false, waterfallLog: result.log || [], createdAt: Date.now(), editedAt: Date.now(),
  };
  state.transactions.push(tx);
  return persistTx(tx);
}

export async function createExpense({ dateISO, splits, payee, note, tags, type = 'expense' }) {
  const entries = splits.map((s) => ({ acctType: s.acctType, acctId: s.acctId, deltaCents: -Math.abs(s.amountCents), category: s.category || '' }));
  const amountCents = splits.reduce((sum, s) => sum + Math.abs(s.amountCents), 0);
  const tx = {
    id: newId(), type, dateISO, amountCents, payee: payee || '', category: splits[0]?.category || '',
    tags: tags || [], note: note || '', entries, periodId: getPeriodId(state.meta, dateISO),
    voided: false, createdAt: Date.now(), editedAt: Date.now(),
  };
  state.transactions.push(tx);
  return persistTx(tx);
}

export async function createRefund({ dateISO, acctType, acctId, amountCents, category, payee, note, linkedTransactionId }) {
  const entries = [{ acctType, acctId, deltaCents: Math.abs(amountCents), category: category || '' }];
  const tx = {
    id: newId(), type: 'refund', dateISO, amountCents: Math.abs(amountCents), payee: payee || '', category: category || '',
    tags: [], note: note || '', entries, periodId: getPeriodId(state.meta, dateISO), voided: false,
    linkedTransactionId: linkedTransactionId || null, createdAt: Date.now(), editedAt: Date.now(),
  };
  state.transactions.push(tx);
  return persistTx(tx);
}

export async function createTransfer({ dateISO, from, to, amountCents, reason }) {
  if (!reason || !reason.trim()) throw new Error('A reason note is required for transfers.');
  const amt = Math.abs(amountCents);
  const entries = [
    { acctType: from.type, acctId: from.id, deltaCents: -amt },
    { acctType: to.type, acctId: to.id, deltaCents: amt },
  ];
  const tx = {
    id: newId(), type: 'transfer', dateISO, amountCents: amt, payee: '', category: '',
    tags: [], note: reason.trim(), entries, periodId: getPeriodId(state.meta, dateISO),
    voided: false, createdAt: Date.now(), editedAt: Date.now(),
  };
  state.transactions.push(tx);
  return persistTx(tx);
}

export async function createAdjustment({ dateISO, acctType, acctId, newBalanceCents, note }) {
  if (!note || !note.trim()) throw new Error('An audit note is required for balance adjustments.');
  const current = getBalance(acctType, acctId);
  const delta = newBalanceCents - current;
  const tx = {
    id: newId(), type: 'adjustment', dateISO, amountCents: delta, payee: '', category: '',
    tags: [], note: note.trim(), entries: [{ acctType, acctId, deltaCents: delta }],
    periodId: getPeriodId(state.meta, dateISO), voided: false, createdAt: Date.now(), editedAt: Date.now(),
  };
  state.transactions.push(tx);
  return persistTx(tx);
}

export function findTransaction(id) {
  return state.transactions.find((t) => t.id === id);
}

// Preview what an edit would change, without committing. Returns {beforeEntries, afterEntries, applyPatch}.
export function previewEditTransaction(id, patch) {
  const tx = findTransaction(id);
  if (!tx) return null;
  const beforeEntries = tx.entries;
  let afterEntries;
  let extra = {};

  if (tx.type === 'income') {
    const amountCents = patch.amountCents ?? tx.amountCents;
    const dateISO = patch.dateISO ?? tx.dateISO;
    const periodId = getPeriodId(state.meta, dateISO);
    const useSnapshot = patch.reallocate ? buildRuleSnapshot() : tx.ruleSnapshot;
    const { balances, periodFunded } = getCache(id);
    const pf = {};
    useSnapshot.essentials.forEach((e) => (pf[e.id] = periodFunded[`${e.id}:${periodId}`] || 0));
    const fb = {};
    useSnapshot.folders.forEach((f) => (fb[f.id] = balances[`folder:${f.id}`] || 0));
    const result = runWaterfall(amountCents, useSnapshot, pf, fb);
    afterEntries = entriesFromWaterfall(result);
    extra = { amountCents, dateISO, periodId, ruleSnapshot: useSnapshot, waterfallLog: result.log || [] };
  } else if (tx.type === 'transfer') {
    const amountCents = patch.amountCents ?? tx.amountCents;
    const from = patch.from || { type: tx.entries[0].acctType, id: tx.entries[0].acctId };
    const to = patch.to || { type: tx.entries[1].acctType, id: tx.entries[1].acctId };
    afterEntries = [
      { acctType: from.type, acctId: from.id, deltaCents: -amountCents },
      { acctType: to.type, acctId: to.id, deltaCents: amountCents },
    ];
    extra = { amountCents, note: patch.reason ?? tx.note, dateISO: patch.dateISO ?? tx.dateISO };
  } else if (tx.type === 'adjustment') {
    const acctType = patch.acctType ?? tx.entries[0].acctType;
    const acctId = patch.acctId ?? tx.entries[0].acctId;
    const newBalanceCents = patch.newBalanceCents;
    const current = getCache(id).balances[`${acctType}:${acctId}`] || 0;
    const delta = newBalanceCents != null ? newBalanceCents - current : tx.entries[0].deltaCents;
    afterEntries = [{ acctType, acctId, deltaCents: delta }];
    extra = { amountCents: delta, note: patch.note ?? tx.note, dateISO: patch.dateISO ?? tx.dateISO };
  } else {
    // expense / refund: rebuild entries from splits if provided, else just field edits
    if (patch.splits) {
      const sign = tx.type === 'refund' ? 1 : -1;
      afterEntries = patch.splits.map((s) => ({ acctType: s.acctType, acctId: s.acctId, deltaCents: sign * Math.abs(s.amountCents), category: s.category || '' }));
      extra.amountCents = patch.splits.reduce((sum, s) => sum + Math.abs(s.amountCents), 0);
    } else {
      afterEntries = beforeEntries;
    }
    extra = { ...extra, note: patch.note ?? tx.note, payee: patch.payee ?? tx.payee, dateISO: patch.dateISO ?? tx.dateISO, category: patch.category ?? tx.category, tags: patch.tags ?? tx.tags };
  }

  const patchedTx = { ...tx, ...extra, entries: afterEntries, editedAt: Date.now() };
  return { tx, beforeEntries, afterEntries, patchedTx };
}

export async function commitEditTransaction(id, patchedTx) {
  const idx = state.transactions.findIndex((t) => t.id === id);
  if (idx === -1) return;
  state.transactions[idx] = patchedTx;
  return persistTx(patchedTx);
}

export function previewVoid(id) {
  const tx = findTransaction(id);
  if (!tx) return null;
  return { tx, beforeEntries: tx.entries, afterEntries: [] };
}

export async function voidTransaction(id) {
  const tx = findTransaction(id);
  if (!tx) return;
  const updated = { ...tx, voided: true, editedAt: Date.now() };
  return commitEditTransaction(id, updated);
}

// --- Essentials ---
export async function addEssential({ name, targetCents }) {
  const priority = (state.essentials.filter((e) => !e.archived).reduce((max, e) => Math.max(max, e.priority), -1)) + 1;
  const rec = { id: newId(), name, targetCents, priority, archived: false, createdAt: Date.now() };
  state.essentials.push(rec);
  await dbPut('essentials', rec);
  notify();
  return rec;
}
export async function updateEssential(id, patch) {
  const idx = state.essentials.findIndex((e) => e.id === id);
  if (idx === -1) return;
  state.essentials[idx] = { ...state.essentials[idx], ...patch };
  await dbPut('essentials', state.essentials[idx]);
  invalidateCache();
  notify();
}
export async function reorderEssential(id, direction) {
  const list = activeEssentials();
  const idx = list.findIndex((e) => e.id === id);
  const swapIdx = idx + direction;
  if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
  const a = list[idx], b = list[swapIdx];
  const pa = a.priority, pb = b.priority;
  await updateEssential(a.id, { priority: pb });
  await updateEssential(b.id, { priority: pa });
}
export async function archiveEssential(id) {
  await updateEssential(id, { archived: true });
}

// --- Folders ---
export async function addFolder({ name, percent, capCents, overflowRule, cascadeTargetId }) {
  const rec = { id: newId(), name, percent, capCents: capCents ?? null, overflowRule: overflowRule || 'redistribute', cascadeTargetId: cascadeTargetId || null, archived: false, createdAt: Date.now() };
  state.folders.push(rec);
  await dbPut('folders', rec);
  notify();
  return rec;
}
export async function updateFolder(id, patch) {
  const idx = state.folders.findIndex((f) => f.id === id);
  if (idx === -1) return;
  state.folders[idx] = { ...state.folders[idx], ...patch };
  await dbPut('folders', state.folders[idx]);
  invalidateCache();
  notify();
}
export async function deleteFolderWithSweep(id, destination) {
  const bal = getBalance('folder', id);
  if (bal !== 0) {
    if (!destination) throw new Error('Choose a destination for the remaining balance first.');
    await createTransfer({ dateISO: new Date().toISOString().slice(0, 10), from: { type: 'folder', id }, to: destination, amountCents: bal, reason: 'Folder deleted — balance swept' });
  }
  await updateFolder(id, { archived: true, percent: 0 });
}
export function foldersPercentTotal() {
  return validatePercentTotal(activeFolders());
}

// --- Bills ---
export async function addBill(bill) {
  const rec = { id: newId(), active: true, lastPaidDate: null, ...bill, createdAt: Date.now() };
  state.bills.push(rec);
  await dbPut('bills', rec);
  notify();
  return rec;
}
export async function updateBill(id, patch) {
  const idx = state.bills.findIndex((b) => b.id === id);
  if (idx === -1) return;
  state.bills[idx] = { ...state.bills[idx], ...patch };
  await dbPut('bills', state.bills[idx]);
  notify();
}
export async function deleteBill(id) {
  await updateBill(id, { active: false, deleted: true });
  state.bills = state.bills.filter((b) => b.id !== id);
  notify();
}
export async function markBillPaid(id, dateISO) {
  const bill = state.bills.find((b) => b.id === id);
  if (!bill) return;
  await createExpense({
    dateISO, splits: [{ acctType: bill.acctType, acctId: bill.acctId, amountCents: bill.amountCents, category: bill.name }],
    payee: bill.name, note: 'Recurring bill', tags: ['bill'],
  });
  await updateBill(id, { lastPaidDate: dateISO });
}

// --- Debts ---
export async function addDebt(debt) {
  const rec = { id: newId(), payments: [], ...debt, createdAt: Date.now() };
  state.debts.push(rec);
  await dbPut('debts', rec);
  notify();
  return rec;
}
export async function updateDebt(id, patch) {
  const idx = state.debts.findIndex((d) => d.id === id);
  if (idx === -1) return;
  state.debts[idx] = { ...state.debts[idx], ...patch };
  await dbPut('debts', state.debts[idx]);
  notify();
}
export async function deleteDebt(id) {
  state.debts = state.debts.filter((d) => d.id !== id);
  await dbPut('debts', { id, deleted: true });
  notify();
}
export async function logDebtPayment(id, { amountCents, dateISO, fromAccount }) {
  const debt = state.debts.find((d) => d.id === id);
  if (!debt) return;
  if (fromAccount) {
    await createExpense({ dateISO, splits: [{ acctType: fromAccount.type, acctId: fromAccount.id, amountCents, category: 'Debt payment: ' + debt.name }], payee: debt.name, note: 'Debt payment' });
  }
  const payments = [...(debt.payments || []), { dateISO, amountCents }];
  const balanceCents = Math.max(0, debt.balanceCents - amountCents);
  await updateDebt(id, { payments, balanceCents });
}

// --- Goals ---
export async function addGoal(goal) {
  const rec = { id: newId(), ...goal, createdAt: Date.now() };
  state.goals.push(rec);
  await dbPut('goals', rec);
  notify();
  return rec;
}
export async function updateGoal(id, patch) {
  const idx = state.goals.findIndex((g) => g.id === id);
  if (idx === -1) return;
  state.goals[idx] = { ...state.goals[idx], ...patch };
  await dbPut('goals', state.goals[idx]);
  notify();
}
export async function deleteGoal(id) {
  state.goals = state.goals.filter((g) => g.id !== id);
  await dbPut('goals', { id, deleted: true });
  notify();
}

// --- Payees / categories (derived, for one-tap reuse) ---
export function frequentPayees(limit = 6) {
  const counts = {};
  for (const t of state.transactions) {
    if (!t.payee) continue;
    counts[t.payee] = (counts[t.payee] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([p]) => p);
}
export function recentPayees(limit = 6) {
  const seen = new Set();
  const out = [];
  for (const t of state.transactions.slice().sort((a, b) => b.createdAt - a.createdAt)) {
    if (!t.payee || seen.has(t.payee)) continue;
    seen.add(t.payee);
    out.push(t.payee);
    if (out.length >= limit) break;
  }
  return out;
}
export function knownCategories() {
  const set = new Set();
  for (const t of state.transactions) {
    if (t.category) set.add(t.category);
    for (const e of t.entries) if (e.category) set.add(e.category);
  }
  return [...set].sort();
}
