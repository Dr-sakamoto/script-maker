import type { Unit, ScriptItem } from './types';

const STORAGE_KEYS = {
  UNITS: 'script_maker_units',
  SCRIPTS: 'script_maker_scripts',
};

export function loadLocalUnits(): Unit[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEYS.UNITS);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to parse local units', e);
    return [];
  }
}

export function saveLocalUnits(units: Unit[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.UNITS, JSON.stringify(units));
}

export function loadLocalScripts(): ScriptItem[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEYS.SCRIPTS);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to parse local scripts', e);
    return [];
  }
}

export function saveLocalScripts(scripts: ScriptItem[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.SCRIPTS, JSON.stringify(scripts));
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
