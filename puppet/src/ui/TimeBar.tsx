import { memo, useRef } from 'react';
import { member } from '../model/cast';
import { isDark, type StageState } from '../model/state';
import { fmtTime, type Timeline } from '../model/timing';
import type { CastMember, Item } from '../model/types';
import { useClock } from './clock';

type Props = {
  cast: CastMember[];
  items: Item[];
  states: StageState[];
  tl: Timeline;
  playing: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
};

const Track = memo(function Track({ cast, items, states, tl }: Omit<Props, 'playing' | 'onToggle' | 'onSeek'>) {
  const T = Math.max(tl.total, 0.001);
  const pc = (s: number) => `${(s / T) * 100}%`;
  // 暗転中の区間（項目を適用した後が暗いところ）をつなげる
  const dark: [number, number][] = [];
  items.forEach((_, i) => {
    if (!isDark(states[i])) return;
    const a = tl.starts[i];
    const b = a + tl.durs[i];
    const last = dark[dark.length - 1];
    if (last && Math.abs(last[1] - a) < 1e-6) last[1] = b;
    else dark.push([a, b]);
  });
  return (
    <>
      {dark.map(([a, b], k) => (
        <div key={k} className="tb-dark" style={{ left: pc(a), width: pc(b - a) }} />
      ))}
      {items.map((it, i) =>
        it.t === 'line' ? (
          <div key={it.id} className="tb-line" style={{ left: pc(tl.starts[i]), width: pc(tl.durs[i]), background: member(cast, it.w)?.color }} />
        ) : it.t === 'act' ? (
          <div key={it.id} className="tb-act" style={{ left: pc(tl.starts[i]), width: pc(tl.durs[i]) }} />
        ) : it.t === 'light' ? (
          <div key={it.id} className="tb-tick light" style={{ left: pc(tl.starts[i]) }} />
        ) : it.t === 'cue' || it.t === 'se' ? (
          <div key={it.id} className="tb-tick sound" style={{ left: pc(tl.starts[i]) }} />
        ) : null,
      )}
    </>
  );
});

export function TimeBar(p: Props) {
  const t = useClock();
  const ref = useRef<HTMLDivElement>(null);
  const T = Math.max(p.tl.total, 0.001);
  const seekAt = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    p.onSeek(Math.min(1, Math.max(0, (x - r.left) / r.width)) * T);
  };
  return (
    <div className="timebar">
      <button className="play" onClick={p.onToggle} aria-label={p.playing ? '停止' : '再生'}>
        {p.playing ? '■' : '▶'}
      </button>
      <div
        ref={ref}
        className="track"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          seekAt(e.clientX);
        }}
        onPointerMove={(e) => e.buttons && seekAt(e.clientX)}
      >
        <Track cast={p.cast} items={p.items} states={p.states} tl={p.tl} />
        <div className="tb-head" style={{ left: `${(Math.min(t, T) / T) * 100}%` }} />
      </div>
      <span className="clock">
        {fmtTime(t)} / {fmtTime(p.tl.total)}
      </span>
    </div>
  );
}
