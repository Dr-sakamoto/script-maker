import { member, nameOf } from './cast';
import { moveBefore } from './edit';
import { allStates, areaOf, classifyMove, initialState, sideName, type StageState } from './state';
import { timeline, type Timeline } from './timing';
import type { CastMember, Doc, Item } from './types';

/**
 * タイムラインの行（トラック）。音楽・動画の編集ツールのように、
 * 人・音・光・モノがそれぞれ時間の上でどう振る舞うかを並べる。UI から切り離した純粋関数。
 */

export type ClipKind = 'line' | 'act' | 'ma' | 'on' | 'held' | 'sound' | 'light';
export type Clip = {
  key: string;
  kind: ClipKind;
  start: number;
  end: number;
  /** この帯をつくった項目（タップでそこへ飛ぶ・ドラッグで動かす） */
  itemId: string;
  /** 帯を終わらせた項目（音を止めた・ハケた など）。無ければ最後まで続く */
  endItemId?: string;
  label?: string;
  color?: string;
  fadeIn?: number;
  fadeOut?: number;
};
export type MarkKind = 'enter' | 'exit' | 'move' | 'hold' | 'se' | 'cue' | 'light';
export type Mark = { key: string; kind: MarkKind; t: number; itemId: string; label: string };
export type LaneGroup = 'people' | 'sound' | 'light' | 'things' | 'stage';
export type Lane = { id: string; group: LaneGroup; label: string; color?: string; clips: Clip[]; marks: Mark[] };

export const GROUP_LABEL: Record<LaneGroup, string> = { people: '人', sound: '音', light: '光', things: 'モノ', stage: '全体' };

