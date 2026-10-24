import { describe, expect, it } from 'vitest';
import { layoutLabels, overlaps, type Label } from '../layout';

describe('吹き出しと（動き）の被り', () => {
  it('近づいた2人のラベルが重ならない', () => {
    const ls: Label[] = [
      { id: 'b', kind: 'bubble', speaking: true, x: 210, y: 100, w: 160, h: 40 },
      { id: 'a1', kind: 'act', speaking: true, x: 200, y: 140, w: 120, h: 22 },
      { id: 'a2', kind: 'act', speaking: false, x: 230, y: 140, w: 120, h: 22 },
    ];
    const r = layoutLabels(ls);
    expect(r.a1).toEqual({ l: 140, r: 260, t: 118, b: 140 }); // 話者の動きは元の位置
    expect(r.a2.b).toBeLessThan(r.a1.t); // もう一人は上へ
    const ids = Object.keys(r);
    for (const x of ids) for (const y of ids) if (x < y) expect(overlaps(r[x], r[y])).toBe(false);
  });

  it('離れていれば動かさない', () => {
    const r = layoutLabels([
      { id: 'a1', kind: 'act', speaking: false, x: 50, y: 100, w: 60, h: 20 },
      { id: 'a2', kind: 'act', speaking: false, x: 300, y: 100, w: 60, h: 20 },
    ]);
    expect(r.a1.b).toBe(100);
    expect(r.a2.b).toBe(100);
  });
});
