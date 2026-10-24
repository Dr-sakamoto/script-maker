/** 舞台の上に出す文字（吹き出し・（動き））の被りを避ける。画面座標 px */
export type Label = {
  id: string;
  kind: 'bubble' | 'act';
  speaking: boolean; // 話している人のもの
  x: number; // 中心
  y: number; // 下端（ここから上に伸びる）
  w: number;
  h: number;
};
export type Rect = { l: number; t: number; r: number; b: number };

const GAP = 4;
const hit = (a: Rect, b: Rect) => a.l < b.r + GAP && b.l < a.r + GAP && a.t < b.b + GAP && b.t < a.b + GAP;

/**
 * 話している人の（動き）は元の位置。もう一人の（動き）は上へ、
 * 吹き出しは（動き）と重なるなら上へずらす。
 */
export function layoutLabels(labels: Label[]): Record<string, Rect> {
  const rank = (l: Label) => (l.kind === 'act' ? (l.speaking ? 0 : 1) : 2);
  const order = [...labels].sort((a, b) => rank(a) - rank(b) || a.x - b.x);
  const placed: Rect[] = [];
  const out: Record<string, Rect> = {};
  for (const l of order) {
    let r: Rect = { l: l.x - l.w / 2, r: l.x + l.w / 2, t: l.y - l.h, b: l.y };
    for (let guard = 0; guard < 50; guard++) {
      const over = placed.filter((p) => hit(p, r));
      if (!over.length) break;
      const top = Math.min(...over.map((p) => p.t));
      r = { ...r, b: top - GAP, t: top - GAP - l.h };
    }
    placed.push(r);
    out[l.id] = r;
  }
  return out;
}

export const overlaps = hit;
