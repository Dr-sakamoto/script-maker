import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

/** 3D空間に置く文字（名前札・吹き出し・動き）を canvas に描いてテクスチャにする */
export type TextStyle = {
  px: number; // 文字の大きさ（画面上の目安 px）
  maxW: number; // 折り返し幅（px）
  fg: string;
  bg?: string; // 無ければ背景なし（縁取り文字）
  border?: string;
  dashed?: boolean;
  tail?: number | null; // 吹き出しのしっぽの x（px、左端から）
  sub?: string; // 小さい2行目（演技メモ）
  /** 背景なしの文字の、黒い縁のさらに外側の縁の色（動き＝その役の色） */
  ring?: string;
};

const FONT = `'Hiragino Sans','Noto Sans JP','Yu Gothic UI',system-ui,sans-serif`;
const SCALE = 2; // 高解像度で描く

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (cur && ctx.measureText(cur + ch).width > maxW) {
      lines.push(cur);
      cur = ch;
    } else cur += ch;
  }
  lines.push(cur);
  return lines;
}

export function textTexture(text: string, s: TextStyle): { tex: CanvasTexture; w: number; h: number } {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const pad = s.bg ? 9 : s.ring ? 6 : 4;
  const tailH = s.tail != null ? 9 : 0;
  ctx.font = `600 ${s.px}px ${FONT}`;
  const lines = wrap(ctx, text, s.maxW - pad * 2);
  const subPx = Math.round(s.px * 0.72);
  ctx.font = `${subPx}px ${FONT}`;
  const subLines = s.sub ? wrap(ctx, `（${s.sub}）`, s.maxW - pad * 2) : [];
  ctx.font = `600 ${s.px}px ${FONT}`;
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), ...subLines.map((l) => (l.length * subPx) / 1.05), s.px);
  const w = Math.ceil(Math.min(s.maxW, tw + pad * 2));
  const lh = s.px * 1.4;
  const h = Math.ceil(lines.length * lh + subLines.length * subPx * 1.4 + pad * 2 - (s.bg ? 4 : 0));
  c.width = (w + 4) * SCALE;
  c.height = (h + tailH + 4) * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.translate(2, 2);
  if (s.bg) {
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, Math.min(14, h / 2));
    if (s.tail != null) {
      const tx = Math.max(14, Math.min(w - 14, s.tail));
      ctx.moveTo(tx - 7, h);
      ctx.lineTo(tx, h + tailH);
      ctx.lineTo(tx + 7, h);
    }
    ctx.fillStyle = s.bg;
    ctx.fill();
    if (s.border) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = s.border;
      ctx.setLineDash(s.dashed ? [6, 4] : []);
      ctx.stroke();
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let y = pad - (s.bg ? 2 : 0) + (lh - s.px) / 2;
  ctx.lineJoin = 'round';
  for (const l of lines) {
    ctx.font = `600 ${s.px}px ${FONT}`;
    if (!s.bg) {
      // 外から：役の色の縁 → 黒の縁 → 白い文字
      if (s.ring) {
        ctx.lineWidth = 8;
        ctx.strokeStyle = s.ring;
        ctx.strokeText(l, w / 2, y);
      }
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(l, w / 2, y);
    }
    ctx.fillStyle = s.fg;
    ctx.fillText(l, w / 2, y);
    y += lh;
  }
  ctx.font = `${subPx}px ${FONT}`;
  ctx.fillStyle = '#6d6862';
  for (const l of subLines) {
    ctx.fillText(l, w / 2, y);
    y += subPx * 1.4;
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  return { tex, w: w + 4, h: h + tailH + 4 };
}
