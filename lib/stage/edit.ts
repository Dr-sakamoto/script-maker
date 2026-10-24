import { applyItem, sameStage, stateAt, type StageState } from './state';
import type { CastMember, Item, NewItem } from './types';

let seq = 0;
export const uid = () => `i${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const withId = (it: NewItem, id = uid()): Item => ({ ...it, id }) as Item;

export type Edit = { items: Item[]; cursor: number };

export function insertAfter(items: Item[], cursor: number, it: NewItem | Item): Edit {
  const item = 'id' in it ? (it as Item) : withId(it);
  const next = [...items];
  next.splice(cursor + 1, 0, item);
  return { items: next, cursor: cursor + 1 };
}

/** 「同じ対象」の判定キー。舞台を触る操作だけが持つ */
export function targetKey(it: NewItem | Item): string | null {
  switch (it.t) {
    case 'move':
    case 'hold':
      // 持つ／置くは同じ小道具への操作なので、続けて触れば上書き
      return `move:${it.w}`;
    case 'light':
      return `light:${it.p ?? 'all'}`;
    case 'cue':
      return `cue:${it.n}`;
    default:
      return null;
  }
}

/**
 * 舞台を触ったときの書き込み。
 * - 選択中の項目と同じ対象なら、新しい行を増やさずに上書きする
 * - 上書きの結果、元の状態に戻ったらその項目を消す
 * - そうでなければ選択中の項目の直後に入れ、それを新しい「今」にする
 */
export function touch(
  items: Item[],
  cast: CastMember[],
  cursor: number,
  make: (now: StageState) => NewItem | null,
): Edit {
  const now = stateAt(items, cast, cursor);
  const it = make(now);
  if (!it || sameStage(now, applyItem(now, withId(it)))) return { items, cursor };
  const cur = items[cursor];
  const key = targetKey(it);
  if (cur && key && targetKey(cur) === key) {
    const before = stateAt(items, cast, cursor - 1);
    const next = [...items];
    if (sameStage(before, applyItem(before, withId(it)))) {
      next.splice(cursor, 1);
      return { items: next, cursor: cursor - 1 };
    }
    next[cursor] = withId(it, cur.id);
    return { items: next, cursor };
  }
  return insertAfter(items, cursor, it);
}

export function updateItem(items: Item[], id: string, patch: Partial<Item>): Item[] {
  return items.map((it) => (it.id === id ? ({ ...it, ...patch } as Item) : it));
}

export function replaceItem(items: Item[], id: string, it: Item): Item[] {
  return items.map((x) => (x.id === id ? it : x));
}

export function removeItem(items: Item[], cursor: number, id: string): Edit {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return { items, cursor };
  const next = items.filter((x) => x.id !== id);
  return { items: next, cursor: cursor >= i ? Math.max(-1, cursor - 1) : cursor };
}

/** id の項目を targetId の直前へ移す（チップのドラッグ） */
export function moveBefore(items: Item[], id: string, targetId: string | null): Item[] {
  if (id === targetId) return items;
  const it = items.find((x) => x.id === id);
  if (!it) return items;
  const rest = items.filter((x) => x.id !== id);
  const at = targetId == null ? rest.length : rest.findIndex((x) => x.id === targetId);
  if (at < 0) return items;
  rest.splice(at, 0, it);
  return rest;
}

export const isBody = (it: Item) => it.t === 'line' || it.t === 'act';

/** 台本の行：本体（セリフ・動き）と、その直前に並ぶ演出チップ */
export type Row = { body: number | null; chips: number[] };

export function groupRows(items: Item[]): Row[] {
  const rows: Row[] = [];
  let chips: number[] = [];
  items.forEach((it, i) => {
    if (isBody(it)) {
      rows.push({ body: i, chips });
      chips = [];
    } else chips.push(i);
  });
  if (chips.length) rows.push({ body: null, chips });
  return rows;
}
