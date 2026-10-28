import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { StageState } from '../../lib/stage/state';
import { fmtTime, type Timeline } from '../../lib/stage/timing';
import { buildLanes, GROUP_LABEL, type Clip, type Lane, type LaneGroup, type Mark } from '../../lib/stage/tracks';
import type { Doc } from '../../lib/stage/types';
import { useClock } from './clock';

/**
 * 音楽・動画の編集ツールのようなタイムライン。人・音・光・モノを1行ずつ並べる。
 * - 帯や印をタップ＝その場面へ（そこが書き込み位置になる）
 * - 印・セリフ・動き・間を左右にドラッグ＝その時刻へ動かす（きっかけが変わる）
 * - 出〜ハケ、音の入〜止め、明〜暗の帯は、両端をつまんで動かせる
 * - 間の帯は右端をつまむと長さが変わる
 * - 目盛りを触る＝その時刻へ。±で拡大縮小（Ctrl＋ホイールでも）
 */

const LABEL = 76; // 行の名前の幅
const ROW = 26;
const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];

type Drag = { key: string; itemId: string; mode: 'move' | 'edge' | 'ma'; t0: number; x0: number; t: number; moved: boolean };

type Props = {
  doc: Doc;
  states: StageState[];
  tl: Timeline;
  cursorItemId?: string;
  playing: boolean;
  onSeek: (t: number) => void;
  onPick: (itemId: string) => void;
  onPlace: (itemId: string, t: number) => void;
  onResizeMa: (itemId: string, sec: number) => void;
};

