import { CHICHI_CAST } from './cast';
import type { Doc, Item } from './types';

/**
 * コント『父』（サレルロブロ）。
 * 参考プロトタイプ chichi.html の本体が手元に無いため、依頼書の書き出し例から再構成した抜粋。
 * chichi.html の台本データ（JSON）は「渡す」モードの読み込みから差し替えられる。
 */
const items: Item[] = [
  { id: 'c01', t: 'move', w: 'oyaji', in: true, x: 22 },
  { id: 'c02', t: 'move', w: 'haha', in: true, x: 78 },
  { id: 'c03', t: 'light', on: true },
  { id: 'c04', t: 'act', w: 'oyaji', x: '食卓で飯を食っている' },
  { id: 'c05', t: 'line', w: 'haha', x: 'ケンジ、もうすぐ着くらしいわ。' },
  { id: 'c06', t: 'ma', s: 2 },
  { id: 'c07', t: 'move', w: 'haha', in: false, side: 'R' },
  { id: 'c08', t: 'cue', n: 1, op: 'C.I', x: '頭蓋骨陥没音' },
  { id: 'c09', t: 'move', w: 'haha', in: true, x: 76 },
  { id: 'c10', t: 'line', w: 'haha', x: 'お父さん、今お醤油きれてて…', n: '戻りながら' },
  { id: 'c11', t: 'move', w: 'haha', in: true, x: 50 },
  { id: 'c12', t: 'light', on: true, p: 2, fade: 3 },
  { id: 'c13', t: 'cue', n: 5, op: 'F.O', sec: 2 },
];

export function chichiDoc(): Doc {
  return {
    id: 'chichi',
    unit: 'サレルロブロ',
    genre: 'コント',
    title: '父',
    cast: CHICHI_CAST.map((c) => ({ ...c })),
    items: items.map((i) => ({ ...i })),
    updatedAt: 0,
  };
}
