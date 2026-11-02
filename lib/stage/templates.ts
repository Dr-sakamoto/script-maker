import { puppets } from './cast';
import { withId } from './edit';
import { WING } from './state';
import type { CastMember, Item, NewItem } from './types';

/** 立ち位置：人数で舞台を割る（袖は避ける） */
const spots = (n: number) => Array.from({ length: n }, (_, i) => Math.round(WING + ((100 - 2 * WING) * (i + 1)) / (n + 1)));

export type Template = { items: Item[]; cursor: number };

/**
 * 種類ごとのひな形。頭（出囃子・板付き・明転）とお尻（締め・暗転・ハケ）だけ入れて、
 * cursor は「ここからネタ」の位置（その直後に打った行が入る）。
 */
export function templateFor(genre: string, cast: CastMember[], unit = ''): Template | null {
  const ps = puppets(cast);
  if (!ps.length) return null;
  const xs = spots(ps.length);
  const head: NewItem[] = [];
  const tail: NewItem[] = [];
  const a = ps[0].id;
  const b = (ps[1] ?? ps[0]).id;
  if (genre === 'コント') {
    // 板付き → 明転 … 暗転
    ps.forEach((p, i) => head.push({ t: 'move', w: p.id, in: true, x: xs[i] }));
    head.push({ t: 'light', on: true });
    tail.push({ t: 'light', on: false });
  } else {
    // 漫才・ピン：出囃子で出て、締めてハケる
    head.push({ t: 'light', on: true });
    head.push({ t: 'cue', n: 1, op: 'C.I', x: '出囃子' });
    ps.forEach((p, i) => head.push({ t: 'move', w: p.id, in: true, x: xs[i] }));
    head.push({ t: 'cue', n: 1, op: 'F.O', sec: 3 });
    if (genre === '漫才' && ps.length > 1) {
      head.push({ t: 'line', w: a, x: `どうもー、${unit || '〇〇'}です！` });
      head.push({ t: 'line', w: b, x: 'よろしくお願いしますー' });
      tail.push({ t: 'line', w: b, x: 'もうええわ' });
      tail.push({ t: 'line', w: a, x: 'どうもありがとうございました' });
    } else {
      head.push({ t: 'line', w: a, x: 'どうもー！' });
      tail.push({ t: 'line', w: a, x: 'ありがとうございました' });
    }
    tail.push({ t: 'cue', n: 2, op: 'C.I', x: 'ハケ囃子' });
    ps.forEach((p, i) => tail.push({ t: 'move', w: p.id, in: false, side: i % 2 === 0 ? 'L' : 'R' }));
    tail.push({ t: 'light', on: false });
  }
  const items = [...head, ...tail].map((it) => withId(it));
  return { items, cursor: head.length - 1 };
}
