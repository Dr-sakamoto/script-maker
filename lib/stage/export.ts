import { member, nameOf } from './cast';
import { allStates, areaOf, cueName, classifyMove, enterSide, initialState, pinArea, sideName, type StageState } from './state';
import { fmtTime, timeline } from './timing';
import type { CastMember, Doc, Item } from './types';

export type ExportKind = 'script' | 'sound' | 'light' | 'stage';
export type ExportOpts = { marks: boolean; time: boolean };

const CIRCLED = '⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
export const circled = (n: number) => (n >= 0 && n <= 20 ? CIRCLED[n] : `(${n})`);
const secs = (s: number) => `${+s.toFixed(1)}秒`;

/** 話者ラベル。○●表記なら記号、卵は『』 */
export function lineText(cast: CastMember[], it: Extract<Item, { t: 'line' }>, marks: boolean): string {
  const m = member(cast, it.w);
  const note = it.n ? `（${it.n}）` : '';
  if (m?.kind === 'prop') return `『${it.x}』${note}`;
  const who = marks && m?.mark ? m.mark : (m?.name ?? '');
  return `${who}「${it.x}」${note}`;
}

export function actText(cast: CastMember[], it: Extract<Item, { t: 'act' }>): string {
  return it.w ? `（${nameOf(cast, it.w)}、${it.x}）` : `（${it.x}）`;
}

export function lightText(it: Extract<Item, { t: 'light' }>): string {
  const f = it.fade ? ` ${secs(it.fade)}` : '';
  if (it.p) return `【ピン${it.p}（${pinArea(it.p)}）${it.on ? 'IN' : 'OUT'}${f}】`;
  return `【${it.fade ? 'じわ' : ''}${it.on ? '明転' : '暗転'}${f}】`;
}

export function cueText(it: Extract<Item, { t: 'cue' }>, name?: string): string {
  const f = it.sec && (it.op === 'F.I' || it.op === 'F.O') ? ` ${secs(it.sec)}` : '';
  const nm = name ?? it.x;
  return `【音源${circled(it.n)}】${it.op}${f}${nm ? `『${nm}』` : ''}`;
}

/** move を文章に。prev は直前の状態 */
export function moveText(cast: CastMember[], prev: StageState, it: Extract<Item, { t: 'move' }>): string {
  const who = nameOf(cast, it.w);
  // 小道具・大道具は置く／動かす／片付ける。持っていた人がいればその人が
  const k0 = member(cast, it.w)?.kind;
  if (k0 === 'prop' || k0 === 'set') {
    const by = prev.held[it.w] ? `${nameOf(cast, prev.held[it.w])}、` : '';
    if (!it.in) return `（${by}${who}を片付ける）`;
    const p = prev.pos[it.w];
    return p?.on ? `（${by}${who}を${areaOf(it.x)}へ動かす）` : `（${by}${who}を${areaOf(it.x)}に置く）`;
  }
  const k = classifyMove(prev, it);
  if (!it.in) return `【${who} ハケ（${sideName(it.side)}へ）】`;
  if (k === 'enter') return `【${who} 出（${sideName(enterSide(prev, it.w))}から・${areaOf(it.x)}へ）】`;
  return `（${who}、${areaOf(it.x)}へ移動）`;
}

/** 小道具を持つ／受け取る */
export function holdText(cast: CastMember[], prev: StageState, it: Extract<Item, { t: 'hold' }>): string {
  const from = prev.held[it.w];
  const by = nameOf(cast, it.by);
  const what = nameOf(cast, it.w);
  return from && from !== it.by ? `（${by}、${nameOf(cast, from)}から${what}を受け取る）` : `（${by}、${what}を持つ）`;
}

/** チップのタップで出す説明文（例：親父が下手から出て中央へ） */
export function moveSentence(cast: CastMember[], prev: StageState, it: Extract<Item, { t: 'move' }>): string {
  const who = nameOf(cast, it.w);
  const k0 = member(cast, it.w)?.kind;
  if (k0 === 'prop' || k0 === 'set') return moveText(cast, prev, it).slice(1, -1);
  const k = classifyMove(prev, it);
  if (!it.in) return `${who}が${sideName(it.side)}へハケる`;
  if (k === 'board') return `${who}は${areaOf(it.x)}に板付き`;
  if (k === 'enter') return `${who}が${sideName(enterSide(prev, it.w))}から出て${areaOf(it.x)}へ`;
  return `${who}が${areaOf(it.x)}へ移動`;
}

type Ctx = { cast: CastMember[]; items: Item[]; states: StageState[]; sounds?: Record<number, string>; before: (i: number) => StageState };

function context(doc: Doc): Ctx {
  const states = allStates(doc.items, doc.cast);
  const init = initialState(doc.cast);
  return { cast: doc.cast, items: doc.items, states, sounds: doc.sounds, before: (i) => (i > 0 ? states[i - 1] : init) };
}

