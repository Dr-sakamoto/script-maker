import { describe, expect, it } from 'vitest';
import { chichiDoc } from '../chichi';
import { buildLanes, placeAt } from '../tracks';
import { timeline } from '../timing';
import type { CastMember } from '../types';

const lanesOf = () => {
  const d = chichiDoc();
  return { d, lanes: buildLanes(d), tl: timeline(d.items) };
};

describe('タイムラインの行', () => {
  it('人→全体→音→光→モノの順に並ぶ', () => {
    const { lanes } = lanesOf();
    expect(lanes.map((l) => l.id)).toEqual(['oyaji', 'haha', 'stage', 'snd:1', 'snd:5', 'light', 'pin:2', 'tamago']);
  });

  it('人の行：セリフ・動きの帯と、舞台にいる時間、出ハケの印', () => {
    const { lanes, tl } = lanesOf();
    const haha = lanes.find((l) => l.id === 'haha')!;
    expect(haha.clips.filter((c) => c.kind === 'line').map((c) => c.label)).toEqual(['ケンジ、もうすぐ着くらしいわ。', 'お父さん、今お醤油きれてて…']);
    const on = haha.clips.filter((c) => c.kind === 'on');
    // 板付き → ハケ、出 → 最後まで
    expect(on).toHaveLength(2);
    expect(on[0]).toMatchObject({ start: 0, endItemId: 'c07' });
    expect(on[1]).toMatchObject({ itemId: 'c09', end: tl.total });
    expect(haha.marks.map((m) => m.label)).toEqual(['板付', 'ハケ 上', '出', '→中']);
  });

  it('音の行：入れてから止めるまでの帯とフェード。止めるだけの音は印', () => {
    const { lanes, tl } = lanesOf();
    const s1 = lanes.find((l) => l.id === 'snd:1')!;
    expect(s1.label).toBe('♪1 頭蓋骨陥没音');
    expect(s1.clips[0]).toMatchObject({ kind: 'sound', itemId: 'c08', end: tl.total });
    const s5 = lanes.find((l) => l.id === 'snd:5')!;
    expect(s5.clips).toHaveLength(0);
    expect(s5.marks[0]).toMatchObject({ kind: 'cue', label: 'F.O' });
  });

  it('光の行：明るい間の帯（じわはフェード）', () => {
    const { lanes, tl } = lanesOf();
    expect(lanes.find((l) => l.id === 'light')!.clips[0]).toMatchObject({ itemId: 'c03', end: tl.total });
    expect(lanes.find((l) => l.id === 'pin:2')!.clips[0]).toMatchObject({ itemId: 'c12', fadeIn: 3 });
  });

  it('モノの行：持っている時間（最初から持っている卵）と、置いた時間', () => {
    const d = chichiDoc();
    const mirror: CastMember = { id: 'kagami', name: '鏡', short: '鏡', color: '#888', kind: 'prop' };
    d.cast.push(mirror);
    d.items.splice(4, 0, { id: 'h1', t: 'hold', w: 'kagami', by: 'oyaji' });
    d.items.splice(6, 0, { id: 'p1', t: 'move', w: 'kagami', in: true, x: 50 });
    const lanes = buildLanes(d);
    const egg = lanes.find((l) => l.id === 'tamago')!;
    expect(egg.clips[0]).toMatchObject({ kind: 'held', label: '親父が持つ', start: 0 });
    const k = lanes.find((l) => l.id === 'kagami')!;
    expect(k.clips.map((c) => [c.kind, c.itemId, c.endItemId])).toEqual([
      ['held', 'h1', 'p1'],
      ['on', 'p1', undefined],
    ]);
    expect(lanes.find((l) => l.id === 'oyaji')!.marks.map((m) => m.label)).toContain('✋鏡');
  });
});

describe('印をドラッグして時刻 t へ', () => {
  it('t を含む項目の前半なら前へ、後半なら後ろへ', () => {
    const d = chichiDoc();
    const rest = d.items.filter((x) => x.id !== 'c08');
    const tl = timeline(rest);
    const j = rest.findIndex((x) => x.id === 'c05');
    const early = placeAt(d.items, 'c08', tl.starts[j] + 0.01).map((x) => x.id);
    expect(early.indexOf('c08')).toBe(early.indexOf('c05') - 1);
    const late = placeAt(d.items, 'c08', tl.starts[j] + tl.durs[j] - 0.01).map((x) => x.id);
    expect(late.indexOf('c08')).toBe(late.indexOf('c05') + 1);
  });

  it('頭より前・終わりより後', () => {
    const d = chichiDoc();
    expect(placeAt(d.items, 'c08', -5)[0].id).toBe('c08');
    expect(placeAt(d.items, 'c08', 9999).at(-1)!.id).toBe('c08');
  });
});