export function TimelineView(p: Props) {
  const lanes = useMemo(() => buildLanes(p.doc, p.tl, p.states), [p.doc, p.tl, p.states]);
  const scroller = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [zoom, setZoom] = useState<number | null>(null); // 1秒あたりの px（null＝全体が収まる）
  const [drag, setDrag] = useState<Drag | null>(null);
  // 帯を掴んでいる間は、下の行の「触った所へ再生位置を動かす」を止める（ポインタの動きは行まで伝わるため）
  const holding = useRef(false);
  const t = useClock();
  const T = Math.max(p.tl.total, 1);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const fit = Math.max(4, (w - LABEL - 24) / T);
  const pps = zoom ?? fit;
  const X = (sec: number) => LABEL + sec * pps;
  const width = X(T) + 40;
  const step = STEPS.find((s) => s * pps >= 48) ?? 300;

  // 再生中は再生位置が見えるように追いかける
  useEffect(() => {
    const el = scroller.current;
    if (!el || !p.playing) return;
    const x = X(t);
    if (x < el.scrollLeft + LABEL || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - LABEL - 40;
  });

  // Ctrl＋ホイールで拡大縮小（ピンチもこれになる）
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const f = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(400, Math.max(fit * 0.5, (z ?? fit) * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    el.addEventListener('wheel', f, { passive: false });
    return () => el.removeEventListener('wheel', f);
  }, [fit]);

  const timeAt = (clientX: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return Math.min(T, Math.max(0, (clientX - r.left + el.scrollLeft - LABEL) / pps));
  };

  /** 帯や印を掴む。動かさずに離せばタップ（その場面へ）、動かせばドラッグ */
  const grab = (key: string, itemId: string, mode: Drag['mode'], t0: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!itemId) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    holding.current = true;
    let d: Drag = { key, itemId, mode, t0, x0: e.clientX, t: t0, moved: false };
    setDrag(d);
    const move = (ev: PointerEvent) => {
      if (!d.moved && Math.abs(ev.clientX - d.x0) < 5) return;
      d = { ...d, moved: true, t: Math.max(0, t0 + (ev.clientX - d.x0) / pps) };
      setDrag(d);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      holding.current = false;
      setDrag(null);
      if (ev.type === 'pointercancel') return;
      if (!d.moved) return p.onPick(itemId);
      if (mode === 'ma') p.onResizeMa(itemId, d.t);
      else p.onPlace(itemId, d.t);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const seekDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    p.onSeek(timeAt(e.clientX));
  };
  const seekMove = (e: React.PointerEvent) => !holding.current && e.buttons && p.onSeek(timeAt(e.clientX));

  // ドラッグ中の見た目：動かしている帯・印をずらして見せる
  const shift = (key: string) => (drag?.moved && drag.key === key && drag.mode === 'move' ? (drag.t - drag.t0) * pps : 0);

  const clipEl = (l: Lane, c: Clip) => {
    const cur = c.itemId === p.cursorItemId || c.endItemId === p.cursorItemId;
    const left = X(c.start) + shift(c.key);
    let wpx = Math.max(3, (c.end - c.start) * pps);
    if (drag?.moved && drag.mode === 'ma' && drag.key === c.key) wpx = Math.max(3, drag.t * pps);
    const span = c.kind === 'on' || c.kind === 'held' || c.kind === 'sound' || c.kind === 'light';
    const fi = c.fadeIn ? Math.min(100, ((c.fadeIn * pps) / wpx) * 100) : 0;
    const fo = c.fadeOut ? Math.min(100, ((c.fadeOut * pps) / wpx) * 100) : 0;
    const style: React.CSSProperties = {
      left,
      width: wpx,
      ['--c' as string]: c.color ?? l.color ?? '#888',
      ...(fi || fo ? { clipPath: `polygon(0 100%, ${fi}% 0, ${100 - fo}% 0, 100% 100%)` } : {}),
    };
    return (
      <div
        key={c.key}
        className={`clip k-${c.kind}${cur ? ' cur' : ''}`}
        style={style}
        title={c.label}
        // 出〜ハケなどの帯は、中を触ればその場面へ（動かすのは両端）。セリフ・動き・間は帯ごと動かせる
        onPointerDown={span ? (e) => e.stopPropagation() : grab(c.key, c.itemId, 'move', c.start)}
        onClick={span && c.itemId ? () => p.onPick(c.itemId) : undefined}
      >
        {c.label && <span>{c.label}</span>}
        {span && c.itemId && <i className="edge l" onPointerDown={grab(`${c.key}:s`, c.itemId, 'move', c.start)} />}
        {span && c.endItemId && <i className="edge r" onPointerDown={grab(`${c.key}:e`, c.endItemId, 'move', c.end - (c.fadeOut ?? 0))} />}
        {c.kind === 'ma' && <i className="edge r" onPointerDown={grab(c.key, c.itemId, 'ma', c.end - c.start)} />}
      </div>
    );
  };

  const markEl = (m: Mark) => {
    const cur = m.itemId === p.cursorItemId;
    return (
      <div key={m.key} className={`mark mk-${m.kind}${cur ? ' cur' : ''}`} style={{ left: X(m.t) + shift(m.key) }} title={m.label} onPointerDown={grab(m.key, m.itemId, 'move', m.t)}>
        <b />
        <span>{m.label}</span>
      </div>
    );
  };

  // ドラッグ中の行き先（縦の点線と時刻）
  const ghostT = drag?.moved ? (drag.mode === 'ma' ? null : drag.t) : null;

  let lastGroup: LaneGroup | null = null;
  return (
    <div className="tlv">
      <div className="tlv-zoom">
        <button onClick={() => setZoom(Math.max(fit * 0.5, pps / 1.5))} aria-label="縮小">
          −
        </button>
        <button onClick={() => setZoom(null)} className={zoom == null ? 'on' : ''} title="全体">
          ⇔
        </button>
        <button onClick={() => setZoom(Math.min(400, pps * 1.5))} aria-label="拡大">
          ＋
        </button>
      </div>
      <div className="tlv-scroll" ref={scroller}>
        <div className="tlv-inner" style={{ width }}>
          <div className="tlv-ruler" onPointerDown={seekDown} onPointerMove={seekMove}>
            <div className="tlv-corner">{fmtTime(t)}</div>
            {Array.from({ length: Math.floor(T / step) + 1 }, (_, k) => k * step).map((s) => (
              <span key={s} style={{ left: X(s) }}>
                {s % 60 === 0 || step >= 60 ? fmtTime(s) : `${s % 60}″`}
              </span>
            ))}
          </div>
          {lanes.map((l) => {
            const head = l.group !== lastGroup;
            lastGroup = l.group;
            return (
              <div key={l.id} className={`lane g-${l.group}${head ? ' first' : ''}`} style={{ height: ROW }} onPointerDown={seekDown} onPointerMove={seekMove}>
                <div className="lane-name" style={{ ['--c' as string]: l.color ?? 'transparent' }}>
                  {head && <em>{GROUP_LABEL[l.group]}</em>}
                  <span>{l.label}</span>
                </div>
                {l.clips.filter((c) => c.kind === 'on' || c.kind === 'held').map((c) => clipEl(l, c))}
                {l.clips.filter((c) => c.kind !== 'on' && c.kind !== 'held').map((c) => clipEl(l, c))}
                {l.marks.map(markEl)}
              </div>
            );
          })}
          <div className="tlv-head" style={{ left: X(Math.min(t, T)) }} />
          {ghostT != null && (
            <div className="tlv-ghost" style={{ left: X(ghostT) }}>
              <span>{ghostT < 60 ? `${ghostT.toFixed(1)}″` : fmtTime(ghostT)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
