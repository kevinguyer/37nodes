/* ===== 02b idb =====
   Unified IndexedDB plumbing. One database, one cached connection.
   Stores:
     'doc' — the document. Today a single whole-doc record under
             DOC_RECORD_KEY; per-node records (keyed by node id) can move
             into this same store later without another DB version bump.
     'kv'  — small odds and ends that need structured cloning
             (currently just the file-mirror FileSystemFileHandle). */

const IDB_NAME = '37nodes';
const IDB_VERSION = 2; // v1: kv only. v2: + doc store.
const IDB_KV = 'kv';
const IDB_DOC = 'doc';
const DOC_RECORD_KEY = 'current';

let idbPromise = null;

function idbOpen() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(IDB_NAME, IDB_VERSION); }
    catch (err) { reject(err); return; } // e.g. indexedDB itself unavailable
    req.onupgradeneeded = () => {
      // Guarded: a v1 database already has 'kv' (and its backupHandle record,
      // which this upgrade must not touch).
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_KV)) db.createObjectStore(IDB_KV);
      if (!db.objectStoreNames.contains(IDB_DOC)) db.createObjectStore(IDB_DOC);
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      // Let a future-version tab upgrade without being blocked by us; drop
      // the cache so the next call here reopens fresh.
      db.onversionchange = () => { db.close(); idbPromise = null; };
      db.onclose = () => { idbPromise = null; }; // browser-forced close
      resolve(db);
    };
  });
  idbPromise.catch(() => { idbPromise = null; }); // allow retry on failure
  return idbPromise;
}

function idbTx(storeName, mode, fn) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

const idbKvGet = k => idbTx(IDB_KV, 'readonly', os => os.get(k));
const idbKvSet = (k, v) => idbTx(IDB_KV, 'readwrite', os => os.put(v, k));
const idbKvDel = k => idbTx(IDB_KV, 'readwrite', os => os.delete(k));

const idbDocGet = k => idbTx(IDB_DOC, 'readonly', os => os.get(k));
const idbDocPut = (k, v) => idbTx(IDB_DOC, 'readwrite', os => os.put(v, k));
const idbDocDel = k => idbTx(IDB_DOC, 'readwrite', os => os.delete(k));
