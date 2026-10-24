import { uid } from './edit';
import type { Item } from './types';

const KINDS = new Set(['line', 'act', 'light', 'move', 'cue', 'se', 'ma']);

/** JSON（{ items } でも Item[] でも）から項目を読む。id が無い項目には振る */
export function parseItems(text: string): Item[] {
  const raw = JSON.parse(text);
  const src = Array.isArray(raw) ? raw : raw?.stage ?? raw?.items;
  if (!Array.isArray(src)) throw new Error('items が見つからない');
  return src
    .filter((it: { t?: string }) => it && KINDS.has(it.t ?? ''))
    .map((it: Item) => ({ ...it, id: typeof it.id === 'string' && it.id ? it.id : uid() }));
}
