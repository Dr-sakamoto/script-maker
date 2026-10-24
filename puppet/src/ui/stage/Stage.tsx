import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { member } from '../../model/cast';
import { circled } from '../../model/export';
import { layoutLabels, type Label } from '../../model/layout';
import { NARRATOR, WING, type Place, type StageState } from '../../model/state';
import type { CastMember, Item, PinNo, Role } from '../../model/types';
import { BATTEN, camPose, FIXTURES, HEAD_Y, makeCamera, project, screenToPct, SPEAKER, WING_PEEK, worldX } from './geom';
import { Puppet3D } from './Puppet3D';
import { Batten, Lights, Speaker3D, StageSet } from './Scene';

export type StageProps = {
  cast: CastMember[];
  st: StageState;
  interactive: boolean;
  size: 'normal' | 'big' | 'small';
  inputRole?: Role;
  bubble?: Extract<Item, { t: 'line' }> | null;
  cueNames: Record<number, string>;
  reduced: boolean;
  onMove?: (role: Role, place: Place) => void;
  onTapRole?: (role: Role) => void;
  onLight?: (p: PinNo | undefined, fade: number) => void;
  onSpeaker?: (fade: number) => void;
  onBadge?: (n: number, fade: number) => void;
  onEdit?: (id: string, patch: Partial<Item>) => void;
};

type Hold = { key: string; t0: number; at: { x: number; y: number } };
type Drag = { role: Role; pct: number; moved: boolean };

const HOLD_MIN = 0.35;
const holdSec = (d: number) => Math.min(8, Math.max(1, Math.round(d)));

function Rig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const p = camPose(size.width / Math.max(1, size.height));
    const c = camera as PerspectiveCamera;
    c.fov = p.fov;
    c.position.copy(p.position);
    c.lookAt(p.target);
    c.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

/** 文字幅の見積もり（全角1em・半角0.6em） */
function textW(s: string, px: number) {
  let w = 0;
  for (const ch of s) w += /[\x20-\x7e]/.test(ch) ? px * 0.6 : px;
  return w;
}
function box(text: string, px: number, maxW: number, extraH = 0) {
  const tw = textW(text, px);
  const inner = Math.min(maxW - 18, Math.max(tw, px * 2));
  const lines = Math.max(1, Math.ceil(tw / inner - 0.02));
  return { w: Math.ceil(inner + 24), h: Math.ceil(lines * px * 1.4 + 10 + extraH) };
}

