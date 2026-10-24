import { member } from '../../lib/stage/cast';
import { circled } from '../../lib/stage/export';
import { areaOf, classifyMove, type StageState } from '../../lib/stage/state';
import type { CastMember, Item } from '../../lib/stage/types';

export type Layer = 'line' | 'act' | 'light' | 'sound' | 'stage';
export const LAYERS: { id: Layer; label: string }[] = [
  { id: 'line', label: 'セリフ' },
  { id: 'act', label: '動き' },
  { id: 'light', label: '照明' },
  { id: 'sound', label: '音響' },
  { id: 'stage', label: '出ハケ・間' },
];

export function layerOf(it: Item): Layer {
  switch (it.t) {
    case 'line':
      return 'line';
    case 'act':
      return 'act';
    case 'light':
      return 'light';
    case 'cue':
    case 'se':
      return 'sound';
    default:
      return 'stage';
  }
}

export type ChipLook = { text: string; tone: 'light' | 'sound' | 'mono'; filled: boolean };

/** 行頭の小さな記号チップ */
export function chipLook(cast: CastMember[], it: Item, prev: StageState): ChipLook {
  switch (it.t) {
    case 'light': {
      const base = it.p ? `◎${it.p}` : it.on ? '明' : '暗';
      return { text: `${it.fade ? '〜' : ''}${base}${it.fade ? ` ${it.fade}″` : ''}`, tone: 'light', filled: it.on };
    }
    case 'cue': {
      const sym = { 'C.I': '▶', 'F.I': '↗', 'C.O': '■', 'F.O': '↘' }[it.op];
      const f = it.sec && (it.op === 'F.I' || it.op === 'F.O') ? ` ${it.sec}″` : '';
      return { text: `${sym}♪${circled(it.n)}${f}`, tone: 'sound', filled: it.op === 'C.I' || it.op === 'F.I' };
    }
    case 'se':
      return { text: `♪SE${it.x ? ` ${it.x.slice(0, 6)}` : ''}`, tone: 'sound', filled: false };
    case 'ma':
      return { text: `・・ ${it.s}″`, tone: 'mono', filled: false };
    case 'move': {
      const who = member(cast, it.w)?.short ?? '?';
      const k = classifyMove(prev, it);
      if (member(cast, it.w)?.kind === 'prop') return { text: it.in ? `${who}↓${areaOf(it.x)[0]}` : `${who}↑`, tone: 'mono', filled: false };
      if (!it.in) return { text: `${who} ハケ`, tone: 'mono', filled: false };
      if (k === 'enter') return { text: `${who} 出`, tone: 'mono', filled: true };
      if (k === 'board') return { text: `${who} 板付`, tone: 'mono', filled: false };
      return { text: `${who}→${areaOf(it.x)[0]}`, tone: 'mono', filled: false };
    }
    default:
      return { text: '', tone: 'mono', filled: false };
  }
}
