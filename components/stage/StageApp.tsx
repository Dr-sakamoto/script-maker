'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { pushScript } from '../../lib/cloud';
import { loadLocalScripts, saveLocalScripts } from '../../lib/storage';
import type { ScriptItem, Unit } from '../../lib/types';
import { docFromScript, scriptWithDoc } from '../../lib/stage/bridge';
import { MARKS, member, PALETTE, puppets, shortName } from '../../lib/stage/cast';
import { insertAfter, moveBefore, removeItem, touch, uid, updateItem, type Edit } from '../../lib/stage/edit';
import { histReducer, initHist } from '../../lib/stage/history';
import { parseItems } from '../../lib/stage/io';
import { allStates, cueName, initialState, isDark, nextCueNo, WING, type Place, type StageState } from '../../lib/stage/state';
import { indexAt, timeline } from '../../lib/stage/timing';
import { placeAt } from '../../lib/stage/tracks';
import type { CastMember, Doc, Item, NewItem, PinNo, Role } from '../../lib/stage/types';
import { LAYERS, type Layer } from './chips';
import { clock } from './clock';
import { CastBox, LightConsole, PropBox, SoundDevice, Transport } from './Desk';
import { HandOff } from './HandOff';
import { TimelineView } from './TimelineView';
import { Info } from './Info';
import { PrintSheet } from './PrintSheet';
import { InputBar } from './InputBar';
import { ScriptView } from './ScriptView';
import { Stage } from './Stage';
import { TimeBar } from './TimeBar';

/** つくる＝舞台を触って作る／かく＝台本を速記する／わたす＝書き出す */
type Mode = 'make' | 'write' | 'hand';
const MODES: [Mode, string][] = [
  ['make', 'つくる'],
  ['write', 'かく'],
  ['hand', 'わたす'],
];
const modeFromUrl = (): Mode => {
  const m = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('mode');
  return m === 'write' || m === 'hand' ? m : 'make';
};
type Theme = 'auto' | 'light' | 'dark';

