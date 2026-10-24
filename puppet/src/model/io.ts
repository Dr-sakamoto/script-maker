import { CHICHI_CAST } from './cast';
import { uid } from './edit';
import type { Doc, Item } from './types';

const KINDS = new Set(['line', 'act', 'light', 'move', 'cue', 'se', 'ma']);

/** JSON（Doc でも Item[] でも）を読み込む。id が無い項目には振る */
export function parseDoc(text: string): Doc {
  const raw = JSON.parse(text);
  const src = Array.isArray(raw) ? { items: raw } : raw;
  if (!src || !Array.isArray(src.items)) throw new Error('items が見つからない');
  const items: Item[] = src.items
    .filter((it: { t?: string }) => it && KINDS.has(it.t ?? ''))
    .map((it: Item) => ({ ...it, id: typeof it.id === 'string' && it.id ? it.id : uid() }));
  return {
    id: uid(),
    unit: typeof src.unit === 'string' ? src.unit : '',
    genre: typeof src.genre === 'string' ? src.genre : 'コント',
    title: typeof src.title === 'string' ? src.title : '読み込んだ台本',
    cast: Array.isArray(src.cast) && src.cast.length ? src.cast : CHICHI_CAST.map((c) => ({ ...c })),
    items,
    updatedAt: Date.now(),
  };
}

export function blankDoc(): Doc {
  return { id: uid(), unit: '', genre: 'コント', title: '無題', cast: CHICHI_CAST.map((c) => ({ ...c })), items: [], updatedAt: Date.now() };
}
