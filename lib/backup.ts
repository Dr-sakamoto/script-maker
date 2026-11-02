import type { ScriptItem } from './types';

/**
 * 台本の自動バックアップ（IndexedDB）。
 * localStorage が消えても戻せるように、台本ごとに直近の版を数十件とっておく。
 * 使えない環境（プライベートブラウズなど）では黙って何もしない。
 */
const DB = 'script-maker-backup';
const STORE = 'snaps';
const KEEP = 30;
/** 同じ台本の版は、この間隔より詰めては取らない */
const EVERY_MS = 60_000;

export type Snapshot = { key: string; scriptId: string; at: number; title: string; lines: number; script: ScriptItem };

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: 'key' });
        s.createIndex('scriptId', 'scriptId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((res) => {
    tx.oncomplete = () => res();
    tx.onerror = () => res();
    tx.onabort = () => res();
  });

const all = <T,>(req: IDBRequest<T[]>) =>
  new Promise<T[]>((res) => {
    req.onsuccess = () => res(req.result ?? []);
    req.onerror = () => res([]);
  });

const last: Record<string, number> = {};

/** 版をとる（1分に1回まで）。古いものは KEEP 件を残して消す */
export async function snapshot(script: ScriptItem, force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - (last[script.id] ?? 0) < EVERY_MS) return;
  last[script.id] = now;
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const lines = (script.stage ?? []).filter((it) => it.t === 'line').length;
    store.put({ key: `${script.id}:${now}`, scriptId: script.id, at: now, title: script.title, lines, script } satisfies Snapshot);
    const mine = (await all<Snapshot>(store.index('scriptId').getAll(script.id))).sort((a, b) => b.at - a.at);
    for (const s of mine.slice(KEEP)) store.delete(s.key);
    await done(tx);
  } catch {
    /* noop */
  } finally {
    db.close();
  }
}

/** とってある版（新しい順）。scriptId を渡せばその台本の分だけ */
export async function listSnapshots(scriptId?: string): Promise<Snapshot[]> {
  const db = await open();
  if (!db) return [];
  try {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const list = await all<Snapshot>(scriptId ? store.index('scriptId').getAll(scriptId) : store.getAll());
    return list.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/** ブラウザに「勝手に消さないで」と頼む（効くかどうかはブラウザ次第） */
export function askPersist(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* noop */
  }
}