export function Stage(p: StageProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [sz, setSz] = useState({ w: 600, h: 340 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [, tick] = useState(0);
  const [pinMode, setPinMode] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSz({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSz({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!hold) return;
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hold]);

  useEffect(() => {
    if (!p.interactive) setPinMode(false);
  }, [p.interactive]);

  const cam = useMemo(() => makeCamera(sz.w, sz.h), [sz]);
  const proj = (x: number, y: number, z: number) => project(cam, sz.w, sz.h, new Vector3(x, y, z));

  const roles = p.cast.filter((c) => c.kind === 'puppet');
  const shownPct = (r: Role) => {
    if (drag?.role === r && drag.moved) return drag.pct;
    const pl = p.st.pos[r];
    if (!pl) return WING_PEEK.L;
    return pl.on ? pl.x : WING_PEEK[pl.side];
  };
  const isGhost = (r: Role) => {
    if (drag?.role === r && drag.moved) return drag.pct < WING || drag.pct > 100 - WING;
    return !p.st.pos[r]?.on;
  };

  /** タップ（短押し）か長押し（秒数）かを、離したときに判定 */
  const press = (key: string, at: { x: number; y: number }, done: (fade: number) => void) => (e: ThreeEvent<PointerEvent> | React.PointerEvent) => {
    e.stopPropagation();
    const t0 = performance.now();
    setHold({ key, t0, at });
    const end = (ok: boolean) => () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      setHold(null);
      if (!ok) return;
      const d = (performance.now() - t0) / 1000;
      done(d < HOLD_MIN ? 0 : holdSec(d));
    };
    const onUp = end(true);
    const onCancel = end(false);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  /** 人形を掴む。動かさずに離したらタップ（話者にする）。卵を掴んでも持ち主が動く */
  const grab = (r: Role, tapRole: Role = r) => (e: ThreeEvent<PointerEvent>) => {
    if (!p.interactive) return;
    e.stopPropagation();
    const rect = wrap.current!.getBoundingClientRect();
    const sx0 = e.nativeEvent.clientX;
    let d: Drag = { role: r, pct: shownPct(r), moved: false };
    const move = (ev: PointerEvent) => {
      if (!d.moved && Math.abs(ev.clientX - sx0) < 6) return;
      d = { role: r, moved: true, pct: screenToPct(cam, sz.w, sz.h, ev.clientX - rect.left, ev.clientY - rect.top) };
      setDrag(d);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!d.moved) return p.onTapRole?.(tapRole);
      const place: Place = d.pct < WING ? { on: false, side: 'L' } : d.pct > 100 - WING ? { on: false, side: 'R' } : { on: true, x: Math.round(d.pct) };
      p.onMove?.(r, place);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // --- 舞台の上の文字（吹き出し・動き）
  const speakerRole = p.bubble ? (member(p.cast, p.bubble.w)?.holder ?? p.bubble.w) : null;
  const small = p.size === 'small';
  const fs = small ? 11 : p.size === 'big' ? 16 : 14;
  const labels: (Label & { text: string; itemId: string; color?: string; note?: string; role: Role })[] = [];
  for (const [role, a] of Object.entries(p.st.acts)) {
    const isNarr = role === NARRATOR;
    if (!isNarr && !p.st.pos[role]?.on && !(drag?.role === role)) continue;
    const head = isNarr ? proj(0, 2.75, 0) : proj(worldX(shownPct(role)), HEAD_Y, 0);
    const text = `（${a.x || '　'}）`;
    const b = box(text, fs - 1, Math.min(300, sz.w * 0.45));
    labels.push({ id: `act:${role}`, kind: 'act', speaking: role === speakerRole, x: head.x, y: head.y, ...b, text, itemId: a.id, role });
  }
  if (p.bubble && speakerRole) {
    const head = proj(worldX(shownPct(speakerRole)), HEAD_Y, 0);
    const m = member(p.cast, p.bubble.w);
    const prop = m?.kind === 'prop';
    const text = prop ? `『${p.bubble.x || '　'}』` : p.bubble.x || '　';
    const b = box(text, fs + 1, Math.min(300, sz.w * 0.55), p.bubble.n ? fs * 1.2 : 0);
    labels.push({ id: 'bubble', kind: 'bubble', speaking: true, x: head.x, y: head.y - 8, ...b, text, itemId: p.bubble.id, color: m?.color, note: p.bubble.n, role: speakerRole });
  }
  const rects = layoutLabels(labels);

  const playing = Object.keys(p.st.playing).map(Number).sort((a, b) => a - b);
  const spk = proj(SPEAKER.x - 0.05, 1.05, SPEAKER.z);
  const battenAt = proj(0, BATTEN.y - 0.5, BATTEN.z);
  const holdS = hold ? (performance.now() - hold.t0) / 1000 : 0;
  const wingL = proj(worldX(WING), 0, 0).x;
  const wingR = proj(worldX(100 - WING), 0, 0).x;
  const dragWing = drag?.moved ? (drag.pct < WING ? 'L' : drag.pct > 100 - WING ? 'R' : null) : null;

  const lightTap = (pin: PinNo | undefined) => (fade: number) => {
    p.onLight?.(pin, fade);
    if (pin) setPinMode(false);
  };

  return (
    <div ref={wrap} className={`stage stage-${p.size}${p.interactive ? ' live' : ''}`}>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} camera={{ fov: 34, position: [0, 2.2, 9] }}>
        <Rig />
        <color attach="background" args={['#0c0a0f']} />
        <StageSet />
        <Lights
          lit={p.st.lit}
          litFade={p.st.litFade}
          pins={p.st.pins}
          pinFade={p.st.pinFade}
          pinX={FIXTURES.map((x) => x * 0.95)}
          reduced={p.reduced}
        />
        <Batten
          interactive={p.interactive}
          pinMode={pinMode}
          pins={p.st.pins}
          lit={p.st.lit}
          onBar={pinMode ? undefined : press('batten', battenAt, lightTap(undefined))}
          onPin={(i) => press(`pin${i}`, proj(FIXTURES[i], BATTEN.y - 0.55, BATTEN.z), lightTap((i + 1) as PinNo))}
          onToggle={(e) => {
            e.stopPropagation();
            setPinMode((v) => !v);
          }}
        />
        <Speaker3D
          playing={playing.length > 0}
          reduced={p.reduced}
          onDown={p.interactive ? press('speaker', spk, (f) => p.onSpeaker?.(f)) : undefined}
        />
        {roles.map((r) => {
          const pct = shownPct(r.id);
          const others = roles.filter((o) => o.id !== r.id && p.st.pos[o.id]?.on).map((o) => shownPct(o.id));
          const near = others.sort((a, b) => Math.abs(a - pct) - Math.abs(b - pct))[0];
          const face = near == null ? 0 : Math.sign(near - pct);
          const prop = p.cast.find((c) => c.kind === 'prop' && c.holder === r.id);
          return (
            <Puppet3D
              key={r.id}
              member={r}
              x={worldX(pct)}
              face={face}
              ghost={isGhost(r.id)}
              speaking={p.bubble?.w === r.id}
              holding={prop}
              marker={p.interactive && p.inputRole === r.id ? r.color : null}
              propMarker={p.interactive && prop && p.inputRole === prop.id ? prop.color : null}
              reduced={p.reduced}
              dragging={drag?.role === r.id && drag.moved}
              onDown={p.interactive ? grab(r.id) : undefined}
              onPropDown={p.interactive && prop ? grab(r.id, prop.id) : undefined}
            />
          );
        })}
      </Canvas>

      <div className="overlay">
        {p.interactive && drag?.moved && (
          <>
            <div className={`wing wing-l${dragWing === 'L' ? ' hot' : ''}`} style={{ width: wingL }} />
            <div className={`wing wing-r${dragWing === 'R' ? ' hot' : ''}`} style={{ left: wingR }} />
          </>
        )}

        {labels.map((l) => {
          const r = rects[l.id];
          const style = { left: r.l, top: r.t, width: l.w, minHeight: l.h, fontSize: l.kind === 'bubble' ? fs + 1 : fs - 1 };
          const canEdit = p.interactive && !!p.onEdit;
          if (l.kind === 'act')
            return (
              <div
                key={l.id}
                className="act-label"
                style={style}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => canEdit && setEditing(l.id)}
              >
                {editing === l.id ? (
                  <input
                    autoFocus
                    defaultValue={p.st.acts[l.role]?.x}
                    onChange={(e) => p.onEdit?.(l.itemId, { x: e.target.value })}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  l.text
                )}
              </div>
            );
          return (
            <div
              key={l.id}
              className={`bubble${member(p.cast, p.bubble?.w)?.kind === 'prop' ? ' voice' : ''}`}
              style={{ ...style, borderColor: l.color, ['--tail' as string]: `${Math.max(12, Math.min(l.w - 12, l.x - r.l))}px` }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => canEdit && setEditing('bubble')}
            >
              {editing === 'bubble' && p.bubble ? (
                <BubbleEdit
                  line={p.bubble}
                  onEdit={(patch) => p.onEdit?.(p.bubble!.id, patch)}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <>
                  <span>{l.text}</span>
                  {l.note && <span className="note">（{l.note}）</span>}
                </>
              )}
            </div>
          );
        })}

        {playing.length > 0 && (
          <div className="badges" style={{ left: spk.x, top: spk.y }}>
            {playing.map((n) => (
              <button
                key={n}
                className="badge"
                title={p.cueNames[n] || `音源${circled(n)}`}
                disabled={!p.interactive}
                onPointerDown={p.interactive ? press(`badge${n}`, spk, (f) => p.onBadge?.(n, f)) : undefined}
              >
                ♪{circled(n)}
              </button>
            ))}
          </div>
        )}

        {hold && holdS >= HOLD_MIN && (
          <div className={`holdbar${hold.key.startsWith('batten') || hold.key.startsWith('pin') ? ' light' : ' sound'}`} style={{ left: hold.at.x, top: hold.at.y }}>
            <div className="fill" style={{ width: `${(Math.min(8, holdS) / 8) * 100}%` }} />
            <span>{holdSec(holdS)}″</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BubbleEdit({ line, onEdit, onDone }: { line: Extract<Item, { t: 'line' }>; onEdit: (p: Partial<Item>) => void; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="bubble-edit"
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) onDone();
      }}
    >
      <input autoFocus defaultValue={line.x} placeholder="セリフ" onChange={(e) => onEdit({ x: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && onDone()} />
      <input defaultValue={line.n ?? ''} placeholder="（演技メモ）" onChange={(e) => onEdit({ n: e.target.value || undefined })} onKeyDown={(e) => e.key === 'Enter' && onDone()} />
    </div>
  );
}
