import { describe, expect, it } from 'vitest';
import { chichiDoc } from '../chichi';
import { groupRows, mergePrev, moveRow, splitBody } from '../edit';
import { templateFor } from '../templates';
import { quickScript } from '../../quick';
import type { Item } from '../types';

const L = (id: string, w: string, x: string): Item => ({ id, t: 'line', w, x });
const ma = (id: string): Item => ({ id, t: 'ma', s: 1 });

describe('行の並べ替え', () => {
  const items: Item[] = [L('a', 'p', 'あ'), ma('m1'), L('b', 'q', 'い'), L('c', 'p', 'う'), ma('tail')];
  it('チップごと別の行の前へ', () => {
    expect(moveRow(items, 'b', 'a').map((x) => x.id)).toEqual(['m1', 'b', 'a', 'c', 'tail']);
  });
  it('末尾へ（残りチップより前）', () => {
    expect(moveRow(items, 'a', null).map((x) => x.id)).toEqual(['m1', 'b', 'c', 'a', 'tail']);
  });
  it('下へ', () => {
    expect(moveRow(items, 'b', 'c').map((x) => x.id)).toEqual(['a', 'm1', 'b', 'c', 'tail']);
    expect(moveRow(items, 'a', 'c').map((x) => x.id)).toEqual(['m1', 'b', 'a', 'c', 'tail']);
  });
  it('知らない id はそのまま', () => {
    expect(moveRow(items, 'zz', 'a')).toBe(items);
  });
});

describe('行を分ける・つなげる', () => {
  it('分けると同じ話者の行が後ろにでき、つなげると戻る', () => {
    const items: Item[] = [L('a', 'p', 'おう、帰ったか')];
    const s = splitBody(items, 'a', 3)!;
    expect(s.items.map((x) => (x as { x: string }).x)).toEqual(['おう、', '帰ったか']);
    expect(s.cursor).toBe(1);
    expect((s.items[1] as { w: string }).w).toBe('p');
    const m = mergePrev(s.items, s.items[1].id)!;
    expect(m.items).toHaveLength(1);
    expect((m.items[0] as { x: string }).x).toBe('おう、帰ったか');
    expect(m.caret).toBe(3);
    expect(m.id).toBe('a');
  });
  it('話者が違う・間にチップがあるとつなげない', () => {
    expect(mergePrev([L('a', 'p', 'x'), L('b', 'q', 'y')], 'b')).toBeNull();
    expect(mergePrev([L('a', 'p', 'x'), ma('m'), L('b', 'p', 'y')], 'b')).toBeNull();
  });
});

describe('ひな形', () => {
  const cast = chichiDoc().cast;
  it('漫才は出囃子で出て、締めてハケる。cursor はつかみの後', () => {
    const t = templateFor('漫才', cast, 'サレルロブロ')!;
    expect(t.items[t.cursor]).toMatchObject({ t: 'line', x: 'よろしくお願いしますー' });
    expect(t.items.at(-1)).toMatchObject({ t: 'light', on: false });
    expect(t.items.some((it) => it.t === 'line' && it.x.includes('サレルロブロ'))).toBe(true);
  });
  it('コントは板付き→明転…暗転', () => {
    const t = templateFor('コント', cast)!;
    expect(t.items[t.cursor]).toMatchObject({ t: 'light', on: true });
    expect(t.items.slice(0, t.cursor).every((it) => it.t === 'move')).toBe(true);
    expect(groupRows(t.items)).toHaveLength(1);
  });
});

describe('すぐ書く', () => {
  it('ユニットが無ければ作り、役は A・B', () => {
    const r = quickScript([], '漫才');
    expect(r.units).toHaveLength(1);
    expect(r.script.unitId).toBe(r.unit.id);
    expect(r.script.characters.map((c) => c.name)).toEqual(['A', 'B']);
  });
  it('演者がいればその名前。ピンは1人', () => {
    const u = { id: 'u', name: 'x', performers: [{ id: 'p1', name: '田中' }, { id: 'p2', name: '佐藤' }] };
    expect(quickScript([u], 'コント').script.characters.map((c) => c.name)).toEqual(['田中', '佐藤']);
    expect(quickScript([u], 'ピン').script.characters.map((c) => c.name)).toEqual(['田中']);
  });
});