export function buildLanes(doc: Doc, tl: Timeline = timeline(doc.items), states: StageState[] = allStates(doc.items, doc.cast)): Lane[] {
  const { items, cast } = doc;
  const init = initialState(cast);
  const before = (i: number) => (i > 0 ? states[i - 1] : init);
  const start = (i: number) => tl.starts[i];
  const end = (i: number) => tl.starts[i] + tl.durs[i];
  const T = tl.total;

  const lanes = new Map<string, Lane>();
  const lane = (id: string, group: LaneGroup, label: string, color?: string) => {
    let l = lanes.get(id);
    if (!l) lanes.set(id, (l = { id, group, label, color, clips: [], marks: [] }));
    return l;
  };
  // 役の行は登場順に先に作っておく（使っていない役も、人なら行を出す）
  for (const c of cast) if (c.kind === 'puppet') lane(c.id, 'people', c.name, c.color);

  // --- 舞台にいる時間（人・モノ）と、持っている時間
  const on: Record<string, { t: number; itemId: string } | undefined> = {};
  const hold: Record<string, { t: number; itemId: string; by: string } | undefined> = {};
  for (const c of cast) if (init.held[c.id]) hold[c.id] = { t: 0, itemId: '', by: init.held[c.id] };
  const thingLane = (c: CastMember) => lane(c.id, 'things', c.name, c.color);
  const closeOn = (w: string, t: number, itemId: string) => {
    const o = on[w];
    if (!o) return;
    const m = member(cast, w);
    const l = m?.kind === 'puppet' ? lane(w, 'people', m.name, m.color) : thingLane(m!);
    l.clips.push({ key: `on:${w}:${o.itemId}`, kind: 'on', start: o.t, end: t, itemId: o.itemId, endItemId: itemId || undefined, color: m?.color });
    on[w] = undefined;
  };
  const closeHold = (w: string, t: number, itemId: string) => {
    const h = hold[w];
    if (!h) return;
    const m = member(cast, w)!;
    thingLane(m).clips.push({
      key: `held:${w}:${h.itemId || 'init'}`,
      kind: 'held',
      start: h.t,
      end: t,
      itemId: h.itemId,
      endItemId: itemId || undefined,
      label: `${nameOf(cast, h.by)}が持つ`,
      color: member(cast, h.by)?.color,
    });
    hold[w] = undefined;
  };

  // --- 音（音源番号ごと）と光
  const snd: Record<number, { t: number; itemId: string; fadeIn?: number } | undefined> = {};
  const reg: Record<number, string> = { ...(doc.sounds ?? {}) };
  for (const it of items) if (it.t === 'cue' && it.x) reg[it.n] = it.x;
  const sndLane = (n: number) => lane(`snd:${n}`, 'sound', `♪${n}${reg[n] ? ` ${reg[n]}` : ''}`);
  const lit: Record<string, { t: number; itemId: string; fadeIn?: number } | undefined> = {};
  const lightLane = (p?: number) => lane(p ? `pin:${p}` : 'light', 'light', p ? `ピン ${['下手', '中央', '上手'][p - 1]}` : '舞台全体');
  const closeLight = (k: string, p: number | undefined, t: number, itemId: string, fadeOut?: number) => {
    const o = lit[k];
    if (!o) return;
    lightLane(p).clips.push({ key: `light:${k}:${o.itemId}`, kind: 'light', label: p ? 'ピン' : '明るい', start: o.t, end: t + (fadeOut ?? 0), itemId: o.itemId, endItemId: itemId || undefined, fadeIn: o.fadeIn, fadeOut });
    lit[k] = undefined;
  };

  items.forEach((it, i) => {
    const t0 = start(i);
    switch (it.t) {
      case 'line': {
        const m = member(cast, it.w);
        const l = m?.kind === 'puppet' ? lane(it.w, 'people', m.name, m.color) : m ? thingLane(m) : lane('stage', 'stage', '間・ト書き');
        l.clips.push({ key: `c:${it.id}`, kind: 'line', start: t0, end: end(i), itemId: it.id, label: it.x || '…', color: m?.color });
        break;
      }
      case 'act': {
        const m = member(cast, it.w);
        const l = m ? (m.kind === 'puppet' ? lane(m.id, 'people', m.name, m.color) : thingLane(m)) : lane('stage', 'stage', '間・ト書き');
        l.clips.push({ key: `c:${it.id}`, kind: 'act', start: t0, end: end(i), itemId: it.id, label: it.x || '…', color: m?.color });
        break;
      }
      case 'ma':
        lane('stage', 'stage', '間・ト書き').clips.push({ key: `c:${it.id}`, kind: 'ma', start: t0, end: end(i), itemId: it.id, label: `間 ${it.s}″` });
        break;
      case 'move': {
        const m = member(cast, it.w);
        if (!m) break;
        const prev = before(i);
        const k = classifyMove(prev, it);
        const l = m.kind === 'puppet' ? lane(m.id, 'people', m.name, m.color) : thingLane(m);
        if (prev.held[it.w]) closeHold(it.w, t0, it.id);
        if (!it.in) {
          closeOn(it.w, t0, it.id);
          l.marks.push({ key: `m:${it.id}`, kind: 'exit', t: t0, itemId: it.id, label: m.kind === 'puppet' ? `ハケ ${sideName(it.side)[0]}` : '片付け' });
        } else {
          // 板付きは幕が開く前からいる
          if (!on[it.w]) on[it.w] = { t: k === 'board' ? 0 : t0, itemId: it.id };
          l.marks.push({
            key: `m:${it.id}`,
            kind: k === 'move' ? 'move' : 'enter',
            t: t0,
            itemId: it.id,
            label: k === 'move' ? `→${areaOf(it.x)[0]}` : m.kind === 'puppet' ? (k === 'board' ? '板付' : '出') : '置く',
          });
        }
        break;
      }
      case 'hold': {
        const m = member(cast, it.w);
        if (!m) break;
        closeHold(it.w, t0, it.id);
        closeOn(it.w, t0, it.id);
        hold[it.w] = { t: t0, itemId: it.id, by: it.by };
        lane(it.by, 'people', nameOf(cast, it.by), member(cast, it.by)?.color).marks.push({ key: `h:${it.id}`, kind: 'hold', t: t0, itemId: it.id, label: `✋${m.short}` });
        break;
      }
      case 'cue': {
        const l = sndLane(it.n);
        if (it.op === 'C.I' || it.op === 'F.I') {
          if (!snd[it.n]) snd[it.n] = { t: t0, itemId: it.id, fadeIn: it.op === 'F.I' ? it.sec : undefined };
        } else {
          const o = snd[it.n];
          if (o) {
            const fadeOut = it.op === 'F.O' ? it.sec : undefined;
            l.clips.push({ key: `s:${o.itemId}`, kind: 'sound', start: o.t, end: t0 + (fadeOut ?? 0), itemId: o.itemId, endItemId: it.id, label: reg[it.n] || `音源${it.n}`, fadeIn: o.fadeIn, fadeOut });
            snd[it.n] = undefined;
          } else l.marks.push({ key: `m:${it.id}`, kind: 'cue', t: t0, itemId: it.id, label: it.op });
        }
        break;
      }
      case 'se':
        lane('se', 'sound', 'SE').marks.push({ key: `m:${it.id}`, kind: 'se', t: t0, itemId: it.id, label: it.x || 'SE' });
        break;
      case 'light': {
        const k = it.p ? `p${it.p}` : 'all';
        if (it.on) {
          if (!lit[k]) lit[k] = { t: t0, itemId: it.id, fadeIn: it.fade };
          else lightLane(it.p).marks.push({ key: `m:${it.id}`, kind: 'light', t: t0, itemId: it.id, label: '点' });
        } else if (lit[k]) closeLight(k, it.p, t0, it.id, it.fade);
        else lightLane(it.p).marks.push({ key: `m:${it.id}`, kind: 'light', t: t0, itemId: it.id, label: '消' });
        break;
      }
    }
  });
  // 最後まで続くもの
  for (const w of Object.keys(on)) closeOn(w, T, '');
  for (const w of Object.keys(hold)) closeHold(w, T, '');
  for (const n of Object.keys(snd).map(Number)) {
    const o = snd[n];
    if (o) sndLane(n).clips.push({ key: `s:${o.itemId}`, kind: 'sound', start: o.t, end: T, itemId: o.itemId, label: reg[n] || `音源${n}`, fadeIn: o.fadeIn });
  }
  for (const k of Object.keys(lit)) closeLight(k, k === 'all' ? undefined : Number(k.slice(1)), T, '');

  const order: LaneGroup[] = ['people', 'stage', 'sound', 'light', 'things'];
  // グループ順。音と光は番号順（光は全体が先）
  return [...lanes.values()].sort((a, b) => {
    const g = order.indexOf(a.group) - order.indexOf(b.group);
    if (g) return g;
    if (a.group === 'sound' || a.group === 'light') return a.id.localeCompare(b.id, 'ja', { numeric: true });
    return 0;
  });
}

/**
 * 項目を時刻 t のところへ動かす（タイムラインで印をドラッグして離したとき）。
 * 時刻 t を含む項目の前半なら、その項目の前へ、後半ならその後ろへ入れる。
 */
export function placeAt(items: Item[], id: string, t: number): Item[] {
  const rest = items.filter((x) => x.id !== id);
  const tl = timeline(rest);
  if (!rest.length) return items;
  if (t <= 0) return moveBefore(items, id, rest[0].id);
  let j = rest.findIndex((_, k) => tl.starts[k] + tl.durs[k] > t);
  if (j < 0) return moveBefore(items, id, null);
  const mid = tl.starts[j] + tl.durs[j] / 2;
  if (t > mid) j += 1;
  return moveBefore(items, id, j < rest.length ? rest[j].id : null);
}

/** 時刻 t へ動かしたら、実際にどこから始まるか（どの項目の後ろに入るか）。ドラッグ中の行き先の表示に使う */
export function placedAt(items: Item[], id: string, t: number): { start: number; after?: string } {
  const next = placeAt(items, id, t);
  const i = next.findIndex((x) => x.id === id);
  return { start: timeline(next).starts[i] ?? 0, after: next[i - 1]?.id };
}
