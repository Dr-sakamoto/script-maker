import { describe, expect, it } from 'vitest';
import { chichiDoc } from '../chichi';
import { exportDoc, exportScript } from '../export';

const SPEC = `ユニット名：サレルロブロ
コント「父」

○ 親父　● 母親　『』 卵（音源）

【板付き】親父（下手）・母親（上手）

【明転】

（親父、食卓で飯を食っている）

●「ケンジ、もうすぐ着くらしいわ。」

【間 2秒】

【母親 ハケ（上手へ）】

【音源①】C.I『頭蓋骨陥没音』

【母親 出（上手から・上手へ）】

●「お父さん、今お醤油きれてて…」（戻りながら）

（母親、中央へ移動）

【ピン2（中央）IN 3秒】

【音源⑤】F.O 2秒
`;

describe('書き出し', () => {
  it('『父』の台本が依頼書の例どおりになる', () => {
    expect(exportScript(chichiDoc(), { marks: true, time: false })).toBe(SPEC);
  });

  it('○●表記なしでは名前で書く', () => {
    const s = exportScript(chichiDoc(), { marks: false, time: false });
    expect(s).toContain('母親「ケンジ、もうすぐ着くらしいわ。」');
    expect(s).not.toContain('○ 親父');
  });

  it('時間を入れる', () => {
    const s = exportScript(chichiDoc(), { marks: true, time: true });
    expect(s).toContain('0:01　【明転】');
  });

  for (const kind of ['script', 'sound', 'light', 'stage'] as const) {
    for (const marks of [true, false]) {
      it(`スナップショット ${kind} marks=${marks}`, () => {
        expect(exportDoc(chichiDoc(), kind, { marks, time: true })).toMatchSnapshot();
      });
    }
  }

  it('音響キュー表のきっかけは直前のセリフ・動き・出ハケ', () => {
    const s = exportDoc(chichiDoc(), 'sound', { marks: true, time: false });
    expect(s).toContain('01. 【音源①】C.I『頭蓋骨陥没音』\n    きっかけ：【母親 ハケ（上手へ）】 の後');
    expect(s).toContain('02. 【音源⑤】F.O 2秒\n    きっかけ：（母親、中央へ移動） の後');
  });

  it('動きの後のきっかけ', () => {
    const doc = chichiDoc();
    doc.items.splice(5, 0, { id: 'x', t: 'act', w: 'oyaji', x: '3回目' });
    doc.items.splice(6, 0, { id: 'y', t: 'cue', n: 2, op: 'C.I', x: 'ドン' });
    const s = exportDoc(doc, 'sound', { marks: true, time: false });
    expect(s).toContain('01. 【音源②】C.I『ドン』\n    きっかけ：（親父、3回目） の後');
  });
});
