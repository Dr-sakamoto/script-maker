import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Color, Group, MeshStandardMaterial, SRGBColorSpace, type Material } from 'three';
import type { CastMember } from '../../lib/stage/types';
import { textTexture } from './textSprite';

/**
 * 汎用の人形：円錐の胴＋球の頭。役ごとに変わるのは色と名前だけ。
 * 小道具（kind=prop）は持ち主の手元の小さな球。
 */
type Props = {
  member: CastMember;
  x: number; // 世界座標
  face: number; // -1 下手向き 〜 1 上手向き
  ghost: boolean; // 袖にいる
  speaking: boolean;
  holding?: CastMember[]; // 持っている小道具（右手→左手の順）
  marker?: string | null; // 話者の印の色
  propMarker?: string | null;
  reduced: boolean;
  dragging: boolean;
  onDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPropDown?: (id: string) => (e: ThreeEvent<PointerEvent>) => void;
};

export const BODY_H = 1.2;
export const HEAD_R = 0.3;

function useMats(color: string) {
  return useMemo(() => {
    const base = new Color(color);
    return {
      body: new MeshStandardMaterial({ color: base, roughness: 0.65, transparent: true }),
      head: new MeshStandardMaterial({ color: base.clone().lerp(new Color('#ffffff'), 0.45), roughness: 0.5, transparent: true }),
      eye: new MeshStandardMaterial({ color: '#1d1b19', roughness: 0.4, transparent: true }),
    };
  }, [color]);
}

/** 名前札（3D空間のスプライト） */
export function NameTag({ name, y, z = 0, px = 30, opacity = 1 }: { name: string; y: number; z?: number; px?: number; opacity?: number }) {
  const t = useMemo(() => textTexture(name, { px, maxW: 400, fg: '#ffffff' }), [name, px]);
  useEffect(() => () => t.tex.dispose(), [t]);
  const k = 0.005;
  return (
    <sprite position={[0, y, z]} scale={[t.w * k, t.h * k, 1]} renderOrder={5}>
      <spriteMaterial map={t.tex} transparent depthTest={false} opacity={opacity} />
    </sprite>
  );
}

export function Puppet3D(p: Props) {
  const m = useMats(p.member.color);

  const g = useRef<Group>(null);
  const inner = useRef<Group>(null);

  useEffect(() => {
    for (const k of Object.values(m) as Material[]) {
      k.opacity = p.ghost ? 0.4 : 1;
      k.depthWrite = !p.ghost;
    }
  }, [m, p.ghost]);

  useFrame((st, dt) => {
    const o = g.current;
    const i = inner.current;
    if (!o || !i) return;
    const k = p.reduced || p.dragging ? 1 : 1 - Math.exp(-dt * 7);
    o.position.x += (p.x - o.position.x) * k;
    const ry = p.face * 0.5;
    o.rotation.y += (ry - o.rotation.y) * (p.reduced ? 1 : 1 - Math.exp(-dt * 5));
    const t = st.clock.elapsedTime;
    i.position.y = p.reduced ? 0 : p.speaking ? Math.abs(Math.sin(t * 9)) * 0.05 : Math.sin(t * 1.6 + p.x) * 0.012;
    i.rotation.z = p.reduced || !p.dragging ? 0 : Math.sin(t * 14) * 0.05;
  });

  const headY = BODY_H + HEAD_R * 0.85;
  return (
    <group ref={g} position={[p.x, 0, 0]}>
      {/* 当たり判定（見えない筒） */}
      <mesh position={[0, 0.95, 0]} onPointerDown={p.onDown}>
        <cylinderGeometry args={[0.55, 0.55, 2, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {p.marker && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 40]} />
          <meshBasicMaterial color={p.marker} transparent opacity={0.9} />
        </mesh>
      )}
      <group ref={inner}>
        <mesh material={m.body} position={[0, BODY_H / 2, 0]} castShadow receiveShadow>
          <coneGeometry args={[0.42, BODY_H, 32]} />
        </mesh>
        <mesh material={m.head} position={[0, headY, 0]} castShadow>
          <sphereGeometry args={[HEAD_R, 32, 24]} />
        </mesh>
        {/* 向きがわかるよう目だけ付ける */}
        {[-1, 1].map((s) => (
          <mesh key={s} material={m.eye} position={[s * 0.1, headY + 0.04, HEAD_R * 0.93]}>
            <sphereGeometry args={[0.035, 10, 8]} />
          </mesh>
        ))}
        <BodyName name={p.member.name} color={p.member.color} ghost={p.ghost} />
        {(p.holding ?? []).slice(0, 2).map((h, i) => (
          <HeldProp key={h.id} member={h} side={i === 0 ? 1 : -1} ghost={p.ghost} marker={p.propMarker && h.color === p.propMarker ? p.propMarker : null} onDown={p.onPropDown?.(h.id)} />
        ))}
      </group>
    </group>
  );
}

