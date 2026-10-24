import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { member, puppets } from './model/cast';
import { chichiDoc } from './model/chichi';
import { insertAfter, moveBefore, removeItem, touch, updateItem, uid, type Edit } from './model/edit';
import { blankDoc, parseDoc } from './model/io';
import { allStates, cueName, initialState, nextCueNo, type Place, type StageState } from './model/state';
import { indexAt, timeline } from './model/timing';
import type { Doc, Item, PinNo, Role } from './model/types';
import { deleteDoc, lastOpen, listDocs, saveDoc } from './store/db';
import { histReducer, initHist } from './store/history';
import { LAYERS, type Layer } from './ui/chips';
import { clock } from './ui/clock';
import { HandOff } from './ui/HandOff';
import { InputBar } from './ui/InputBar';
import { ScriptView } from './ui/ScriptView';
import { Stage } from './ui/stage/Stage';
import { TimeBar } from './ui/TimeBar';

type Mode = 'write' | 'show' | 'hand';
type Theme = 'auto' | 'light' | 'dark';

function useReducedMotion() {
  const q = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [v, setV] = useState(!!q?.matches);
  useEffect(() => {
    if (!q) return;
    const f = () => setV(q.matches);
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, [q]);
  return v;
}

const readTheme = (): Theme => {
  try {
    return (localStorage.getItem('puppet-script:theme') as Theme) || 'auto';
  } catch {
    return 'auto';
  }
};

export default function App() {
  const [h, dispatch] = useReducer(histReducer, undefined, () => initHist(chichiDoc()));
  const [docs, setDocs] = useState<Doc[]>([]);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('write');
  const [role, setRole] = useState<Role>('oyaji');
  const [kind, setKind] = useState<'line' | 'act'>('line');
  const [layers, setLayers] = useState<Set<Layer>>(new Set());
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [focusName, setFocusName] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [scrollKey, setScrollKey] = useState(0);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [docMenu, setDocMenu] = useState(false);
  const reduced = useReducedMotion();

  const { doc, cursor } = h;
  const { items, cast } = doc;
  const states = useMemo(() => allStates(items, cast), [items, cast]);
  const init = useMemo(() => initialState(cast), [cast]);
  const st: StageState = cursor >= 0 ? (states[cursor] ?? init) : init;
  const tl = useMemo(() => timeline(items), [items]);
  const cueNames = useMemo(() => {
    const o: Record<number, string> = {};
    for (const it of items) if (it.t === 'cue' && !(it.n in o)) o[it.n] = cueName(items, it.n);
    return o;
  }, [items]);
  const cur = items[cursor];
  const bubble = cur?.t === 'line' ? cur : null;

  // 最新の値をコールバックから読む
  const ref = useRef({ doc, cursor });
  ref.current = { doc, cursor };

  // --- 保存（IndexedDB）
  useEffect(() => {
    (async () => {
      let list = await listDocs();
      if (!list.length) {
        const d = { ...chichiDoc(), updatedAt: Date.now() };
        await saveDoc(d);
        list = [d];
      }
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      const want = list.find((d) => d.id === lastOpen.get()) ?? list[0];
      setDocs(list);
      dispatch({ type: 'load', doc: want });
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    lastOpen.set(doc.id);
    const t = setTimeout(() => {
      saveDoc(doc);
      setDocs((ds) => [doc, ...ds.filter((d) => d.id !== doc.id)]);
    }, 350);
    return () => clearTimeout(t);
  }, [doc, ready]);

  // --- テーマ
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'auto') el.removeAttribute('data-theme');
    else el.dataset.theme = theme;
    try {
      localStorage.setItem('puppet-script:theme', theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  // --- 書き込み
  const commit = useCallback((e: Edit, group?: string) => {
    const { doc } = ref.current;
    if (e.items === doc.items && e.cursor === ref.current.cursor) return;
    dispatch({ type: 'commit', doc: { ...doc, items: e.items }, cursor: e.cursor, group });
  }, []);
  const doTouch = useCallback(
    (make: (now: StageState) => Omit<Item, 'id'> | null) => {
      const { doc, cursor } = ref.current;
      const e = touch(doc.items, doc.cast, cursor, make as never);
      commit(e);
      return e;
    },
    [commit],
  );

  const setCursor = useCallback((i: number) => {
    dispatch({ type: 'cursor', cursor: i });
    clock.set(timeline(ref.current.doc.items).starts[i] ?? 0);
  }, []);

  const onEdit = useCallback(
    (id: string, patch: Partial<Item>) => {
      const { doc, cursor } = ref.current;
      commit({ items: updateItem(doc.items, id, patch), cursor }, `${id}:${Object.keys(patch).join()}`);
    },
    [commit],
  );
  const onRemove = useCallback(
    (id: string) => {
      const { doc, cursor } = ref.current;
      commit(removeItem(doc.items, cursor, id));
    },
    [commit],
  );
  const onMoveChip = useCallback(
    (id: string, beforeId: string | null) => {
      const { doc } = ref.current;
      const next = moveBefore(doc.items, id, beforeId);
      commit({ items: next, cursor: next.findIndex((x) => x.id === id) });
    },
    [commit],
  );

  const onMove = (r: Role, pl: Place) =>
    doTouch(() => (pl.on ? { t: 'move', w: r, in: true, x: pl.x } : { t: 'move', w: r, in: false, side: pl.side }));
  const onTapRole = (r: Role) => {
    setRole(r);
    if (member(cast, r)?.kind === 'prop') setKind('line');
  };
  const onLight = (p: PinNo | undefined, fade: number) =>
    doTouch((s) => ({ t: 'light', on: p ? !s.pins[p - 1] : !s.lit, ...(p ? { p } : {}), ...(fade ? { fade } : {}) }));
  const onSpeaker = (fade: number) => {
    const n = nextCueNo(ref.current.doc.items);
    const e = doTouch(() => ({ t: 'cue', n, op: fade ? 'F.I' : 'C.I', ...(fade ? { sec: fade } : {}) }));
    const it = e.items[e.cursor];
    if (it) {
      setOpenChip(it.id);
      setFocusName(it.id);
    }
  };
  const onBadge = (n: number, fade: number) => doTouch(() => ({ t: 'cue', n, op: fade ? 'F.O' : 'C.O', ...(fade ? { sec: fade } : {}) }));

  const nextSpeaker = (w: Role) => {
    const ps = puppets(cast).map((c) => c.id);
    const i = ps.indexOf(w);
    return i < 0 ? w : ps[(i + 1) % ps.length];
  };
  const onSubmit = (text: string) => {
    const { doc, cursor } = ref.current;
    const m = member(cast, role);
    if (kind === 'line') {
      commit(insertAfter(doc.items, cursor, { t: 'line', w: role, x: text }));
      if (m?.kind === 'puppet') setRole(nextSpeaker(role));
    } else commit(insertAfter(doc.items, cursor, m?.kind === 'puppet' ? { t: 'act', w: role, x: text } : { t: 'act', x: text }));
    setScrollKey((k) => k + 1);
  };
  const onMa = () => {
    const { doc, cursor } = ref.current;
    const c = doc.items[cursor];
    // 続けて押すと1秒ずつ伸びる（同じ対象の上書き）
    if (c?.t === 'ma') commit({ items: updateItem(doc.items, c.id, { s: c.s + 1 }), cursor });
    else commit(insertAfter(doc.items, cursor, { t: 'ma', s: 1 }));
  };
  const onSE = (text: string) => {
    const { doc, cursor } = ref.current;
    const e = insertAfter(doc.items, cursor, { t: 'se', x: text });
    commit(e);
    if (!text) setOpenChip(e.items[e.cursor].id);
  };

  // --- 再生
  useEffect(() => {
    if (!playing) return;
    const { items } = ref.current.doc;
    const tl = timeline(items);
    let t = clock.get();
    if (t >= tl.total - 0.05) t = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      t += (now - last) / 1000;
      last = now;
      clock.set(Math.min(t, tl.total));
      const i = indexAt(tl, t);
      if (i !== ref.current.cursor) dispatch({ type: 'cursor', cursor: i });
      if (t >= tl.total) return setPlaying(false);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const onSeek = useCallback((t: number) => {
    const tl = timeline(ref.current.doc.items);
    clock.set(t);
    const i = indexAt(tl, t);
    dispatch({ type: 'cursor', cursor: i });
    setScrollKey((k) => k + 1);
  }, []);
  const togglePlay = useCallback(() => {
    if (!playing) clock.set(timeline(ref.current.doc.items).starts[ref.current.cursor] ?? 0);
    setPlaying((v) => !v);
  }, [playing]);

  // --- キーボード
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (e.key === ' ' && !typing && mode !== 'write') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [mode, togglePlay]);

  // --- 台本の出し入れ
  const openDoc = (d: Doc) => {
    setPlaying(false);
    setOpenChip(null);
    dispatch({ type: 'load', doc: d });
    setDocMenu(false);
  };
  const newDoc = () => openDoc(blankDoc());
  const dupDoc = () => openDoc({ ...doc, id: uid(), title: `${doc.title}（写）`, updatedAt: Date.now() });
  const delDoc = async () => {
    if (!confirm(`「${doc.title}」を消す？`)) return;
    await deleteDoc(doc.id);
    const rest = docs.filter((d) => d.id !== doc.id);
    setDocs(rest);
    openDoc(rest[0] ?? blankDoc());
  };
  const onImport = async (f: File) => {
    try {
      openDoc(parseDoc(await f.text()));
    } catch (err) {
      alert(`読み込めなかった：${(err as Error).message}`);
    }
  };
  const onMeta = (patch: Partial<Doc>) =>
    dispatch({ type: 'commit', doc: { ...ref.current.doc, ...patch }, group: `meta:${Object.keys(patch).join()}` });

  const write = mode === 'write';
  const stage = (
    <Stage
      cast={cast}
      st={st}
      interactive={write && !playing}
      size={mode === 'show' ? 'big' : mode === 'hand' ? 'small' : 'normal'}
      inputRole={role}
      bubble={bubble}
      cueNames={cueNames}
      reduced={reduced}
      onMove={onMove}
      onTapRole={onTapRole}
      onLight={onLight}
      onSpeaker={onSpeaker}
      onBadge={onBadge}
      onEdit={onEdit}
    />
  );

  return (
    <div className={`app mode-${mode}`}>
      <header>
        <button className="docbtn" onClick={() => setDocMenu((v) => !v)} aria-label="台本の一覧">
          ☰
        </button>
        <input className="title" value={doc.title} onChange={(e) => onMeta({ title: e.target.value })} aria-label="題" />
        <span className="undo">
          <button disabled={!h.past.length} onClick={() => dispatch({ type: 'undo' })} aria-label="元に戻す">
            ↶
          </button>
          <button disabled={!h.future.length} onClick={() => dispatch({ type: 'redo' })} aria-label="やり直す">
            ↷
          </button>
        </span>
        <nav className="modes">
          {(
            [
              ['write', '書く'],
              ['show', '見せる'],
              ['hand', '渡す'],
            ] as const
          ).map(([m, l]) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {l}
            </button>
          ))}
        </nav>
        <button className="theme" onClick={() => setTheme(theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto')} aria-label="テーマ">
          {theme === 'auto' ? '◐' : theme === 'light' ? '○' : '●'}
        </button>
        {docMenu && (
          <div className="docmenu">
            {docs.map((d) => (
              <button key={d.id} className={d.id === doc.id ? 'on' : ''} onClick={() => openDoc(d)}>
                {d.title || '無題'}
                <small>{d.unit}</small>
              </button>
            ))}
            <div className="docops">
              <button onClick={newDoc}>＋ 新しい台本</button>
              <button onClick={dupDoc}>⎘ 複製</button>
              <button onClick={() => openDoc({ ...chichiDoc(), id: uid() })}>『父』</button>
              <button onClick={delDoc}>🗑</button>
            </div>
          </div>
        )}
      </header>

      <main>
        {write && (
          <>
            <section className="left">
              {stage}
              <p className="legend">
                人形 ⇆ 移動・袖へ＝ハケ・タップ＝話者　｜　バトン タップ＝明暗・長押し＝じわ　｜　◎＝ピン　｜　🔈 タップ＝C.I・長押し＝F.I　｜　♪ タップ＝C.O・長押し＝F.O
              </p>
            </section>
            <section className="right">
              <div className="sheet">
                {LAYERS.map((l) => (
                  <button
                    key={l.id}
                    className={`ly-${l.id}${layers.has(l.id) ? ' on' : ''}`}
                    onClick={() =>
                      setLayers((s) => {
                        const n = new Set(s);
                        if (n.has(l.id)) n.delete(l.id);
                        else n.add(l.id);
                        return n;
                      })
                    }
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <ScriptView
                cast={cast}
                items={items}
                states={states}
                cursor={cursor}
                layers={layers}
                openChip={openChip}
                focusName={focusName}
                scrollKey={scrollKey}
                onOpenChip={setOpenChip}
                onCursor={setCursor}
                onEdit={onEdit}
                onRemove={onRemove}
                onMoveChip={onMoveChip}
              />
            </section>
          </>
        )}
        {mode === 'show' && <section className="show">{stage}</section>}
        {mode === 'hand' && (
          <section className="hand">
            {stage}
            <HandOff doc={doc} onMeta={onMeta} onImport={onImport} />
          </section>
        )}
      </main>

      <footer>
        {write && (
          <InputBar cast={cast} role={role} kind={kind} onRole={onTapRole} onKind={setKind} onSubmit={onSubmit} onMa={onMa} onSE={onSE} />
        )}
        <TimeBar cast={cast} items={items} states={states} tl={tl} playing={playing} onToggle={togglePlay} onSeek={onSeek} />
      </footer>
    </div>
  );
}
