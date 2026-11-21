import type { Unit, ScriptItem } from './types';

const STORAGE_KEYS = {
  UNITS: 'script_maker_units',
  SCRIPTS: 'script_maker_scripts',
};

/**
 * 保存データを読む。読めなかった（壊れている・形が違う）ときは、あとで上書きして消してしまわないよう、
 * 元の文字列をそのまま別のキーに取っておく（アプリを更新したあとでも手で取り出せる）
 */
function readList<T>(key: string): T[] {
  const stored = localStorage.getItem(key);
  if (!stored) return [];
  try {
    const data = JSON.parse(stored);
    if (Array.isArray(data)) return data as T[];
    throw new Error('not an array');
  } catch (e) {
    console.error(`Failed to parse ${key}`, e);
    try {
      // 先に取っておいた分があれば、それを上書きしない
      if (localStorage.getItem(`${key}:unreadable`) == null) localStorage.setItem(`${key}:unreadable`, stored);
    } catch {
      /* 容量がいっぱいなら、元のデータをそのまま残す */
    }
    return [];
  }
}

export function loadLocalUnits(): Unit[] {
  if (typeof window === 'undefined') return [];
  return readList<Unit>(STORAGE_KEYS.UNITS);
}

/** 保存できたら true。容量がいっぱい・保存が禁止されているときは false（例外は投げない） */
export function saveLocalUnits(units: Unit[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEYS.UNITS, JSON.stringify(units));
    return true;
  } catch (e) {
    console.error('Failed to save local units', e);
    return false;
  }
}

export function loadLocalScripts(): ScriptItem[] {
  if (typeof window === 'undefined') return [];
  return readList<ScriptItem>(STORAGE_KEYS.SCRIPTS);
}

/** 保存できたら true。容量がいっぱい・保存が禁止されているときは false（例外は投げない） */
export function saveLocalScripts(scripts: ScriptItem[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEYS.SCRIPTS, JSON.stringify(scripts));
    return true;
  } catch (e) {
    console.error('Failed to save local scripts', e);
    return false;
  }
}

export function exportBackup(units: Unit[], scripts: ScriptItem[]): void {
  if (typeof window === 'undefined') return;
  const backupData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    units,
    scripts,
  };
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `script-maker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importBackup(jsonString: string): { units: Unit[]; scripts: ScriptItem[] } | null {
  try {
    const data = JSON.parse(jsonString);
    if (data && Array.isArray(data.units) && Array.isArray(data.scripts)) {
      return {
        units: data.units,
        scripts: data.scripts,
      };
    }
    return null;
  } catch (e) {
    console.error('Failed to import backup data', e);
    return null;
  }
}
