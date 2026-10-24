import { useEffect, useRef, useState } from 'react';
import { circled } from '../../lib/stage/export';
import type { StageState } from '../../lib/stage/state';
import { fmtTime, type Timeline } from '../../lib/stage/timing';
import type { CastMember, Item, Role } from '../../lib/stage/types';
import { useClock } from './clock';
import { Track } from './TimeBar';

/**
 * つくるの机：舞台のまわりに置く道具。触ることがそのまま操作になる。
 * 左上＝音源プレーヤー、左下＝人形箱、右上＝照明卓、右下＝小道具箱、下＝時間軸。
 */

const HOLD_MIN = 0.35;
const holdSec = (d: number) => Math.min(8, Math.max(1, Math.round(d)));

/** タップか長押し（押した秒数）か。押している間は秒数のバーが伸びる */
function HoldButton(p: { className?: string; title?: string; onPress: (sec: number) => void; children: React.ReactNode; disabled?: boolean }) {
  const [held, setHeld] = useState<number | null>(null);
  const t0 = useRef(0);
  useEffect(() => {
    if (held == null) return;
    let raf = 0;
    const f = () => {
      setHeld((performance.now() - t0.current) / 1000);
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [held != null]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      className={`hold ${p.className ?? ''}`}
      title={p.title}
      disabled={p.disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        t0.current = performance.now();
        setHeld(0);
        const up = (ev: PointerEvent) => {
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          setHeld(null);
          if (ev.type === 'pointercancel') return;
          const d = (performance.now() - t0.current) / 1000;
          p.onPress(d < HOLD_MIN ? 0 : holdSec(d));
        };
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }}
    >
      {p.children}
      {held != null && held >= HOLD_MIN && (
        <span className="holdfill">
          <i style={{ width: `${(Math.min(8, held) / 8) * 100}%` }} />
          <b>{holdSec(held)}″</b>
        </span>
      )}
    </button>
  );
}

/** 音源プレーヤー：本体を叩く＝新しい音源を入れる（長押し＝F.I）、॥＝止める（長押し＝F.O） */
export function SoundDevice(p: {
  st: StageState;
  cueNames: Record<number, string>;
  editing: Item | null;
  editKey?: number;
  interactive: boolean;
  onNew: (fade: number) => void;
  onStop: (n: number, fade: number) => void;
  onSE: () => void;
  onName: (id: string, x: string) => void;
  onNameDone: (id: string) => void;
}) {
  const playing = Object.keys(p.st.playing).map(Number).sort((a, b) => b - a);
  const top = playing[0];
  const ed = p.editing && (p.editing.t === 'cue' || p.editing.t === 'se') ? p.editing : null;
  return (
    <div className="dev sound">
      <div className="screen">
        {ed ? (
          <label className="nowname" key={`${ed.id}:${p.editKey}`}>
            <span>{ed.t === 'cue' ? `音源${circled(ed.n)}` : 'SE'}</span>
            <input
              autoFocus
              defaultValue={ed.t === 'cue' ? (ed.x ?? p.cueNames[ed.n] ?? '') : ed.x}
              placeholder="…"
              enterKeyHint="done"
              onChange={(e) => p.onName(ed.id, e.target.value)}
              onBlur={() => p.onNameDone(ed.id)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
            />
          </label>
        ) : top != null ? (
          <div className="now">
            <span>音源{circled(top)}</span>
            <b>「{p.cueNames[top] || '　'}」</b>
          </div>
        ) : (
          <div className="now idle">—</div>
        )}
        <div className={`wave${top != null ? ' on' : ''}`}>
          {Array.from({ length: 24 }, (_, i) => (
            <i key={i} style={{ height: `${20 + ((i * 37) % 70)}%` }} />
          ))}
        </div>
        <div className="keys">
          {playing.map((n) => (
            <HoldButton key={n} className="stop" title={`音源${circled(n)}を止める（長押し＝F.O）`} disabled={!p.interactive} onPress={(f) => p.onStop(n, f)}>
              ॥{circled(n)}
            </HoldButton>
          ))}
          <button className="se" disabled={!p.interactive} onClick={p.onSE} title="SE">
            SE
          </button>
        </div>
      </div>
      <HoldButton className="grill" title="新しい音源（長押し＝F.I）" disabled={!p.interactive} onPress={p.onNew}>
        <span />
      </HoldButton>
    </div>
  );
}

/** 照明卓：全体の明転・暗転・じわ（じわは長押しの秒数、タップなら3秒） */
export function LightConsole(p: { st: StageState; interactive: boolean; onLight: (on: boolean, fade: number) => void }) {
  return (
    <div className="dev light">
      <HoldButton className={`big${p.st.lit ? ' lit' : ''}`} disabled={!p.interactive} onPress={() => p.onLight(true, 0)}>
        明転
      </HoldButton>
      <HoldButton className={`big${!p.st.lit ? ' lit' : ''}`} disabled={!p.interactive} onPress={() => p.onLight(false, 0)}>
        暗転
      </HoldButton>
      <HoldButton disabled={!p.interactive} onPress={(f) => p.onLight(true, f || 3)}>
        じわ明
      </HoldButton>
      <HoldButton disabled={!p.interactive} onPress={(f) => p.onLight(false, f || 3)}>
        じわ暗
      </HoldButton>
    </div>
  );
}

/** 箱から舞台へ引っぱり出す。舞台の上で離したら onDrop(x) */
function useDragOut(onDrop: (id: Role, cx: number, cy: number) => void, onTap?: (id: Role) => void) {
  const [ghost, setGhost] = useState<{ id: Role; x: number; y: number; label: string; color: string } | null>(null);
  const start = (id: Role, label: string, color: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      moved = true;
      setGhost({ id, x: ev.clientX, y: ev.clientY, label, color });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setGhost(null);
      if (ev.type === 'pointercancel') return;
      if (moved) onDrop(id, ev.clientX, ev.clientY);
      else onTap?.(id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const ghostEl = ghost && (
    <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y, background: ghost.color }}>
      {ghost.label}
    </div>
  );
  return { start, ghostEl };
}

/** 人形箱：舞台に出ていない人形。引っぱり出す＝出、舞台から箱に入れる＝ハケ */
export function CastBox(p: { cast: CastMember[]; st: StageState; interactive: boolean; onDrop: (id: Role, cx: number, cy: number) => void }) {
  const { start, ghostEl } = useDragOut(p.onDrop);
  const off = p.cast.filter((c) => c.kind === 'puppet' && !p.st.pos[c.id]?.on);
  return (
    <div className="dev box cast" data-drop="box">
      <div className="inbox">
        {off.map((c) => (
          <button key={c.id} className="head" style={{ ['--c' as string]: c.color }} disabled={!p.interactive} onPointerDown={start(c.id, c.name, c.color)}>
            <i />
            <span>{c.name}</span>
          </button>
        ))}
        {!off.length && <span className="emptybox">…</span>}
      </div>
      {ghostEl}
    </div>
  );
}

/** 小道具箱：引っぱり出す＝置く、舞台から箱に入れる＝片付ける、＋＝新しい小道具 */
export function PropBox(p: { cast: CastMember[]; st: StageState; interactive: boolean; onDrop: (id: Role, cx: number, cy: number) => void; onAdd: (name: string) => void }) {
  const { start, ghostEl } = useDragOut(p.onDrop);
  const [adding, setAdding] = useState(false);
  // 誰かが持っている小道具（卵など）は箱に入れない
  const off = p.cast.filter((c) => c.kind === 'prop' && !c.holder && !p.st.pos[c.id]?.on);
  return (
    <div className="dev box props" data-drop="box">
      <div className="inbox">
        {off.map((c) => (
          <button key={c.id} className="thing" style={{ ['--c' as string]: c.color }} disabled={!p.interactive} onPointerDown={start(c.id, c.name, c.color)}>
            {c.name}
          </button>
        ))}
        {adding ? (
          <input
            className="thing new"
            autoFocus
            placeholder="…"
            enterKeyHint="done"
            onBlur={(e) => {
              if (e.target.value.trim()) p.onAdd(e.target.value.trim());
              setAdding(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button className="thing add" disabled={!p.interactive} onClick={() => setAdding(true)} title="小道具を足す">
            ＋
          </button>
        )}
      </div>
      {ghostEl}
    </div>
  );
}

/** 時間軸：⏮ ↺ ▷ ↻ ⏭。1分ごとの目盛り */
export function Transport(p: {
  cast: CastMember[];
  items: Item[];
  states: StageState[];
  tl: Timeline;
  playing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onMa: () => void;
  onFull: () => void;
}) {
  const t = useClock();
  const ref = useRef<HTMLDivElement>(null);
  const T = Math.max(p.tl.total, 0.001);
  const seekAt = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    p.onSeek(Math.min(1, Math.max(0, (x - r.left) / r.width)) * T);
  };
  const minutes = Array.from({ length: Math.floor(T / 60) }, (_, i) => (i + 1) * 60);
  return (
    <div className="dev transport">
      <div className="scrub">
        <div
          ref={ref}
          className="track"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            seekAt(e.clientX);
          }}
          onPointerMove={(e) => e.buttons && seekAt(e.clientX)}
        >
          <Track cast={p.cast} items={p.items} states={p.states} tl={p.tl} />
          <div className="tb-head" style={{ left: `${(Math.min(t, T) / T) * 100}%` }} />
        </div>
        <div className="marks">
          {minutes.map((m) => (
            <span key={m} style={{ left: `${(m / T) * 100}%` }}>
              {fmtTime(m)}
            </span>
          ))}
          <span className="end">{fmtTime(T)}</span>
        </div>
      </div>
      <div className="keys">
        <button onClick={p.onMa} title="間">
          ・・
        </button>
        <span className="mid">
          <button onClick={() => p.onSeek(0)} aria-label="頭へ">
            ⏮
          </button>
          <button onClick={p.onUndo} disabled={!p.canUndo} aria-label="元に戻す">
            ↺
          </button>
          <button className="play" onClick={p.onToggle} aria-label={p.playing ? '停止' : '再生'}>
            {p.playing ? '■' : '▷'}
          </button>
          <button onClick={p.onRedo} disabled={!p.canRedo} aria-label="やり直す">
            ↻
          </button>
          <button onClick={() => p.onSeek(T)} aria-label="終わりへ">
            ⏭
          </button>
        </span>
        <button onClick={p.onFull} title="全画面で見る">
          ⛶
        </button>
      </div>
    </div>
  );
}
