// The allocation waterfall. Pure functions — take explicit rule snapshots, never read global
// state — so a past income transaction can always be re-evaluated against the rules that were
// actually in effect when it landed (percentages/caps changed later must never retroactively
// re-allocate old deposits).

import { splitCentsByWeights } from './money.js';

// essentials: [{id,name,targetCents,priority}], periodFunded: {essentialId: centsAlreadyFundedThisPeriod}
export function allocateEssentials(incomeCents, essentials, periodFunded) {
  const sorted = essentials.slice().sort((a, b) => a.priority - b.priority);
  let remaining = incomeCents;
  const alloc = [];
  for (const e of sorted) {
    if (remaining <= 0) break;
    const funded = periodFunded[e.id] || 0;
    const need = Math.max(0, e.targetCents - funded);
    const give = Math.min(need, remaining);
    if (give > 0) {
      alloc.push({ essentialId: e.id, amountCents: give });
      remaining -= give;
    }
  }
  return { alloc, remaining };
}

// folders: [{id,name,percent,capCents,overflowRule,cascadeTargetId}], folderBalances: {folderId: currentCents}
export function allocateFolders(remainingCents, folders, folderBalances) {
  const log = [];
  if (folders.length === 0 || remainingCents <= 0) {
    return { alloc: [], unassignedCents: Math.max(0, remainingCents), log };
  }

  const capRemaining = {};
  folders.forEach((f) => {
    capRemaining[f.id] = f.capCents == null ? Infinity : Math.max(0, f.capCents - (folderBalances[f.id] || 0));
  });
  const totalAlloc = {};
  folders.forEach((f) => (totalAlloc[f.id] = 0));

  const weights = folders.map((f) => f.percent);
  const initialSplit = splitCentsByWeights(remainingCents, weights);
  let pool = folders.map((f, i) => ({ id: f.id, amount: initialSplit[i] }));
  const cascadedFrom = new Set();
  let unassignedCents = 0;
  let iterations = 0;

  while (pool.length && iterations < 500) {
    iterations++;
    const next = [];
    for (const p of pool) {
      if (p.amount <= 0) continue;
      const f = folders.find((x) => x.id === p.id);
      const room = capRemaining[p.id];
      const give = Math.min(p.amount, room);
      if (give > 0) {
        totalAlloc[p.id] += give;
        capRemaining[p.id] -= give;
      }
      const overflow = p.amount - give;
      if (overflow <= 0) continue;

      if (f.overflowRule === 'cascade' && f.cascadeTargetId) {
        if (cascadedFrom.has(p.id)) {
          unassignedCents += overflow;
          log.push(`Cascade loop detected at "${f.name}" — sent to Unassigned instead.`);
          continue;
        }
        cascadedFrom.add(p.id);
        next.push({ id: f.cascadeTargetId, amount: overflow });
      } else {
        const targets = folders.filter((o) => o.id !== p.id && capRemaining[o.id] > 0);
        const totalW = targets.reduce((s, o) => s + o.percent, 0);
        if (targets.length === 0 || totalW <= 0) {
          unassignedCents += overflow;
          continue;
        }
        const splits = splitCentsByWeights(overflow, targets.map((o) => o.percent));
        targets.forEach((o, i) => {
          if (splits[i] > 0) next.push({ id: o.id, amount: splits[i] });
        });
      }
    }
    pool = next;
  }
  if (iterations >= 500) {
    pool.forEach((p) => (unassignedCents += p.amount));
    log.push('Allocation safety limit reached — remainder sent to Unassigned.');
  }

  const alloc = folders
    .filter((f) => totalAlloc[f.id] > 0)
    .map((f) => ({ folderId: f.id, amountCents: totalAlloc[f.id] }));
  return { alloc, unassignedCents, log };
}

// Full waterfall for one income event, given an explicit rule snapshot.
export function runWaterfall(incomeCents, snapshot, periodFunded, folderBalances) {
  const { alloc: essentialAlloc, remaining } = allocateEssentials(incomeCents, snapshot.essentials, periodFunded);
  const { alloc: folderAlloc, unassignedCents, log } = allocateFolders(remaining, snapshot.folders, folderBalances);
  return {
    essentialAlloc,
    folderAlloc,
    unassignedCents,
    log,
    essentialsFullyFunded: remaining > 0 || snapshot.essentials.every((e) => (periodFunded[e.id] || 0) + (essentialAlloc.find((a) => a.essentialId === e.id)?.amountCents || 0) >= e.targetCents),
    remainderAfterEssentials: remaining,
  };
}

export function validatePercentTotal(folders) {
  const total = folders.reduce((s, f) => s + (Number(f.percent) || 0), 0);
  return Math.round(total * 100) / 100;
}
