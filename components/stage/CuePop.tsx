import { useEffect, useRef, useState } from 'react';
import { circled } from '../../lib/stage/export';
import { readToken, TOKEN_START, type CueToken, type Dir } from '../../lib/stage/cueToken';

/** 文章の中の ・m1・・l（start〜end） */
export type TokenHit = { start: number; end: number; tk: CueToken; line: number; nth: number };

/** pos の近く（前後1文字まで）にある ・m1・・l を探す */
export function tokenNear(text: string, pos: number): TokenHit | null {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = text.indexOf('\n', pos);
  const row = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
  const line = text.slice(0, lineStart).split('\n').length - 1;
  const re = new RegExp(TOKEN_START.source, 'g');
  const count = { cue: 0, light: 0 };
  let m: RegExpExecArray | null;
  while ((m = re.exec(row))) {
    const tk = readToken(row.slice(m.index));
    if (!tk) continue;
    const start = lineStart + m.index;
    const end = start + tk.len;
    const nth = count[tk.kind]++;
    if (pos >= start - 1 && pos <= end + 1) return { start, end, tk, line, nth };
  }
  return null;
}

/** textarea の中の文字位置 → 欄の左上からの座標（カーソルの下に吹き出しを出す） */
export function caretXY(el: HTMLTextAreaElement, pos: number): { x: number; y: number } {
  const cs = getComputedStyle(el);
  const d = document.createElement('div');
  const copy = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing', 'tabSize'] as const;
  for (const k of copy) d.style[k] = cs[k];
  Object.assign(d.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'normal', width: `${el.offsetWidth}px`, borderStyle: 'solid', left: '0', top: '0' });
  d.textContent = el.value.slice(0, pos);
  const mark = document.createElement('span');
  mark.textContent = '​';
  d.appendChild(mark);
  document.body.appendChild(d);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
  const r = { x: mark.offsetLeft - el.scrollLeft, y: mark.offsetTop - el.scrollTop + lh };
  d.remove();
  return r;
}

type Props = {
  hit: TokenHit;
  /** 今の向き（書いていなければ、流れで決まった向き） */
  dir: Dir;
  x: number;
  y: number;
  /** 打ったばかり：秒数の欄にカーソルを合わせる。そうでなければ幽霊のように薄く出す */
  focus: boolean;
  onPick: (dir: Dir, sec: number) => void;
  onClose: () => void;
};

/** ・m1・・l の吹き出し：イン／アウト（明転／暗転）と秒数。秒数を入れなければカット */
export function CuePop(p: Props) {
  const { tk } = p.hit;
  const [sec, setSec] = useState(tk.sec ? String(tk.sec) : '');
  const [dir, setDir] = useState<Dir>(p.dir);
  const [ghost, setGhost] = useState(!p.focus);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSec(tk.sec ? String(tk.sec) : '');
    setDir(p.dir);
  }, [p.hit.start, tk.sec, p.dir]);
  useEffect(() => {
    setGhost(!p.focus);
    if (p.focus) input.current?.focus({ preventScroll: true });
  }, [p.focus, p.hit.start]);

  const n = () => {
    const v = Number(sec.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10)).replace('．', '.'));
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const pick = (d: Dir) => p.onPick(d, n());
  const keep = (e: React.PointerEvent) => e.preventDefault();
  const title = tk.kind === 'cue' ? `音源${circled(tk.n)}` : '照明';
  const [inL, outL] = tk.kind === 'cue' ? ['イン', 'アウト'] : ['明転', '暗転'];

  return (
    <div
      ref={box}
      className={`cuepop ${tk.kind === 'cue' ? 'snd' : 'lgt'}${ghost ? ' ghost' : ''}`}
      style={{ left: p.x, top: p.y }}
      role="dialog"
      aria-label={`${title}のイン・アウトと秒数`}
      onPointerDown={() => setGhost(false)}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node)) p.onClose();
      }}
    >
      <b>{title}</b>
      <button className={dir === 'in' ? 'on' : ''} onPointerDown={keep} onClick={() => pick('in')}>
        {inL}
      </button>
      <button className={dir === 'out' ? 'on' : ''} onPointerDown={keep} onClick={() => pick('out')}>
        {outL}
      </button>
      <label>
        <input
          ref={input}
          value={sec}
          inputMode="decimal"
          placeholder="0"
          size={3}
          aria-label="秒数（入れなければカット）"
          onChange={(e) => setSec(e.target.value)}
          onFocus={() => setGhost(false)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              pick(dir);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              p.onClose();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              if (sec) return;
              e.preventDefault();
              setDir(e.key === 'ArrowLeft' ? 'in' : 'out');
            }
          }}
        />
        秒
      </label>
    </div>
  );
}
