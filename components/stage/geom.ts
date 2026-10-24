import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';

/** 舞台の座標。x は 0（下手端）〜100（上手端）。世界座標は -HALF〜HALF */
export const HALF = 4;
export const worldX = (pct: number) => (pct / 100 - 0.5) * HALF * 2;
export const pctX = (wx: number) => (wx / (HALF * 2) + 0.5) * 100;
/** 袖にいる人形を覗かせる位置 */
export const WING_PEEK = { L: 2.5, R: 97.5 } as const;

export const BATTEN = { y: 3.25, z: 1.3, half: 3.3 };
export const FIXTURES = [-2.6, 0, 2.6];
export const SPEAKER = new Vector3(3.85, 0, 1.25);
export const HEAD_Y = 1.82;

const FOV = 34;
const TARGET = new Vector3(0, 1.55, 0);

/** 画面の縦横比から、舞台の幅が必ず収まるカメラ位置を出す */
/** halfW：横に必ず収める舞台の半幅。触る画面は袖とスピーカーまで、見せる画面は少し寄る */
export function camPose(aspect: number, halfW = 5) {
  const t = Math.tan(((FOV / 2) * Math.PI) / 180);
  const d = Math.max(2.25 / t, halfW / (t * Math.max(aspect, 0.3)));
  return { fov: FOV, position: new Vector3(0, 2.2, d), target: TARGET };
}

export function makeCamera(w: number, h: number, halfW = 5): PerspectiveCamera {
  const aspect = w / Math.max(1, h);
  const p = camPose(aspect, halfW);
  const c = new PerspectiveCamera(p.fov, aspect, 0.1, 100);
  c.position.copy(p.position);
  c.lookAt(p.target);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}

export function project(c: PerspectiveCamera, w: number, h: number, v: Vector3) {
  const p = v.clone().project(c);
  return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
}

/** 画面上の点を、人形が立つ縦の面（z=0）上の舞台 x（0〜100）に */
export function screenToPct(c: PerspectiveCamera, w: number, h: number, sx: number, sy: number): number {
  const r = new Raycaster();
  r.setFromCamera(new Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), c);
  const hit = new Vector3();
  r.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), 0), hit);
  return Math.min(100, Math.max(0, pctX(hit.x)));
}

/** 画面上の点を、奥行き z の縦の面の上の世界座標に。あわせて 1px あたりの世界の長さ */
export function screenToWorld(c: PerspectiveCamera, w: number, h: number, sx: number, sy: number, z = 0.3) {
  const r = new Raycaster();
  r.setFromCamera(new Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), c);
  const hit = new Vector3();
  r.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -z), hit);
  const dist = hit.distanceTo(c.position);
  const perPx = (2 * Math.tan(((c.fov / 2) * Math.PI) / 180) * dist) / h;
  return { p: hit, perPx };
}
