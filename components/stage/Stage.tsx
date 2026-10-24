import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { member } from '../../lib/stage/cast';
import { circled } from '../../lib/stage/export';
import { layoutLabels, type Label } from '../../lib/stage/layout';
import { NARRATOR, WING, type Place, type StageState } from '../../lib/stage/state';
import type { CastMember, Item, PinNo, Role } from '../../lib/stage/types';
import { BATTEN, camPose, FIXTURES, HEAD_Y, makeCamera, project, screenToFloor, screenToPct, SET_Z, WING_PEEK, worldX } from './geom';
import { NameTag, Prop3D, Puppet3D } from './Puppet3D';
import { Set3D } from './Set3D';
import { ProgressLine, ScreenSprite } from './Sprites3D';
import { Batten, Lights, StageSet } from './Scene';

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
  onEdit?: (id: string, patch: Partial<Item>) => void;
  /** 「見せる」：全体の秒数。進みは舞台ツラの光の線で出す */
  total?: number;
  /** 「見せる」：幕前に出す題 */
  title?: string | null;
  onTap?: () => void;
  /** これを開いて打たせる（つくる：人形を触ったら吹き出し／動きをその場で打つ）。n を変えると開き直す */
  autoEdit?: { id: string; n: number } | null;
  /** 舞台の上で打ち終えた（空なら消す） */
  onDoneEdit?: (id: string) => void;
  /** セリフ「」⇄（動き）を入れ替える */
  onSwap?: (id: string) => void;
  /** 背景（ホリゾント）を触った：話者なしの（動き） */
  onBackdrop?: () => void;
  /** 舞台の外（人形箱・小道具箱）から落としたときに、舞台の x（0〜100）を求める */
  apiRef?: React.MutableRefObject<{ pctAt: (clientX: number, clientY: number) => number | null } | null>;
  /** 舞台の隅に置く小さな道具（記号だけ） */
  tray?: React.ReactNode;
  /** 小道具を人形に持たせる（人形の上で離した） */
  onHold?: (prop: Role, by: Role) => void;
  /** 人形の長押し：名前と色を変える */
  onCast?: (role: Role, patch: { name?: string; color?: string }) => void;
};

type Drag = { role: Role; pct: number; moved: boolean };


