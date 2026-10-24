import { describe, expect, it } from 'vitest';
import { chichiDoc } from '../chichi';
import { exportDoc, exportScript } from '../export';
import { touch } from '../edit';
import type { CastMember } from '../types';

const mirror: CastMember = { id: 'kagami', name: '鏡', short: '鏡', color: '#888888', kind: 'prop' };

describe('小道具を舞台に置く', () => {
  it('置く・動かす・片付けるが台本と出ハケ表に出る', () => {
    const d = chichiDoc();
    d.cast.push(mirror);
    let e = touch(d.items, d.cast, 3, () => ({ t: 'move', w: 'kagami', in: true, x: 50 }));
    e = touch(e.items, d.cast, e.cursor + 1, () => ({ t: 'move', w: 'kagami', in: true, x: 80 }));
    e = touch(e.items, d.cast, e.items.length - 1, () => ({ t: 'move', w: 'kagami', in: false, side: 'R' }));
    d.items = e.items;
    const s = exportScript(d, { marks: true, time: false });
    expect(s).toContain('（鏡を中央に置く）');
    expect(s).toContain('（鏡を上手へ動かす）');
    expect(s).toContain('（鏡を片付ける）');
    expect(exportDoc(d, 'stage', { marks: true, time: false })).toContain('（鏡を中央に置く）');
  });
});

import { docFromScript, scriptWithDoc } from '../bridge';
import { chichiSample } from '../chichi';
import { stateAt } from '../state';

describe('小道具を持たせる', () => {
  it('持つ・受け取る・置くが台本に出る', () => {
    const d = chichiDoc();
    d.cast.push(mirror);
    let e = touch(d.items, d.cast, 3, () => ({ t: 'hold', w: 'kagami', by: 'oyaji' }));
    e = touch(e.items, d.cast, e.cursor + 1, () => ({ t: 'hold', w: 'kagami', by: 'haha' }));
    e = touch(e.items, d.cast, e.cursor + 1, () => ({ t: 'move', w: 'kagami', in: true, x: 50 }));
    d.items = e.items;
    const s = exportScript(d, { marks: true, time: false });
    expect(s).toContain('（親父、鏡を持つ）');
    expect(s).toContain('（母親、親父から鏡を受け取る）');
    expect(s).toContain('（母親、鏡を中央に置く）');
    expect(stateAt(d.items, d.cast, d.items.length - 1).held).toEqual({ tamago: 'oyaji' });
  });

  it('同じ小道具を続けて触ると上書き', () => {
    const d = chichiDoc();
    d.cast.push(mirror);
    let e = touch(d.items, d.cast, 3, () => ({ t: 'hold', w: 'kagami', by: 'oyaji' }));
    e = touch(e.items, d.cast, e.cursor, () => ({ t: 'move', w: 'kagami', in: true, x: 30 }));
    expect(e.items.filter((i) => i.t === 'hold' || (i.t === 'move' && i.w === 'kagami'))).toHaveLength(1);
  });
});

describe('大道具', () => {
  it('机と椅子は最初からあり、ネタ管理には書き戻さない', () => {
    const { script } = chichiSample();
    const doc = docFromScript(script);
    expect(doc.cast.filter((c) => c.kind === 'set').map((c) => c.name)).toEqual(['机', '椅子']);
    expect(scriptWithDoc(script, doc).characters.some((c) => c.kind === 'set')).toBe(false);
  });

  it('置き場所の奥行きと向きも状態に入り、向きを変えれば別の状態', () => {
    const doc = docFromScript(chichiSample().script);
    let e = touch(doc.items, doc.cast, 1, () => ({ t: 'move', w: 'set-desk', in: true, x: 70, z: 0.8, r: 0 }));
    expect(exportScript({ ...doc, items: e.items }, { marks: true, time: false })).toContain('【板付き】親父（下手）・母親（上手）・机（上手）');
    e = touch(e.items, doc.cast, e.cursor, () => ({ t: 'move', w: 'set-desk', in: true, x: 70, z: 0.8, r: 45 }));
    expect(stateAt(e.items, doc.cast, e.cursor).pos['set-desk']).toEqual({ on: true, x: 70, z: 0.8, r: 45 });
    expect(e.items.filter((i) => i.t === 'move' && i.w === 'set-desk')).toHaveLength(1);
  });
});

import { itemsToBlocks, soundRegistry } from '../bridge';
import { parseItems } from '../io';

describe('「編集する」と「かく」を1つにしたあとの書き戻し', () => {
  const base = () => {
    const { unit, script } = chichiSample();
    return { unit, script, doc: docFromScript(script, unit) };
  };

  it('配役・衣装・道具・持ち込み・衣装（全体）が往復する', () => {
    const { script, doc } = base();
    doc.assign = { ...doc.assign, oyaji: { performerId: 'p1', costume: '作業着' } };
    doc.tools = '食卓';
    doc.bringIns = '卵';
    const s = scriptWithDoc(script, doc);
    expect(s.characters.find((c) => c.id === 'oyaji')).toMatchObject({ performerId: 'p1', costume: '作業着' });
    expect([s.tools, s.bringIns]).toEqual(['食卓', '卵']);
    expect(docFromScript(s).assign?.oyaji).toEqual({ performerId: 'p1', costume: '作業着' });
  });

  it('役を足す・なくす', () => {
    const { script, doc } = base();
    doc.cast = [...doc.cast, { id: 'new1', name: '息子', short: '息', color: '#336699', kind: 'puppet' }];
    expect(scriptWithDoc(script, doc).characters.map((c) => c.name)).toContain('息子');
    doc.cast = doc.cast.filter((c) => c.id !== 'haha');
    expect(scriptWithDoc(script, doc).characters.map((c) => c.id)).not.toContain('haha');
  });

  it('音源リストの名前を変える・消す（舞台で付けた名前も重なる）', () => {
    const { script, doc } = base();
    expect(soundRegistry(doc)).toEqual({ 1: '頭蓋骨陥没音' });
    doc.items = doc.items.map((i) => (i.t === 'cue' ? { ...i, x: undefined } : i)) as typeof doc.items;
    doc.sounds = { 1: '陥没音', 3: 'ベル' };
    expect(scriptWithDoc(script, doc).sounds.map((s) => [s.index, s.name])).toEqual([[1, '陥没音'], [3, 'ベル']]);
    doc.sounds = {};
    expect(scriptWithDoc(script, doc).sounds).toEqual([]);
  });

  it('舞台の項目から、これまでの形のブロックも作る（きっかけ付き）', () => {
    const { doc } = base();
    const blocks = itemsToBlocks(doc);
    expect(blocks.find((b) => b.type === 'dialogue')).toMatchObject({ speaker: '母親', text: 'ケンジ、もうすぐ着くらしいわ。' });
    const snd = blocks.find((b) => b.type === 'sound');
    expect(snd?.text).toBe('サレルロブロ1 C.I');
    expect(snd?.cue?.triggerText).toContain('母親 ハケ');
    expect(blocks.some((b) => b.type === 'stage' && b.text.includes('間 2秒'))).toBe(true);
  });

  it('JSON を読み込むときは stage の項目も読める', () => {
    const { script } = base();
    expect(parseItems(JSON.stringify({ stage: script.stage }))).toHaveLength(13);
  });
});
