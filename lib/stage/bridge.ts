import type { Character, ScriptBlock, ScriptItem, Sound, Unit } from '../types';
import { MARKS, PALETTE, shortName } from './cast';
import { uid } from './edit';
import { lineOfItem, triggerOf } from './export';
import type { ImportResult } from './importText';
import { cueName } from './state';
import type { CastMember, CueOp, Doc, Item } from './types';

/**
 * ネタ管理（ユニット・台本・登場人物・音源）と舞台エディタの橋渡し。
 * 舞台の役は台本の登場人物、音源番号は登録済みの音源トラックをそのまま使う。
 */

/** どの台本にも最初からある大道具（お笑いでよく使う机と椅子）。上手の袖に置いてある */
export const DEFAULT_SETS: CastMember[] = [
  { id: 'set-desk', name: '机', short: '机', color: '#b07a45', kind: 'set', shape: 'desk', home: 'R' },
  { id: 'set-chair', name: '椅子', short: '椅', color: '#b07a45', kind: 'set', shape: 'chair', home: 'R' },
];
const isDefaultSet = (id: string) => DEFAULT_SETS.some((d) => d.id === id);

export function castFromCharacters(chars: Character[]): CastMember[] {
  let puppetNo = 0;
  const cast: CastMember[] = chars.map((c, i) => {
    const kind = c.kind ?? 'puppet';
    const k = kind === 'puppet' ? puppetNo++ : -1;
    return {
      id: c.id,
      name: c.name || `役${i + 1}`,
      short: shortName(c.name || `役${i + 1}`),
      mark: kind === 'puppet' ? MARKS[k] : undefined,
      color: c.color || PALETTE[i % PALETTE.length],
      kind,
      holder: kind === 'prop' ? c.holder : undefined,
      shape: kind === 'set' ? (c.shape ?? 'free') : undefined,
      home: kind === 'set' ? 'R' : k % 2 === 0 ? 'L' : 'R',
    };
  });
  for (const d of DEFAULT_SETS) if (!cast.some((c) => c.id === d.id)) cast.push({ ...d });
  return cast;
}

export const soundMap = (sounds: Sound[]) => Object.fromEntries(sounds.map((s) => [s.index, s.name]));

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

/** これまでのエディタのブロック（セリフ・ト書き・音響・照明）を舞台の項目に起こす */
export function itemsFromBlocks(blocks: ScriptBlock[], chars: Character[]): Item[] {
  const byName = (n?: string) => chars.find((c) => c.name === n || c.id === n)?.id;
  const out: Item[] = [];
  for (const b of blocks) {
    const text = (b.text ?? '').trim();
    if (b.type === 'dialogue') {
      const w = byName(b.speaker) ?? chars[0]?.id;
      if (text && w) out.push({ id: uid(), t: 'line', w, x: text });
    } else if (b.type === 'stage') {
      if (text) out.push({ id: uid(), t: 'act', w: byName(b.speaker), x: text });
    } else if (b.type === 'light') {
      const on = text.includes('明');
      const fade = text.includes('徐々') || text.includes('じわ') ? (b.cue?.fadeDuration ?? 4) : undefined;
      out.push({ id: uid(), t: 'light', on, ...(fade ? { fade } : {}) });
    } else if (b.type === 'sound') {
      const op = (['C.I', 'F.I', 'C.O', 'F.O'] as CueOp[]).find((o) => text.includes(o)) ?? 'C.I';
      const ch = [...text].find((c) => CIRCLED.includes(c));
      const digits = text.match(/(\d+)/);
      const n = ch ? CIRCLED.indexOf(ch) + 1 : digits ? Number(digits[1]) : 1;
      const sec = op === 'F.I' || op === 'F.O' ? (b.cue?.fadeDuration ?? 3) : undefined;
      out.push({ id: uid(), t: 'cue', n, op, ...(sec ? { sec } : {}) });
    }
  }
  return out;
}

export function docFromScript(script: ScriptItem, unit?: Unit): Doc {
  const assign: NonNullable<Doc['assign']> = {};
  for (const c of script.characters) assign[c.id] = { performerId: c.performerId ?? '', costume: c.costume ?? '' };
  return {
    id: script.id,
    unit: unit?.name ?? '',
    genre: script.netaType,
    title: script.title,
    cast: castFromCharacters(script.characters),
    items: script.stage ?? itemsFromBlocks(script.blocks ?? [], script.characters),
    sounds: soundMap(script.sounds ?? []),
    performers: unit?.performers ?? [],
    university: unit?.university,
    tools: script.tools ?? '',
    bringIns: script.bringIns ?? '',
    costumes: script.costumes ?? '',
    assign,
    updatedAt: Date.parse(script.updatedAt ?? '') || 0,
  };
}

/** 登録された音源（番号→名前）。舞台で付けた名前（cue の x）も重ねる */
export function soundRegistry(doc: Doc): Record<number, string> {
  const reg: Record<number, string> = { ...(doc.sounds ?? {}) };
  for (const it of doc.items) if (it.t === 'cue' && it.x) reg[it.n] = it.x;
  return reg;
}

const strip = (s: string) => s.replace(/^[【（]/, '').replace(/[】）]$/, '');

