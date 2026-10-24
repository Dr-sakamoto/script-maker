import { describe, expect, it } from 'vitest';
import { chichiDoc } from '../chichi';
import { histReducer, initHist } from '../history';

describe('元に戻す／やり直す', () => {
  it('commit → undo → redo', () => {
    const d = chichiDoc();
    let s = initHist(d);
    s = histReducer(s, { type: 'commit', doc: { ...d, items: d.items.slice(1) }, cursor: 0 });
    expect(s.doc.items).toHaveLength(12);
    s = histReducer(s, { type: 'undo' });
    expect(s.doc.items).toHaveLength(13);
    expect(s.cursor).toBe(12);
    s = histReducer(s, { type: 'redo' });
    expect(s.doc.items).toHaveLength(12);
  });

  it('同じ欄への連続入力は1回分', () => {
    const d = chichiDoc();
    let s = initHist(d);
    s = histReducer(s, { type: 'commit', doc: { ...d, title: 'a' }, group: 'title' });
    s = histReducer(s, { type: 'commit', doc: { ...d, title: 'ab' }, group: 'title' });
    expect(s.past).toHaveLength(1);
    s = histReducer(s, { type: 'undo' });
    expect(s.doc.title).toBe('父');
  });
});

import { parseItems } from '../io';
import { docFromScript, itemsFromBlocks, scriptWithDoc } from '../bridge';
import { chichiSample } from '../chichi';
import { exportScript } from '../export';

describe('読み込み', () => {
  it('項目の配列でも { items } でも読める', () => {
    expect(parseItems(JSON.stringify([{ t: 'line', w: 'oyaji', x: 'おう' }, { t: 'bogus' }]))).toHaveLength(1);
    const back = parseItems(JSON.stringify(chichiDoc()));
    expect(back).toHaveLength(13);
  });
});

describe('ネタ管理との橋渡し', () => {
  it('サンプルの台本から作った舞台は『父』と同じ書き出しになる', () => {
    const { unit, script } = chichiSample();
    const doc = docFromScript(script, unit);
    expect(exportScript(doc, { marks: true, time: false })).toBe(exportScript(chichiDoc(), { marks: true, time: false }));
  });

  it('登場人物の順に○●が付き、色が無ければ自動で付く', () => {
    const { script } = chichiSample();
    const doc = docFromScript({ ...script, characters: script.characters.map((c) => ({ ...c, color: undefined })) });
    expect(doc.cast.map((c) => c.mark)).toEqual(['○', '●', undefined]);
    expect(doc.cast.every((c) => /^#/.test(c.color))).toBe(true);
    expect(doc.cast[2]).toMatchObject({ kind: 'prop', holder: 'oyaji' });
  });

  it('名前・色・音源名を台本に書き戻す', () => {
    const { script } = chichiSample();
    const doc = docFromScript(script);
    doc.cast[0] = { ...doc.cast[0], name: 'オヤジ', color: '#123456' };
    doc.items.push({ id: 'z', t: 'cue', n: 2, op: 'C.I', x: 'チャイム' });
    const s = scriptWithDoc(script, doc);
    expect(s.characters[0]).toMatchObject({ name: 'オヤジ', color: '#123456' });
    expect(s.sounds.map((x) => [x.index, x.name])).toEqual([[1, '頭蓋骨陥没音'], [2, 'チャイム']]);
    expect(s.stage).toHaveLength(14);
  });

  it('これまでのブロックから舞台の項目を起こす', () => {
    const chars = [{ id: 'a', name: 'ボケ', performerId: '' }, { id: 'b', name: 'ツッコミ', performerId: '' }];
    const items = itemsFromBlocks(
      [
        { id: '1', type: 'light', text: '明転' },
        { id: '2', type: 'dialogue', speaker: 'ボケ', text: 'どうも' },
        { id: '3', type: 'stage', speaker: 'ツッコミ', text: '頭をはたく' },
        { id: '4', type: 'sound', text: 'サレルロブロ② F.O', cue: { fadeDuration: 4, triggerType: 'undefined' } },
        { id: '5', type: 'light', text: '徐々暗転', cue: { fadeDuration: 5, triggerType: 'undefined' } },
        { id: '6', type: 'dialogue', speaker: 'ボケ', text: '' },
      ],
      chars,
    );
    expect(items.map(({ id: _id, ...r }) => r)).toEqual([
      { t: 'light', on: true },
      { t: 'line', w: 'a', x: 'どうも' },
      { t: 'act', w: 'b', x: '頭をはたく' },
      { t: 'cue', n: 2, op: 'F.O', sec: 4 },
      { t: 'light', on: false, fade: 5 },
    ]);
  });
});
