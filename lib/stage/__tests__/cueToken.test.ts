import { describe, expect, it } from 'vitest';
import { cueWarnings } from '../cueToken';
import { parseQuick } from '../quickText';
import type { CastMember, Doc, Item } from '../types';
import { docToText, textToItems } from '../writeText';

const cast: CastMember[] = [
  { id: 'a', name: 'ボケ', short: 'ボ', color: '#f00', kind: 'puppet' },
  { id: 'b', name: 'ツッコミ', short: 'ツ', color: '#00f', kind: 'puppet' },
];
const strip = (xs: Item[]) => xs.map(({ id: _id, ...o }) => o);
const one = (t: string) => strip(parseQuick(t, cast, { first: 'a' }).items);

describe('・m1（音源）・・l（照明）', () => {
  it('吹き出しで選んだ向き・秒数（後ろの i/o と数字）。秒数なし＝カット', () => {
    expect(one('・m1i')).toEqual([{ t: 'cue', n: 1, op: 'C.I' }]);
    expect(one('・ｍ１お５')).toEqual([{ t: 'cue', n: 1, op: 'F.O', sec: 5 }]);
    expect(one('・l1i0')).toEqual([{ t: 'light', on: true }]);
    expect(one('・lo3')).toEqual([{ t: 'light', on: false, fade: 3 }]);
    expect(one('・m2i3『出囃子』')).toEqual([{ t: 'cue', n: 2, op: 'F.I', sec: 3, x: '出囃子' }]);
  });

  it('向きを書いていなければ、そこまでの流れで決める（暗ければ明転・流れていればアウト）', () => {
    expect(one('・l\n・l\n・m1\n・m1').map((i) => ('on' in i ? i.on : 'op' in i ? i.op : ''))).toEqual([true, false, 'C.I', 'C.O']);
  });

  it('同じ行に書くと、その前の文字（セリフ・動き・演技のメモ）がきっかけ', () => {
    expect(one('しね！＠銃を撃つ・m1o5')).toEqual([
      { t: 'line', w: 'a', x: 'しね！（銃を撃つ）' },
      { t: 'cue', n: 1, op: 'F.O', sec: 5, k: '（銃を撃つ）' },
    ]);
    expect(one('あさだな・ｌ１i＠のびをする')).toEqual([
      { t: 'line', w: 'a', x: 'あさだな（のびをする）' },
      { t: 'light', on: true, k: 'あさだな' },
    ]);
    // 行頭に書いたときは、きっかけなし。文の中の / や ・ はそのまま
    expect(one('・l')).toEqual([{ t: 'light', on: true }]);
    expect(one('1/2の確率・まじで')).toEqual([{ t: 'line', w: 'a', x: '1/2の確率・まじで' }]);
  });

  it('文章に戻しても、同じ行・きっかけのまま', () => {
    const empty: Doc = { id: 'd', unit: '', genre: '', title: '', cast, items: [], updatedAt: 0 };
    // 行頭に書いた音源・照明（きっかけなし）は、これまでどおり【】の行に戻る
    const cases: [string, string][] = [
      ['しね！＠銃を撃つ・m1o5', 'しね！＠銃を撃つ・m1o5'],
      ['あさだな・li＠のびをする', 'あさだな・li＠のびをする'],
      ['・m1i\nどうも・m1o・li\n@座る・lo3', '【音源①】C.I\nどうも・m1o・li\n@座る・lo3'],
    ];
    for (const [t, back] of cases) {
      const r = textToItems(t, empty, docToText(empty).synced);
      const w = docToText({ ...empty, items: r.items });
      expect(w.text).toBe(back);
      expect(strip(textToItems(w.text, empty, docToText(empty).synced).items)).toEqual(strip(r.items));
    }
  });

  it('矛盾を指摘する', () => {
    const msgs = (t: string) => cueWarnings(parseQuick(t, cast, { first: 'a' }).items).map((w) => w.msg);
    expect(msgs('・li\n・li')).toEqual(['明転が二回になっています']);
    expect(msgs('・lo')).toEqual(['まだ明転していないのに暗転しています']);
    expect(msgs('・m1o')).toEqual(['音源①の流し始めが記述されていません']);
    expect(msgs('・m1i\n・m1i')).toEqual(['音源①がもう流れています（インが二回になっています）']);
    expect(msgs('・m1i\n・m1o\n・m1o')).toEqual(['音源①はもう止まっています（アウトが二回になっています）']);
    expect(msgs('・li\n・m1i\n・m1o\n・lo')).toEqual([]);
  });
});
