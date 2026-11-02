import type { NetaType, ScriptItem, Unit } from './types';

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2, 11)}`;

export const QUICK_UNIT_NAME = 'マイネタ';

/**
 * 「すぐ書く」：ユニットや題を決めずに台本を1本作る。
 * ユニットは選んでいるもの → 最初のもの → 無ければ「マイネタ」を作る。
 * 役はユニットの演者の名前（いなければ A・B）。題は空（あとで付ける）
 */
export function quickScript(units: Unit[], genre: NetaType, unitId?: string | null): { units: Unit[]; script: ScriptItem; unit: Unit } {
  let unit = units.find((u) => u.id === unitId) ?? units[0];
  let nextUnits = units;
  if (!unit) {
    unit = { id: newId(), name: QUICK_UNIT_NAME, performers: [] };
    nextUnits = [...units, unit];
  }
  const people = unit.performers ?? [];
  const count = genre === 'ピン' ? 1 : Math.max(2, Math.min(people.length, 4));
  const characters = Array.from({ length: count }, (_, i) => ({
    id: newId(),
    name: people[i]?.name ?? (count === 1 ? '自分' : String.fromCharCode(65 + i)),
    performerId: people[i]?.id ?? '',
    costume: '',
  }));
  const now = new Date().toISOString();
  const script: ScriptItem = {
    id: newId(),
    unitId: unit.id,
    title: '',
    netaType: genre,
    characters,
    sounds: [],
    blocks: [],
    stage: [],
    createdAt: now,
    updatedAt: now,
  };
  return { units: nextUnits, script, unit };
}
