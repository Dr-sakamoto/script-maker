import type { Character, ScriptBlock, ScriptItem, Sound, Unit } from '../types';
import { MARKS, PALETTE, shortName } from './cast';
import { uid } from './edit';
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
  return {
    id: script.id,
    unit: unit?.name ?? '',
    genre: script.netaType,
    title: script.title,
    cast: castFromCharacters(script.characters),
    items: script.stage ?? itemsFromBlocks(script.blocks ?? [], script.characters),
    sounds: soundMap(script.sounds ?? []),
    updatedAt: Date.parse(script.updatedAt ?? '') || 0,
  };
}

/** 舞台で変えたもの（項目・役の名前と色・音源名・題）を台本に書き戻す */
export function scriptWithDoc(script: ScriptItem, doc: Doc): ScriptItem {
  const characters: Character[] = script.characters.map((c) => {
    const m = doc.cast.find((x) => x.id === c.id);
    return m ? { ...c, name: m.name, color: m.color } : c;
  });
  // 舞台で足した役（小道具箱の＋など）
  // 机・椅子（最初からある大道具）は書き戻さない
  for (const m of doc.cast)
    if (!characters.some((c) => c.id === m.id) && !isDefaultSet(m.id))
      characters.push({
        id: m.id,
        name: m.name,
        performerId: '',
        color: m.color,
        ...(m.kind === 'prop' ? { kind: 'prop' as const, holder: m.holder } : {}),
        ...(m.kind === 'set' ? { kind: 'set' as const, shape: m.shape } : {}),
      });
  const sounds = [...(script.sounds ?? [])];
  for (const it of doc.items) {
    if (it.t !== 'cue' || !it.x) continue;
    const s = sounds.find((x) => x.index === it.n);
    if (s) s.name !== it.x && sounds.splice(sounds.indexOf(s), 1, { ...s, name: it.x });
    else sounds.push({ id: uid(), unitId: script.unitId, index: it.n, name: it.x });
  }
  sounds.sort((a, b) => a.index - b.index);
  return { ...script, title: doc.title, characters, sounds, stage: doc.items, updatedAt: new Date(doc.updatedAt || Date.now()).toISOString() };
}
