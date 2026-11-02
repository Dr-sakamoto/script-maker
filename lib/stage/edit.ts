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

/**
 * セリフ・動きの行を、直前の演出チップごと別の行の前へ移す（行の並べ替え）。
 * beforeBodyId が null なら最後の本体の後ろ（末尾に残ったチップより前）へ。
 */
export function moveRow(items: Item[], bodyId: string, beforeBodyId: string | null): Item[] {
  if (bodyId === beforeBodyId) return items;
  const rows = groupRows(items);
  const span = (r: Row) => {
    const idx = [...r.chips, ...(r.body != null ? [r.body] : [])];
    return { from: Math.min(...idx), to: Math.max(...idx) };
  };
  const src = rows.find((r) => r.body != null && items[r.body].id === bodyId);
  if (!src) return items;
  const { from, to } = span(src);
  const block = items.slice(from, to + 1);
  const rest = [...items.slice(0, from), ...items.slice(to + 1)];
  let at: number;
  if (beforeBodyId == null) {
    let last = -1;
    rest.forEach((it, i) => {
      if (isBody(it)) last = i;
    });
    at = last + 1;
  } else {
    const restRows = groupRows(rest);
    const dst = restRows.find((r) => r.body != null && rest[r.body].id === beforeBodyId);
    if (!dst) return items;
    at = span(dst).from;
  }
  rest.splice(at, 0, ...block);
  return rest;
}

/** セリフ・動きを文字の位置 at で2行に分ける。後ろ半分は同じ話者の新しい行。cursor は後ろの行 */
export function splitBody(items: Item[], id: string, at: number): Edit | null {
  const i = items.findIndex((x) => x.id === id);
  const it = items[i];
  if (!it || (it.t !== 'line' && it.t !== 'act')) return null;
  const head = it.x.slice(0, at);
  const tail = it.x.slice(at);
  const next = [...items];
  next[i] = { ...it, x: head } as Item;
  const second = withId(it.t === 'line' ? { t: 'line', w: it.w, x: tail } : { t: 'act', ...(it.w ? { w: it.w } : {}), x: tail });
  next.splice(i + 1, 0, second);
  return { items: next, cursor: i + 1 };
}

/**
 * 直前の本体（同じ種類・同じ話者、間に演出チップが無いとき）につなげる。
 * caret はつないだ行での継ぎ目の位置。つなげられなければ null
 */
export function mergePrev(items: Item[], id: string): (Edit & { id: string; caret: number }) | null {
  const i = items.findIndex((x) => x.id === id);
  const it = items[i];
  const prev = items[i - 1];
  if (!it || !prev || (it.t !== 'line' && it.t !== 'act') || prev.t !== it.t || prev.w !== it.w) return null;
  const caret = prev.x.length;
  const merged = { ...prev, x: prev.x + it.x } as Item;
  if (it.t === 'line' && prev.t === 'line' && it.n) (merged as { n?: string }).n = prev.n ? `${prev.n}・${it.n}` : it.n;
  const next = [...items];
  next.splice(i - 1, 2, merged);
  return { items: next, cursor: i - 1, id: prev.id, caret };
}
