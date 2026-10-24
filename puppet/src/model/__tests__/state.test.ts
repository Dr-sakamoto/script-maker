import { describe, expect, it } from 'vitest';
import { CHICHI_CAST } from '../cast';
import { chichiDoc } from '../chichi';
import { groupRows, moveBefore, touch } from '../edit';
import { exportDoc } from '../export';
import { areaOf, classifyMove, isDark, stateAt, allStates } from '../state';
import { durationOf, indexAt, timeline } from '../timing';
import type { Item } from '../types';

const cast = CHICHI_CAST;

describe('舞台の状態', () => {
  it('エリア名', () => {
    expect([areaOf(10), areaOf(37.9), areaOf(38), areaOf(61.9), areaOf(62)]).toEqual(['下手', '下手', '中央', '中央', '上手']);
  });

  it('明転より前の move は板付き、袖から出れば出', () => {
    const d = chichiDoc();
    const st = allStates(d.items, cast);
    expect(classifyMove(stateAt(d.items, cast, -1), d.items[0] as never)).toBe('board');
    expect(classifyMove(st[7], d.items[8] as never)).toBe('enter');
    expect(classifyMove(st[9], d.items[10] as never)).toBe('move');
    expect(st[6].pos.haha).toEqual({ on: false, side: 'R' });
    expect(st[7].playing).toEqual({ 1: '頭蓋骨陥没音' });
    expect(st[11].pins).toEqual([false, true, false]);
  });

  it('冒頭は暗い', () => {
    expect(isDark(stateAt([], cast, -1))).toBe(true);
  });
});

describe('触る＝書き込む', () => {
  const base: Item[] = [{ id: 'a', t: 'light', on: true }];

  it('人形のドラッグは選択中の直後に入る', () => {
    const r = touch(base, cast, 0, () => ({ t: 'move', w: 'oyaji', in: true, x: 50 }));
    expect(r.cursor).toBe(1);
    expect(r.items[1]).toMatchObject({ t: 'move', w: 'oyaji', x: 50 });
  });

  it('同じ人形を続けてドラッグすると上書き', () => {
    let r = touch(base, cast, 0, () => ({ t: 'move', w: 'oyaji', in: true, x: 50 }));
    r = touch(r.items, cast, r.cursor, () => ({ t: 'move', w: 'oyaji', in: true, x: 80 }));
    expect(r.items).toHaveLength(2);
    expect(r.items[1]).toMatchObject({ x: 80 });
  });

  it('元に戻したら項目は消える（袖へ戻す）', () => {
    let r = touch(base, cast, 0, () => ({ t: 'move', w: 'oyaji', in: true, x: 50 }));
    r = touch(r.items, cast, r.cursor, () => ({ t: 'move', w: 'oyaji', in: false, side: 'L' }));
    expect(r.items).toHaveLength(1);
    expect(r.cursor).toBe(0);
  });

  it('バトンを2回タップすると明転が消える', () => {
    const toggle = (s: { lit: boolean }) => ({ t: 'light' as const, on: !s.lit });
    let r = touch([], cast, -1, toggle);
    expect(r.items).toMatchObject([{ t: 'light', on: true }]);
    r = touch(r.items, cast, r.cursor, toggle);
    expect(r.items).toEqual([]);
  });

  it('入れた音源をすぐC.Oすると消える', () => {
    let r = touch(base, cast, 0, () => ({ t: 'cue', n: 1, op: 'C.I' }));
    r = touch(r.items, cast, r.cursor, () => ({ t: 'cue', n: 1, op: 'C.O' }));
    expect(r.items).toHaveLength(1);
  });

  it('何も変わらない操作は書かない', () => {
    const r = touch(base, cast, 0, () => ({ t: 'light', on: true }));
    expect(r.items).toBe(base);
  });
});

describe('チップの移動', () => {
  it('チップを別の行へ動かすと、きっかけが変わる', () => {
    const d = chichiDoc();
    // 音源①（c08）を「お醤油」の行の後ろ＝（母親、中央へ移動）の直前へ
    d.items = moveBefore(d.items, 'c08', 'c11');
    // 移動チップ c11 は本体ではないので、c11 の直前＝c10 の後
    const s = exportDoc(d, 'sound', { marks: true, time: false });
    expect(s).toContain('【音源①】C.I『頭蓋骨陥没音』\n    きっかけ：●「お父さん、今お醤油きれてて…」（戻りながら） の後');
  });

  it('行のまとまり', () => {
    const rows = groupRows(chichiDoc().items);
    expect(rows[0]).toEqual({ body: 3, chips: [0, 1, 2] });
    expect(rows.at(-1)).toEqual({ body: null, chips: [10, 11, 12] });
  });
});

describe('表示秒数', () => {
  it('文字数にほぼ比例', () => {
    expect(durationOf({ id: '', t: 'line', w: 'a', x: 'あいうえお' })).toBeCloseTo(0.45 + 5 * 0.16);
    expect(durationOf({ id: '', t: 'line', w: 'a', x: 'あ' })).toBe(0.8);
    expect(durationOf({ id: '', t: 'line', w: 'a', x: '…' })).toBe(1.3);
    expect(durationOf({ id: '', t: 'line', w: 'a', x: '！？' })).toBe(1.3);
    expect(durationOf({ id: '', t: 'act', x: 'あ' })).toBe(1.2);
    expect(durationOf({ id: '', t: 'ma', s: 2 })).toBe(2);
    expect(durationOf({ id: '', t: 'light', on: true })).toBe(0.8);
    expect(durationOf({ id: '', t: 'light', on: true, fade: 3 })).toBe(3);
    expect(durationOf({ id: '', t: 'se', x: 'a' })).toBe(1.2);
    expect(durationOf({ id: '', t: 'cue', n: 1, op: 'C.I' })).toBe(0.6);
    expect(durationOf({ id: 'q', t: 'ma', s: 2 }, { q: 5 })).toBe(5);
  });

  it('時刻から項目へ', () => {
    const tl = timeline(chichiDoc().items);
    expect(indexAt(tl, 0)).toBe(0);
    expect(indexAt(tl, tl.starts[5] + 0.01)).toBe(5);
    expect(indexAt(tl, tl.total + 9)).toBe(12);
  });
});
