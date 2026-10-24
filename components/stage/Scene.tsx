import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { forwardRef, useMemo, useRef } from 'react';
import { AmbientLight, DirectionalLight, DoubleSide, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Quaternion, SpotLight, Vector3 } from 'three';
import { BATTEN, FIXTURES, SPEAKER } from './geom';

/** 照明の点き具合 0〜1 を、じわ秒数に合わせて追いかける */
function useLevel(on: boolean, fade: number, reduced: boolean) {
  const v = useRef(on ? 1 : 0);
  return (dt: number) => {
    const target = on ? 1 : 0;
    if (reduced || fade <= 0) v.current = target;
    else {
      const step = dt / fade;
      v.current = v.current < target ? Math.min(target, v.current + step) : Math.max(target, v.current - step);
    }
    return v.current;
  };
}

type LightsProps = {
  lit: boolean;
  litFade: number;
  pins: boolean[];
  pinFade: number[];
  pinX: number[]; // 各ピンの当たる舞台の x（世界座標）
  reduced: boolean;
};

export function Lights(p: LightsProps) {
  const amb = useRef<AmbientLight>(null);
  const wash = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const spots = [useRef<SpotLight>(null), useRef<SpotLight>(null), useRef<SpotLight>(null)];
  const cones = [useRef<Mesh>(null), useRef<Mesh>(null), useRef<Mesh>(null)];
  const lv = useLevel(p.lit, p.litFade, p.reduced);
  const pl = [0, 1, 2].map((i) => useLevel(p.pins[i], p.pinFade[i], p.reduced));
  const targets = useMemo(() => [0, 1, 2].map(() => new Object3D()), []);

  useFrame((_, dt) => {
    const k = lv(dt);
    // 暗転でも作業灯ほどの明かりは残す（触れるように）
    if (amb.current) amb.current.intensity = 0.07 + k * 0.5;
    if (wash.current) wash.current.intensity = k * 2.1;
    if (fill.current) fill.current.intensity = k * 0.6;
    pl.forEach((f, i) => {
      const v = f(dt);
      const s = spots[i].current;
      if (s) s.intensity = v * 55;
      const c = cones[i].current;
      if (c) (c.material as MeshBasicMaterial).opacity = v * 0.13;
      targets[i].position.set(p.pinX[i], 0, 0.2);
      targets[i].updateMatrixWorld();
    });
  });

  return (
    <>
      <ambientLight ref={amb} intensity={0.07} />
      <directionalLight ref={wash} position={[1.5, 6, 7]} intensity={0} castShadow shadow-mapSize={[1024, 1024]}>
        <orthographicCamera attach="shadow-camera" args={[-6, 6, 5, -2, 0.5, 20]} />
      </directionalLight>
      <directionalLight ref={fill} position={[-4, 3, 5]} intensity={0} color="#cfd8ff" />
      {FIXTURES.map((fx, i) => (
        <group key={i}>
          <primitive object={targets[i]} />
          <spotLight
            ref={spots[i]}
            position={[fx, BATTEN.y - 0.2, BATTEN.z]}
            target={targets[i]}
            angle={0.3}
            penumbra={0.45}
            decay={1.6}
            distance={12}
            intensity={0}
            color="#fff1c8"
            castShadow
            shadow-mapSize={[512, 512]}
          />
          <Cone ref={cones[i]} from={[fx, BATTEN.y - 0.2, BATTEN.z]} to={[p.pinX[i], 0, 0.2]} />
        </group>
      ))}
    </>
  );
}

/** ピンスポの光の筋（見た目だけ） */
const Cone = forwardRef<Mesh, { from: number[]; to: number[] }>(function Cone({ from, to }, ref) {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const dir = a.clone().sub(b);
  const len = dir.length();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  return (
    <mesh ref={ref} position={a.clone().add(b).multiplyScalar(0.5).toArray()} quaternion={q}>
      <cylinderGeometry args={[0.05, len * 0.31, len, 24, 1, true]} />
      <meshBasicMaterial color="#fff2b0" transparent opacity={0} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
});

/** 袖幕・床・ホリゾント・額縁 */
export function StageSet({ onBackdrop }: { onBackdrop?: (e: ThreeEvent<PointerEvent>) => void }) {
  const curtain = useMemo(() => {
    const g = new PlaneGeometry(1.15, 4.2, 24, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 22) * 0.05);
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <>
      {/* 床 */}
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[11, 0.2, 4.4]} />
        <meshStandardMaterial color="#6b4a33" roughness={0.85} />
      </mesh>
      {/* 板目 */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[0, 0.001, -1.9 + i * 0.48]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[11, 0.012]} />
          <meshBasicMaterial color="#4b3323" />
        </mesh>
      ))}
      {/* ホリゾント */}
      <mesh position={[0, 2.2, -2.2]} receiveShadow onPointerDown={onBackdrop}>
        <planeGeometry args={[11, 4.6]} />
        <meshStandardMaterial color="#8d97a8" roughness={1} />
      </mesh>
      {/* 袖幕（両側に2枚ずつ） */}
      {[-1, 1].flatMap((s) =>
        [0, 1].map((k) => (
          <mesh key={`${s}${k}`} geometry={curtain} position={[s * (4.15 + k * 0.25), 2.1, 0.55 - k * 1.5]} castShadow>
            <meshStandardMaterial color="#3b1f2b" roughness={0.95} side={DoubleSide} />
          </mesh>
        )),
      )}
      {/* 額縁 */}
      <mesh position={[0, 4.15, 1.75]}>
        <boxGeometry args={[11.5, 0.9, 0.2]} />
        <meshStandardMaterial color="#141016" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 5.35, 2, 1.75]}>
          <boxGeometry args={[0.9, 5, 0.2]} />
          <meshStandardMaterial color="#141016" />
        </mesh>
      ))}
      {/* 舞台ツラ */}
      <mesh position={[0, -0.35, 2.21]}>
        <boxGeometry args={[11, 0.5, 0.02]} />
        <meshStandardMaterial color="#2a1c14" />
      </mesh>
    </>
  );
}

