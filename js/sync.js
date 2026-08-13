// Optional sync to a Supabase project the user owns and configures themselves. The app never
// ships any credentials — nothing syncs until the user pastes their own project URL + anon key
// into Settings and signs in. Everything keeps working fully offline either way; IndexedDB stays
// the source of truth and this layer just reconciles it with Postgres via plain REST (PostgREST +
// GoTrue), last-write-wins by updatedAt. No SDK, no CDN dependency.

import { state, saveMeta, loadState } from './state.js';
import { dbGetAll, dbPutFromRemote, dbClearDirty } from './db.js';

const SYNCED_STORES = ['meta', 'essentials', 'folders', 'transactions', 'bills', 'debts', 'goals'];

let syncing = false;
let statusListeners = new Set();
let status = { state: 'idle', message: '', lastSyncAt: null }; // idle | syncing | error | offline | unconfigured

export function onSyncStatus(fn) {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}
function setStatus(patch) {
  status = { ...status, ...patch };
  statusListeners.forEach((fn) => fn(status));
}

function cfg() {
  return state.meta.sync || {};
}
export function isConfigured() {
  const c = cfg();
  return !!(c.url && c.anonKey);
}
export function isSignedIn() {
  return !!cfg().accessToken;
}

export async function configure(url, anonKey) {
  const clean = url.trim().replace(/\/$/, '');
  await saveMeta({ sync: { ...cfg(), url: clean, anonKey: anonKey.trim() } });
}

function restBase() {
  return cfg().url + '/rest/v1';
}
function authBase() {
  return cfg().url + '/auth/v1';
}

async function rawAuthCall(path, body) {
  const res = await fetch(authBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg().anonKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.msg || json.error || `Auth request failed (${res.status})`);
  return json;
}

async function storeSession(json) {
  await saveMeta({
    sync: {
      ...cfg(),
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
      userId: json.user?.id || cfg().userId,
      email: json.user?.email || cfg().email,
    },
  });
}

export async function signUp(email, password) {
  const json = await rawAuthCall('/signup', { email, password });
  if (json.access_token) {
    await storeSession(json);
    return { needsEmailConfirmation: false };
  }
  return { needsEmailConfirmation: true };
}

export async function signIn(email, password) {
  const json = await rawAuthCall('/token?grant_type=password', { email, password });
  await storeSession(json);
}

export async function signOut() {
  await saveMeta({ sync: { ...cfg(), accessToken: null, refreshToken: null, expiresAt: null, userId: null } });
  setStatus({ state: 'idle', message: 'Signed out' });
}

async function ensureFreshToken() {
  const c = cfg();
  if (!c.accessToken) return;
  if (c.expiresAt && c.expiresAt - Date.now() < 60000 && c.refreshToken) {
    try {
      const json = await rawAuthCall('/token?grant_type=refresh_token', { refresh_token: c.refreshToken });
      await storeSession(json);
    } catch {
      await saveMeta({ sync: { ...cfg(), accessToken: null } });
    }
  }
}

async function api(path, opts = {}) {
  const c = cfg();
  const res = await fetch(restBase() + path, {
    ...opts,
    headers: {
      apikey: c.anonKey,
      Authorization: 'Bearer ' + c.accessToken,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sync request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return [];
  return res.json();
}

function toRemoteRow(userId, record) {
  const { id, updatedAt, dirty, deleted, ...rest } = record;
  return { id, user_id: userId, data: rest, updated_at: updatedAt, deleted: !!deleted };
}
function fromRemoteRow(row) {
  return { id: row.id, ...row.data, updatedAt: row.updated_at, deleted: row.deleted };
}

async function pushStore(store) {
  const all = await dbGetAll(store);
  const dirty = all.filter((r) => r.dirty);
  if (dirty.length === 0) return;
  const c = cfg();
  const rows = dirty.map((r) => toRemoteRow(c.userId, r));
  await api(`/${store}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  for (const r of dirty) await dbClearDirty(store, r.id);
}

async function pullStore(store) {
  const cursor = cfg().lastCursor?.[store] || 0;
  let from = cursor;
  let maxSeen = cursor;
  for (let page = 0; page < 50; page++) {
    const rows = await api(`/${store}?updated_at=gt.${from}&order=updated_at.asc&limit=500`, { method: 'GET' });
    if (!rows.length) break;
    const local = await dbGetAll(store);
    for (const row of rows) {
      const rec = fromRemoteRow(row);
      const existing = local.find((r) => r.id === rec.id);
      if (!existing || !existing.dirty) {
        await dbPutFromRemote(store, rec);
      }
      maxSeen = Math.max(maxSeen, row.updated_at);
    }
    from = maxSeen;
    if (rows.length < 500) break;
  }
  return maxSeen;
}

export async function syncAll() {
  if (syncing) return;
  if (!isConfigured() || !isSignedIn()) {
    setStatus({ state: 'unconfigured' });
    return;
  }
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    return;
  }
  syncing = true;
  setStatus({ state: 'syncing', message: 'Syncing…' });
  try {
    await ensureFreshToken();
    const newCursor = { ...(cfg().lastCursor || {}) };
    for (const store of SYNCED_STORES) {
      const seen = await pullStore(store);
      newCursor[store] = seen;
    }
    for (const store of SYNCED_STORES) {
      await pushStore(store);
    }
    for (const store of SYNCED_STORES) {
      const seen = await pullStore(store);
      newCursor[store] = Math.max(newCursor[store] || 0, seen);
    }
    await saveMeta({ sync: { ...cfg(), lastCursor: newCursor } });
    await loadState();
    setStatus({ state: 'idle', message: 'Synced', lastSyncAt: Date.now() });
  } catch (err) {
    setStatus({ state: 'error', message: err.message || 'Sync failed' });
  } finally {
    syncing = false;
  }
}

let autoTimer = null;
export function startAutoSync() {
  if (autoTimer) return;
  window.addEventListener('online', () => syncAll());
  autoTimer = setInterval(() => syncAll(), 60000);
  syncAll();
}
