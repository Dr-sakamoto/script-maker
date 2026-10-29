import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { castFromCharacters, charactersFromImport, soundsFromImport } from '../bridge';
import { chichiDoc } from '../chichi';
import { exportScript } from '../export';
import { parseScriptText } from '../importText';
import { decodeText, docxToText, docxXmlToText } from '../scriptFile';
import type { Doc, Item } from '../types';

const kinds = (items: Item[]) => items.map((it) => it.t).join(' ');

describe('既存の台本（文章）を読み込む', () => {
  it('この画面の書き出しを読み込むと、同じ書き出しに戻る', () => {
    const d = chichiDoc();
    for (const marks of [true, false])
      for (const time of [true, false]) {
        const text = exportScript(d, { marks, time });
        const r = parseScriptText(text, d.cast);
        expect(r.added).toEqual([]);
        expect(r.title).toBe('父');
        expect(r.genre).toBe('コント');
        expect(r.unit).toBe('サレルロブロ');
        expect(exportScript({ ...d, cast: r.cast, items: r.items }, { marks, time })).toBe(text);
      }
  });

  it('役が無い台本でも、書き出しから役（人形・声の小道具）を起こせる', () => {
    const d = chichiDoc();
    const text = exportScript(d, { marks: false, time: false });
    const r = parseScriptText(text);
    expect(r.cast.map((c) => c.name)).toEqual(['親父', '母親']);
    const again: Doc = { ...d, cast: r.cast, items: r.items };
    expect(exportScript(again, { marks: false, time: false })).toBe(text);
  });

  it('Word でよくある書き方（名前：セリフ・「」・（ト書き）・暗転）', () => {
    const r = parseScriptText(
      [
        'タイトル：コンビニ',
        '登場人物：店員、客',
        '',
        '明転',
        '（店員、レジに立っている）',
        '客：すみません',
        '店員「いらっしゃいませ',
        'ようこそ」',
        '（間）',
        '「…どうしました？」',
        'SE：ドアチャイム',
        'M1 C.I',
        '暗転',
      ].join('\n'),
    );
    expect(r.title).toBe('コンビニ');
    expect(r.cast.map((c) => c.name)).toEqual(['店員', '客']);
    const [ten, kyaku] = r.cast.map((c) => c.id);
    // しゃべる二人は板付きになり、そのあと明転
    expect(kinds(r.items)).toBe('move move light act line line ma line se cue light');
    expect(r.items[3]).toMatchObject({ t: 'act', w: ten, x: 'レジに立っている' });
    expect(r.items[4]).toMatchObject({ t: 'line', w: kyaku, x: 'すみません' });
    expect(r.items[5]).toMatchObject({ t: 'line', w: ten, x: 'いらっしゃいませようこそ' });
    // 名前の無い「」は直前の話者
    expect(r.items[7]).toMatchObject({ t: 'line', w: ten });
    expect(r.items[9]).toMatchObject({ t: 'cue', n: 1, op: 'C.I' });
    expect(r.items[10]).toMatchObject({ t: 'light', on: false });
  });

  it('空白区切りは、何度も出てくる名前だけ話者にする', () => {
    const r = parseScriptText(['A　どうもー', 'B　どうもー', 'A　いやあ', 'B　ほんで', 'A　はい', 'B　ちゃうねん', '舞台中央　机がある'].join('\n'));
    expect(r.cast.map((c) => c.name)).toEqual(['A', 'B']);
    expect(r.items.filter((it) => it.t === 'line')).toHaveLength(6);
    expect(r.items.at(-1)).toMatchObject({ t: 'act', x: '舞台中央　机がある' });
  });

  it('読めない行も（動き）として残す。【】の中のわからない指示も', () => {
    const r = parseScriptText('【暗転中に机を出す】\nここで客席を見る');
    expect(r.items).toMatchObject([
      { t: 'act', x: '暗転中に机を出す' },
      { t: 'act', x: 'ここで客席を見る' },
    ]);
  });

  it('見出しの「作：」は話者にしない', () => {
    const r = parseScriptText('作：山田\n山田「どうも」');
    expect(r.items.filter((it) => it.t === 'line')).toHaveLength(1);
    expect(r.items.some((it) => it.t === 'line' && it.x === '山田')).toBe(false);
  });
});

/** テスト用の最小の zip（deflate） */
function zip(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, body] of Object.entries(files)) {
    const n = enc.encode(name);
    const data = new Uint8Array(deflateRawSync(enc.encode(body)));
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(8, 8, true);
    lh.setUint32(18, data.length, true);
    lh.setUint16(26, n.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(10, 8, true);
    ch.setUint32(20, data.length, true);
    ch.setUint16(28, n.length, true);
    ch.setUint32(42, offset, true);
    locals.push(new Uint8Array(lh.buffer), n, data);
    centrals.push(new Uint8Array(ch.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const cdSize = centrals.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out.buffer;
}

describe('ファイル', () => {
  const xml =
    '<w:document><w:body>' +
    '<w:p><w:r><w:t>親父「おう</w:t></w:r><w:r><w:t xml:space="preserve">、帰ったか」</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>母親</w:t><w:tab/><w:t>&lt;ただいま&gt;</w:t></w:r></w:p>' +
    '<w:p/>' +
    '</w:body></w:document>';

  it('Word の段落を行に、タブはタブにする', () => {
    expect(docxXmlToText(xml)).toBe('親父「おう、帰ったか」\n母親\t<ただいま>\n');
  });

  it('.docx（zip）から本文を取り出す', async () => {
    const text = await docxToText(zip({ '[Content_Types].xml': '<x/>', 'word/document.xml': xml }));
    const r = parseScriptText(text);
    expect(r.items.filter((it) => it.t === 'line')).toMatchObject([{ x: 'おう、帰ったか' }, { x: '<ただいま>' }]);
  });

  it('Shift_JIS のテキストも読める', () => {
    // 「暗転」の Shift_JIS
    const sjis = new Uint8Array([0x88, 0xc3, 0x93, 0x5d]);
    expect(decodeText(sjis.buffer)).toBe('暗転');
  });
});

describe('新規台本の設定に落とし込む', () => {
  it('仮の「演者A」は使われなければ外し、読み込んだ役を足す。音源も起こす', () => {
    const prev = [{ id: 'a', name: '演者A', performerId: '', costume: '' }];
    const r = parseScriptText('【音源①】C.I『出囃子』\n店員「いらっしゃいませ」', castFromCharacters(prev));
    const chars = charactersFromImport(prev, r);
    expect(chars.map((c) => c.name)).toEqual(['店員']);
    expect(soundsFromImport([], r.items, 'u')).toMatchObject([{ index: 1, name: '出囃子', unitId: 'u' }]);
  });

  it('名前の一致する登場人物はそのまま（配役を残す）', () => {
    const prev = [{ id: 'k', name: '客', performerId: 'p1', costume: '青' }];
    const r = parseScriptText('客：すみません', castFromCharacters(prev));
    expect(charactersFromImport(prev, r)).toEqual(prev);
  });
});
