import type { ReactNode } from 'react';
import { circled } from '../../lib/stage/export';
import { soundRegistry } from '../../lib/stage/bridge';
import type { Doc, Role } from '../../lib/stage/types';

const GENRES = ['漫才', 'コント', 'ピン'];

/** 台本で使っている役（使っていれば消せない） */
export function usedRoles(doc: Doc): Set<Role> {
  const s = new Set<Role>();
  for (const it of doc.items) {
    if ('w' in it && it.w) s.add(it.w);
    if (it.t === 'hold') s.add(it.by);
  }
  return s;
}

const Field = (p: { label: string; children: ReactNode }) => (
  <label className="field">
    <span>{p.label}</span>
    {p.children}
  </label>
);

/**
 * 表紙・配役・音源の登録。ネタを作るときに入れたものを、ここで直す（「わたす」の中）。
 * 台本の表紙（印刷・PDF）にそのまま載る。
 */
export function Info(p: { doc: Doc; onChange: (patch: Partial<Doc>, group: string) => void }) {
  const { doc } = p;
  const used = usedRoles(doc);
  const reg = soundRegistry(doc);
  const nums = Object.keys(reg).map(Number).sort((a, b) => a - b);
  const people = doc.cast.filter((c) => !c.id.startsWith('set-'));
  const setAssign = (id: Role, patch: Partial<{ performerId: string; costume: string }>) =>
    p.onChange({ assign: { ...doc.assign, [id]: { performerId: '', costume: '', ...doc.assign?.[id], ...patch } } }, `assign:${id}`);
  const setCast = (id: Role, patch: Record<string, unknown>) =>
    p.onChange({ cast: doc.cast.map((c) => (c.id === id ? { ...c, ...patch } : c)) }, `cast:${id}`);
  // 音源名は登録リストが本体。舞台で付けた名前（cue の x）は外して一本にする
  const withoutCueNames = (n: number) => doc.items.map((i) => (i.t === 'cue' && i.n === n ? { ...i, x: undefined } : i)) as Doc['items'];
  const setSound = (n: number, name: string) => p.onChange({ sounds: { ...doc.sounds, [n]: name }, items: withoutCueNames(n) }, `snd:${n}`);
  const delSound = (n: number) => {
    const next = { ...doc.sounds };
    delete next[n];
    p.onChange({ sounds: next, items: withoutCueNames(n) }, `snd-del:${n}`);
  };
  const addSound = () => {
    const n = (nums.length ? nums[nums.length - 1] : 0) + 1;
    p.onChange({ sounds: { ...doc.sounds, [n]: '' } }, `snd-add:${n}`);
  };

  return (
    <details className="info">
      <summary>表紙・配役・音源</summary>
      <div className="info-body">
        <div className="info-row">
          <Field label="種別">
            <select value={doc.genre} onChange={(e) => p.onChange({ genre: e.target.value }, 'genre')}>
              {GENRES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
        </div>

        <h4>登場人物・配役・衣装</h4>
        {people.map((c) => (
          <div className="info-cast" key={c.id}>
            <input type="color" value={c.color} onChange={(e) => setCast(c.id, { color: e.target.value })} aria-label="色" />
            <input className="nm" value={c.name} onChange={(e) => setCast(c.id, { name: e.target.value, short: [...(e.target.value.trim() || '？')][0] })} aria-label="名前" />
            <span className="kind">{c.kind === 'puppet' ? '人形' : c.kind === 'prop' ? '小道具' : '大道具'}</span>
            {c.kind === 'puppet' && (
              <select value={doc.assign?.[c.id]?.performerId ?? ''} onChange={(e) => setAssign(c.id, { performerId: e.target.value })} aria-label="配役">
                <option value="">配役未定</option>
                {(doc.performers ?? []).map((pf) => (
                  <option key={pf.id} value={pf.id}>
                    {pf.name}
                  </option>
                ))}
              </select>
            )}
            <input className="cs" value={doc.assign?.[c.id]?.costume ?? ''} placeholder="衣装" onChange={(e) => setAssign(c.id, { costume: e.target.value })} aria-label="衣装" />
            <button
              disabled={used.has(c.id)}
              title={used.has(c.id) ? '台本で使っているので消せません' : '消す'}
              onClick={() => p.onChange({ cast: doc.cast.filter((x) => x.id !== c.id) }, `cast-del:${c.id}`)}
            >
              ✕
            </button>
          </div>
        ))}

        <h4>道具・持ち込み</h4>
        <Field label="使用道具">
          <input value={doc.tools ?? ''} onChange={(e) => p.onChange({ tools: e.target.value }, 'tools')} />
        </Field>
        <Field label="持ち込み物">
          <input value={doc.bringIns ?? ''} onChange={(e) => p.onChange({ bringIns: e.target.value }, 'bringIns')} />
        </Field>
        {!!doc.costumes && (
          <Field label="衣装（全体）">
            <input value={doc.costumes} onChange={(e) => p.onChange({ costumes: e.target.value }, 'costumes')} />
          </Field>
        )}

        <h4>音源トラック</h4>
        {nums.map((n) => (
          <div className="info-snd" key={n}>
            <b>{circled(n)}</b>
            <input value={reg[n]} placeholder="名前" onChange={(e) => setSound(n, e.target.value)} />
            <button title="消す" onClick={() => delSound(n)}>
              ✕
            </button>
          </div>
        ))}
        <button className="add" onClick={addSound}>
          ＋ 音源を足す
        </button>
      </div>
    </details>
  );
}