/** 舞台に置いた小道具：角を落とした箱＋名前。見た目は全部共通で色だけ変わる */
export function Prop3D(p: { member: CastMember; x: number; ghost: boolean; reduced: boolean; dragging: boolean; onDown?: (e: ThreeEvent<PointerEvent>) => void }) {
  const m = useMats(p.member.color);
  const g = useRef<Group>(null);
  useEffect(() => {
    for (const k of Object.values(m) as Material[]) {
      k.opacity = p.ghost ? 0.4 : 1;
      k.depthWrite = !p.ghost;
    }
  }, [m, p.ghost]);
  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    const k = p.reduced || p.dragging ? 1 : 1 - Math.exp(-dt * 7);
    o.position.x += (p.x - o.position.x) * k;
    o.position.y = p.dragging && !p.reduced ? 0.12 : 0;
  });
  return (
    <group ref={g} position={[p.x, 0, 0.55]}>
      <mesh material={m.body} position={[0, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.44, 0.4]} />
      </mesh>
      <NameTag name={p.member.name} y={0.24} z={0.25} px={26} opacity={p.ghost ? 0.5 : 1} />
      <mesh position={[0, 0.3, 0]} onPointerDown={p.onDown}>
        <boxGeometry args={[0.8, 0.8, 0.7]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** 手に持った小道具：小さな球＋名前 */
function HeldProp(p: { member: CastMember; side: 1 | -1; ghost: boolean; marker: string | null; onDown?: (e: ThreeEvent<PointerEvent>) => void }) {
  const pm = useMats(p.member.color);
  useEffect(() => {
    for (const k of Object.values(pm) as Material[]) {
      k.opacity = p.ghost ? 0.4 : 1;
      k.depthWrite = !p.ghost;
    }
  }, [pm, p.ghost]);
  return (
    <group position={[0.34 * p.side, 0.9, 0.36]}>
      <mesh material={pm.head} castShadow>
        <sphereGeometry args={[0.13, 20, 16]} />
      </mesh>
      {p.marker && (
        <mesh>
          <torusGeometry args={[0.19, 0.012, 6, 30]} />
          <meshBasicMaterial color={p.marker} />
        </mesh>
      )}
      <NameTag name={p.member.name} y={-0.24} px={22} opacity={p.ghost ? 0.5 : 1} />
      <mesh onPointerDown={p.onDown}>
        <sphereGeometry args={[0.24, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** 縦書きで回す文字（長音・波線・三点リーダ） */
const ROTATE = new Set(['ー', '〜', '～', '…', '‥', '－', '-', '—', '（', '）', '「', '」']);

/** 服の色に対して読みやすい文字色（明るい服なら黒、暗い服なら白） */
function inkFor(bg: string) {
  const c = new Color(bg);
  const l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  return l > 0.55 ? { fg: '#1d1b19', edge: 'rgba(255,255,255,0.55)' } : { fg: '#ffffff', edge: 'rgba(0,0,0,0.7)' };
}

function verticalTexture(name: string, bg: string) {
  const chars = [...name.trim()].slice(0, 8);
  const n = Math.max(1, chars.length);
  const W = 128;
  const cell = 120;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = cell * n;
  const g = c.getContext('2d')!;
  const { fg, edge } = inkFor(bg);
  g.font = `800 ${cell * 0.86}px 'Hiragino Sans','Noto Sans JP','Yu Gothic UI',sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  chars.forEach((ch, i) => {
    g.save();
    g.translate(W / 2, cell * i + cell / 2);
    if (ROTATE.has(ch)) g.rotate(Math.PI / 2);
    g.lineWidth = 12;
    g.strokeStyle = edge;
    g.strokeText(ch, 0, 0);
    g.fillStyle = fg;
    g.fillText(ch, 0, 0);
    g.restore();
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, n };
}

/** 役名：胴（円錐）の正面に縦書きで貼る。服の色が文字の地になる */
function BodyName({ name, color, ghost }: { name: string; color: string; ghost: boolean }) {
  const { tex, n } = useMemo(() => verticalTexture(name, color), [name, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  // 胴の裾から積む。円錐は上ほど細いので、長い名前ほど1文字を小さくして肩より下に収める
  const bottom = 0.14;
  const cell = Math.min(0.27, 0.66 / n);
  const h = cell * n;
  const cy = bottom + h / 2;
  const slope = Math.atan(0.42 / BODY_H);
  const r = 0.42 * (1 - cy / BODY_H);
  return (
    <mesh position={[0, cy, r + 0.012]} rotation={[-slope, 0, 0]} renderOrder={2}>
      <planeGeometry args={[cell * (128 / 120), h]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} opacity={ghost ? 0.5 : 1} />
    </mesh>
  );
}
