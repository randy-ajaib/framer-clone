import type { Document } from './model/types';

const DB_NAME = 'site-builder';
const STORE = 'documents';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDocument(): Promise<Document | null> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(isDocument(req.result) ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveDocument(doc: Document): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(doc, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isDocument(value: unknown): value is Document {
  const v = value as Document | null;
  return !!v && v.version === 1 && typeof v.rootId === 'string' && !!v.nodes?.[v.rootId];
}
