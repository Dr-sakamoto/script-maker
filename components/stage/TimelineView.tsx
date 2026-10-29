import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { StageState } from '../../lib/stage/state';
import { fmtTime, type Timeline } from '../../lib/stage/timing';
import { buildLanes, placedAt, type Clip, type Lane, type LaneGroup, type Mark, type MarkKind } from '../../lib/stage/tracks';
import type { Doc } from '../../lib/stage/types';
import { useClock } from './clock';

/**
 * 音楽・動画の編集ツールのようなタイムライン。人・音・光・モノを1行ずつ並べる。
 * - 帯や印をタップ＝その場面へ（そこが書き込み位置になる）
 * - 印・セリフ・動き・間を左右にドラッグ＝その時刻へ動かす（きっかけが変わる）。離す前に行き先を点線で見せる
 * - 出〜ハケ、音の入〜止め、明〜暗の帯は、両端をつまんで動かせる
 * - 間の帯は右端をつまむと長さが変わる
 * - 目盛りを触る＝その時刻へ。±で拡大縮小（Ctrl＋ホイールでも）。見出しをタップで畳む
 *
 * スマホ（幅が狭いとき）は CapCut のような触り心地にする：
 * - 再生位置の線は真ん中に固定。指で左右に送ると時間が動く（再生中に触ると止まる）
 * - 2本指で広げる・つまむ＝拡大縮小
 * - タップで選ぶ → 選んだものだけ、ずらす・端をつまめる（選んでいない帯の上でも指で送れる）
 */

const ROW = 32;
/** スマホの行の高さ。人・モノは大きく、音・光は細く（横向きで背が低いときは少し詰める） */
const capRow = (g: LaneGroup, short: boolean) => (g === 'sound' || g === 'light' ? (short ? 24 : 30) : short ? 32 : 42);
/** 指で触る端末か（スマホ・タブレット） */
const coarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];

/** 見出しのまとまり。間・ト書きは人のまとまりに入れる */
const SECTIONS: { key: string; icon: string; label: string; groups: LaneGroup[] }[] = [
  { key: 'people', icon: '●', label: '人', groups: ['people', 'stage'] },
  { key: 'sound', icon: '♪', label: '音', groups: ['sound'] },
  { key: 'light', icon: '☀', label: '光', groups: ['light'] },
  { key: 'things', icon: '■', label: 'モノ', groups: ['things'] },
];

const MARK_ICON: Record<MarkKind, string> = { enter: '▶', exit: '◀', move: '', hold: '', se: '◆', cue: '■', light: '☀' };

type Drag = { key: string; itemId: string; mode: 'move' | 'edge' | 'ma'; t0: number; x0: number; t: number; moved: boolean };

type Props = {
  doc: Doc;
  states: StageState[];
  tl: Timeline;
  cursorItemId?: string;
  playing: boolean;
  onSeek: (t: number) => void;
  onPick: (itemId: string) => void;
  onPlace: (itemId: string, t: number) => void;
  onResizeMa: (itemId: string, sec: number) => void;
  /** 選んでいるものを一つ前・後ろへ */
  onNudge: (itemId: string, dir: -1 | 1) => void;
  onRemove: (itemId: string) => void;
  onPause: () => void;
};

/** 帯・印を短い言葉にする（上の帯に「いま選んでいるもの」「どこへ動くか」を出すため） */
function describe(lanes: Lane[]): Map<string, string> {
  const d = new Map<string, string>();
  for (const l of lanes) {
    const who = l.group === 'stage' ? '' : l.label;
    for (const c of l.clips) {
      if (c.kind === 'line') d.set(c.itemId, `${who}「${c.label}」`);
      else if (c.kind === 'act') d.set(c.itemId, `${who}（${c.label}）`);
      else if (c.kind === 'ma') d.set(c.itemId, c.label ?? '間');
      else if (c.kind === 'sound') {
        d.set(c.itemId, `♪${c.label} 入`);
        if (c.endItemId) d.set(c.endItemId, `♪${c.label} 止め`);
      } else if (c.kind === 'light') {
        if (c.itemId) d.set(c.itemId, `${l.label} 点く`);
        if (c.endItemId) d.set(c.endItemId, `${l.label} 消える`);
      } else if (c.kind === 'held' && c.endItemId && !d.has(c.endItemId)) d.set(c.endItemId, `${l.label} 手放す`);
    }
    for (const m of l.marks) d.set(m.itemId, `${l.label} ${m.label}`);
  }
  return d;
}

