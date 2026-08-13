// Local-first storage. IndexedDB primary, localStorage fallback. Every record (except the
// singleton `meta` row) carries updatedAt (ms epoch), dirty (needs push to server) and
// deleted (soft-delete tombstone so deletions can sync too).

const DB_NAME = 'envelope-budget';
const DB_VERSION = 1;
export const STORES = ['meta', 'essentials', 'folders', 'transactions', 'bills', 'debts', 'goals'];

let idb = null;
let useLocalStorage = false;

export function isLocalStorageMode() {
  return useLocalStorage;
}

export function openDatabase() {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      useLocalStorage = true;
      resolve();
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      idb = e.target.result;
      resolve();
    };
    req.onerror = () => {
      useLocalStorage = true;
      resolve();
    };
  });
}

function lsKey(store) {
  return 'eb_' + store;
}

function lsGetAll(store) {
  try {
    return JSON.parse(localStorage.getItem(lsKey(store)) || '[]');
  } catch {
    return [];
  }
}

function lsSetAll(store, arr) {
  localStorage.setItem(lsKey(store), JSON.stringify(arr));
}

export function dbGetAll(store) {
  if (useLocalStorage) return Promise.resolve(lsGetAll(store));
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function dbPutRaw(store, obj) {
  if (useLocalStorage) {
    const arr = lsGetAll(store);
    const i = arr.findIndex((x) => x.id === obj.id);
    if (i >= 0) arr[i] = obj;
    else arr.push(obj);
    lsSetAll(store, arr);
    return Promise.resolve(obj);
  }
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = () => resolve(obj);
    tx.onerror = () => reject(tx.error);
  });
}

// Writes a local change: stamps updatedAt and marks dirty so the sync layer picks it up.
export function dbPut(store, obj) {
  const stamped = { ...obj, updatedAt: Date.now(), dirty: true };
  return dbPutRaw(store, stamped);
}

// Writes a record coming FROM the server during sync: not dirty, carries the server's updatedAt.
export function dbPutFromRemote(store, obj) {
  return dbPutRaw(store, { ...obj, dirty: false });
}

export function dbClearDirty(store, id, serverUpdatedAt) {
  return dbGetAll(store).then((arr) => {
    const rec = arr.find((x) => x.id === id);
    if (!rec) return;
    return dbPutRaw(store, { ...rec, dirty: false, updatedAt: serverUpdatedAt ?? rec.updatedAt });
  });
}

export function dbDeleteHard(store, id) {
  if (useLocalStorage) {
    const arr = lsGetAll(store).filter((x) => x.id !== id);
    lsSetAll(store, arr);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
