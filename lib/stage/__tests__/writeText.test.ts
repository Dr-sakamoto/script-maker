import { describe, expect, it } from 'vitest';
import { chichiDoc } from '../chichi';
import type { CastMember, Doc, Item } from '../types';
import { docToText, firstInCast, joinPrev, setSpeaker, swapFirst, textToItems, toggleKind } from '../writeText';

const cast: CastMember[] = [
  { id: 'a', name: 'ボケ', short: 'ボ', color: '#111', kind: 'puppet' },
  { id: 'b', name: 'ツッコミ', short: 'ツ', color: '#222', kind: 'puppet' },
  { id: 'c', name: '店員', short: '店', color: '#333', kind: 'puppet' },
  { id: 'e', name: '卵', short: '卵', color: '#444', kind: 'prop' },
];
const doc = (items: Item[]): Doc => ({ id: 'd', unit: '', genre: 'コント', title: 't', cast, items, updatedAt: 0 });
/** 文章にしてから、一から読み直す（同期の記録を使わない） */
const reread = (d: Doc) => {
  const { text } = docToText(d);
  return { text, items: textToItems(text, d, { lines: [], byLine: [] }).items };
};
const show = (items: Item[]) => items.map((it) => (it.t === 'line' ? `${it.w}:${it.x}` : it.t === 'act' ? `(${it.w ?? ''}${it.x})` : it.t));
const strip = (items: Item[]) => items.map(({ id: _, ...it }) => it);

describe('かく：台本 → 文章', () => {
  it('セリフの書き方：交代は何も付けず、続けて話すは行頭の空白、それ以外は番号。動きは @', () => {
    const d = doc([
      { id: '1', t: 'line', w: 'a', x: 'どうも' },
      { id: '2', t: 'line', w: 'b', x: 'お願いします' },
      { id: '3', t: 'line', w: 'b', x: 'いきなりだけど' },
      { id: '4', t: 'line', w: 'c', x: 'いらっしゃいませ' },
      { id: '5', t: 'line', w: 'a', x: 'ラーメン' },
      { id: '6', t: 'line', w: 'e', x: 'ピヨ' },
      { id: '7', t: 'act', w: 'a', x: '座る' },
      { id: '8', t: 'act', x: '二人　顔を見合わせる' },
    ]);
    const r = reread(d);
    expect(r.text.split('\n')).toEqual(['どうも', 'お願いします', '　いきなりだけど', '3 いらっしゃいませ', '1 ラーメン', '4 ピヨ', '@ボケ、座る', '@二人　顔を見合わせる']);
    expect(strip(r.items)).toEqual(strip(d.items));
  });

  it('そのままだと別の意味に読める文は番号付き。注は名前付き', () => {
    const d = doc([
      { id: '1', t: 'line', w: 'a', x: 'いや　ちがう' },
      { id: '2', t: 'line', w: 'b', x: 'ボケが悪い' },
      { id: '3', t: 'line', w: 'a', x: '1番です' },
      { id: '4', t: 'line', w: 'b', x: '暗転だ' },
      { id: '5', t: 'line', w: 'a', x: '結論：やめとけ' },
      { id: '6', t: 'line', w: 'b', x: 'え', n: '小声で' },
    ]);
    const r = reread(d);
    expect(r.text.split('\n')).toEqual(['1 いや　ちがう', '2 ボケが悪い', '1 1番です', '2 暗転だ', '1 結論：やめとけ', 'ツッコミ「え」（小声で）']);
    expect(strip(r.items)).toEqual(strip(d.items));
  });

  it('サンプルの台本も、一から読み直して同じ形に戻る（出ハケ・照明・音響）', () => {
    const d = chichiDoc();
    const r = reread(d);
    expect(r.text).toContain('【板付き】');
    expect(show(r.items)).toEqual(show(d.items));
  });
});

describe('かく：文章 → 台本（打つたび）', () => {
  const d = doc([
    { id: 'm1', t: 'move', w: 'a', in: true, x: 22 },
    { id: 'l1', t: 'line', w: 'a', x: 'どうも' },
    { id: 'l2', t: 'line', w: 'b', x: 'はい' },
    { id: 'l3', t: 'line', w: 'a', x: 'それで' },
  ]);
  const w = docToText(d);

  it('書き換えていない行は元の項目のまま（細かい位置も）', () => {
    const r = textToItems(w.text, d, w.synced);
    expect(r.items).toEqual(d.items);
  });

  it('途中に1行足しても、後ろの割り振りはずれない', () => {
    const lines = w.text.split('\n');
    lines.splice(2, 0, 'なんだよ');
    const r = textToItems(lines.join('\n'), d, w.synced);
    expect(show(r.items)).toEqual(['move', 'a:どうも', 'b:なんだよ', 'b:はい', 'a:それで']);
    expect(r.items.filter((it) => it.id.length === 2).map((it) => it.id)).toEqual(['m1', 'l1', 'l2', 'l3']);
  });

  it('1行を打ち直したら、その行だけ読み直す（id は引き継ぐ）', () => {
    const r = textToItems(w.text.replace('はい', 'はいはい'), d, w.synced);
    expect(show(r.items)).toEqual(['move', 'a:どうも', 'b:はいはい', 'a:それで']);
    expect(r.items[2].id).toBe('l2');
    // 続けて打っても、その前の同期から読む
    const r2 = textToItems(w.text.replace('はい', 'はいはいはい'), { ...d, items: r.items }, r.synced);
    expect(show(r2.items)).toEqual(['move', 'a:どうも', 'b:はいはいはい', 'a:それで']);
  });

  it('行を消すと、その項目だけ消える', () => {
    const r = textToItems(w.text.replace('\nはい', ''), d, w.synced);
    expect(show(r.items)).toEqual(['move', 'a:どうも', 'a:それで']);
  });
});

describe('かく：プレビューから直す（その行だけ）', () => {
  const items: Item[] = [
    { id: '1', t: 'line', w: 'a', x: 'どうも' },
    { id: '2', t: 'act', x: '座る' },
    { id: '3', t: 'line', w: 'b', x: 'はい' },
    { id: '4', t: 'line', w: 'a', x: 'それで' },
  ];
  it('話者を替える', () => {
    expect(show(setSpeaker(items, '3', 'c'))).toEqual(['a:どうも', '(座る)', 'c:はい', 'a:それで']);
  });
  it('セリフ ⇔ 動き。ほかの行の割り振りは動かない', () => {
    expect(show(toggleKind(cast, items, '2'))).toEqual(['a:どうも', 'b:座る', 'b:はい', 'a:それで']);
    expect(show(toggleKind(cast, items, '3'))).toEqual(['a:どうも', '(座る)', '(はい)', 'a:それで']);
  });
  it('前の行につなぐ', () => {
    expect(show(joinPrev(items, '4'))).toEqual(['a:どうも', '(座る)', 'b:はいそれで']);
    expect(joinPrev(items, '1')).toBe(items);
  });
  it('最初に話す人を替えると、全部のセリフで入れ替わる', () => {
    expect(show(swapFirst(items, 'b'))).toEqual(['b:どうも', '(座る)', 'a:はい', 'b:それで']);
  });
  it('最初：セリフが無いときは役の並びを入れ替える', () => {
    expect(firstInCast(cast, [], 'b')?.map((c) => c.id)).toEqual(['b', 'a', 'c', 'e']);
    expect(firstInCast(cast, [], 'a')).toBeNull();
    expect(firstInCast(cast, [], 'e')).toBeNull();
    expect(firstInCast(cast, [{ id: '1', t: 'line', w: 'a', x: 'どうも' }], 'b')).toBeNull();
  });
});
