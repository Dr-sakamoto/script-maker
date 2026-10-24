import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Group, MeshStandardMaterial, type Material } from 'three';
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
  holding?: CastMember;
  marker?: string | null; // 話者の印の色
  propMarker?: string | null;
  reduced: boolean;
  dragging: boolean;
  onDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPropDown?: (e: ThreeEvent<PointerEvent>) => void;
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
  const pm = useMats(p.holding?.color ?? '#ffffff');
  const g = useRef<Group>(null);
  const inner = useRef<Group>(null);

  useEffect(() => {
    for (const k of [...Object.values(m), ...Object.values(pm)] as Material[]) {
      k.opacity = p.ghost ? 0.4 : 1;
      k.depthWrite = !p.ghost;
    }
  }, [m, pm, p.ghost]);

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
        <NameTag name={p.member.name} y={0.62} z={0.5} opacity={p.ghost ? 0.5 : 1} />
        {p.holding && (
          <group position={[0.34, 0.9, 0.36]}>
            <mesh material={pm.head} castShadow>
              <sphereGeometry args={[0.13, 20, 16]} />
            </mesh>
            {p.propMarker && (
              <mesh>
                <torusGeometry args={[0.19, 0.012, 6, 30]} />
                <meshBasicMaterial color={p.propMarker} />
              </mesh>
            )}
            <NameTag name={p.holding.name} y={-0.24} px={22} opacity={p.ghost ? 0.5 : 1} />
            <mesh onPointerDown={p.onPropDown}>
              <sphereGeometry args={[0.24, 8, 6]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        )}
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
