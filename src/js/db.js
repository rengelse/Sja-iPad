const DB_NAME = 'sja-generator-db';
const DB_VERSION = 1;
const STORE = 'documents';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('status', 'status');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = work(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export const db = {
  async list() { const rows = await withStore('readonly', s => s.getAll()); return rows.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))); },
  get(id) { return withStore('readonly', s => s.get(id)); },
  put(doc) { return withStore('readwrite', s => s.put(doc)); },
  delete(id) { return withStore('readwrite', s => s.delete(id)); }
};
