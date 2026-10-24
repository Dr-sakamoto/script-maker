import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Mesh, PerspectiveCamera } from 'three';
import { clock } from './clock';
import { screenToWorld } from './geom';
import { textTexture, type TextStyle } from './textSprite';

type Rect = { l: number; t: number; r: number; b: number };

/** 画面上の矩形の位置に、3D空間の板として文字を置く（「見せる」用） */
export function ScreenSprite({ text, style, rect, cam, w, h, z = 0.3 }: { text: string; style: TextStyle; rect: Rect; cam: PerspectiveCamera; w: number; h: number; z?: number }) {
  const key = JSON.stringify(style);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(() => textTexture(text, style), [text, key]);
  useEffect(() => () => t.tex.dispose(), [t]);
  const { p, perPx } = screenToWorld(cam, w, h, (rect.l + rect.r) / 2, (rect.t + rect.b) / 2, z);
  // テクスチャは描いた大きさそのまま（画面の矩形と同じ px）
  return (
    <sprite position={p} scale={[t.w * perPx, t.h * perPx, 1]} renderOrder={10}>
      <spriteMaterial map={t.tex} transparent depthTest={false} />
    </sprite>
  );
}

/** 舞台ツラに沿った細い光の線＝進み具合（再生位置を毎フレーム読む） */
export function ProgressLine({ total }: { total: number }) {
  const W = 8.6;
  const bar = useRef<Mesh>(null);
  useFrame(() => {
    const v = Math.min(1, Math.max(0.0001, clock.get() / Math.max(total, 0.001)));
    if (!bar.current) return;
    bar.current.scale.x = v;
    bar.current.position.x = -W / 2 + (W * v) / 2;
  });
  return (
    <group position={[0, 0.006, 2.15]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, 0.035]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.08} />
      </mesh>
      <mesh ref={bar} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[W, 0.035]} />
        <meshBasicMaterial color="#f2c94c" />
      </mesh>
    </group>
  );
}
