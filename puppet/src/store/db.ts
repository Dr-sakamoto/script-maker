import type { Doc } from '../model/types';

/** ローカル保存。IndexedDB が使えなければ localStorage に落とす */
const DB = 'puppet-script';
const STORE = 'docs';
const LS = 'puppet-script:docs';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const req = f(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => res(req.result as T);
        req.onerror = () => rej(req.error);
      }),
  );
}

const lsAll = (): Doc[] => {
  try {
    return JSON.parse(localStorage.getItem(LS) ?? '[]');
  } catch {
    return [];
  }
};
const lsPut = (docs: Doc[]) => {
  try {
    localStorage.setItem(LS, JSON.stringify(docs));
  } catch {
    /* 保存できない環境では何もしない */
  }
};

export async function listDocs(): Promise<Doc[]> {
  try {
    return await tx<Doc[]>('readonly', (s) => s.getAll());
  } catch {
    return lsAll();
  }
}

export async function saveDoc(doc: Doc): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(doc));
  } catch {
    lsPut([...lsAll().filter((d) => d.id !== doc.id), doc]);
  }
}

export async function deleteDoc(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    lsPut(lsAll().filter((d) => d.id !== id));
  }
}

export const lastOpen = {
  get: () => {
    try {
      return localStorage.getItem('puppet-script:last');
    } catch {
      return null;
    }
  },
  set: (id: string) => {
    try {
      localStorage.setItem('puppet-script:last', id);
    } catch {
      /* noop */
    }
  },
};
