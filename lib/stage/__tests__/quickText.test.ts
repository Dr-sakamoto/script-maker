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

  it('ト書き・照明・音響', () => {
    const r = parseQuick('（ボケ、座る\n(笑う)\n暗転\nSE：拍手\n【じわ明転 3秒】', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['(a座る)', '(笑う)', 'light', 'se', 'light']);
    expect(r.items[4]).toMatchObject({ on: true, fade: 3 });
  });

  it('知らない名前の「：」・「…」は役にしない（役は「＋」で足す）。知っている名前の 名前「…」はその役', () => {
    const r = parseQuick('結論：やめとけ\n10:30に集合\n客「すみません」\nボケ「はい」', cast, { first: 'a' });
    expect(r.items.slice(0, 3).map((it) => (it.t === 'line' ? it.x : ''))).toEqual(['結論：やめとけ', '10:30に集合', '客「すみません」']);
    expect(r.added).toHaveLength(0);
    expect(r.cast).toHaveLength(cast.length);
    expect(r.items[3]).toMatchObject({ t: 'line', x: 'はい' });
  });

  it('見出しに見える行も捨てない。板付き・明転は足さない', () => {
    const r = parseQuick('衣装：スーツ\n「え', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:衣装：スーツ', 'b:「え']);
  });

  it('行頭の @ はト書き（括弧を打たなくていい）', () => {
    const r = parseQuick('どうも\n@ボケ、座る\n＠笑う　なんで\n、そうだね\n、、', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:どうも', '(a座る)', '(笑う)', 'a:なんで', 'b:、そうだね', 'a:……']);
    // 行頭の @ は次の空白までが動き。そのあとは、同じ人のセリフに戻る
    expect(show(parseQuick('@二人　顔を見合わせる', cast, { first: 'a' }).items)).toEqual(['(二人)', 'a:顔を見合わせる']);
  });

  it('行の途中の @ は直前のセリフの（ ）。別の動きになるのは行頭の @ だけ。^ は途中でも新しい音', () => {
    expect(show(parseQuick('どうも@座る　疲れた', cast, { first: 'a' }).items)).toEqual(['a:どうも（座る）', 'a:疲れた']);
    expect(show(parseQuick('もう！だからおれじゃないってぇ　りゅうきがいっただけじゃん＠なく', cast, { first: 'a' }).items)).toEqual(['a:もう！だからおれじゃないってぇ', 'a:りゅうきがいっただけじゃん（なく）']);
    expect(show(parseQuick('りゅうきが＠なく＠笑う', cast, { first: 'a' }).items)).toEqual(['a:りゅうきが（なく）（笑う）']);
    expect(show(parseQuick('りゅうきが\n＠なく', cast, { first: 'a' }).items)).toEqual(['a:りゅうきが', '(なく)']);
    const r = parseQuick('どうも ^拍手 ありがとう\nはい^2 出囃子', cast, { first: 'a' });
    expect(r.items.map((it) => it.t)).toEqual(['line', 'se', 'line', 'line', 'cue']);
    expect(r.items[1]).toMatchObject({ t: 'se', x: '拍手' });
    expect(r.items[4]).toMatchObject({ t: 'cue', n: 2 });
  });

  it('行頭の ^ は音：番号があれば音源、なければ SE', () => {
    const r = parseQuick('^1\n^2 出囃子\n＾１ fo 3秒\n^2 c.o\n^拍手', cast, { first: 'a' });
    expect(r.items.map(({ id: _, ...it }) => it)).toEqual([
      { t: 'cue', n: 1, op: 'C.I' },
      { t: 'cue', n: 2, op: 'C.I', x: '出囃子' },
      { t: 'cue', n: 1, op: 'F.O', sec: 3 },
      { t: 'cue', n: 2, op: 'C.O' },
      { t: 'se', x: '拍手' },
    ]);
  });

  it('「、、」は打った数だけ「…」になる。それだけの行も間にはせずセリフ', () => {
    const r = parseQuick('いや、、なんで\n、、\n@ボケ、黙る、、\nそう、まあ', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:いや……なんで', 'b:……', '(a黙る……)', 'a:そう、まあ']);
    expect(show(parseQuick('え、、、、うそ', cast, { first: 'a' }).items)).toEqual(['a:え…………うそ']);
  });

  it('話し始める人を選ぶと、直前の話者より優先する', () => {
    const before = { prev: 'a', prev2: 'b' } as const;
    expect(show(parseQuick('どうも\nはい', cast, { first: 'a', ...before }).items)).toEqual(['b:どうも', 'a:はい']);
    expect(show(parseQuick('どうも\nはい', cast, { first: 'a', ...before, start: 'a' }).items)).toEqual(['a:どうも', 'b:はい']);
    expect(show(parseQuick('いらっしゃい\nえ\nはい', three, { first: 'a', start: 'c' }).items)).toEqual(['c:いらっしゃい', 'a:え', 'c:はい']);
  });

  it('その前の話者がいないときは、先に登録した役から（あとで足した役が割り込まない）', () => {
    expect(show(parseQuick('はい', three, { first: 'a', prev: 'b' }).items)).toEqual(['a:はい']);
    expect(show(parseQuick('はい', three, { first: 'a', prev: 'a' }).items)).toEqual(['b:はい']);
  });

  it('ピンは同じ人が話し続ける', () => {
    const r = parseQuick('どうも\n今日は', cast.slice(0, 1), { first: 'a' });
    expect(show(r.items)).toEqual(['a:どうも', 'a:今日は']);
  });
});

describe('まとめ書き：雑に打った文章', () => {
  it('行の途中の空白も、同じ人が続けて話す（交代は改行だけ）', () => {
    const r = parseQuick('どうも　お願いします　いきなりだけど\nなに', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:どうも', 'a:お願いします', 'a:いきなりだけど', 'b:なに']);
    expect(r.rows).toEqual([{ line: 0, seg: 0 }, { line: 0, seg: 1 }, { line: 0, seg: 2 }, { line: 1, seg: 0 }]);
  });

  it('句点では分けない', () => {
    const blob = 'どうもよろしくお願いします。いきなりだけどラーメン屋やりたいんだよね。急だな！まあいいけど付き合うよ。';
    expect(show(parseQuick(blob, cast, { first: 'a' }).items)).toEqual([`a:${blob}`]);
  });

  it('かたまりの中の照明・ト書きも拾う', () => {
    const r = parseQuick('どうも　ボケが椅子に座る　ツッコミ、立ち上がる。　ありがとうございました　暗転', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:どうも', '(a椅子に座る)', '(b立ち上がる)', 'a:ありがとうございました', 'light']);
  });

  it('役名で始まっても、セリフらしいものはセリフのまま', () => {
    const r = parseQuick('ボケが悪いんだろ！\nツッコミは俺？', cast, { first: 'a' });
    expect(show(r.items)).toEqual(['a:ボケが悪いんだろ！', 'b:ツッコミは俺？']);
  });

  it('（ ）の行は分けない。番号の行は、番号を最初に残して分ける（＠ も効く）', () => {
    const r = parseQuick('（ボケ、立つ。　そして座る）\n1 どうも　ボケです＠頭をかく', cast, { first: 'b' });
    expect(show(r.items)).toEqual(['(a立つ。　そして座る)', 'a:どうも', 'a:ボケです（頭をかく）']);
    expect(show(parseQuick('2 もう！だからおれじゃないってぇ　りゅうきがいっただけじゃん＠なく', cast, { first: 'a' }).items)).toEqual(['b:もう！だからおれじゃないってぇ', 'b:りゅうきがいっただけじゃん（なく）']);
  });
  it('照明・音源のショートカット：数字なしはカット、数字を付けたときだけ秒数かけてじわ・フェード', () => {
    const one = (t: string) => parseQuick(t, cast, { first: 'a' }).items.map(({ id: _id, ...o }) => o);
    // 照明（数字なし）：m・い＝明転、あ＝暗転
    expect(one('＾ｍ')).toEqual([{ t: 'light', on: true }]);
    expect(one('^い')).toEqual([{ t: 'light', on: true }]);
    expect(one('＾あ')).toEqual([{ t: 'light', on: false }]);
    expect(one('^あ5')).toEqual([{ t: 'light', on: false, fade: 5 }]);
    // 音源（数字あり）：1い＝イン、1あ＝アウト、後ろの数字＝秒数
    expect(one('＾１い')).toEqual([{ t: 'cue', n: 1, op: 'C.I' }]);
    expect(one('＾１い５')).toEqual([{ t: 'cue', n: 1, op: 'F.I', sec: 5 }]);
    expect(one('＾１あ')).toEqual([{ t: 'cue', n: 1, op: 'C.O' }]);
    expect(one('^1あ2.5秒')).toEqual([{ t: 'cue', n: 1, op: 'F.O', sec: 2.5 }]);
    expect(one('^15い')).toEqual([{ t: 'cue', n: 15, op: 'C.I' }]);
    // これまでの書き方・名前付き・SE はそのまま
    expect(one('^1 fo 3秒')).toEqual([{ t: 'cue', n: 1, op: 'F.O', sec: 3 }]);
    expect(one('^2 出囃子')).toEqual([{ t: 'cue', n: 2, op: 'C.I', x: '出囃子' }]);
    expect(one('^あいう')).toEqual([{ t: 'se', x: 'あいう' }]);
    // 言葉でも：明転・暗転・音源1（数字を付けたときだけじわ・フェード）。ジョジョ＝徐々
    expect(one('明転5')).toEqual([{ t: 'light', on: true, fade: 5 }]);
    expect(one('ジョジョ暗転')).toEqual([{ t: 'light', on: false, fade: 3 }]);
    expect(one('音源①')).toEqual([{ t: 'cue', n: 1, op: 'C.I' }]);
    expect(one('音源1 5秒')).toEqual([{ t: 'cue', n: 1, op: 'F.I', sec: 5 }]);
    // M1（M-1）はセリフのまま
    expect(one('M1')).toEqual([{ t: 'line', w: 'a', x: 'M1' }]);
  });
});
