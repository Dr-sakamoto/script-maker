import { circled } from './export';
import type { Item, NewItem } from './types';

/**
 * 「かく」の音源・照明のショートカット：`・m1`＝音源①、`・l`＝照明。
 * 中黒（日本語入力の「/」キー）で始めるので、指が届きやすい。
 *
 * - `・m1` → 音源① をイン／アウト（どちらかは、そこまでの流れで決まる：止まっていればイン、流れていればアウト）
 * - `・l`（`・l1` も同じ） → 明転／暗転（暗ければ明転、明るければ暗転）
 * - 吹き出しで選んだ向きと秒数は、後ろに付いて文章に残る：`・m1o5`＝5秒かけてアウト、`・l1i`＝カットで明転
 *   向き：i・い＝イン（明転）、o・お＝アウト（暗転）。秒数を書かなければ（0 も）カット
 * - 音源の名前は後ろに `『出囃子』`
 */
const DOT = '[・･/／]';
const D = '[0-9０-９]';
const IO = '[iIｉＩいイoOｏＯおオ]';
const SEC = `(${D}+(?:[.．]${D}+)?)?(?:秒|s)?`;
const SOUND = new RegExp(`^${DOT}[mMｍＭ](${D}+|[①-⑳])(${IO})?${SEC}(?:『([^』]*)』)?`);
const LIGHT = new RegExp(`^${DOT}[lLｌＬ](${D}*)(${IO})?${SEC}`);
/** 行の中でトークンが始まる位置（`・` のあとに m か l） */
export const TOKEN_START = /[・･/／](?=[mMｍＭlLｌＬ])/;

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const num = (s: string): number =>
  CIRCLED.includes(s) ? CIRCLED.indexOf(s) + 1 : Number(s.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10)).replace('．', '.'));

export type Dir = 'in' | 'out';
export type CueToken =
  | { kind: 'cue'; n: number; dir?: Dir; sec: number; name?: string; len: number; head: string }
  | { kind: 'light'; no?: number; dir?: Dir; sec: number; len: number; head: string };

const dirOf = (s?: string): Dir | undefined => (!s ? undefined : /[iIｉＩいイ]/.test(s) ? 'in' : 'out');

/** s の頭にあるトークンを読む（無ければ null）。head は向き・秒数より前（`・m1`・`・l1`） */
export function readToken(s: string): CueToken | null {
  let m = s.match(SOUND);
  if (m) {
    const head = m[0].slice(0, 2 + m[1].length);
    return { kind: 'cue', n: num(m[1]), dir: dirOf(m[2]), sec: m[3] ? num(m[3]) : 0, ...(m[4] ? { name: m[4] } : {}), len: m[0].length, head };
  }
  m = s.match(LIGHT);
  if (m) {
    const head = m[0].slice(0, 2 + m[1].length);
    return { kind: 'light', ...(m[1] ? { no: num(m[1]) } : {}), dir: dirOf(m[2]), sec: m[3] ? num(m[3]) : 0, len: m[0].length, head };
  }
  return null;
}

/** トークンを書く（吹き出しで選んだあと・台本から文章に戻すとき） */
export function writeToken(head: string, dir: Dir, sec: number, name?: string): string {
  return `${head}${dir === 'in' ? 'i' : 'o'}${sec > 0 ? +sec.toFixed(1) : ''}${name ? `『${name}』` : ''}`;
}

/** 台本の項目 → トークン（照明のピンは書けないので null） */
export function tokenOf(it: Item): string | null {
  if (it.t === 'light') return it.p ? null : writeToken('・l', it.on ? 'in' : 'out', it.fade ?? 0);
  if (it.t === 'cue') return writeToken(`・m${it.n}`, it.op === 'C.I' || it.op === 'F.I' ? 'in' : 'out', it.op === 'F.I' || it.op === 'F.O' ? (it.sec ?? 0) : 0, it.x);
  return null;
}

/** そこまでの照明・音源の様子（向きを書いていないトークンの向きを決める） */
export type CueState = { lit: boolean; playing: Set<number>; lights: number; started: Set<number> };
export const emptyCueState = (): CueState => ({ lit: false, playing: new Set(), lights: 0, started: new Set() });

export function stepCue(s: CueState, it: Item): void {
  if (it.t === 'light' && !it.p) {
    s.lit = it.on;
    s.lights++;
  } else if (it.t === 'cue') {
    if (it.op === 'C.I' || it.op === 'F.I') {
      s.playing.add(it.n);
      s.started.add(it.n);
    } else s.playing.delete(it.n);
  }
}

export function cueStateOf(items: Item[]): CueState {
  const s = emptyCueState();
  for (const it of items) stepCue(s, it);
  return s;
}

/** トークン → 台本の項目（向きが無ければ、そこまでの流れで決める）。k＝きっかけの文字 */
export function itemOfToken(t: CueToken, s: CueState, k?: string): NewItem {
  if (t.kind === 'light') {
    const dir = t.dir ?? (s.lit ? 'out' : 'in');
    return { t: 'light', on: dir === 'in', ...(t.sec > 0 ? { fade: t.sec } : {}), ...(k ? { k } : {}) };
  }
  const dir = t.dir ?? (s.playing.has(t.n) ? 'out' : 'in');
  const op = (t.sec > 0 ? (dir === 'in' ? 'F.I' : 'F.O') : dir === 'in' ? 'C.I' : 'C.O') as Extract<Item, { t: 'cue' }>['op'];
  return { t: 'cue', n: t.n, op, ...(t.sec > 0 ? { sec: t.sec } : {}), ...(t.name ? { x: t.name } : {}), ...(k ? { k } : {}) };
}

export type CueWarning = { id: string; msg: string };

/** 矛盾している照明・音源（明転が二回・流し始めの無いアウト など） */
export function cueWarnings(items: Item[]): CueWarning[] {
  const s = emptyCueState();
  const out: CueWarning[] = [];
  for (const it of items) {
    if (it.t === 'light' && !it.p) {
      if (it.on && s.lit) out.push({ id: it.id, msg: '明転が二回になっています' });
      if (!it.on && !s.lit) out.push({ id: it.id, msg: s.lights ? '暗転が二回になっています' : 'まだ明転していないのに暗転しています' });
    } else if (it.t === 'cue') {
      const name = `音源${circled(it.n)}`;
      const inn = it.op === 'C.I' || it.op === 'F.I';
      if (inn && s.playing.has(it.n)) out.push({ id: it.id, msg: `${name}がもう流れています（インが二回になっています）` });
      if (!inn && !s.playing.has(it.n))
        out.push({ id: it.id, msg: s.started.has(it.n) ? `${name}はもう止まっています（アウトが二回になっています）` : `${name}の流し始めが記述されていません` });
    }
    stepCue(s, it);
  }
  return out;
}
