// IndexedDB 래퍼: ISS 좌표를 timestamp(ms)를 키로 저장한다.
const DB_NAME = 'iss-tracker';
const STORE = 'positions';
const VERSION = 1;

export const RETENTION_MS = 4 * 60 * 60 * 1000; // 최근 4시간만 유지

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'ts' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function savePosition({ ts, lat, lon }) {
  return run('readwrite', (store) => store.put({ ts, lat, lon }));
}

/** cutoff 보다 오래된(4시간 경과) 좌표를 삭제한다. */
export function pruneOld(now = Date.now()) {
  const cutoff = now - RETENTION_MS;
  return run('readwrite', (store) => store.delete(IDBKeyRange.upperBound(cutoff, true)));
}

/** 저장된 모든 좌표를 시간 오름차순으로 반환한다. */
export function getAllPositions() {
  return run('readonly', (store) => store.getAll());
}
