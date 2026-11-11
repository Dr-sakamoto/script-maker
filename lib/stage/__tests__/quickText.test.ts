import { describe, expect, it } from 'vitest';
import { fixQuick, parseQuick, speakersBefore } from '../quickText';
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

describe('まとめ書き：雑に打った文章', () => {
  it('改行していなくても、空白で話者を替える', () => {
    const r = parseQuick('どうも　お願いします　いきなりだけど', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:どうも', 'b:お願いします', 'a:いきなりだけど']);
    expect(r.rows).toEqual([{ line: 0, seg: 0 }, { line: 0, seg: 1 }, { line: 0, seg: 2 }]);
  });

  it('長い文のかたまりは「。！？」でも分ける。短い行は1人が続けて話したものと見る', () => {
    const blob = 'どうもよろしくお願いします。いきなりだけどラーメン屋やりたいんだよね。急だな！まあいいけど付き合うよ。';
    expect(show(parseQuick(blob, cast, { first: 'a' }).items)).toEqual([
      'a:どうもよろしくお願いします。',
      'b:いきなりだけどラーメン屋やりたいんだよね。',
      'a:急だな！',
      'b:まあいいけど付き合うよ。',
    ]);
    expect(show(parseQuick('なんでだよ！おかしいだろ。', cast, { first: 'a' }).items)).toEqual(['a:なんでだよ！おかしいだろ。']);
  });

  it('かたまりの中の照明・間・ト書きも拾う', () => {
    const r = parseQuick('どうも　間　ボケが椅子に座る　ツッコミ、立ち上がる。　ありがとうございました　暗転', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:どうも', 'ma1', '(a椅子に座る)', '(b立ち上がる)', 'b:ありがとうございました', 'light']);
  });

  it('役名で始まっても、セリフらしいものはセリフのまま', () => {
    const r = parseQuick('ボケが悪いんだろ！\nツッコミは俺？', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:ボケが悪いんだろ！', 'b:ツッコミは俺？']);
  });

  it('書式のある行は分けない', () => {
    const r = parseQuick('（ボケ、立つ。　そして座る）\n1 どうも　ボケです', cast, { first: 'b' });
    expect(show(r.items)).toEqual(['(a立つ。　そして座る)', 'a:どうも　ボケです']);
  });
});

describe('まとめ書き：割り振りを直す', () => {
  const ctx = { first: 'a' };
  const after = (text: string) => show(parseQuick(text, cast, ctx).items);

  it('話者を替えると、続きの交代もそれに合わせて変わる', () => {
    const t = fixQuick('どうも　ボケです　ツッコミです　お願いします', cast, ctx, 1, 'speaker')!;
    expect(t).toBe('どうも\n　ボケです\nツッコミです\nお願いします');
    expect(after(t)).toEqual(['a:どうも', 'a:ボケです', 'b:ツッコミです', 'a:お願いします']);
    // もう一度替えると元の話者に戻る
    expect(after(fixQuick(t, cast, ctx, 1, 'speaker')!)).toEqual(['a:どうも', 'b:ボケです', 'a:ツッコミです', 'b:お願いします']);
  });

  it('最初の行は番号で決める', () => {
    const t = fixQuick('どうも\nはい', cast, ctx, 0, 'speaker')!;
    expect(t).toBe('2 どうも\nはい');
    expect(after(t)).toEqual(['b:どうも', 'a:はい']);
  });

  it('セリフ ⇔ 動き', () => {
    const t = fixQuick('どうも\n椅子に座る', cast, ctx, 1, 'kind')!;
    expect(t).toBe('どうも\n（椅子に座る）');
    expect(after(t)).toEqual(['a:どうも', '(椅子に座る)']);
    expect(after(fixQuick(t, cast, ctx, 1, 'kind')!)).toEqual(['a:どうも', 'b:椅子に座る']);
    // 動きに見えてしまったセリフを、セリフに決める
    const u = fixQuick('ツッコミは俺がやる', cast, ctx, 0, 'kind')!;
    expect(u).toBe('「ツッコミは俺がやる」');
    expect(after(u)).toEqual(['a:ツッコミは俺がやる']);
  });

  it('前の行につなぐ（同じ行の中・行をまたいで）', () => {
    expect(fixQuick('どうも　ボケです　ツッコミです', cast, ctx, 1, 'join')).toBe('どうもボケです\nツッコミです');
    expect(fixQuick('どうも\nボケです\nツッコミです', cast, ctx, 2, 'join')).toBe('どうも\nボケですツッコミです');
    expect(fixQuick('（座る）\nそして立つ', cast, ctx, 1, 'join')).toBe('（座るそして立つ）');
    expect(fixQuick('どうも', cast, ctx, 0, 'join')).toBeNull();
  });

  it('照明や間は直す対象にしない', () => {
    expect(fixQuick('暗転', cast, ctx, 0, 'speaker')).toBeNull();
  });
});
