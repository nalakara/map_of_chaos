/**
 * IndexedDB Schema & Driver Layer for Map of Chaos
 * Provides universal IStorageDriver abstraction supported by both browser IndexedDB and in-memory test backend.
 */

export const DB_NAME = 'map_of_chaos_db_v1';
export const DB_VERSION = 1;

export const STORES = {
  DUMPS: 'dumps',
  EVIDENCE: 'evidence',
  MENTIONS: 'mentions',
  ENTITIES: 'entities',
  CLAIMS: 'claims',
  ENTITY_RESOLUTIONS: 'entity_resolutions',
  HUMAN_OVERRIDES: 'human_overrides',
  CLAIM_AUDITS: 'claim_audits',
  PROJECTION_CACHE: 'projection_cache',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

export interface IStorageDriver {
  get<T>(storeName: StoreName, key: string): Promise<T | null>;
  put<T extends { id: string }>(storeName: StoreName, item: T): Promise<void>;
  delete(storeName: StoreName, key: string): Promise<void>;
  getAll<T>(
    storeName: StoreName,
    indexName?: string,
    query?: IDBValidKey | IDBKeyRange | ((item: T) => boolean)
  ): Promise<T[]>;
  clear(storeName: StoreName): Promise<void>;
  runTransaction<R>(
    storeNames: StoreName[],
    mode: 'readonly' | 'readwrite',
    operation: (txDriver: IStorageDriver) => Promise<R>
  ): Promise<R>;
}

class ScopedIndexedDBDriver implements IStorageDriver {
  constructor(private tx: IDBTransaction) {}

  get<T>(storeName: StoreName, key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const store = this.tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  }

  put<T extends { id: string }>(storeName: StoreName, item: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  delete(storeName: StoreName, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  getAll<T>(
    storeName: StoreName,
    indexName?: string,
    query?: IDBValidKey | IDBKeyRange | ((item: T) => boolean)
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const store = this.tx.objectStore(storeName);
      const target = indexName ? store.index(indexName) : store;

      if (typeof query === 'function') {
        const req = target.getAll();
        req.onsuccess = () => resolve((req.result || []).filter(query));
        req.onerror = () => reject(req.error);
      } else {
        const req = query !== undefined ? target.getAll(query) : target.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }
    });
  }

  clear(storeName: StoreName): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  runTransaction<R>(
    _storeNames: StoreName[],
    _mode: 'readonly' | 'readwrite',
    operation: (txDriver: IStorageDriver) => Promise<R>
  ): Promise<R> {
    return operation(this);
  }
}

/**
 * Native IndexedDB Driver for Browser and PWA
 */
export class IndexedDBDriver implements IStorageDriver {
  constructor(private db: IDBDatabase) {}

  get<T>(storeName: StoreName, key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  }

  put<T extends { id: string }>(storeName: StoreName, item: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  delete(storeName: StoreName, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  getAll<T>(
    storeName: StoreName,
    indexName?: string,
    query?: IDBValidKey | IDBKeyRange | ((item: T) => boolean)
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const target = indexName ? store.index(indexName) : store;

      if (typeof query === 'function') {
        const req = target.getAll();
        req.onsuccess = () => resolve((req.result || []).filter(query));
        req.onerror = () => reject(req.error);
      } else {
        const req = query !== undefined ? target.getAll(query) : target.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }
    });
  }

  clear(storeName: StoreName): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  runTransaction<R>(
    storeNames: StoreName[],
    mode: 'readonly' | 'readwrite',
    operation: (txDriver: IStorageDriver) => Promise<R>
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction(storeNames, mode);
      } catch (err) {
        return reject(err);
      }

      const scopedDriver = new ScopedIndexedDBDriver(tx);
      let opResult: R;

      operation(scopedDriver)
        .then((result) => {
          opResult = result;
        })
        .catch((err) => {
          try {
            tx.abort();
          } catch (_) {}
          reject(err);
        });

      tx.oncomplete = () => resolve(opResult);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('IndexedDB transaction was aborted.'));
    });
  }
}

/**
 * Memory Storage Driver for testing & headless environments
 */
export class MemoryStorageDriver implements IStorageDriver {
  public stores: Map<StoreName, Map<string, unknown>> = new Map();

  constructor() {
    Object.values(STORES).forEach((name) => {
      this.stores.set(name, new Map());
    });
  }

  get<T>(storeName: StoreName, key: string): Promise<T | null> {
    const store = this.stores.get(storeName);
    const val = store?.get(key);
    return Promise.resolve(val ? (JSON.parse(JSON.stringify(val)) as T) : null);
  }

  put<T extends { id: string }>(storeName: StoreName, item: T): Promise<void> {
    const store = this.stores.get(storeName);
    if (store) {
      store.set(item.id, JSON.parse(JSON.stringify(item)));
    }
    return Promise.resolve();
  }

  delete(storeName: StoreName, key: string): Promise<void> {
    const store = this.stores.get(storeName);
    store?.delete(key);
    return Promise.resolve();
  }

