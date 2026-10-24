import { describe, expect, it } from 'vitest';
import { chichiDoc } from '../chichi';
import { histReducer, initHist } from '../../store/history';

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

import { parseDoc } from '../io';
import { exportScript } from '../export';

describe('読み込み', () => {
  it('書き出したJSONを読み込むと同じ台本になる', () => {
    const d = chichiDoc();
    const back = parseDoc(JSON.stringify(d));
    expect(exportScript(back, { marks: true, time: false })).toBe(exportScript(d, { marks: true, time: false }));
  });
  it('項目の配列だけでも読める', () => {
    const back = parseDoc(JSON.stringify([{ t: 'line', w: 'oyaji', x: 'おう' }, { t: 'bogus' }]));
    expect(back.items).toHaveLength(1);
    expect(back.items[0].id).toBeTruthy();
  });
});
