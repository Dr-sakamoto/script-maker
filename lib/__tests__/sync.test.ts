import { describe, expect, it } from 'vitest';
import { mergeScripts, mergeUnits } from '../sync';
import type { ScriptItem, Unit } from '../types';

const script = (id: string, patch: Partial<ScriptItem> = {}): ScriptItem => ({
  id,
  unitId: 'u1',
  title: id,
  netaType: '漫才',
  characters: [],
  sounds: [],
  blocks: [],
  ...patch,
});

describe('台本の突き合わせ', () => {
  it('手元にしか無い台本は残して、送り直す', () => {
    const r = mergeScripts([script('a'), script('offline')], [script('a'), script('b')]);
    expect(r.scripts.map((s) => s.id)).toEqual(['a', 'offline', 'b']);
    expect(r.push.map((s) => s.id)).toEqual(['offline']);
  });

  it('クラウドが空でも手元の台本は残る', () => {
    const r = mergeScripts([script('a')], []);
    expect(r.scripts.map((s) => s.id)).toEqual(['a']);
    expect(r.push.map((s) => s.id)).toEqual(['a']);
  });

  it('手元のほうが新しければ手元を採って送り直す', () => {
    const local = script('a', { title: '手元', updatedAt: '2026-11-10T10:00:00.000Z' });
    const cloud = script('a', { title: 'クラウド', updatedAt: '2026-11-10T09:00:00+00:00' });
    const r = mergeScripts([local], [cloud]);
    expect(r.scripts[0].title).toBe('手元');
    expect(r.push).toEqual([local]);
  });

  it('クラウドのほうが新しければクラウドを採る（舞台の項目と人形の色は手元を残す）', () => {
    const local = script('a', {
      title: '手元',
      updatedAt: '2026-11-10T09:00:00.000Z',
      stage: [],
      characters: [{ id: 'c1', name: '旧', performerId: '', color: '#ff0000' }],
    });
    const cloud = script('a', {
      title: 'クラウド',
      updatedAt: '2026-11-10T10:00:00+00:00',
      characters: [{ id: 'c1', name: '新', performerId: '' }],
    });
    const r = mergeScripts([local], [cloud]);
    expect(r.scripts[0].title).toBe('クラウド');
    expect(r.scripts[0].stage).toEqual([]);
    expect(r.scripts[0].characters[0]).toMatchObject({ name: '新', color: '#ff0000' });
    expect(r.push).toEqual([]);
  });

  it('時刻が同じ（書式だけ違う）なら送り直さない', () => {
    const r = mergeScripts(
      [script('a', { updatedAt: '2026-11-10T10:00:00.000Z' })],
      [script('a', { updatedAt: '2026-11-10T10:00:00+00:00' })],
    );
    expect(r.push).toEqual([]);
  });
});

describe('ユニットの突き合わせ', () => {
  const unit = (id: string, performers: Unit['performers'] = []): Unit => ({ id, name: id, performers });

  it('手元にしか無いユニットは残して、送り直す', () => {
    const r = mergeUnits([unit('mine')], [unit('u1')]);
    expect(r.units.map((u) => u.id)).toEqual(['mine', 'u1']);
    expect(r.push.map((u) => u.id)).toEqual(['mine']);
  });

  it('手元にしか居ない演者は足す', () => {
    const r = mergeUnits([unit('u1', [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }])], [unit('u1', [{ id: 'p1', name: 'A' }])]);
    expect(r.units[0].performers.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(r.push.map((u) => u.id)).toEqual(['u1']);
  });

  it('同じなら何も送らない', () => {
    const r = mergeUnits([unit('u1', [{ id: 'p1', name: 'A' }])], [unit('u1', [{ id: 'p1', name: 'A' }])]);
    expect(r.push).toEqual([]);
  });
});
