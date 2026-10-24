import type { Item } from './types';

const visibleLen = (s: string) => [...s.replace(/\s/g, '')].length;
/** 「…」「！？」など記号だけ（文字・数字が1つもない） */
const symbolsOnly = (s: string) => s.trim() !== '' && !/[\p{L}\p{N}]/u.test(s);

/** 表示秒数。文字数にほぼ比例。将来は実測値で上書きする（override） */
export function durationOf(it: Item, override?: Record<string, number>): number {
  const o = override?.[it.id];
  if (o != null) return o;
  switch (it.t) {
    case 'line':
      if (symbolsOnly(it.x) || it.x.trim() === '') return 1.3;
      return Math.max(0.8, 0.45 + visibleLen(it.x) * 0.16);
    case 'act':
      return Math.max(1.2, 0.8 + visibleLen(it.x) * 0.06);
    case 'ma':
      return Math.max(0, it.s);
    case 'light':
      return it.fade ? it.fade : 0.8;
    case 'se':
      return 1.2;
    default:
      return 0.6;
  }
}

export type Timeline = { starts: number[]; durs: number[]; total: number };

export function timeline(items: Item[], override?: Record<string, number>): Timeline {
  const starts: number[] = [];
  const durs: number[] = [];
  let t = 0;
  for (const it of items) {
    const d = durationOf(it, override);
    starts.push(t);
    durs.push(d);
    t += d;
  }
  return { starts, durs, total: t };
}

/** 時刻 t を含む項目の番号（範囲外は端に寄せる） */
export function indexAt(tl: Timeline, t: number): number {
  const n = tl.starts.length;
  if (n === 0) return -1;
  if (t <= 0) return 0;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.starts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