  getAll<T>(
    storeName: StoreName,
    _indexName?: string,
    query?: IDBValidKey | IDBKeyRange | ((item: T) => boolean)
  ): Promise<T[]> {
    const store = this.stores.get(storeName);
    if (!store) return Promise.resolve([]);
    let items = Array.from(store.values()) as T[];
    if (typeof query === 'function') {
      items = items.filter(query);
    }
    return Promise.resolve(JSON.parse(JSON.stringify(items)));
  }

  clear(storeName: StoreName): Promise<void> {
    const store = this.stores.get(storeName);
    store?.clear();
    return Promise.resolve();
  }

  async runTransaction<R>(
    _storeNames: StoreName[],
    _mode: 'readonly' | 'readwrite',
    operation: (txDriver: IStorageDriver) => Promise<R>
  ): Promise<R> {
    // Create deep copy of all stores for transactional isolation
    const snapshot = new Map<StoreName, Map<string, unknown>>();
    for (const [storeName, map] of this.stores.entries()) {
      const copyMap = new Map<string, unknown>();
      for (const [k, v] of map.entries()) {
        copyMap.set(k, JSON.parse(JSON.stringify(v)));
      }
      snapshot.set(storeName, copyMap);
    }

    const txDriver = new MemoryStorageDriver();
    txDriver.stores = snapshot;

    try {
      const result = await operation(txDriver);
      // Atomic commit: apply snapshot back
      this.stores = snapshot;
      return result;
    } catch (err) {
      // Rollback: discard snapshot, state remains untouched
      throw err;
    }
  }
}

/**
 * Opens or upgrades the IndexedDB instance in a browser
 */
export function openDatabase(factory?: IDBFactory): Promise<IDBDatabase> {
  const idb = factory || (typeof window !== 'undefined' ? window.indexedDB : globalThis.indexedDB);
  if (!idb) {
    return Promise.reject(
      new Error('IndexedDB is not available in the current runtime environment.')
    );
  }

  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Dumps store
      if (!db.objectStoreNames.contains(STORES.DUMPS)) {
        const dumpStore = db.createObjectStore(STORES.DUMPS, { keyPath: 'id' });
        dumpStore.createIndex('createdAt', 'createdAt', { unique: false });
        dumpStore.createIndex('processingStatus', 'processingStatus', { unique: false });
      }

      // 2. Evidence store
      if (!db.objectStoreNames.contains(STORES.EVIDENCE)) {
        const evStore = db.createObjectStore(STORES.EVIDENCE, { keyPath: 'id' });
        evStore.createIndex('dumpId', 'dumpId', { unique: false });
      }

      // 3. Mentions store
      if (!db.objectStoreNames.contains(STORES.MENTIONS)) {
        const mentionStore = db.createObjectStore(STORES.MENTIONS, { keyPath: 'id' });
        mentionStore.createIndex('dumpId', 'dumpId', { unique: false });
        mentionStore.createIndex('normalizedForm', 'normalizedForm', { unique: false });
      }

      // 4. Entities store
      if (!db.objectStoreNames.contains(STORES.ENTITIES)) {
        const entityStore = db.createObjectStore(STORES.ENTITIES, { keyPath: 'id' });
        entityStore.createIndex('canonicalName', 'canonicalName', { unique: false });
        entityStore.createIndex('resolutionStatus', 'resolutionStatus', { unique: false });
      }

      // 5. Claims store
      if (!db.objectStoreNames.contains(STORES.CLAIMS)) {
        const claimStore = db.createObjectStore(STORES.CLAIMS, { keyPath: 'id' });
        claimStore.createIndex('subjectEntityId', 'subjectEntityId', { unique: false });
        claimStore.createIndex('dumpId', 'dumpId', { unique: false });
        claimStore.createIndex('reviewState', 'reviewState', { unique: false });
        claimStore.createIndex('temporalScope', 'temporalScope', { unique: false });
        claimStore.createIndex('predicate', 'predicate', { unique: false });
      }

      // 6. EntityResolutions store
      if (!db.objectStoreNames.contains(STORES.ENTITY_RESOLUTIONS)) {
        const resStore = db.createObjectStore(STORES.ENTITY_RESOLUTIONS, { keyPath: 'id' });
        resStore.createIndex('mentionId', 'mentionId', { unique: false });
        resStore.createIndex('targetEntityId', 'targetEntityId', { unique: false });
        resStore.createIndex('status', 'status', { unique: false });
      }

      // 7. HumanOverrides store
      if (!db.objectStoreNames.contains(STORES.HUMAN_OVERRIDES)) {
        const ovStore = db.createObjectStore(STORES.HUMAN_OVERRIDES, { keyPath: 'id' });
        ovStore.createIndex('targetId', 'targetId', { unique: false });
        ovStore.createIndex('targetType', 'targetType', { unique: false });
      }

      // 8. ClaimAudits store
      if (!db.objectStoreNames.contains(STORES.CLAIM_AUDITS)) {
        const auditStore = db.createObjectStore(STORES.CLAIM_AUDITS, { keyPath: 'id' });
        auditStore.createIndex('claimId', 'claimId', { unique: false });
      }

      // 9. ProjectionCache store
      if (!db.objectStoreNames.contains(STORES.PROJECTION_CACHE)) {
        db.createObjectStore(STORES.PROJECTION_CACHE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