type Down = (e: ThreeEvent<PointerEvent>) => void;

/** 照明のバトン（灯体3つ）と、端の ◎ */
export function Batten(p: { pinMode: boolean; pins: boolean[]; lit: boolean; onBar?: Down; onPin?: (i: number) => Down; onToggle?: Down; interactive: boolean }) {
  return (
    <group position={[0, BATTEN.y, BATTEN.z]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, BATTEN.half * 2, 10]} />
        <meshStandardMaterial color="#5c5c66" metalness={0.6} roughness={0.4} emissive={p.lit ? '#3a3200' : '#000'} />
      </mesh>
      {/* バーの当たり判定 */}
      <mesh onPointerDown={p.interactive ? p.onBar : undefined}>
        <boxGeometry args={[BATTEN.half * 2, 0.6, 0.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {FIXTURES.map((fx, i) => (
        <group key={i} position={[fx, -0.18, 0]} rotation={[-0.55, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.13, 0.16, 0.34, 18]} />
            <meshStandardMaterial
              color={p.pinMode ? '#7a6a2a' : '#2c2c30'}
              metalness={0.4}
              roughness={0.5}
              emissive={p.pinMode ? '#4a3d00' : '#000'}
            />
          </mesh>
          <mesh position={[0, -0.172, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.15, 20]} />
            <meshBasicMaterial color={p.pins[i] ? '#fff3b0' : '#3a3a3a'} side={DoubleSide} />
          </mesh>
          {p.pinMode && p.interactive && (
            <mesh onPointerDown={p.onPin?.(i)}>
              <sphereGeometry args={[0.36, 10, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}
        </group>
      ))}
      {/* ◎（目立たせない。触れないときは出さない） */}
      {p.interactive && <group position={[BATTEN.half + 0.28, 0, 0.02]}>
        <mesh>
          <torusGeometry args={[0.085, 0.018, 8, 24]} />
          <meshBasicMaterial color={p.pinMode ? '#ffd23f' : '#77777f'} />
        </mesh>
        <mesh>
          <circleGeometry args={[0.035, 16]} />
          <meshBasicMaterial color={p.pinMode ? '#ffd23f' : '#77777f'} />
        </mesh>
        <mesh onPointerDown={p.onToggle}>
          <sphereGeometry args={[0.22, 8, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>}
    </group>
  );
}

export function Speaker3D(p: { playing: boolean; reduced: boolean; onDown?: Down }) {
  const cone = useRef<Mesh>(null);
  useFrame((st) => {
    if (!cone.current) return;
    const s = p.playing && !p.reduced ? 1 + Math.sin(st.clock.elapsedTime * 18) * 0.06 : 1;
    cone.current.scale.set(s, s, 1);
  });
  return (
    <group position={SPEAKER.toArray()} rotation={[0, -0.35, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.5, 0.84, 0.42]} />
        <meshStandardMaterial color="#1f2326" roughness={0.6} />
      </mesh>
      {[0.58, 0.24].map((y, i) => (
        <mesh key={y} ref={i === 1 ? cone : undefined} position={[0, y, 0.215]}>
          <circleGeometry args={[i === 0 ? 0.09 : 0.17, 24]} />
          <meshStandardMaterial color={p.playing ? '#1f8f86' : '#3c4246'} emissive={p.playing ? '#0d4b46' : '#000'} />
        </mesh>
      ))}
      <mesh position={[0, 0.45, 0]} onPointerDown={p.onDown}>
        <boxGeometry args={[0.8, 1.1, 0.7]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
