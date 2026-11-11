import { describe, expect, it } from 'vitest';
import { parseQuick, speakersBefore } from '../quickText';
import type { CastMember, Item } from '../types';

const cast: CastMember[] = [
  { id: 'a', name: 'ボケ', short: 'ボ', color: '#111', kind: 'puppet' },
  { id: 'b', name: 'ツッコミ', short: 'ツ', color: '#222', kind: 'puppet' },
];
const three: CastMember[] = [...cast, { id: 'c', name: '店員', short: '店', color: '#333', kind: 'puppet' }];
const show = (items: Item[]) =>
  items.map((it) => (it.t === 'line' ? `${it.w}:${it.x}` : it.t === 'act' ? `(${it.w ?? ''}${it.x})` : it.t === 'ma' ? `ma${it.s}` : it.t));

describe('まとめ書き', () => {
  it('何も付けない行はセリフ。話者は交代する', () => {
    const r = parseQuick('どうも\nお願いします\nいきなりだけど\n\nなに', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:どうも', 'b:お願いします', 'a:いきなりだけど', 'b:なに']);
    expect(r.next).toBe('a');
    expect(r.added).toEqual([]);
  });

  it('行頭に空白を入れると、同じ人が続けて話す', () => {
    const r = parseQuick('どうも\n　ボケです\nツッコミです', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:どうも', 'a:ボケです', 'b:ツッコミです']);
  });

  it('差し込む位置までの話者から続ける', () => {
    const before: Item[] = [
      { id: '1', t: 'line', w: 'a', x: 'x' },
      { id: '2', t: 'light', on: true },
      { id: '3', t: 'line', w: 'b', x: 'y' },
      { id: '4', t: 'line', w: 'b', x: 'z' },
    ];
    expect(speakersBefore(before, 3)).toEqual({ prev: 'b', prev2: 'a' });
    expect(speakersBefore(before, 0)).toEqual({ prev: 'a' });
    expect(speakersBefore(before, -1)).toEqual({ prev: undefined });
    const r = parseQuick('つづき', cast, { first: 'b', ...speakersBefore(before, 3) });
    expect(show(r.items)).toEqual(['a:つづき']);
  });

  it('番号・名前で話者を決められる。3人でも直前の2人で交代する', () => {
    const r = parseQuick('3 いらっしゃいませ\nボケ：ラーメン\nえ\n店員「はい」\n１　もう一回', three, { first: 'a' });
    expect(show(r.items)).toEqual(['c:いらっしゃいませ', 'a:ラーメン', 'c:え', 'c:はい', 'a:もう一回']);
  });

  it('ト書き・間・照明・音響', () => {
    const r = parseQuick('（ボケ、座る\n(笑う)\n、、\n・・・\n暗転\nSE：拍手\n【じわ明転 3秒】', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['(a座る)', '(笑う)', 'ma1', 'ma2', 'light', 'se', 'light']);
    expect(r.items[6]).toMatchObject({ on: true, fade: 3 });
  });

  it('知らない名前の「：」は役にしない。名前「…」は役を足す', () => {
    const r = parseQuick('結論：やめとけ\n10:30に集合\n客「すみません」', cast, { first: 'a' });
    expect(r.items.slice(0, 2).map((it) => (it.t === 'line' ? it.x : ''))).toEqual(['結論：やめとけ', '10:30に集合']);
    expect(r.added).toHaveLength(1);
    expect(r.cast.at(-1)?.name).toBe('客');
    expect(r.items[2]).toMatchObject({ t: 'line', w: r.added[0], x: 'すみません' });
  });

  it('見出しに見える行も捨てない。板付き・明転は足さない', () => {
    const r = parseQuick('衣装：スーツ\n「え', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:衣装：スーツ', 'b:え']);
  });

  it('ピンは同じ人が話し続ける', () => {
    const r = parseQuick('どうも\n今日は', cast.slice(0, 1), { first: 'a' });
    expect(show(r.items)).toEqual(['a:どうも', 'a:今日は']);
  });
});