function Rig({ halfW }: { halfW: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const p = camPose(size.width / Math.max(1, size.height), halfW);
    const c = camera as PerspectiveCamera;
    c.fov = p.fov;
    c.position.copy(p.position);
    c.lookAt(p.target);
    c.updateProjectionMatrix();
  }, [camera, size, halfW]);
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
  /** 向きを変えるために選んでいる大道具 */
  const [selSet, setSelSet] = useState<Role | null>(null);
  /** 大道具を動かしている最中の位置・向き */
  const [moving, setMoving] = useState<{ role: Role; pct: number; z: number; r: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [castEdit, setCastEdit] = useState<Role | null>(null);
  const finish = (id: string) => {
    setEditing(null);
    p.onDoneEdit?.(id);
  };
  useEffect(() => {
    const a = p.autoEdit;
    if (!a) return;
    if (p.bubble?.id === a.id) return setEditing('bubble');
    const role = Object.entries(p.st.acts).find(([, v]) => v.id === a.id)?.[0];
    if (role) setEditing(`act:${role}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.autoEdit?.id, p.autoEdit?.n]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSz({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSz({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const halfW = p.size === 'big' ? 4.4 : 4.7;
  const cam = useMemo(() => makeCamera(sz.w, sz.h, halfW), [sz, halfW]);
  if (p.apiRef)
    p.apiRef.current = {
      pctAt: (cx, cy) => {
        const r = wrap.current?.getBoundingClientRect();
        if (!r || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
        return Math.round(screenToPct(cam, sz.w, sz.h, cx - r.left, cy - r.top));
      },
    };
  const proj = (x: number, y: number, z: number) => project(cam, sz.w, sz.h, new Vector3(x, y, z));

  const roles = p.cast.filter((c) => c.kind === 'puppet');
  // 舞台に置いてある小道具（掴んでいる最中も）
  const floorProps = p.cast.filter((c) => c.kind === 'prop' && (p.st.pos[c.id]?.on || (drag?.role === c.id && drag.moved)));
  const sets = p.cast.filter((c) => c.kind === 'set');
  const shownPct = (r: Role): number => {
    if (drag?.role === r && drag.moved) return drag.pct;
    if (moving?.role === r) return moving.pct;
    const by = p.st.held[r];
    if (by && !(drag?.role === r)) return shownPct(by);
    const pl = p.st.pos[r];
    if (!pl) return WING_PEEK.L;
    return pl.on ? pl.x : WING_PEEK[pl.side];
  };
  const isGhost = (r: Role) => {
    if (drag?.role === r && drag.moved) return drag.pct < WING || drag.pct > 100 - WING;
    if (moving?.role === r) return moving.pct < WING || moving.pct > 100 - WING;
    return !p.st.pos[r]?.on;
  };

  /** 人形を掴む。動かさずに離したらタップ（話者にする）、長押しなら名前と色。卵を掴んでも持ち主が動く */
  const grab = (r: Role, tapRole: Role = r) => (e: ThreeEvent<PointerEvent>) => {
    if (!p.interactive) return;
    e.stopPropagation();
    const t0 = performance.now();
    const rect = wrap.current!.getBoundingClientRect();
    const sx0 = e.nativeEvent.clientX;
    let d: Drag = { role: r, pct: shownPct(r), moved: false };
    const move = (ev: PointerEvent) => {
      if (!d.moved && Math.abs(ev.clientX - sx0) < 6) return;
      d = { role: r, moved: true, pct: screenToPct(cam, sz.w, sz.h, ev.clientX - rect.left, ev.clientY - rect.top) };
      setDrag(d);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!d.moved) {
        if (performance.now() - t0 > 500 && p.onCast) return setCastEdit(tapRole);
        return p.onTapRole?.(tapRole);
      }
      // 小道具を人形の上で離したら、その人形が持つ
      if (member(p.cast, r)?.kind === 'prop' && p.onHold) {
        const by = roles
          .filter((o) => p.st.pos[o.id]?.on)
          .map((o) => ({ id: o.id, d: Math.abs((p.st.pos[o.id] as { x: number }).x - d.pct) }))
          .filter((o) => o.d < 7)
          .sort((a, b) => a.d - b.d)[0];
        if (by) return p.onHold(r, by.id);
      }
      // 人形箱・小道具箱の上で離したら、近い袖へハケる／片付ける
      const overBox = !!(document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-drop="box"]');
      const place: Place = overBox
        ? { on: false, side: d.pct < 50 ? 'L' : 'R' }
        : d.pct < WING
          ? { on: false, side: 'L' }
          : d.pct > 100 - WING
            ? { on: false, side: 'R' }
            : { on: true, x: Math.round(d.pct) };
      p.onMove?.(r, place);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /** 大道具を掴んで床の上を動かす（奥行きも）。動かさずに離したら選ぶ（向きを変えるつまみが出る） */
  const grabSet = (r: Role) => (e: ThreeEvent<PointerEvent>) => {
    if (!p.interactive) return;
    e.stopPropagation();
    const rect = wrap.current!.getBoundingClientRect();
    const pl = p.st.pos[r];
    const start = pl?.on ? { pct: pl.x, z: pl.z ?? 0.6, r: pl.r ?? 0 } : { pct: shownPct(r), z: setZ(r), r: 0 };
    const f0 = screenToFloor(cam, sz.w, sz.h, e.nativeEvent.clientX - rect.left, e.nativeEvent.clientY - rect.top);
    let cur = { role: r, ...start };
    let moved = false;
    const move = (ev: PointerEvent) => {
      const f = screenToFloor(cam, sz.w, sz.h, ev.clientX - rect.left, ev.clientY - rect.top);
      if (!f || !f0) return;
      if (!moved && Math.abs(f.pct - f0.pct) < 1.5 && Math.abs(f.z - f0.z) < 0.08) return;
      moved = true;
      cur = {
        role: r,
        pct: Math.min(100, Math.max(0, start.pct + f.pct - f0.pct)),
        z: Math.min(SET_Z.max, Math.max(SET_Z.min, start.z + f.z - f0.z)),
        r: start.r,
      };
      setMoving(cur);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setMoving(null);
      if (!moved) return setSelSet((v) => (v === r ? null : r));
      const overBox = !!(document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-drop="box"]');
      const off = overBox || cur.pct < WING || cur.pct > 100 - WING;
      p.onMove?.(r, off ? { on: false, side: cur.pct < 50 ? 'L' : 'R' } : { on: true, x: Math.round(cur.pct), z: Math.round(cur.z * 20) / 20, r: cur.r });
      if (off) setSelSet(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /** つまみを回して向きを変える（15度きざみ） */
  const rotateSet = (r: Role) => (e: ThreeEvent<PointerEvent>) => {
    if (!p.interactive) return;
    e.stopPropagation();
    const pl = p.st.pos[r];
    if (!pl?.on) return;
    const rect = wrap.current!.getBoundingClientRect();
    const cx = worldX(pl.x);
    const cz = pl.z ?? 0.6;
    let cur = { role: r, pct: pl.x, z: cz, r: pl.r ?? 0 };
    const move = (ev: PointerEvent) => {
      const f = screenToFloor(cam, sz.w, sz.h, ev.clientX - rect.left, ev.clientY - rect.top);
      if (!f) return;
      const ang = (Math.atan2(worldX(f.pct) - cx, f.z - cz) * 180) / Math.PI;
      cur = { ...cur, r: (((Math.round(-ang / 15) * 15) % 360) + 360) % 360 };
      setMoving(cur);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setMoving(null);
      if (cur.r !== (pl.r ?? 0)) p.onMove?.(r, { on: true, x: pl.x, z: pl.z, r: cur.r });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /** 袖に置いてある大道具の x（少しずつずらして重ならないように） */
  const wingX = (r: Role) => {
    const side = p.st.pos[r]?.on ? 'R' : ((p.st.pos[r] as { side?: 'L' | 'R' })?.side ?? 'R');
    const i = sets.filter((c) => { const q = p.st.pos[c.id]; return !q?.on && (q?.side ?? 'R') === side; }).findIndex((c) => c.id === r);
    return side === 'L' ? 4 + i * 3 : 96 - i * 3;
  };
  /** 袖に置いてある大道具は、奥へ向かって並べる */
  const setZ = (r: Role) => {
    const pl = p.st.pos[r];
    if (pl?.on) return pl.z ?? 0.6;
    const side = pl?.side ?? 'R';
    const i = sets.filter((c) => { const q = p.st.pos[c.id]; return !q?.on && (q?.side ?? 'R') === side; }).findIndex((c) => c.id === r);
    return 1.1 - i * 1.0;
  };

  // --- 舞台の上の文字（吹き出し・動き）
  const speakerRole = p.bubble ? (member(p.cast, p.bubble.w)?.holder ?? p.bubble.w) : null;
  const small = p.size === 'small';
  const fs = small ? 11 : p.size === 'big' ? Math.round(Math.min(18, Math.max(12, sz.w / 60))) : 14;
  const labels: (Label & { text: string; itemId: string; color?: string; note?: string; role: Role; ring?: string })[] = [];
  for (const [role, a] of Object.entries(p.st.acts)) {
    const isNarr = role === NARRATOR;
    if (!isNarr && !p.st.pos[role]?.on && !(drag?.role === role)) continue;
    const head = isNarr ? proj(0, 2.75, 0) : proj(worldX(shownPct(role)), HEAD_Y, 0);
    const text = `（${a.x || '　'}）`;
    // 白い文字・黒の縁・その役の色の縁の3層
    const ring = isNarr ? undefined : member(p.cast, role)?.color;
    const b = box(text, fs - 1, Math.min(300, sz.w * 0.45));
    labels.push({ id: `act:${role}`, kind: 'act', speaking: role === speakerRole, x: head.x, y: head.y, ...b, text, itemId: a.id, role, ring });
  }
  if (p.bubble && speakerRole) {
    const head = proj(worldX(shownPct(speakerRole)), HEAD_Y, 0);
    const m = member(p.cast, p.bubble.w);
    const prop = m?.kind === 'prop';
    const text = prop ? `『${p.bubble.x || '　'}』` : p.bubble.x || '　';
    // 打っている間は入力欄2段ぶんの大きさを取って、ほかの文字を避けさせる
    const typing = editing === 'bubble';
    const b0 = box(text, fs + 1, Math.min(300, sz.w * 0.55), typing ? fs * 2 : p.bubble.n ? fs * 1.2 : 0);
    const b = typing ? { w: Math.max(b0.w, Math.min(240, sz.w * 0.6)), h: b0.h } : b0;
    labels.push({ id: 'bubble', kind: 'bubble', speaking: true, x: head.x, y: head.y - 8, ...b, text, itemId: p.bubble.id, color: m?.color, note: p.bubble.n, role: speakerRole });
  }
  const rects = layoutLabels(labels);
  // 画面の外にはみ出さない
  for (const r of Object.values(rects)) {
    const dx = r.l < 4 ? 4 - r.l : r.r > sz.w - 4 ? sz.w - 4 - r.r : 0;
    r.l += dx;
    r.r += dx;
  }

  const playing = Object.keys(p.st.playing).map(Number).sort((a, b) => a - b);
  const wingL = proj(worldX(WING), 0, 0).x;
  const wingR = proj(worldX(100 - WING), 0, 0).x;
  const dragWing = drag?.moved ? (drag.pct < WING ? 'L' : drag.pct > 100 - WING ? 'R' : null) : null;

  // 「見せる」は文字も3D空間に置く（HTMLの重ね書きを使わない）
  const in3D = p.size === 'big';

  return (
    <div ref={wrap} className={`stage stage-${p.size}${p.interactive ? ' live' : ''}`} onClick={p.onTap}>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} camera={{ fov: 34, position: [0, 2.2, 9] }}>
        <Rig halfW={halfW} />
        <color attach="background" args={['#0c0a0f']} />
        <StageSet onBackdrop={p.interactive && p.onBackdrop ? (e) => (e.stopPropagation(), p.onBackdrop!()) : undefined} />
        <Lights
          lit={p.st.lit}
          litFade={p.st.litFade}
          pins={p.st.pins}
          pinFade={p.st.pinFade}
          pinX={FIXTURES.map((x) => x * 0.95)}
          reduced={p.reduced}
        />
        {/* 灯体を直接触る＝そのピン（タップ＝カット、長押し＝じわ）。全体は照明卓で */}
        <Batten
          interactive={p.interactive}
          pins={p.st.pins}
          lit={p.st.lit}
          onPin={(i) => (e) => {
            e.stopPropagation();
            p.onLight?.((i + 1) as PinNo, 0);
          }}
        />
        {/* 舞台に出ていない人形は人形箱にいるので、袖には出さない（掴んでいる間だけ見せる） */}
        {roles.filter((r) => p.st.pos[r.id]?.on || (drag?.role === r.id && drag.moved)).map((r) => {
          const pct = shownPct(r.id);
          const others = roles.filter((o) => o.id !== r.id && p.st.pos[o.id]?.on).map((o) => shownPct(o.id));
          const near = others.sort((a, b) => Math.abs(a - pct) - Math.abs(b - pct))[0];
          const face = near == null ? 0 : Math.sign(near - pct);
          const props = p.cast.filter((c) => c.kind === 'prop' && p.st.held[c.id] === r.id && !(drag?.role === c.id && drag.moved));
          return (
            <Puppet3D
              key={r.id}
              member={r}
              x={worldX(pct)}
              face={face}
              ghost={isGhost(r.id)}
              speaking={p.bubble?.w === r.id}
              holding={props}
              marker={p.interactive && p.inputRole === r.id ? r.color : null}
              propMarker={p.interactive ? (props.find((c) => c.id === p.inputRole)?.color ?? null) : null}
              reduced={p.reduced}
              dragging={drag?.role === r.id && drag.moved}
              onDown={p.interactive ? grab(r.id) : undefined}
              onPropDown={p.interactive ? (id) => grab(id) : undefined}
            />
          );
        })}
        {sets.map((c) => {
          const pl = p.st.pos[c.id];
          const sd = moving?.role === c.id ? moving : null;
          return (
            <Set3D
              key={c.id}
              member={c}
              x={worldX(sd ? sd.pct : pl?.on ? pl.x : wingX(c.id))}
              z={sd ? sd.z : setZ(c.id)}
              r={sd ? sd.r : pl?.on ? (pl.r ?? 0) : 0}
              ghost={isGhost(c.id)}
              selected={p.interactive && selSet === c.id && !!pl?.on}
              dragging={!!sd}
              reduced={p.reduced}
              onDown={p.interactive ? grabSet(c.id) : undefined}
              onRotateDown={rotateSet(c.id)}
            />
          );
        })}
        {floorProps.map((c) => (
          <Prop3D
            key={c.id}
            member={c}
            x={worldX(shownPct(c.id))}
            ghost={isGhost(c.id)}
            reduced={p.reduced}
            dragging={drag?.role === c.id && drag.moved}
            onDown={p.interactive ? grab(c.id) : undefined}
          />
        ))}
        {in3D &&
          labels.map((l) => (
            <ScreenSprite
              key={l.id + l.text + (l.note ?? '')}
              text={l.text}
              rect={rects[l.id]}
              cam={cam}
              w={sz.w}
              h={sz.h}
              style={
                l.kind === 'bubble'
                  ? { px: fs + 1, maxW: l.w + 6, fg: '#1d1b19', bg: '#fffdf8', border: l.color, dashed: member(p.cast, p.bubble?.w)?.kind === 'prop', tail: l.x - rects[l.id].l, sub: l.note }
                  : { px: fs - 1, maxW: l.w + 6, fg: '#f4f1ea', ring: l.ring }
              }
            />
          ))}
        {in3D && playing.length > 0 && (
          <group position={[-3.6, 3.0, 0.8]}>
            <NameTag name={playing.map((n) => `♪${circled(n)}`).join(' ')} y={0} px={26} />
          </group>
        )}
        {in3D && p.total != null && <ProgressLine total={p.total} />}
        {in3D && p.title && (
          <group position={[0, 2.1, -1.9]}>
            <NameTag name={p.title} y={0} px={44} />
          </group>
        )}
      </Canvas>

      <div className="overlay">
        {p.interactive && drag?.moved && (
          <>
            <div className={`wing wing-l${dragWing === 'L' ? ' hot' : ''}`} style={{ width: wingL }} />
            <div className={`wing wing-r${dragWing === 'R' ? ' hot' : ''}`} style={{ left: wingR }} />
          </>
        )}

        {!in3D && labels.map((l) => {
          const r = rects[l.id];
          const style = { left: r.l, top: r.t, width: l.w, minHeight: l.h, fontSize: l.kind === 'bubble' ? fs + 1 : fs - 1 };
          const canEdit = p.interactive && !!p.onEdit;
          if (l.kind === 'act')
            return (
              <div
                key={l.id}
                className="act-label"
                style={{ ...style, ...(l.ring ? { ['--ring' as string]: l.ring } : {}) }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => canEdit && setEditing(l.id)}
              >
                {editing === l.id ? (
                  <InlineEdit
                    value={p.st.acts[l.role]?.x ?? ''}
                    placeholder="動き"
                    swapLabel="「」"
                    onChange={(x) => p.onEdit?.(l.itemId, { x })}
                    onSwap={p.onSwap && l.role !== NARRATOR ? () => p.onSwap!(l.itemId) : undefined}
                    onDone={() => finish(l.itemId)}
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
                  onSwap={p.onSwap && member(p.cast, p.bubble.w)?.kind === 'puppet' ? () => p.onSwap!(p.bubble!.id) : undefined}
                  onDone={() => finish(p.bubble!.id)}
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

        {castEdit && p.onCast && (() => {
          const m = member(p.cast, castEdit);
          if (!m) return null;
          const holder = m.kind === 'prop' ? m.holder : m.id;
          const at = proj(worldX(holder ? shownPct(holder) : 50), HEAD_Y + 0.1, 0);
          return (
            <CastEdit
              key={castEdit}
              m={m}
              x={Math.min(Math.max(at.x, 110), sz.w - 110)}
              y={Math.max(at.y, 84)}
              onChange={(patch) => p.onCast!(castEdit, patch)}
              onDone={() => setCastEdit(null)}
            />
          );
        })()}

        {p.tray && <div className="tray">{p.tray}</div>}

      </div>
    </div>
  );
}

const enter = (e: React.KeyboardEvent) => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229;

function BubbleEdit({ line, onEdit, onSwap, onDone }: { line: Extract<Item, { t: 'line' }>; onEdit: (p: Partial<Item>) => void; onSwap?: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="bubble-edit"
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) onDone();
      }}
    >
      <input autoFocus defaultValue={line.x} placeholder="…" enterKeyHint="done" onChange={(e) => onEdit({ x: e.target.value })} onKeyDown={(e) => enter(e) && onDone()} />
      <span className="bubble-row">
        <input defaultValue={line.n ?? ''} placeholder="（　）" onChange={(e) => onEdit({ n: e.target.value || undefined })} onKeyDown={(e) => enter(e) && onDone()} />
        {onSwap && (
          <button className="swap" title="動きにする" onMouseDown={(e) => e.preventDefault()} onClick={onSwap}>
            （）
          </button>
        )}
      </span>
    </div>
  );
}

/** （動き）をその場で打つ */
function InlineEdit(p: { value: string; placeholder: string; swapLabel: string; onChange: (v: string) => void; onSwap?: () => void; onDone: () => void }) {
  return (
    <span className="inline-edit">
      <input
        autoFocus
        defaultValue={p.value}
        placeholder={p.placeholder}
        enterKeyHint="done"
        onChange={(e) => p.onChange(e.target.value)}
        onBlur={(e) => !(e.relatedTarget as HTMLElement | null)?.classList.contains('swap') && p.onDone()}
        onKeyDown={(e) => enter(e) && (e.target as HTMLInputElement).blur()}
      />
      {p.onSwap && (
        <button className="swap" title="セリフにする" onMouseDown={(e) => e.preventDefault()} onClick={p.onSwap}>
          {p.swapLabel}
        </button>
      )}
    </span>
  );
}

const SWATCHES = ['#d9822b', '#c2507d', '#3f88c5', '#4a9b5e', '#8a63d2', '#c9a227', '#d0453a', '#5d6b7a', '#e8e4dc'];

function CastEdit(p: { m: CastMember; x: number; y: number; onChange: (patch: { name?: string; color?: string }) => void; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && p.onDone();
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [p]);
  return (
    <div ref={ref} className="cast-edit" style={{ left: p.x, top: p.y }} onPointerDown={(e) => e.stopPropagation()}>
      <input autoFocus defaultValue={p.m.name} onChange={(e) => e.target.value.trim() && p.onChange({ name: e.target.value.trim() })} onKeyDown={(e) => e.key === 'Enter' && p.onDone()} aria-label="名前" />
      <div className="swatches">
        {SWATCHES.map((c) => (
          <button key={c} aria-label={c} className={c === p.m.color ? 'on' : ''} style={{ background: c }} onClick={() => p.onChange({ color: c })} />
        ))}
        <input type="color" value={p.m.color} onChange={(e) => p.onChange({ color: e.target.value })} aria-label="色" />
      </div>
    </div>
  );
}