export function TimelineView(p: Props) {
  const lanes = useMemo(() => buildLanes(p.doc, p.tl, p.states), [p.doc, p.tl, p.states]);
  const words = useMemo(() => describe(lanes), [lanes]);
  const scroller = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [zoom, setZoom] = useState<number | null>(null); // 1秒あたりの px（null＝おまかせ）
  const [drag, setDrag] = useState<Drag | null>(null);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [help, setHelp] = useState(false);
  // 帯を掴んでいる間は、下の行の「触った所へ再生位置を動かす」を止める（ポインタの動きは行まで伝わるため）
  const holding = useRef(false);
  const t = useClock();
  const T = Math.max(p.tl.total, 1);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const cap = w < 640 || coarse(); // 指で触る端末：真ん中の線に時間を送る
  const narrow = w < 640;
  const short = typeof window !== 'undefined' && window.innerHeight < 520;
  const LABEL = narrow ? 30 : cap ? 96 : 112; // 行の名前の幅（狭いときは丸だけ）
  const fit = Math.max(4, cap ? (w - 48) / T : (w - LABEL - 24) / T);
  // おまかせ：全体が収まる幅。スマホは文字が読める幅で開き、横に送って見る
  const auto = cap ? Math.max(fit, 36) : fit;
  const pps = zoom ?? auto;
  const pad = cap ? w / 2 : LABEL; // スマホは頭と終わりも真ん中まで送れるように余白を取る
  const X = (sec: number) => pad + sec * pps;
  const width = X(T) + (cap ? w / 2 : 40);
  const step = STEPS.find((s) => s * pps >= 48) ?? 300;

  // 再生中は再生位置が見えるように追いかける。スマホは常に再生位置が真ん中に来るよう送る
  const setByUs = useRef(-1);
  const pinching = useRef(false);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (cap) {
      const want = Math.round(t * pps);
      if (Math.abs(el.scrollLeft - want) > 1) {
        setByUs.current = want;
        el.scrollLeft = want;
      }
      return;
    }
    if (!p.playing) return;
    const x = X(t);
    if (x < el.scrollLeft + LABEL || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - LABEL - 40;
  });
  // スマホ：指で送った分だけ時間を動かす
  const onScroll = () => {
    const el = scroller.current;
    if (!cap || !el || p.playing || pinching.current) return;
    if (Math.abs(el.scrollLeft - setByUs.current) <= 1) return;
    setByUs.current = -1;
    p.onSeek(Math.min(T, Math.max(0, el.scrollLeft / pps)));
  };
  // スマホ：2本指で拡大縮小
  useEffect(() => {
    const el = scroller.current;
    if (!el || !cap) return;
    let d0 = 0;
    let z0 = 0;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      d0 = dist(e);
      z0 = ppsRef.current;
      pinching.current = true; // つまんでいる間は、拡大で動く送り位置を時間として読まない
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !d0) return;
      e.preventDefault();
      setZoom(Math.min(400, Math.max(fit * 0.8, (z0 * dist(e)) / d0)));
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length >= 2 || !d0) return;
      d0 = 0;
      // 拡大し終わってから、再生位置が真ん中に戻るまで待つ
      requestAnimationFrame(() => requestAnimationFrame(() => (pinching.current = false)));
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [cap, fit]);

  // Ctrl＋ホイールで拡大縮小（ピンチもこれになる）
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const f = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(400, Math.max(fit * 0.5, (z ?? auto) * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    el.addEventListener('wheel', f, { passive: false });
    return () => el.removeEventListener('wheel', f);
  }, [fit, auto]);

  const timeAt = (clientX: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return Math.min(T, Math.max(0, (clientX - r.left + el.scrollLeft - LABEL) / pps));
  };

  /** 帯や印を掴む。動かさずに離せばタップ（その場面へ）、動かせばドラッグ */
  const grab = (key: string, itemId: string, mode: Drag['mode'], t0: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!itemId) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    holding.current = true;
    let d: Drag = { key, itemId, mode, t0, x0: e.clientX, t: t0, moved: false };
    setDrag(d);
    const move = (ev: PointerEvent) => {
      if (pinching.current) return; // 2本指になったら拡大縮小。掴んだものは動かさない
      if (!d.moved && Math.abs(ev.clientX - d.x0) < 5) return;
      d = { ...d, moved: true, t: Math.max(0, t0 + (ev.clientX - d.x0) / pps) };
      setDrag(d);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      holding.current = false;
      setDrag(null);
      if (ev.type === 'pointercancel' || pinching.current) return;
      if (!d.moved) return p.onPick(itemId);
      if (mode === 'ma') p.onResizeMa(itemId, d.t);
      else p.onPlace(itemId, d.t);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const seekDown = (e: React.PointerEvent) => {
    if (cap) return; // スマホは指で送って時間を動かす
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    p.onSeek(timeAt(e.clientX));
  };
  const seekMove = (e: React.PointerEvent) => !cap && !holding.current && e.buttons && p.onSeek(timeAt(e.clientX));
  /** スマホで選んでいないもの：タップで選ぶだけ（指で送るのを邪魔しない） */
  const pick = (itemId: string) => () => itemId && p.onPick(itemId);

  // ドラッグ中の行き先。項目は並び順で決まるので、実際に入る位置へ吸い付けて見せる
  const dest = useMemo(() => (drag?.moved && drag.mode !== 'ma' ? placedAt(p.doc.items, drag.itemId, drag.t) : null), [drag, p.doc.items]);

  // ドラッグ中の見た目：動かしている帯・印を指に付いてこさせる
  const shift = (key: string) => (drag?.moved && drag.key === key && drag.mode === 'move' ? (drag.t - drag.t0) * pps : 0);

  const clipEl = (l: Lane, c: Clip) => {
    const cur = c.itemId === p.cursorItemId || c.endItemId === p.cursorItemId;
    const left = X(c.start) + shift(c.key);
    let wpx = Math.max(3, (c.end - c.start) * pps);
    if (drag?.moved && drag.mode === 'ma' && drag.key === c.key) wpx = Math.max(3, drag.t * pps);
    const span = c.kind === 'on' || c.kind === 'held' || c.kind === 'sound' || c.kind === 'light';
    const fi = c.fadeIn ? Math.min(100, ((c.fadeIn * pps) / wpx) * 100) : 0;
    const fo = c.fadeOut ? Math.min(100, ((c.fadeOut * pps) / wpx) * 100) : 0;
    const style: React.CSSProperties = {
      left,
      width: wpx,
      ['--c' as string]: c.color ?? l.color ?? '#888',
      ...(fi || fo ? { clipPath: `polygon(0 100%, ${fi}% 0, ${100 - fo}% 0, 100% 100%)` } : {}),
    };
    const label =
      c.kind === 'act' ? `（${c.label}）` : c.kind === 'sound' ? `♪ ${c.label}` : c.kind === 'held' ? `✋ ${c.label}` : c.kind === 'on' ? '' : c.label;
    const dragging = drag?.moved && (drag.key === c.key || drag.key.startsWith(`${c.key}:`));
    // スマホは選んでいるものだけ動かせる（それ以外はタップで選ぶ）
    const live = !cap || cur;
    return (
      <div
        key={c.key}
        className={`clip k-${c.kind}${cur ? ' cur' : ''}${dragging ? ' lift' : ''}`}
        style={style}
        title={words.get(c.itemId) ?? c.label}
        // 出〜ハケなどの帯は、中を触ればその場面へ（動かすのは両端）。セリフ・動き・間は帯ごと動かせる
        onPointerDown={!live ? undefined : span ? (e) => e.stopPropagation() : grab(c.key, c.itemId, 'move', c.start)}
        onClick={!live || span ? pick(c.itemId) : undefined}
      >
        {label && <span>{label}</span>}
        {live && span && c.itemId && <i className="edge l" onPointerDown={grab(`${c.key}:s`, c.itemId, 'move', c.start)} />}
        {live && span && c.endItemId && <i className="edge r" onPointerDown={grab(`${c.key}:e`, c.endItemId, 'move', c.end - (c.fadeOut ?? 0))} />}
        {live && c.kind === 'ma' && <i className="edge r" onPointerDown={grab(c.key, c.itemId, 'ma', c.end - c.start)} />}
      </div>
    );
  };

  const markEl = (m: Mark) => {
    const cur = m.itemId === p.cursorItemId;
    const lift = drag?.moved && drag.key === m.key;
    return (
      <div
        key={m.key}
        className={`mark mk-${m.kind}${cur ? ' cur' : ''}${lift ? ' lift' : ''}`}
        style={{ left: X(m.t) + shift(m.key) }}
        title={words.get(m.itemId) ?? m.label}
        onPointerDown={!cap || cur ? grab(m.key, m.itemId, 'move', m.t) : undefined}
        onClick={cap && !cur ? pick(m.itemId) : undefined}
      >
        <b>
          {MARK_ICON[m.kind] && <i>{MARK_ICON[m.kind]}</i>}
          {m.label}
        </b>
      </div>
    );
  };

  const nameEl = (l: Lane) => {
    const icon = l.group === 'sound' ? (l.id === 'se' ? 'SE' : '♪') : l.group === 'light' ? '☀' : l.group === 'stage' ? '…' : l.label.slice(0, 1);
    const name = l.group === 'sound' && l.id !== 'se' ? l.label.replace(/^♪/, '') : l.id === 'se' ? '効果音' : l.label;
    return (
      <div className="lane-name">
        <i style={{ ['--c' as string]: l.color ?? '#5a5862' }}>{icon}</i>
        <span>{name}</span>
      </div>
    );
  };

  // 上の帯：いま何を選んでいるか／ドラッグでどこへ入るか
  const cur = p.cursorItemId ? words.get(p.cursorItemId) : undefined;
  const say = drag?.moved
    ? drag.mode === 'ma'
      ? `間を ${Math.max(0.5, Math.round(drag.t * 2) / 2)}″ に`
      : `${words.get(drag.itemId) ?? ''} → ${fmtTime(dest?.start ?? drag.t)}${dest?.after ? `　${words.get(dest.after) ?? ''} の後へ` : '　いちばん最初へ'}`
    : cur
      ? `▸ ${cur}`
      : '';

  const curId = p.cursorItemId;
  return (
    <div className={`tlv${cap ? ' cap' : ''}${narrow ? ' narrow' : ''}${short ? ' short' : ''}`}>
      <div className="tlv-bar">
        <div className={`tlv-say${drag?.moved ? ' drag' : ''}`}>
          {say || <em>{cap ? '指で左右に送る／タップで選ぶ' : '帯や印をタップ＝その場面へ／左右にずらす＝タイミングを変える'}</em>}
        </div>
        {/* 選んでいるものの道具（一つ前へ・後ろへ・消す） */}
        {curId && !drag?.moved && (
          <div className="tlv-tools">
            <button onClick={() => p.onNudge(curId, -1)} aria-label="一つ前へ" title="一つ前へ">
              ◀
            </button>
            <button onClick={() => p.onNudge(curId, 1)} aria-label="一つ後ろへ" title="一つ後ろへ">
              ▶
            </button>
            <button className="trash" onClick={() => p.onRemove(curId)} aria-label="消す" title="消す">
              削除
            </button>
          </div>
        )}
        <div className="tlv-zoom">
          <button onClick={() => setHelp((v) => !v)} className={help ? 'on' : ''} aria-label="見かた">
            ?
          </button>
          {!cap && (
            <>
              <button onClick={() => setZoom(Math.max(fit * 0.5, pps / 1.5))} aria-label="縮小">
                −
              </button>
              <button onClick={() => setZoom(fit)} className={Math.abs(pps - fit) < 0.01 ? 'on' : ''} title="全体を表示">
                全体
              </button>
              <button onClick={() => setZoom(Math.min(400, pps * 1.5))} aria-label="拡大">
                ＋
              </button>
            </>
          )}
        </div>
      </div>
      {help && (
        <div className="tlv-help" onClick={() => setHelp(false)}>
          <span className="clip k-line ex" style={{ ['--c' as string]: '#d9822b' }}>
            <span>セリフ</span>
          </span>
          <span className="clip k-act ex" style={{ ['--c' as string]: '#d9822b' }}>
            <span>（動き）</span>
          </span>
          <span className="ex on">舞台にいる</span>
          <span className="ex off">袖にいる</span>
          <span className="mark mk-enter ex">
            <b>
              <i>▶</i>出
            </b>
          </span>
          <span className="mark mk-exit ex">
            <b>
              <i>◀</i>ハケ
            </b>
          </span>
          <span className="mark mk-hold ex">
            <b>✋持つ</b>
          </span>
          <span className="clip k-sound ex">
            <span>♪ 音</span>
          </span>
          <span className="clip k-light ex">
            <span>明るい</span>
          </span>
          {cap ? (
            <p>指で左右に送る＝時間を動かす　／　2本指＝拡大縮小　／　タップで選ぶ → 選んだものを左右にずらす・端をつまむ　／　◀ ▶＝一つ前・後ろへ　／　見出しをタップ＝たたむ</p>
          ) : (
            <p>タップ＝その場面へ　／　左右にずらす＝タイミングを変える　／　帯の端をつまむ＝出入りや音・明かりの長さ　／　見出しをタップ＝たたむ</p>
          )}
        </div>
      )}
      <div className="tlv-body">
      <div
        className="tlv-scroll"
        ref={scroller}
        style={{ ['--label' as string]: `${LABEL}px` }}
        onScroll={onScroll}
        onPointerDown={() => cap && p.playing && p.onPause()}
      >
        <div className="tlv-inner" style={{ width }}>
          <div className="tlv-ruler" onPointerDown={seekDown} onPointerMove={seekMove}>
            {!cap && <div className="tlv-corner">{fmtTime(t)}</div>}
            {Array.from({ length: Math.floor(T / step) + 1 }, (_, k) => k * step).map((s) => (
              <span key={s} className={s === 0 ? 'zero' : undefined} style={{ left: X(s) }}>
                {s % 60 === 0 || step >= 60 ? fmtTime(s) : `${s % 60}″`}
              </span>
            ))}
          </div>
          {SECTIONS.map((sec) => {
            const ls = lanes.filter((l) => sec.groups.includes(l.group));
            if (!ls.length) return null;
            const fold = !!folded[sec.key];
            return (
              <div key={sec.key} className={`sect s-${sec.key}${fold ? ' folded' : ''}`}>
                <div className="sect-head" onPointerDown={seekDown} onPointerMove={seekMove}>
                  <button
                    className="sect-name"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setFolded((f) => ({ ...f, [sec.key]: !fold }))}
                    aria-expanded={!fold}
                  >
                    <b>{fold ? '▸' : '▾'}</b>
                    <i>{sec.icon}</i>
                    {sec.label}
                    <small>{ls.length}</small>
                  </button>
                  {/* 畳んでいる間も、何がどこにあるかだけは細い線で見せる */}
                  {fold &&
                    ls.flatMap((l) =>
                      l.clips
                        .filter((c) => c.kind !== 'on')
                        .map((c) => <u key={c.key} className={`mini k-${c.kind}`} style={{ left: X(c.start), width: Math.max(2, (c.end - c.start) * pps), ['--c' as string]: c.color ?? l.color ?? '#888' }} />),
                    )}
                </div>
                {!fold &&
                  ls.map((l) => (
                    <div
                      key={l.id}
                      className={`lane g-${l.group}${l.group === 'people' || l.group === 'things' ? ' presence' : ''}`}
                      style={{ height: cap ? capRow(l.group, short) : ROW }}
                      onPointerDown={seekDown}
                      onPointerMove={seekMove}
                    >
                      {nameEl(l)}
                      {l.clips.filter((c) => c.kind === 'on' || c.kind === 'held').map((c) => clipEl(l, c))}
                      {l.clips.filter((c) => c.kind !== 'on' && c.kind !== 'held').map((c) => clipEl(l, c))}
                      {l.marks.map(markEl)}
                    </div>
                  ))}
              </div>
            );
          })}
          {/* 終わりから先は暗くする（袖の斜線と見分けるため） */}
          <div className="tlv-end" style={{ left: X(T) }} />
          {!cap && <div className="tlv-head" style={{ left: X(Math.min(t, T)) }} />}
          {dest && (
            <div className="tlv-ghost" style={{ left: X(dest.start) }}>
              <span>ここに入る</span>
            </div>
          )}
        </div>
      </div>
      {/* スマホ：再生位置は真ん中に固定。時間はその上に出す */}
      {cap && (
        <div className="tlv-head center">
          <span>
            {fmtTime(t)} <small>/ {fmtTime(p.tl.total)}</small>
          </span>
        </div>
      )}
      </div>
    </div>
  );
}
