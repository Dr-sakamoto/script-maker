import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Group, LatheGeometry, Material, MeshStandardMaterial, Vector2 } from 'three';
import type { CastMember } from '../../model/types';

type Look = NonNullable<CastMember['look']>;

const lathe = (pts: [number, number][], seg = 28) => new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), seg);

/** 胴体の輪郭（半径, 高さ） */
const ROBE: Record<'father' | 'mother', [number, number][]> = {
  father: [[0, 0], [0.44, 0], [0.43, 0.08], [0.36, 0.55], [0.33, 0.9], [0.24, 1.08], [0.12, 1.16], [0, 1.17]],
  mother: [[0, 0], [0.5, 0], [0.48, 0.07], [0.34, 0.5], [0.25, 0.85], [0.22, 1.02], [0.12, 1.13], [0, 1.14]],
};

function mats(color: string) {
  const m = (c: string | Color, r = 0.75) => new MeshStandardMaterial({ color: c, roughness: r, transparent: true });
  const base = new Color(color);
  return {
    body: m(base.clone().multiplyScalar(0.8)),
    trim: m(base.clone().lerp(new Color('#ffffff'), 0.55)),
    skin: m('#f1c7a1', 0.6),
    dark: m('#2b2321', 0.5),
    gray: m('#7d7670', 0.9),
    hair: m('#3a2a22', 0.8),
    white: m('#f4f1ea', 0.6),
    cheek: m('#e88f8f', 0.9),
    egg: m('#f6ecd2', 0.35),
    eggDark: m('#3a3330', 0.5),
  };
}

type Props = {
  member: CastMember;
  x: number; // 世界座標
  face: number; // -1 下手向き 〜 1 上手向き
  ghost: boolean; // 袖にいる
  speaking: boolean;
  holding?: CastMember; // 持っている小道具（卵）
  marker?: string | null; // 話者の印の色
  propMarker?: string | null;
  reduced: boolean;
  dragging: boolean;
  onDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPropDown?: (e: ThreeEvent<PointerEvent>) => void;
};

export function Puppet3D(p: Props) {
  const look: Look = p.member.look ?? 'father';
  const m = useMemo(() => mats(p.member.color), [p.member.color]);
  const robe = useMemo(() => lathe(ROBE[look === 'mother' ? 'mother' : 'father']), [look]);
  const g = useRef<Group>(null);
  const inner = useRef<Group>(null);

  useEffect(() => {
    for (const k of Object.values(m) as Material[]) {
      k.opacity = p.ghost ? 0.42 : 1;
      k.depthWrite = !p.ghost;
    }
  }, [m, p.ghost]);

  useFrame((st, dt) => {
    const o = g.current;
    const i = inner.current;
    if (!o || !i) return;
    const snap = p.reduced || p.dragging;
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    o.position.x += (p.x - o.position.x) * k;
    const ry = p.face * 0.42;
    o.rotation.y += (ry - o.rotation.y) * (p.reduced ? 1 : 1 - Math.exp(-dt * 5));
    const t = st.clock.elapsedTime;
    i.position.y = p.reduced ? 0 : p.speaking ? Math.abs(Math.sin(t * 9)) * 0.05 : Math.sin(t * 1.6 + p.x) * 0.012;
    i.rotation.z = p.reduced || !p.dragging ? 0 : Math.sin(t * 14) * 0.05;
  });

  return (
    <group ref={g} position={[p.x, 0, 0]}>
      {/* 当たり判定（見えない筒） */}
      <mesh position={[0, 0.95, 0]} onPointerDown={p.onDown}>
        <cylinderGeometry args={[0.55, 0.55, 2, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {p.marker && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.52, 0.64, 40]} />
          <meshBasicMaterial color={p.marker} transparent opacity={0.9} />
        </mesh>
      )}
      <group ref={inner}>
        <mesh geometry={robe} material={m.body} castShadow receiveShadow />
        {look === 'mother' ? <MotherParts m={m} /> : <FatherParts m={m} />}
        {/* 腕 */}
        <mesh material={m.body} position={[0.33, 0.82, 0.05]} rotation={[0.2, 0, 0.35]} castShadow>
          <capsuleGeometry args={[0.075, 0.38, 4, 10]} />
        </mesh>
        <mesh material={m.body} position={[-0.3, 0.84, 0.2]} rotation={[1.1, 0, -0.25]} castShadow>
          <capsuleGeometry args={[0.075, 0.34, 4, 10]} />
        </mesh>
        <mesh material={m.skin} position={[0.4, 0.6, 0.1]}>
          <sphereGeometry args={[0.075, 12, 10]} />
        </mesh>
        <mesh material={m.skin} position={[-0.33, 0.78, 0.42]}>
          <sphereGeometry args={[0.075, 12, 10]} />
        </mesh>
        {p.holding && <Egg m={m} marker={p.propMarker} onDown={p.onPropDown} />}
      </group>
    </group>
  );
}

