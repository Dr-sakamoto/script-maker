import { MARKS, member, nameOf, puppets } from './cast';
import { lineOfItem } from './export';
import { parseQuick } from './quickText';
import { allStates, areaOf, classifyMove, initialState } from './state';
import type { CastMember, Doc, Item, Role } from './types';

/**
 * 「かく」：台本をまとめ書きの文章で書く。文章と台本の項目を行き来させる。
 *
 * - docToText：台本 → 文章。セリフ・動きは打つときと同じ書き方。出ハケ・照明・音響などは文字台本と同じ1行（【…】・（…））
 * - textToItems：文章 → 台本。打つたびに呼ぶ。書き換えていない行は元の項目のまま残す（話者も、出ハケの細かい位置も）。
 *   書き換えた行・足した行だけを読み直し、話者はその直前までの続きから決める（途中に1行足しても、後ろの割り振りはずれない）
 */
export type Synced = {
  /** 最後に台本と合わせた文章の行 */
  lines: string[];
  /** 各行から読んだ項目 */
  byLine: Item[][];
};

const SPECIAL_HEAD = /^[@＠^＾（(【［\[『■1-9１-９]/;
const PLAIN_BAD = /[\s　：:「」『』@＠^＾]|[、,，]{2}/;

/** 何も付けずに書いても、そのままのセリフに読める文か */
function plain(x: string, cast: CastMember[]): boolean {
  if (!x || SPECIAL_HEAD.test(x) || PLAIN_BAD.test(x)) return false;
  if (MARKS.some((m) => x.startsWith(m))) return false;
  if (/^[-=＝ー─━]{3,}$/.test(x)) return false;
  if (/^(じわ|徐々に?)?(明転|暗転|溶明|溶暗)/.test(x) || /^(音源|M)\s*[0-9０-９①-⑳]/.test(x) || /^(SE|効果音)/i.test(x)) return false;
  // 役名で始まると動き（「ボケ、座る」）や話者（「ボケ：…」）に読まれることがある
  if (cast.some((c) => c.name && x.startsWith(c.name))) return false;
  return true;
}

/** 何も付けない行の話者（quickText の parseQuick と同じ決め方） */
function nextSpeaker(cast: CastMember[], prev?: Role, prev2?: Role): Role | undefined {
  const ps = puppets(cast).map((c) => c.id);
  if (!prev) return ps[0];
  if (prev2 && member(cast, prev2)) return prev2;
  return ps.find((id) => id !== prev) ?? prev;
}

/** items の i 番目より前に話した人（新しい順に2人） */
function spokeBefore(items: Item[], i: number): { prev?: Role; prev2?: Role } {
  let prev: Role | undefined;
  for (let j = Math.min(i, items.length) - 1; j >= 0; j--) {
    const it = items[j];
    if (it.t !== 'line') continue;
    if (!prev) prev = it.w;
    else if (it.w !== prev) return { prev, prev2: it.w };
  }
  return { prev };
}

/** i 番目にセリフを入れたら、何も付けなくて話す人 */
export function speakerAt(cast: CastMember[], items: Item[], i: number): Role | undefined {
  const { prev, prev2 } = spokeBefore(items, i);
  return nextSpeaker(cast, prev, prev2);
}

/** 台本 → 文章（1項目＝1行） */
export function docToText(doc: Doc): { text: string; synced: Synced } {
  const cast = doc.cast;
  const speaking = cast.filter((c) => c.kind !== 'set');
  const states = allStates(doc.items, cast);
  const init = initialState(cast);
  let prev: Role | undefined;
  let prev2: Role | undefined;

  const lines = doc.items.map((it, i): string => {
    if (it.t === 'line') {
      const auto = nextSpeaker(cast, prev, prev2);
      const m = member(cast, it.w);
      const n = speaking.findIndex((c) => c.id === it.w) + 1;
      const ok = plain(it.x, cast);
      let l: string;
      if (it.n && m) l = `${m.name}「${it.x}」（${it.n}）`;
      else if (ok && it.w === auto) l = it.x;
      else if (ok && it.w === prev) l = `　${it.x}`;
      else l = n >= 1 && n <= 9 ? `${n} ${it.x}` : `${m?.name ?? '？'}「${it.x}」`;
      if (it.w !== prev) {
        prev2 = prev;
        prev = it.w;
      }
      return l;
    }
    if (it.t === 'act') {
      const body = `${it.w ? `${nameOf(cast, it.w)}、` : ''}${it.x}`;
      // @ の動きは空白や @ ^ で区切られるので、そういう文字を含む動きは（ ）で包んで1つのまま残す
      return /[@＠^＾]|(?<=[^\x00-\x7F])[ 　]+(?=[^\x00-\x7F])/.test(body) ? `（${body}）` : `@${body}`;
    }
    const before = i > 0 ? states[i - 1] : init;
    if (it.t === 'move' && it.in && classifyMove(before, it) === 'board') return `【板付き】${nameOf(cast, it.w)}（${areaOf(it.x)}）`;
    return lineOfItem(doc, i, false) ?? `（${it.t}）`;
  });
  return { text: lines.join('\n'), synced: { lines, byLine: doc.items.map((it) => [it]) } };
}

const splitLines = (text: string) => text.replace(/\r\n?/g, '\n').split('\n');

/** 文章 → 台本の項目と役。書き換えていない行は元の項目のまま */
export function textToItems(text: string, base: Doc, synced: Synced): { items: Item[]; cast: CastMember[]; synced: Synced } {
  const a = synced.lines;
  const b = splitLines(text);
  // 前後の同じ行を飛ばす（打っているときは、たいてい1か所だけ変わる）
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const oldMid = a.slice(head, a.length - tail);
  const newMid = b.slice(head, b.length - tail);

  // 真ん中は行ごとに対応を取る（同じ行は元の項目のまま）
  const pairs = lcs(oldMid, newMid);
  const byLine: Item[][] = synced.byLine.slice(0, head);
  let cast = base.cast;
  const flat = () => byLine.flat();

  /** 書き換えた行のかたまりを、直前までの話者の続きから読む */
  const readBlock = (lines: string[], olds: Item[][]) => {
    if (!lines.length) return;
    const { prev, prev2 } = spokeBefore(flat(), Infinity);
    const r = parseQuick(lines.join('\n'), cast, { prev, prev2 });
    cast = r.cast;
    const per: Item[][] = lines.map(() => []);
    r.items.forEach((it, k) => per[r.rows[k].line].push(it));
    // 1行を打ち直しただけなら、元の項目の id を引き継ぐ
    per.forEach((items, k) => {
      const old = olds[k];
      if (old?.length === 1 && items.length === 1 && old[0].t === items[0].t) items[0] = { ...items[0], id: old[0].id } as Item;
      byLine.push(items);
    });
  };

  let oi = 0;
  let ni = 0;
  for (const [po, pn] of [...pairs, [oldMid.length, newMid.length] as const]) {
    readBlock(newMid.slice(ni, pn), synced.byLine.slice(head + oi, head + po));
    if (po < oldMid.length) byLine.push(synced.byLine[head + po]);
    oi = po + 1;
    ni = pn + 1;
  }
  byLine.push(...synced.byLine.slice(a.length - tail));
  return { items: byLine.flat(), cast, synced: { lines: b, byLine } };
}

/** 同じ行の対応（最長共通部分列）。[古い行の位置, 新しい行の位置] */
function lcs(a: string[], b: string[]): [number, number][] {
  if (!a.length || !b.length) return [];
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/** プレビューから直す：話者を替える（その行だけ） */
export function setSpeaker(items: Item[], id: string, w: Role): Item[] {
  return items.map((it) => (it.id === id && it.t === 'line' ? { ...it, w } : it));
}

/** プレビューから直す：セリフ ⇔ 動き（ほかの行の割り振りは動かさない） */
export function toggleKind(cast: CastMember[], items: Item[], id: string): Item[] {
  const i = items.findIndex((it) => it.id === id);
  const it = items[i];
  if (!it || (it.t !== 'line' && it.t !== 'act')) return items;
  const next = [...items];
  if (it.t === 'line') next[i] = { id: it.id, t: 'act', x: it.x };
  else {
    const w = it.w && member(cast, it.w)?.kind !== 'set' ? it.w : speakerAt(cast, items, i);
    if (!w) return items;
    next[i] = { id: it.id, t: 'line', w, x: it.x };
  }
  return next;
}

/** プレビューから直す：前の行（セリフ・動き）につなぐ */
export function joinPrev(items: Item[], id: string): Item[] {
  const i = items.findIndex((it) => it.id === id);
  const it = items[i];
  const p = items[i - 1];
  if (!it || !p || (it.t !== 'line' && it.t !== 'act') || (p.t !== 'line' && p.t !== 'act')) return items;
  const next = [...items];
  next.splice(i - 1, 2, { ...p, x: p.x + it.x });
  return next;
}

/** 「最初」：最初に話す人を替える。全部のセリフで、今の最初の人と選んだ人を入れ替える */
export function swapFirst(items: Item[], to: Role): Item[] {
  const from = items.find((it) => it.t === 'line')?.w;
  if (!from || from === to) return items;
  return items.map((it) => (it.t === 'line' && (it.w === from || it.w === to) ? { ...it, w: it.w === from ? to : from } : it));
}

/**
 * 「最初」：まだセリフが無いときは、役の並びで選んだ人を先頭へ（何も付けずに打つと最初に話す人＝並びの先頭の人形）。
 * セリフがあれば並びはそのまま（null）
 */
export function firstInCast(cast: CastMember[], items: Item[], to: Role): CastMember[] | null {
  if (items.some((it) => it.t === 'line')) return null;
  const m = member(cast, to);
  if (!m || m.kind !== 'puppet' || puppets(cast)[0]?.id === to) return null;
  return [m, ...cast.filter((c) => c.id !== to)];
}
