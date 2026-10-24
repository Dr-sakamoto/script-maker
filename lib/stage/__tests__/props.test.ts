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