type M = ReturnType<typeof mats>;

function Face({ m, y }: { m: M; y: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh material={m.skin} castShadow>
        <sphereGeometry args={[0.31, 28, 22]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh material={m.dark} position={[s * 0.1, 0.03, 0.28]}>
            <sphereGeometry args={[0.03, 10, 8]} />
          </mesh>
          <mesh material={m.skin} position={[s * 0.3, 0, 0]}>
            <sphereGeometry args={[0.06, 10, 8]} />
          </mesh>
        </group>
      ))}
      <mesh material={m.skin} position={[0, -0.04, 0.31]}>
        <sphereGeometry args={[0.05, 12, 10]} />
      </mesh>
    </group>
  );
}

function FatherParts({ m }: { m: M }) {
  const y = 1.47;
  return (
    <>
      {/* 襟 */}
      <mesh material={m.white} position={[0, 1.12, 0]}>
        <torusGeometry args={[0.15, 0.04, 8, 20]} />
      </mesh>
      <Face m={m} y={y} />
      {/* 横と後ろだけの髪（はげ） */}
      <mesh material={m.gray} position={[0, y - 0.02, -0.02]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.55]}>
        <torusGeometry args={[0.28, 0.07, 8, 28, Math.PI * 1.25]} />
      </mesh>
      {/* 眼鏡 */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.dark} position={[s * 0.1, y + 0.03, 0.3]}>
          <torusGeometry args={[0.065, 0.012, 6, 20]} />
        </mesh>
      ))}
      <mesh material={m.dark} position={[0, y + 0.03, 0.31]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.008, 0.06, 2, 4]} />
      </mesh>
      {/* 口ひげ */}
      <mesh material={m.gray} position={[0, y - 0.12, 0.29]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.025, 0.14, 4, 8]} />
      </mesh>
      {/* 胸のボタン */}
      {[0.75, 0.55, 0.35].map((by) => (
        <mesh key={by} material={m.trim} position={[0, by, 0.355 - by * 0.07]}>
          <sphereGeometry args={[0.025, 8, 6]} />
        </mesh>
      ))}
    </>
  );
}

function MotherParts({ m }: { m: M }) {
  const y = 1.43;
  return (
    <>
      {/* エプロン */}
      <mesh material={m.white} position={[0, 0.45, 0.33]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[0.46, 0.6, 0.02]} />
      </mesh>
      <mesh material={m.white} position={[0, 0.88, 0.235]} rotation={[-0.3, 0, 0]}>
        <boxGeometry args={[0.24, 0.24, 0.02]} />
      </mesh>
      <Face m={m} y={y} />
      {/* 髪とおだんご */}
      <mesh material={m.hair} position={[0, y + 0.06, -0.05]} scale={[1.06, 0.95, 1.02]}>
        <sphereGeometry args={[0.31, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
      </mesh>
      <mesh material={m.hair} position={[0, y + 0.3, -0.1]} castShadow>
        <sphereGeometry args={[0.13, 16, 12]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.cheek} position={[s * 0.17, y - 0.07, 0.25]} scale={[1, 0.6, 0.4]}>
          <sphereGeometry args={[0.05, 10, 8]} />
        </mesh>
      ))}
      <mesh material={m.cheek} position={[0, y - 0.15, 0.27]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.012, 0.05, 2, 6]} />
      </mesh>
    </>
  );
}

function Egg({ m, marker, onDown }: { m: M; marker?: string | null; onDown?: (e: ThreeEvent<PointerEvent>) => void }) {
  return (
    <group position={[-0.33, 0.95, 0.44]}>
      <mesh material={m.egg} scale={[0.1, 0.13, 0.1]} castShadow>
        <sphereGeometry args={[1, 20, 16]} />
      </mesh>
      {/* 卵の顔 */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.eggDark} position={[s * 0.03, 0.02, 0.095]}>
          <sphereGeometry args={[0.012, 8, 6]} />
        </mesh>
      ))}
      {marker && (
        <mesh rotation={[0, 0, 0]} position={[0, 0, 0]}>
          <torusGeometry args={[0.17, 0.012, 6, 30]} />
          <meshBasicMaterial color={marker} />
        </mesh>
      )}
      <mesh onPointerDown={onDown}>
        <sphereGeometry args={[0.2, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