/** 1項目を文字台本の1行に（板付きは null：冒頭にまとめる） */
function itemLine(c: Ctx, i: number, marks: boolean): string | null {
  const it = c.items[i];
  switch (it.t) {
    case 'line':
      return lineText(c.cast, it, marks);
    case 'act':
      return actText(c.cast, it);
    case 'light':
      return lightText(it);
    case 'cue':
      // 入れるときだけ、登録済みの音源名を補う
      return cueText(it, it.x || (it.op === 'C.I' || it.op === 'F.I' ? c.sounds?.[it.n] : undefined));
    case 'se':
      return `【SE】${it.x}`;
    case 'ma':
      return `【間 ${secs(it.s)}】`;
    case 'move':
      return classifyMove(c.before(i), it) === 'board' ? null : moveText(c.cast, c.before(i), it);
    case 'hold':
      return holdText(c.cast, c.before(i), it);
  }
}

function header(doc: Doc, marks: boolean): string[] {
  const out = [`ユニット名：${doc.unit}`, `${doc.genre}「${doc.title}」`, ''];
  if (marks) {
    const legend = doc.cast
      .map((m) => (m.kind === 'prop' ? `『』 ${m.name}（音源）` : m.mark ? `${m.mark} ${m.name}` : ''))
      .filter(Boolean)
      .join('　');
    if (legend) out.push(legend, '');
  }
  return out;
}

function boardSet(c: Ctx): string | null {
  const parts: string[] = [];
  c.items.forEach((it, i) => {
    if (it.t === 'move' && it.in && classifyMove(c.before(i), it) === 'board') {
      const who = nameOf(c.cast, it.w);
      if (member(c.cast, it.w)?.kind !== 'puppet') return void parts.push(`${who}（${areaOf(it.x)}）`);
      const idx = parts.findIndex((p) => p.startsWith(`${who}（`));
      const s = `${who}（${areaOf(it.x)}）`;
      if (idx >= 0) parts[idx] = s;
      else parts.push(s);
    }
  });
  return parts.length ? `【板付き】${parts.join('・')}` : null;
}

export function exportScript(doc: Doc, o: ExportOpts): string {
  const c = context(doc);
  const tl = timeline(doc.items);
  const out = header(doc, o.marks);
  const b = boardSet(c);
  if (b) out.push(b, '');
  c.items.forEach((_, i) => {
    const s = itemLine(c, i, o.marks);
    if (s == null) return;
    out.push((o.time ? `${fmtTime(tl.starts[i])}　` : '') + s, '');
  });
  return out.join('\n').replace(/\n+$/, '\n');
}

/** きっかけ：直前のセリフ・動き・出ハケ */
export function trigger(c: Ctx, i: number, marks: boolean): string {
  for (let j = i - 1; j >= 0; j--) {
    const it = c.items[j];
    if (it.t === 'line') return `${lineText(c.cast, it, marks)} の後`;
    if (it.t === 'act') return `${actText(c.cast, it)} の後`;
    if (it.t === 'hold') return `${holdText(c.cast, c.before(j), it)} の後`;
    if (it.t === 'move') {
      const k = classifyMove(c.before(j), it);
      if (k === 'board') continue;
      return `${moveText(c.cast, c.before(j), it)} の後`;
    }
  }
  return '冒頭';
}

export function exportCues(doc: Doc, kind: Exclude<ExportKind, 'script'>, o: ExportOpts): string {
  const c = context(doc);
  const tl = timeline(doc.items);
  const out = header(doc, o.marks);
  const title = { sound: '音響キュー表', light: '照明キュー表', stage: '出ハケ表' }[kind];
  out.push(`■ ${title}`, '');
  if (kind === 'stage') {
    const b = boardSet(c);
    if (b) out.push(b, '');
  }
  let no = 0;
  c.items.forEach((it, i) => {
    let s: string | null = null;
    if (kind === 'sound' && it.t === 'cue') {
      s = cueText(it, it.x || cueName(c.items, it.n, doc.sounds));
    } else if (kind === 'sound' && it.t === 'se') s = `【SE】${it.x}`;
    else if (kind === 'light' && it.t === 'light') s = lightText(it);
    else if (kind === 'stage' && it.t === 'move' && classifyMove(c.before(i), it) !== 'board')
      s = moveText(c.cast, c.before(i), it);
    else if (kind === 'stage' && it.t === 'hold') s = holdText(c.cast, c.before(i), it);
    if (s == null) return;
    no++;
    const t = o.time ? `　[${fmtTime(tl.starts[i])}]` : '';
    out.push(`${String(no).padStart(2, '0')}. ${s}${t}`, `    きっかけ：${trigger(c, i, o.marks)}`, '');
  });
  if (no === 0) out.push('（なし）', '');
  return out.join('\n').replace(/\n+$/, '\n');
}

export function exportDoc(doc: Doc, kind: ExportKind, o: ExportOpts): string {
  return kind === 'script' ? exportScript(doc, o) : exportCues(doc, kind, o);
}