/**
 * 舞台の項目を、これまでのブロック（セリフ・ト書き・音響・照明）の形にも起こしておく。
 * クラウドの blocks 列や、これまでの形を読む側のため。きっかけは直前のセリフ・動き・出ハケから自動で入る。
 */
export function itemsToBlocks(doc: Doc): ScriptBlock[] {
  const name = (id?: string) => doc.cast.find((c) => c.id === id)?.name;
  const out: ScriptBlock[] = [];
  doc.items.forEach((it, i) => {
    const base = { id: it.id };
    const cueOf = (fade?: number): ScriptBlock['cue'] => ({
      fadeDuration: fade ?? 4,
      triggerType: i === 0 ? 'undefined' : 'action',
      triggerText: triggerOf(doc, i, false).replace(/ の後$/, ''),
    });
    switch (it.t) {
      case 'line':
        out.push({ ...base, type: 'dialogue', speaker: name(it.w), text: it.x });
        break;
      case 'act':
        out.push({ ...base, type: 'stage', speaker: name(it.w), text: it.x });
        break;
      case 'light':
        out.push({
          ...base,
          type: 'light',
          text: it.p ? `ピン${it.p}${it.on ? 'IN' : 'OUT'}` : it.fade ? (it.on ? '徐々明転' : '徐々暗転') : it.on ? '明転' : '暗転',
          cue: cueOf(it.fade),
        });
        break;
      case 'cue':
        out.push({ ...base, type: 'sound', text: `${doc.unit}${it.n} ${it.op}`, cue: cueOf(it.sec) });
        break;
      case 'se':
        out.push({ ...base, type: 'sound', text: `SE ${it.x}`, cue: cueOf() });
        break;
      default: {
        // 間・出ハケ・移動・持つ → ト書きとして文章に
        const line = lineOfItem(doc, i, false);
        if (line) out.push({ ...base, type: 'stage', text: strip(line) });
      }
    }
  });
  return out;
}

/** 舞台や「わたす」で変えたものを、ネタ管理の台本に書き戻す */
export function scriptWithDoc(script: ScriptItem, doc: Doc): ScriptItem {
  // 役：名前・色・配役・衣装。舞台で足した役は加え、なくした役は外す。机・椅子（最初からある大道具）は書き戻さない
  const characters: Character[] = [];
  for (const m of doc.cast) {
    if (isDefaultSet(m.id)) continue;
    const old = script.characters.find((c) => c.id === m.id);
    const a = doc.assign?.[m.id];
    characters.push({
      ...(old ?? { id: m.id, performerId: '' }),
      id: m.id,
      name: m.name,
      color: m.color,
      performerId: a?.performerId ?? old?.performerId ?? '',
      costume: a?.costume ?? old?.costume ?? '',
      ...(m.kind === 'prop' ? { kind: 'prop' as const, holder: m.holder } : {}),
      ...(m.kind === 'set' ? { kind: 'set' as const, shape: m.shape } : {}),
    });
  }
  // 音源：登録リスト＋舞台で付けた名前。番号の順に
  const reg = soundRegistry(doc);
  const sounds: Sound[] = Object.keys(reg)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => ({ id: (script.sounds ?? []).find((s) => s.index === n)?.id ?? uid(), unitId: script.unitId, index: n, name: reg[n] }));
  return {
    ...script,
    title: doc.title,
    netaType: doc.genre as ScriptItem['netaType'],
    characters,
    sounds,
    tools: doc.tools ?? script.tools,
    bringIns: doc.bringIns ?? script.bringIns,
    costumes: doc.costumes ?? script.costumes,
    stage: doc.items,
    blocks: itemsToBlocks(doc),
    updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  };
}

/** 新規台本の設定画面で既存の台本を読み込んだとき：登場人物に読み込んだ役を足す。使っていない仮の役（演者A・名前なし）は外す */
export function charactersFromImport(prev: Character[], r: Pick<ImportResult, 'cast' | 'items'>): Character[] {
  const used = new Set<string>();
  for (const it of r.items) {
    if ('w' in it && it.w) used.add(it.w);
    if (it.t === 'hold') used.add(it.by);
  }
  const placeholder = (c: Character) => !c.name.trim() || c.name === '演者A';
  const out: Character[] = [];
  for (const m of r.cast) {
    if (isDefaultSet(m.id)) continue;
    const old = prev.find((c) => c.id === m.id);
    if (old) {
      if (used.has(m.id) || !placeholder(old)) out.push(old);
      continue;
    }
    out.push({
      id: m.id,
      name: m.name,
      performerId: '',
      costume: '',
      color: m.color,
      ...(m.kind === 'prop' ? { kind: 'prop' as const, holder: m.holder } : {}),
      ...(m.kind === 'set' ? { kind: 'set' as const, shape: m.shape } : {}),
    });
  }
  return out;
}

/** 読み込んだ台本で名前の付いた音源を、登録済みの音源に足す（同じ番号は登録が優先） */
export function soundsFromImport(prev: Sound[], items: Item[], unitId: string): Sound[] {
  const out = [...prev];
  for (const it of items)
    if (it.t === 'cue' && !out.some((s) => s.index === it.n))
      out.push({ id: uid(), unitId, index: it.n, name: cueName(items, it.n) || `音源${it.n}` });
  return out.sort((a, b) => a.index - b.index);
}
