/* Collector — IndexedDB layer (vanilla, no dependencies) */
(function () {
  const DB_NAME = 'collector-db';
  const DB_VERSION = 2;
  const STORE = 'artworks';
  const SETS_STORE = 'sets';

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          const store = req.result.createObjectStore(STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('title', 'title');
          store.createIndex('artist', 'artist');
          store.createIndex('year', 'year');
          store.createIndex('era', 'era');
          store.createIndex('category', 'category');
          store.createIndex('visibility', 'visibility');
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('setId', 'setId');
        }
        if (!req.result.objectStoreNames.contains(SETS_STORE)) {
          req.result.createObjectStore(SETS_STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function withNamedStore(name, mode, fn) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(name, mode);
          const s = t.objectStore(name);
          fn(s, (value) => resolve(value), reject);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  function withStore(mode, fn) {
    return withNamedStore(STORE, mode, fn);
  }

  function withSets(mode, fn) {
    return withNamedStore(SETS_STORE, mode, fn);
  }

  function getAll() {
    return withStore('readonly', (s, done, fail) => {
      const req = s.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        done(rows);
      };
      req.onerror = () => fail(req.error);
    });
  }

  function addArt(art) {
    return withStore('readwrite', (s, done, fail) => {
      const req = s.add(art);
      req.onsuccess = () => done(req.result);
      req.onerror = () => fail(req.error);
    });
  }

  // Update merges the patch into the EXISTING record. Using a bare put() here
  // would replace the whole record and delete fields not present in the patch
  // (notably the stored image blobs).
  function updateArt(id, art) {
    return withStore('readwrite', (s, done, fail) => {
      const getReq = s.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result || {};
        const merged = { ...existing, ...art, id, updatedAt: Date.now() };
        const putReq = s.put(merged);
        putReq.onsuccess = () => done();
        putReq.onerror = () => fail(putReq.error);
      };
      getReq.onerror = () => fail(getReq.error);
    });
  }

  function deleteArt(id) {
    return withStore('readwrite', (s, done, fail) => {
      const req = s.delete(id);
      req.onsuccess = () => done();
      req.onerror = () => fail(req.error);
    });
  }

  function clearAll() {
    return withStore('readwrite', (s, done, fail) => {
      const req = s.clear();
      req.onsuccess = () => done();
      req.onerror = () => fail(req.error);
    });
  }

  function getAllSets() {
    return withSets('readonly', (s, done, fail) => {
      const req = s.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        done(rows);
      };
      req.onerror = () => fail(req.error);
    });
  }

  function addSet(set) {
    return withSets('readwrite', (s, done, fail) => {
      const req = s.add(set);
      req.onsuccess = () => done(req.result);
      req.onerror = () => fail(req.error);
    });
  }

  function renameSet(id, name) {
    return withSets('readwrite', (s, done, fail) => {
      const getReq = s.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result || {};
        const merged = { ...existing, name, id, updatedAt: Date.now() };
        const putReq = s.put(merged);
        putReq.onsuccess = () => done();
        putReq.onerror = () => fail(putReq.error);
      };
      getReq.onerror = () => fail(getReq.error);
    });
  }

  // Remove a set and untag its artworks (their data is preserved).
  function deleteSet(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction([SETS_STORE, STORE], 'readwrite');
          const setStore = t.objectStore(SETS_STORE);
          const artStore = t.objectStore(STORE);
          const delReq = setStore.delete(id);
          delReq.onerror = () => reject(delReq.error);
          const allReq = artStore.getAll();
          allReq.onsuccess = () => {
            for (const a of allReq.result || []) {
              if (a.setId === id) {
                const next = { ...a };
                delete next.setId;
                artStore.put(next);
              }
            }
          };
          allReq.onerror = () => reject(allReq.error);
          t.oncomplete = () => resolve();
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  window.CollectorDB = { getAll, addArt, updateArt, deleteArt, clearAll, openDb, getAllSets, addSet, renameSet, deleteSet };
})();