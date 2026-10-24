import type { CastMember, Item, ItemOf, PinNo, Role, Side } from './types';

export type Place = { on: true; x: number } | { on: false; side: Side };

export type StageState = {
  /** 全体照明（点いている／消えている） */
  lit: boolean;
  /** ピン1〜3（下手・中央・上手） */
  pins: [boolean, boolean, boolean];
  /** 直近の照明変化のじわ秒数（0＝カット）。描画の補間に使う */
  litFade: number;
  pinFade: [number, number, number];
  pos: Record<Role, Place>;
  /** 鳴っている音源：番号→名前 */
  playing: Record<number, string>;
  /** 各人形の今の（動き）。'_' は話者なしの動き */
  acts: Record<string, { x: string; id: string }>;
  /** 最初の照明きっかけを過ぎたか（それより前の move は板付き） */
  started: boolean;
};

export const NARRATOR = '_';
export const WING = 9; // 両端の約9%が袖

export function areaOf(x: number): '下手' | '中央' | '上手' {
  return x < 38 ? '下手' : x < 62 ? '中央' : '上手';
}
export const sideName = (s: Side) => (s === 'L' ? '下手' : '上手');
export const pinArea = (p: PinNo) => (['下手', '中央', '上手'] as const)[p - 1];

export function initialState(cast: CastMember[]): StageState {
  const pos: Record<Role, Place> = {};
  for (const c of cast) if (c.kind === 'puppet') pos[c.id] = { on: false, side: c.home ?? 'L' };
  return {
    lit: false,
    pins: [false, false, false],
    litFade: 0,
    pinFade: [0, 0, 0],
    pos,
    playing: {},
    acts: {},
    started: false,
  };
}

export type MoveKind = 'board' | 'enter' | 'exit' | 'move';

/** move が板付き・出・ハケ・移動のどれかを、直前の状態から決める */
export function classifyMove(prev: StageState, m: ItemOf<'move'>): MoveKind {
  if (!m.in) return 'exit';
  if (!prev.started) return 'board';
  const p = prev.pos[m.w];
  return p && p.on ? 'move' : 'enter';
}

/** 出のとき、どちらの袖から出たか */
export function enterSide(prev: StageState, w: Role): Side {
  const p = prev.pos[w];
  return p && !p.on ? p.side : 'L';
}

export function applyItem(s: StageState, it: Item): StageState {
  switch (it.t) {
    case 'light': {
      const fade = it.fade ?? 0;
      if (!it.p) return { ...s, lit: it.on, litFade: fade, started: true };
      const pins = [...s.pins] as StageState['pins'];
      const pinFade = [...s.pinFade] as StageState['pinFade'];
      pins[it.p - 1] = it.on;
      pinFade[it.p - 1] = fade;
      return { ...s, pins, pinFade, started: true };
    }
    case 'move': {
      const pos = { ...s.pos, [it.w]: it.in ? { on: true as const, x: it.x } : { on: false as const, side: it.side } };
      const acts = { ...s.acts };
      const was = s.pos[it.w];
      // 出・ハケのたびに、その人の（動き）はリセット
      if (!it.in || !was || !was.on) delete acts[it.w];
      return { ...s, pos, acts };
    }
    case 'cue': {
      const playing = { ...s.playing };
      if (it.op === 'C.I' || it.op === 'F.I') playing[it.n] = it.x ?? playing[it.n] ?? '';
      else delete playing[it.n];
      return { ...s, playing };
    }
    case 'act':
      return { ...s, acts: { ...s.acts, [it.w ?? NARRATOR]: { x: it.x, id: it.id } } };
    case 'line': {
      if (!(NARRATOR in s.acts)) return s;
      const acts = { ...s.acts };
      delete acts[NARRATOR];
      return { ...s, acts };
    }
    default:
      return s;
  }
}

/** states[i] は items[0..i] を適用した後。states[-1] 相当は initialState */
export function allStates(items: Item[], cast: CastMember[]): StageState[] {
  const out: StageState[] = [];
  let s = initialState(cast);
  for (const it of items) {
    s = applyItem(s, it);
    out.push(s);
  }
  return out;
}

export function stateAt(items: Item[], cast: CastMember[], index: number): StageState {
  let s = initialState(cast);
  for (let i = 0; i <= index && i < items.length; i++) s = applyItem(s, items[i]);
  return s;
}

/** 舞台の見た目として同じか（じわ秒数・started は比べない） */
export function sameStage(a: StageState, b: StageState): boolean {
  if (a.lit !== b.lit || a.pins.some((p, i) => p !== b.pins[i])) return false;
  const roles = new Set([...Object.keys(a.pos), ...Object.keys(b.pos)]);
  for (const r of roles) {
    const p = a.pos[r];
    const q = b.pos[r];
    if (!p || !q || p.on !== q.on) return false;
    if (p.on && q.on && Math.abs(p.x - q.x) >= 2) return false;
    if (!p.on && !q.on && p.side !== q.side) return false;
  }
  const ka = Object.keys(a.playing).sort().join(',');
  const kb = Object.keys(b.playing).sort().join(',');
  return ka === kb;
}

/** 音源の名前：同じ番号でどこかに名前が書かれていればそれ */
export function cueName(items: Item[], n: number): string {
  for (const it of items) if (it.t === 'cue' && it.n === n && it.x) return it.x;
  return '';
}

export function nextCueNo(items: Item[]): number {
  let m = 0;
  for (const it of items) if (it.t === 'cue') m = Math.max(m, it.n);
  return m + 1;
}

/** 照明が落ちているか（全体もピンも消えている） */
export const isDark = (s: StageState) => !s.lit && !s.pins.some(Boolean);
