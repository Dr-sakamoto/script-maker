import { memo, useEffect, useRef, useState } from 'react';
import { member, puppets } from '../../lib/stage/cast';
import { groupRows } from '../../lib/stage/edit';
import { moveSentence } from '../../lib/stage/export';
import { actParens } from '../../lib/stage/parens';
import { initialState, type StageState } from '../../lib/stage/state';
import type { CastMember, CueOp, Item, PinNo } from '../../lib/stage/types';
import { AutoText } from './AutoText';
import { chipLook, layerOf, type Layer } from './chips';

type Props = {
  cast: CastMember[];
  items: Item[];
  states: StageState[];
  cursor: number;
  layers: Set<Layer>;
  openChip: string | null;
  focusName: string | null;
  scrollKey: number;
  onOpenChip: (id: string | null) => void;
  onCursor: (i: number) => void;
  onEdit: (id: string, patch: Partial<Item>) => void;
  onRemove: (id: string) => void;
  onMoveChip: (id: string, beforeId: string | null) => void;
};

type ChipDrag = { id: string; x: number; y: number; over: string | null; text: string };

export const ScriptView = memo(function ScriptView(p: Props) {
  const rows = groupRows(p.items);
  const init = initialState(p.cast);
  const before = (i: number) => (i > 0 ? p.states[i - 1] : init);
  const sel = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<ChipDrag | null>(null);
  const dim = (l: Layer) => (p.layers.size && !p.layers.has(l) ? ' dim' : '');

  useEffect(() => {
    sel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [p.cursor, p.scrollKey]);

  const lineRoles = [...puppets(p.cast), ...p.cast.filter((c) => c.kind === 'prop')];
  const actRoles: (string | undefined)[] = [...puppets(p.cast).map((c) => c.id), undefined];
  const cycle = <T,>(list: T[], v: T) => list[(list.indexOf(v) + 1) % list.length];

  /** 長押しで掴んで別の行へ。短く離せばミニ操作盤 */
  const chipDown = (id: string, text: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let grabbed = false;
    let cur: ChipDrag | null = null;
    const timer = window.setTimeout(() => {
      grabbed = true;
      cur = { id, x: x0, y: y0, over: null, text };
      setDrag(cur);
      navigator.vibrate?.(15);
    }, 350);
    const rowAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest('[data-row]') as HTMLElement | null;
      return el ? el.dataset.row ?? '' : null;
    };
    const move = (ev: PointerEvent) => {
      if (!grabbed) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) cleanup();
        return;
      }
      ev.preventDefault();
      cur = { ...cur!, x: ev.clientX, y: ev.clientY, over: rowAt(ev.clientX, ev.clientY) };
      setDrag(cur);
    };
    const up = (ev: PointerEvent) => {
      const was = grabbed;
      cleanup();
      if (!was) return p.onOpenChip(p.openChip === id ? null : id);
      const over = rowAt(ev.clientX, ev.clientY);
      setDrag(null);
      if (over != null) p.onMoveChip(id, over || null);
    };
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const cancel = () => {
      cleanup();
      setDrag(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  return (
    <div className={`script${drag ? ' dragging' : ''}`}>
      {rows.length === 0 && <div className="empty">舞台を触るか、下の欄に打つ</div>}
      {rows.map((row, ri) => {
        const body = row.body != null ? p.items[row.body] : null;
        const bodyId = body?.id ?? '';
        const here = (row.body != null && p.cursor === row.body) || row.chips.includes(p.cursor);
        const open = row.chips.map((i) => p.items[i]).find((it) => it.id === p.openChip);
        return (
          <div
            key={bodyId || `tail${ri}`}
            data-row={bodyId}
            ref={here ? sel : undefined}
            className={`row${here ? ' here' : ''}${drag && drag.over === bodyId ? ' drop' : ''}`}
          >
            {row.chips.length > 0 && (
              <div className="chips">
                {row.chips.map((i) => {
                  const it = p.items[i];
                  const look = chipLook(p.cast, it, before(i));
                  return (
                    <button
                      key={it.id}
                      className={`chip ${look.tone}${look.filled ? ' filled' : ''}${p.cursor === i ? ' cur' : ''}${p.openChip === it.id ? ' open' : ''}${drag?.id === it.id ? ' lifted' : ''}${dim(layerOf(it))}`}
                      onPointerDown={chipDown(it.id, look.text)}
                      onClick={() => p.onCursor(i)}
                    >
                      {look.text}
                    </button>
                  );
                })}
              </div>
            )}
            {open && (
              <ChipPanel
                key={open.id}
                cast={p.cast}
                it={open}
                prev={before(p.items.indexOf(open))}
                focusName={p.focusName === open.id}
                onEdit={(patch) => p.onEdit(open.id, patch)}
                onRemove={() => {
                  p.onOpenChip(null);
                  p.onRemove(open.id);
                }}
              />
            )}
            {body && row.body != null && (
              <div className={`body ${body.t}${p.cursor === row.body ? ' cur' : ''}${dim(layerOf(body))}`} onClick={() => p.onCursor(row.body!)}>
                {body.t === 'line' ? (
                  <LineBody
                    cast={p.cast}
                    it={body}
                    onSpeaker={() => p.onEdit(body.id, { w: cycle(lineRoles.map((c) => c.id), body.w) })}
                    onEdit={(patch) => p.onEdit(body.id, patch)}
                    onFocus={() => p.onCursor(row.body!)}
                  />
                ) : body.t === 'act' ? (
                  <>
                    <span className="paren act-paren" style={{ color: actParens(p.cast, body.w).color }}>
                      {actParens(p.cast, body.w).open}
                    </span>
                    <button
                      className="who"
                      style={{ color: member(p.cast, body.w)?.color }}
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onEdit(body.id, { w: cycle(actRoles, body.w) });
                      }}
                    >
                      {member(p.cast, body.w)?.name ?? '・'}
                    </button>
                    {body.w && <span className="paren">、</span>}
                    <AutoText value={body.x} onChange={(x) => p.onEdit(body.id, { x })} onFocus={() => p.onCursor(row.body!)} placeholder="動き" />
                    <span className="paren act-paren" style={{ color: actParens(p.cast, body.w).color }}>
                      {actParens(p.cast, body.w).close}
                    </span>
                  </>
                ) : null}
                {p.cursor === row.body && (
                  <button
                    className="del"
                    aria-label="この行を消す"
                    onClick={(e) => {
                      e.stopPropagation();
                      p.onRemove(body.id);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {drag && (
        <div className="chip ghost" style={{ left: drag.x, top: drag.y }}>
          {drag.text}
        </div>
      )}
    </div>
  );
});

function LineBody(p: {
  cast: CastMember[];
  it: Extract<Item, { t: 'line' }>;
  onSpeaker: () => void;
  onEdit: (patch: Partial<Item>) => void;
  onFocus: () => void;
}) {
  const m = member(p.cast, p.it.w);
  const prop = m?.kind === 'prop';
  return (
    <>
      <button
        className="who"
        style={{ color: m?.color }}
        onClick={(e) => {
          e.stopPropagation();
          p.onSpeaker();
        }}
      >
        {m?.name ?? '？'}
      </button>
      <span className="quote">{prop ? '『' : '「'}</span>
      <AutoText value={p.it.x} onChange={(x) => p.onEdit({ x })} onFocus={p.onFocus} placeholder="セリフ" />
      <span className="quote">{prop ? '』' : '」'}</span>
      <span className={`note${p.it.n ? '' : ' blank'}`}>
        <span className="paren">（</span>
        <AutoText className="memo" value={p.it.n ?? ''} onChange={(n) => p.onEdit({ n: n || undefined })} onFocus={p.onFocus} placeholder="　" />
        <span className="paren">）</span>
      </span>
    </>
  );
}

const Step = (p: { value: number; min?: number; max?: number; step?: number; fmt?: (v: number) => string; onChange: (v: number) => void }) => {
  const s = p.step ?? 1;
  const clamp = (v: number) => Math.min(p.max ?? 99, Math.max(p.min ?? 0, Math.round(v * 10) / 10));
  return (
    <span className="step">
      <button onClick={() => p.onChange(clamp(p.value - s))}>−</button>
      <b>{p.fmt ? p.fmt(p.value) : p.value}</b>
      <button onClick={() => p.onChange(clamp(p.value + s))}>＋</button>
    </span>
  );
};

const Seg = <T extends string | number | undefined>(p: { opts: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) => (
  <span className="seg">
    {p.opts.map((o) => (
      <button key={String(o.v)} className={o.v === p.value ? 'on' : ''} onClick={() => p.onChange(o.v)}>
        {o.label}
      </button>
    ))}
  </span>
);

function ChipPanel(p: { cast: CastMember[]; it: Item; prev: StageState; focusName: boolean; onEdit: (patch: Partial<Item>) => void; onRemove: () => void }) {
  const { it } = p;
  const x = (
    <button className="x" onClick={p.onRemove} aria-label="消す">
      ×
    </button>
  );
  let inner: React.ReactNode = null;
  switch (it.t) {
    case 'light':
      inner = (
        <>
          <Seg<PinNo | undefined>
            opts={[{ v: undefined, label: '全体' }, { v: 1, label: '◎1' }, { v: 2, label: '◎2' }, { v: 3, label: '◎3' }]}
            value={it.p}
            onChange={(v) => p.onEdit({ p: v })}
          />
          <Seg opts={[{ v: 'on', label: '点' }, { v: 'off', label: '消' }]} value={it.on ? 'on' : 'off'} onChange={(v) => p.onEdit({ on: v === 'on' })} />
          <Step value={it.fade ?? 0} max={30} fmt={(v) => (v ? `じわ ${v}″` : 'カット')} onChange={(v) => p.onEdit({ fade: v || undefined })} />
        </>
      );
      break;
    case 'cue':
      inner = (
        <>
          <Step value={it.n} min={1} fmt={(v) => `♪${v}`} onChange={(n) => p.onEdit({ n })} />
          <Seg<CueOp>
            opts={(['C.I', 'F.I', 'C.O', 'F.O'] as CueOp[]).map((v) => ({ v, label: v }))}
            value={it.op}
            onChange={(op) => p.onEdit({ op, sec: op === 'F.I' || op === 'F.O' ? (it.sec ?? 3) : undefined })}
          />
          {(it.op === 'F.I' || it.op === 'F.O') && <Step value={it.sec ?? 0} max={30} fmt={(v) => `${v}″`} onChange={(sec) => p.onEdit({ sec: sec || undefined })} />}
          <input className="name" autoFocus={p.focusName} value={it.x ?? ''} placeholder="音源の名前" onChange={(e) => p.onEdit({ x: e.target.value || undefined })} />
        </>
      );
      break;
    case 'ma':
      inner = <Step value={it.s} step={0.5} max={60} fmt={(v) => `${v}″`} onChange={(s) => p.onEdit({ s })} />;
      break;
    case 'se':
      inner = <input className="name" autoFocus value={it.x} placeholder="SE" onChange={(e) => p.onEdit({ x: e.target.value })} />;
      break;
    case 'move':
      inner = <span className="sentence">{moveSentence(p.cast, p.prev, it)}</span>;
      break;
  }
  return (
    <div className={`panel ${it.t}`} onPointerDown={(e) => e.stopPropagation()}>
      {inner}
      {x}
    </div>
  );
}