function useReducedMotion() {
  const [v, setV] = useState(false);
  useEffect(() => {
    const q = matchMedia('(prefers-reduced-motion: reduce)');
    setV(q.matches);
    const f = () => setV(q.matches);
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, []);
  return v;
}

const readTheme = (): Theme => {
  try {
    return (localStorage.getItem('stage:theme') as Theme) || 'auto';
  } catch {
    return 'auto';
  }
};

/** 舞台エディタ。台本・役・音源はネタ管理（localStorage の units / scripts）のものを使い、そこへ書き戻す */
export default function StageApp({ script, unit }: { script: ScriptItem; unit?: Unit }) {
  const [h, dispatch] = useReducer(histReducer, undefined, () => initHist(docFromScript(script, unit)));
  const [mode, setModeRaw] = useState<Mode>(modeFromUrl);
  /** つくるの中の全画面プレビュー（3D空間だけ） */
  const [full, setFull] = useState(false);
  const [autoEdit, setAutoEdit] = useState<{ id: string; n: number } | null>(null);
  const stageApi = useRef<{ pctAt: (cx: number, cy: number) => number | null } | null>(null);
  /** つくる：スピーカーの横で音源名／SE を打つ */
  const [soundEdit, setSoundEdit] = useState<{ id: string; n: number } | null>(null);
  const setMode = (m: Mode) => {
    setModeRaw(m);
    setFull(false);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('mode', m);
      window.history.replaceState(null, '', u);
    } catch {
      /* noop */
    }
  };
  const [role, setRole] = useState<Role>(() => script.characters[0]?.id ?? '');
  const [kind, setKind] = useState<'line' | 'act'>('line');
  const [layers, setLayers] = useState<Set<Layer>>(new Set());
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [focusName, setFocusName] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [scrollKey, setScrollKey] = useState(0);
  const [theme, setTheme] = useState<Theme>('auto');
  const reduced = useReducedMotion();

  const { doc, cursor } = h;
  const { items, cast } = doc;
  const states = useMemo(() => allStates(items, cast), [items, cast]);
  const init = useMemo(() => initialState(cast), [cast]);
  const st: StageState = cursor >= 0 ? (states[cursor] ?? init) : init;
  const tl = useMemo(() => timeline(items), [items]);
  const cueNames = useMemo(() => {
    const o: Record<number, string> = {};
    for (const it of items) if (it.t === 'cue' && !(it.n in o)) o[it.n] = cueName(items, it.n, doc.sounds);
    return o;
  }, [items, doc.sounds]);
  const cur = items[cursor];
  const bubble = cur?.t === 'line' ? cur : null;

  const ref = useRef({ doc, cursor });
  ref.current = { doc, cursor };

  // --- ネタ管理へ書き戻す（最新の一覧に混ぜるので、ほかの台本は消さない）。繋がっていればクラウドにも送る
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const all = loadLocalScripts();
      saveLocalScripts(all.map((s) => (s.id === script.id ? scriptWithDoc(s, doc) : s)));
    }, 300);
    const c = setTimeout(() => {
      const mine = loadLocalScripts().find((s) => s.id === script.id);
      if (mine) void pushScript(mine);
    }, 2500);
    return () => {
      clearTimeout(t);
      clearTimeout(c);
    };
  }, [doc, script.id]);

  // --- テーマ
  useEffect(() => setTheme(readTheme()), []);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'auto') el.removeAttribute('data-theme');
    else el.dataset.theme = theme;
    try {
      localStorage.setItem('stage:theme', theme);
    } catch {
      /* noop */
    }
    return () => el.removeAttribute('data-theme');
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
    doTouch(() =>
      pl.on
        ? { t: 'move', w: r, in: true, x: pl.x, ...(pl.z != null ? { z: pl.z } : {}), ...(pl.r != null ? { r: pl.r } : {}) }
        : { t: 'move', w: r, in: false, side: pl.side },
    );
  /** 小道具を人形に持たせる */
  const onHold = (prop: Role, by: Role) => doTouch((s) => (s.held[prop] === by ? null : { t: 'hold', w: prop, by }));
  /** つくる：舞台の上でそのまま打たせる */
  const openNew = (it: NewItem) => {
    const { doc, cursor } = ref.current;
    const e = insertAfter(doc.items, cursor, it);
    commit(e);
    setAutoEdit((a) => ({ id: e.items[e.cursor].id, n: (a?.n ?? 0) + 1 }));
    setScrollKey((k) => k + 1);
  };
  const onTouchRole = (r: Role) => {
    if (mode !== 'make') return onTapRole(r);
    openNew({ t: 'line', w: r, x: '' });
  };
  const onBackdrop = () => openNew({ t: 'act', x: '' });
  const onDoneEdit = (id: string) => {
    const { doc, cursor } = ref.current;
    const it = doc.items.find((x) => x.id === id);
    if (it && (it.t === 'line' || it.t === 'act') && !it.x.trim() && !(it.t === 'line' && it.n)) commit(removeItem(doc.items, cursor, id));
  };
  const onSwap = (id: string) => {
    const { doc, cursor } = ref.current;
    const it = doc.items.find((x) => x.id === id);
    if (!it) return;
    const next: Item | null =
      it.t === 'line' ? { id, t: 'act', w: it.w, x: it.x } : it.t === 'act' && it.w ? { id, t: 'line', w: it.w, x: it.x } : null;
    if (!next) return;
    commit({ items: doc.items.map((x) => (x.id === id ? next : x)), cursor });
    setAutoEdit((a) => ({ id, n: (a?.n ?? 0) + 1 }));
  };

  const onTapRole = (r: Role) => {
    setRole(r);
    if (member(cast, r)?.kind === 'prop') setKind('line');
  };
  const onCast = (r: Role, patch: { name?: string; color?: string }) => {
    const d = ref.current.doc;
    const c = d.cast.map((m) => (m.id === r ? { ...m, ...patch, ...(patch.name ? { short: shortName(patch.name) } : {}) } : m));
    dispatch({ type: 'commit', doc: { ...d, cast: c }, group: `cast:${r}:${Object.keys(patch).join()}` });
  };
  const onLight = (p: PinNo | undefined, fade: number) =>
    doTouch((s) => ({ t: 'light', on: p ? !s.pins[p - 1] : !s.lit, ...(p ? { p } : {}), ...(fade ? { fade } : {}) }));
  const onSpeaker = (fade: number) => {
    const n = nextCueNo(ref.current.doc.items);
    const e = doTouch(() => ({ t: 'cue', n, op: fade ? 'F.I' : 'C.I', ...(fade ? { sec: fade } : {}) }));
    const it = e.items[e.cursor];
    if (!it) return;
    // つくる：名前は舞台のスピーカーの横で打つ／かく：台本のチップで
    if (mode === 'make') setSoundEdit((a) => ({ id: it.id, n: (a?.n ?? 0) + 1 }));
    else {
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
    if (text) return;
    if (mode === 'make') setSoundEdit((a) => ({ id: e.items[e.cursor].id, n: (a?.n ?? 0) + 1 }));
    else setOpenChip(e.items[e.cursor].id);
  };
  /** 照明卓：全体の明転・暗転（じわは秒数） */
  const onLightAll = (on: boolean, fade: number) => doTouch((s) => (s.lit === on ? null : { t: 'light', on, ...(fade ? { fade } : {}) }));
  // じわの秒数は「かく」のチップで変える（つくるでは長押しで秒数を決めない）
  /** 箱から舞台へ：落としたところに出す／置く */
  const onDropFromBox = (id: Role, cx: number, cy: number) => {
    const x = stageApi.current?.pctAt(cx, cy);
    if (x == null) return;
    const s = ref.current.cursor >= 0 ? states[ref.current.cursor] : init;
    // 小道具を人形の上に落としたら、その人形が持つ
    if (member(cast, id)?.kind === 'prop') {
      const by = puppets(cast)
        .filter((c) => s.pos[c.id]?.on)
        .map((c) => ({ id: c.id, d: Math.abs((s.pos[c.id] as { x: number }).x - x) }))
        .filter((c) => c.d < 7)
        .sort((a, b) => a.d - b.d)[0];
      if (by) return onHold(id, by.id);
    }
    onMove(id, { on: true, x: Math.min(100 - WING - 1, Math.max(WING + 1, x)) });
  };
  /** 「わたす」の表紙・配役・音源の直し */
  const onInfo = (patch: Partial<Doc>, group: string) => dispatch({ type: 'commit', doc: { ...ref.current.doc, ...patch }, group: `info:${group}` });
  /** 人形箱の＋：新しい人形（色と○●は自動） */
  const onAddPuppet = (name: string) => {
    const d = ref.current.doc;
    const k = d.cast.filter((c) => c.kind === 'puppet').length;
    const m: CastMember = {
      id: uid(),
      name,
      short: shortName(name),
      mark: MARKS[k],
      color: PALETTE[d.cast.length % PALETTE.length],
      kind: 'puppet',
      home: k % 2 === 0 ? 'L' : 'R',
    };
    dispatch({ type: 'commit', doc: { ...d, cast: [...d.cast, m] } });
  };
  /** 小道具箱の＋：新しい小道具（色は自動） */
  const onAddProp = (name: string, kind: 'prop' | 'set') => {
    const d = ref.current.doc;
    const m: CastMember = {
      id: uid(),
      name,
      short: shortName(name),
      color: PALETTE[d.cast.length % PALETTE.length],
      kind,
      ...(kind === 'set' ? { shape: 'free' as const, home: 'R' as const } : {}),
    };
    dispatch({ type: 'commit', doc: { ...d, cast: [...d.cast, m] } });
  };
  const onSoundDone = (id: string) => {
    setSoundEdit(null);
    const { doc, cursor } = ref.current;
    const it = doc.items.find((x) => x.id === id);
    if (it?.t === 'se' && !it.x.trim()) commit(removeItem(doc.items, cursor, id));
  };

  // --- 再生
  useEffect(() => {
    if (!playing) return;
    const tl = timeline(ref.current.doc.items);
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

  // --- 引き出すタイムライン（人・音・光・モノの行）。開き具合は端末ごとに覚えておく
  const [tlOpen, setTlOpenRaw] = useState(false);
  const [tlHeight, setTlHeightRaw] = useState(260);
  useEffect(() => {
    try {
      setTlOpenRaw(localStorage.getItem('stage:tl-open') === '1');
      const h = Number(localStorage.getItem('stage:tl-h'));
      if (h > 0) setTlHeightRaw(h);
    } catch {
      /* noop */
    }
  }, []);
  const setTlOpen = (v: boolean) => {
    setTlOpenRaw(v);
    try {
      localStorage.setItem('stage:tl-open', v ? '1' : '0');
    } catch {
      /* noop */
    }
  };
  const setTlHeight = (h: number) => {
    setTlHeightRaw(h);
    try {
      localStorage.setItem('stage:tl-h', String(Math.round(h)));
    } catch {
      /* noop */
    }
  };
  /** タイムラインで帯・印を触った：その項目へ（そこが書き込み位置になる） */
  const onPick = (itemId: string) => {
    const i = ref.current.doc.items.findIndex((x) => x.id === itemId);
    if (i >= 0) setCursor(i);
  };
  /** 帯・印を時刻 t へドラッグした：その位置へ並べ替える（きっかけが変わる） */
  const onPlace = (itemId: string, t: number) => {
    const next = placeAt(ref.current.doc.items, itemId, t);
    const i = next.findIndex((x) => x.id === itemId);
    commit({ items: next, cursor: i });
    clock.set(timeline(next).starts[i] ?? 0);
  };
  /** 間の帯の長さを変えた（0.5秒きざみ） */
  const onResizeMa = (itemId: string, sec: number) => {
    const s = Math.max(0.5, Math.round(sec * 2) / 2);
    const { doc, cursor } = ref.current;
    commit({ items: updateItem(doc.items, itemId, { s } as Partial<Item>), cursor });
  };

  const onSeek = useCallback((t: number) => {
    const tl = timeline(ref.current.doc.items);
    clock.set(t);
    dispatch({ type: 'cursor', cursor: indexAt(tl, t) });
    setScrollKey((k) => k + 1);
  }, []);
  const togglePlay = useCallback(() => {
    if (!playing) {
      const tl = timeline(ref.current.doc.items);
      const at = tl.starts[ref.current.cursor] ?? 0;
      clock.set(at >= tl.total - 0.05 ? 0 : at);
    }
    setPlaying((v) => !v);
  }, [playing]);

  // 「見せる」は頭から：板付きまで済ませた暗い舞台で、題を出して待つ
  const firstLight = items.findIndex((it) => it.t === 'light');
  const boardEnd = firstLight > 0 && items.slice(0, firstLight).every((it) => it.t === 'move') ? firstLight - 1 : -1;
  const enterShow = () => {
    setPlaying(false);
    clock.set(boardEnd >= 0 ? tl.starts[boardEnd + 1] : 0);
    dispatch({ type: 'cursor', cursor: boardEnd });
    setFull(true);
  };

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
      } else if (e.key === ' ' && !typing && (full || mode === 'make')) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'Escape' && full) {
        setPlaying(false);
        setFull(false);
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [mode, full, togglePlay]);

  const onImport = async (f: File) => {
    try {
      const next = parseItems(await f.text());
      dispatch({ type: 'commit', doc: { ...ref.current.doc, items: next }, cursor: next.length - 1 });
    } catch (err) {
      alert(`読み込めなかった：${(err as Error).message}`);
    }
  };
  const onTitle = (title: string) => dispatch({ type: 'commit', doc: { ...ref.current.doc, title }, group: 'title' });

  const make = mode === 'make';
  const atTop = full && !playing && cursor <= boardEnd && isDark(st);
  const stage = (
    <Stage
      cast={cast}
      st={st}
      interactive={make && !full && !playing}
      size={full ? 'big' : 'normal'}
      bubble={bubble}
      cueNames={cueNames}
      reduced={reduced}
      onMove={onMove}
      onTapRole={onTouchRole}
      onLight={onLight}
      apiRef={stageApi}
      onEdit={onEdit}
      onCast={onCast}
      onHold={onHold}
      autoEdit={autoEdit}
      onDoneEdit={onDoneEdit}
      onSwap={onSwap}
      onBackdrop={onBackdrop}
      total={full ? tl.total : undefined}
      title={atTop ? `${doc.genre}「${doc.title}」` : null}
      onTap={full ? togglePlay : undefined}
    />
  );

  // 全画面プレビュー：3D空間だけ。触ると再生／停止、Esc か隅の × で戻る
  if (full)
    return (
      <div className="stage-app mode-show screen-only">
        {stage}
        <button
          className="show-exit"
          aria-label="戻る"
          onClick={() => {
            setPlaying(false);
            setFull(false);
          }}
        >
          ×
        </button>
      </div>
    );

  const sheet = (
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
  );
  const scriptView = (
    <ScriptView
      cast={cast}
      items={items}
      states={states}
      cursor={cursor}
      layers={mode === 'write' ? layers : new Set()}
      openChip={openChip}
      focusName={focusName}
      scrollKey={scrollKey}
      onOpenChip={setOpenChip}
      onCursor={setCursor}
      onEdit={onEdit}
      onRemove={onRemove}
      onMoveChip={onMoveChip}
    />
  );

  return (
    <>
    <div className={`stage-app app mode-${mode} screen-only`}>
      <header>
        <a className="docbtn" href="/" aria-label="ネタ一覧へ">
          ←
        </a>
        <input className="title" value={doc.title} onChange={(e) => onTitle(e.target.value)} aria-label="題" />
        <span className="undo" hidden={make}>
          <button disabled={!h.past.length} onClick={() => dispatch({ type: 'undo' })} aria-label="元に戻す">
            ↶
          </button>
          <button disabled={!h.future.length} onClick={() => dispatch({ type: 'redo' })} aria-label="やり直す">
            ↷
          </button>
        </span>
        <nav className="modes">
          {MODES.map(([m, l]) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {l}
            </button>
          ))}
        </nav>
        <button className="theme" onClick={() => setTheme(theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto')} aria-label="テーマ">
          {theme === 'auto' ? '◐' : theme === 'light' ? '○' : '●'}
        </button>
      </header>

      <main>
        {make && (
          <div className="desk">
            <SoundDevice
              st={st}
              cueNames={cueNames}
              editing={soundEdit ? (items.find((x) => x.id === soundEdit.id) ?? null) : null}
              editKey={soundEdit?.n}
              interactive={!playing}
              onNew={onSpeaker}
              onStop={onBadge}
              onSE={() => onSE('')}
              onName={(id, x) => {
                const it = ref.current.doc.items.find((i) => i.id === id);
                onEdit(id, { x: it?.t === 'cue' ? x || undefined : x } as Partial<Item>);
              }}
              onNameDone={onSoundDone}
            />
            <LightConsole st={st} interactive={!playing} onLight={onLightAll} />
            <section className="left">{stage}</section>
            <CastBox cast={cast} st={st} interactive={!playing} onDrop={onDropFromBox} onAdd={onAddPuppet} />
            <PropBox cast={cast} st={st} interactive={!playing} onDrop={onDropFromBox} onAdd={onAddProp} />
          </div>
        )}
        {mode === 'write' && (
          <section className="right">
            {sheet}
            {scriptView}
          </section>
        )}
        {mode === 'hand' && (
          <section className="hand">
            <HandOff doc={doc} onImport={onImport} onPrint={() => window.print()}>
              <Info doc={doc} onChange={onInfo} />
            </HandOff>
          </section>
        )}
      </main>

      <footer>
        {mode === 'write' && (
          <InputBar cast={cast} role={role} kind={kind} onRole={onTapRole} onKind={setKind} onSubmit={onSubmit} onMa={onMa} onSE={onSE} autoFocus />
        )}
        {mode === 'write' && <TimeBar cast={cast} items={items} states={states} tl={tl} playing={playing} onToggle={togglePlay} onSeek={onSeek} />}
        {make && (
          <Transport
            cast={cast}
            items={items}
            states={states}
            tl={tl}
            playing={playing}
            canUndo={!!h.past.length}
            canRedo={!!h.future.length}
            onToggle={togglePlay}
            onSeek={onSeek}
            onUndo={() => dispatch({ type: 'undo' })}
            onRedo={() => dispatch({ type: 'redo' })}
            onMa={onMa}
            onFull={enterShow}
            expanded={tlOpen}
            onExpand={setTlOpen}
            height={tlHeight}
            onHeight={setTlHeight}
          >
            <TimelineView
              doc={doc}
              states={states}
              tl={tl}
              cursorItemId={items[cursor]?.id}
              playing={playing}
              onSeek={onSeek}
              onPick={onPick}
              onPlace={onPlace}
              onResizeMa={onResizeMa}
            />
          </Transport>
        )}
      </footer>
    </div>
    <div className="print-only">
      <PrintSheet doc={doc} />
    </div>
    </>
  );
}

export type { Doc };
