import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Color, DoubleSide, Group, MeshStandardMaterial, SRGBColorSpace, type Material } from 'three';
import type { CastMember } from '../../lib/stage/types';
import { NameTag } from './Puppet3D';

/**
 * 大道具。机と椅子はそれらしい形、それ以外（持参の物）は背景の抜けた点線の円に名前。
 * 床の上を x・奥行き z で動かし、r（度）で向きを変える。
 */
type Props = {
  member: CastMember;
  x: number; // 世界座標
  z: number;
  r: number; // 度
  ghost: boolean;
  selected: boolean;
  dragging: boolean;
  reduced: boolean;
  onDown?: (e: ThreeEvent<PointerEvent>) => void;
  onRotateDown?: (e: ThreeEvent<PointerEvent>) => void;
};

function useWood(color: string) {
  return useMemo(() => new MeshStandardMaterial({ color: new Color(color), roughness: 0.75, transparent: true }), [color]);
}

function Desk({ m }: { m: Material }) {
  return (
    <group>
      <mesh material={m} position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.15, 0.06, 0.62]} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} material={m} position={[sx * 0.5, 0.35, sz * 0.24]} castShadow>
            <boxGeometry args={[0.06, 0.7, 0.06]} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Chair({ m }: { m: Material }) {
  return (
    <group>
      <mesh material={m} position={[0, 0.44, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.05, 0.44]} />
      </mesh>
      <mesh material={m} position={[0, 0.74, -0.2]} castShadow>
        <boxGeometry args={[0.46, 0.55, 0.05]} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} material={m} position={[sx * 0.2, 0.21, sz * 0.19]} castShadow>
            <boxGeometry args={[0.05, 0.42, 0.05]} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** 点線の円＋名前（背景は透明） */
function freeTexture(name: string, color: string) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.setLineDash([14, 10]);
  g.lineWidth = 8;
  g.strokeStyle = color;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.font = `700 ${Math.min(64, Math.floor(200 / Math.max(1, [...name].length)))}px 'Hiragino Sans','Noto Sans JP',sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.strokeText(name, S / 2, S / 2);
  g.fillStyle = '#fff';
  g.fillText(name, S / 2, S / 2);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function Free({ member, ghost }: { member: CastMember; ghost: boolean }) {
  const tex = useMemo(() => freeTexture(member.name, member.color), [member.name, member.color]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, 0.5, 0]}>
      <planeGeometry args={[0.95, 0.95]} />
      <meshBasicMaterial map={tex} transparent side={DoubleSide} depthWrite={false} opacity={ghost ? 0.45 : 1} />
    </mesh>
  );
}

export function Set3D(p: Props) {
  const wood = useWood(p.member.color);
  const g = useRef<Group>(null);
  useEffect(() => {
    wood.opacity = p.ghost ? 0.4 : 1;
    wood.depthWrite = !p.ghost;
  }, [wood, p.ghost]);
  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    const k = p.reduced || p.dragging ? 1 : 1 - Math.exp(-dt * 8);
    o.position.x += (p.x - o.position.x) * k;
    o.position.z += (p.z - o.position.z) * k;
    o.rotation.y += ((-p.r * Math.PI) / 180 - o.rotation.y) * k;
  });
  const shape = p.member.shape ?? 'free';
  return (
    <group ref={g} position={[p.x, 0, p.z]} rotation={[0, (-p.r * Math.PI) / 180, 0]}>
      {shape === 'desk' ? <Desk m={wood} /> : shape === 'chair' ? <Chair m={wood} /> : <Free member={p.member} ghost={p.ghost} />}
      {shape !== 'free' && <NameTag name={p.member.name} y={shape === 'desk' ? 0.9 : 1.1} px={22} opacity={p.ghost ? 0.5 : 1} />}
      {/* 掴むところ */}
      <mesh position={[0, 0.45, 0]} onPointerDown={p.onDown}>
        <boxGeometry args={[shape === 'desk' ? 1.3 : 0.9, 1, 0.9]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* 選んでいるときだけ：床の輪と、回すつまみ */}
      {p.selected && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
            <ringGeometry args={[0.78, 0.84, 48]} />
            <meshBasicMaterial color="#f2c94c" transparent opacity={0.9} />
          </mesh>
          <group position={[0, 0.06, 0.81]}>
            <mesh>
              <sphereGeometry args={[0.1, 16, 12]} />
              <meshBasicMaterial color="#f2c94c" />
            </mesh>
            <mesh onPointerDown={p.onRotateDown}>
              <sphereGeometry args={[0.3, 10, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  );
}
