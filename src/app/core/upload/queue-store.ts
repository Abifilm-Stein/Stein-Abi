/**
 * Crash-safe upload queue, persisted in IndexedDB.
 *
 * The `File` handle itself is stored, not just its name: `File`/`Blob` are
 * structured-cloneable, so after a reload or a lost connection the transfer
 * resumes at its byte offset WITHOUT asking the student to pick the file
 * again. That is the difference between "my 1.4 GB video died at 90%" and a
 * queue that quietly finishes itself.
 *
 * Every operation degrades to a no-op when IndexedDB is unavailable (private
 * windows, blocked site data). Persistence is a convenience, never a
 * precondition for uploading.
 */

const DB_NAME = 'steinabi-uploads';
const DB_VERSION = 1;
const STORE = 'queue';

export interface PersistedUpload {
  id: string;
  file: File;
  /** tus session URL, so the transfer can pick up where it stopped. */
  resumeUrl?: string;
  bytesSent: number;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | undefined;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function transact<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const tx = db.transaction(STORE, mode);
          const request = work(tx.objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function saveUpload(entry: PersistedUpload): Promise<void> {
  await transact('readwrite', (store) => store.put(entry) as IDBRequest<IDBValidKey>);
}

export async function removeUpload(id: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(id) as IDBRequest<undefined>);
}

export async function loadUploads(): Promise<PersistedUpload[]> {
  const rows = await transact('readonly', (store) => store.getAll() as IDBRequest<PersistedUpload[]>);
  if (!rows) return [];
  // Guard against rows written by an older schema.
  return rows.filter((row) => row && row.file instanceof Blob).sort((a, b) => a.createdAt - b.createdAt);
}

export async function clearUploads(): Promise<void> {
  await transact('readwrite', (store) => store.clear() as IDBRequest<undefined>);
}
