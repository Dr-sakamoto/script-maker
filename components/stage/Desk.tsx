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

/** 触ったら1回。長押しで秒数を決める操作は置かない（秒数は「かく」のチップで） */
function Tap(p: { className?: string; title?: string; onPress: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button className={p.className} title={p.title} disabled={p.disabled} onClick={p.onPress}>
      {p.children}
    </button>
  );
}

/** 音源プレーヤー：網を叩く＝新しい音源を入れる（C.I）、॥＝止める（C.O） */
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
            <Tap key={n} className="stop" title={`音源${circled(n)}を止める`} disabled={!p.interactive} onPress={() => p.onStop(n, 0)}>
              ॥{circled(n)}
            </Tap>
          ))}
          <button className="se" disabled={!p.interactive} onClick={p.onSE} title="SE">
            SE
          </button>
        </div>
      </div>
      <Tap className="grill" title="新しい音源" disabled={!p.interactive} onPress={() => p.onNew(0)}>
        <span />
      </Tap>
    </div>
  );
}

/** 照明卓：全体の明転・暗転・じわ（じわは3秒。変えるなら「かく」のチップで） */
export function LightConsole(p: { st: StageState; interactive: boolean; onLight: (on: boolean, fade: number) => void }) {
  return (
    <div className="dev light">
      <Tap className={`big${p.st.lit ? ' lit' : ''}`} disabled={!p.interactive} onPress={() => p.onLight(true, 0)}>
        明転
      </Tap>
      <Tap className={`big${!p.st.lit ? ' lit' : ''}`} disabled={!p.interactive} onPress={() => p.onLight(false, 0)}>
        暗転
      </Tap>
      <Tap disabled={!p.interactive} onPress={() => p.onLight(true, 3)}>
        じわ明
      </Tap>
      <Tap disabled={!p.interactive} onPress={() => p.onLight(false, 3)}>
        じわ暗
      </Tap>
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
export function CastBox(p: { cast: CastMember[]; st: StageState; interactive: boolean; onDrop: (id: Role, cx: number, cy: number) => void; onAdd: (name: string) => void }) {
  const { start, ghostEl } = useDragOut(p.onDrop);
  const [adding, setAdding] = useState(false);
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
        {adding ? (
          <input
            className="thing new"
            autoFocus
            placeholder="名前"
            enterKeyHint="done"
            onBlur={(e) => {
              if (e.target.value.trim()) p.onAdd(e.target.value.trim());
              setAdding(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button className="thing add" disabled={!p.interactive} onClick={() => setAdding(true)} title="人形を足す">
            ＋
          </button>
        )}
      </div>
      {ghostEl}
    </div>
  );
}

/**
 * 小道具箱：引っぱり出す＝置く／人形の上に落とす＝持たせる、舞台から箱に入れる＝片付ける。
 * ＋で足すとき、✋（手に持つ＝小道具）か ▭（置くだけ＝大道具。袖に立つ点線の円）かを選ぶ
 */
export function PropBox(p: {
  cast: CastMember[];
  st: StageState;
  interactive: boolean;
  onDrop: (id: Role, cx: number, cy: number) => void;
  onAdd: (name: string, kind: 'prop' | 'set') => void;
}) {
  const { start, ghostEl } = useDragOut(p.onDrop);
  const [adding, setAdding] = useState<'prop' | 'set' | null>(null);
  // 誰かが持っている小道具（卵など）は箱に入れない
  const off = p.cast.filter((c) => c.kind === 'prop' && !p.st.held[c.id] && !p.st.pos[c.id]?.on);
  return (
    <div className="dev box props" data-drop="box">
      <div className="inbox">
        {off.map((c) => (
          <button key={c.id} className="thing" style={{ ['--c' as string]: c.color }} disabled={!p.interactive} onPointerDown={start(c.id, c.name, c.color)}>
            {c.name}
          </button>
        ))}
        {adding ? (
          <span className="adding">
            <span className="kinds">
              <button className={adding === 'prop' ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => setAdding('prop')} title="手に持つ（小道具）">
                ✋
              </button>
              <button className={adding === 'set' ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => setAdding('set')} title="置くだけ（大道具）">
                ▭
              </button>
            </span>
            <input
              className="thing new"
              autoFocus
              placeholder="…"
              enterKeyHint="done"
              onBlur={(e) => {
                if (e.target.value.trim()) p.onAdd(e.target.value.trim(), adding);
                setAdding(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
            />
          </span>
        ) : (
          <button className="thing add" disabled={!p.interactive} onClick={() => setAdding('prop')} title="道具を足す">
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
  /** 引き出したタイムライン（人・音・光・モノの行）。開いていれば細いバーの代わりに出す */
  expanded: boolean;
  onExpand: (v: boolean) => void;
  height: number;
  onHeight: (h: number) => void;
  children?: React.ReactNode;
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
    <div className={`dev transport${p.expanded ? ' expanded' : ''}`}>
      {/* つまんで上下に引くと、タイムラインが開く・高さが変わる */}
      <div
        className="grip"
        title="タイムラインを引き出す"
        onPointerDown={(e) => {
          e.preventDefault();
          const y0 = e.clientY;
          const h0 = p.expanded ? p.height : 0;
          let moved = false;
          const move = (ev: PointerEvent) => {
            const h = h0 + (y0 - ev.clientY);
            if (Math.abs(y0 - ev.clientY) > 4) moved = true;
            if (!moved) return;
            if (h < 90) p.onExpand(false);
            else {
              p.onExpand(true);
              p.onHeight(Math.min(window.innerHeight * 0.75, Math.max(140, h)));
            }
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (!moved) p.onExpand(!p.expanded);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      >
        <i />
      </div>
      {p.expanded ? (
        <div className="tl-box" style={{ height: p.height }}>
          {p.children}
        </div>
      ) : (
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
      )}
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
