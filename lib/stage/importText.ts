import { MARKS, PALETTE, shortName } from './cast';
import { uid } from './edit';
import type { CastMember, CueOp, Item, NewItem, PinNo, Role, Side } from './types';

/**
 * 既存の台本（Word・メモ帳・この画面の書き出し）の文章を、舞台の項目に落とし込む。
 *
 * - 親父「セリフ」／親父：セリフ／親父<Tab>セリフ → セリフ（知らない名前は役を足す）
 * - （ト書き）／（親父、ト書き） → 動き。（間） → 間
 * - 【明転】【暗転】【じわ明転 3秒】【ピン2 IN】 → 照明
 * - 【音源①】C.I『名前』／M1 C.I ／【SE】拍手 → 音響
 * - 【板付き】親父（下手）・母親（上手）／【親父 出（下手から・中央へ）】／【親父 ハケ（上手へ）】 → 出ハケ
 * - それ以外の行は（動き）として残す。文字は捨てない
 */
export type ImportResult = {
  items: Item[];
  /** 元の役＋読み込みで足した役 */
  cast: CastMember[];
  /** 足した役の id */
  added: Role[];
  title?: string;
  genre?: string;
  unit?: string;
  tools?: string;
  bringIns?: string;
  costumes?: string;
};

const AREA_X: Record<string, number> = { 下手: 25, 中央: 50, 上手: 75 };
const CIRCLED = '⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const MARK_CHARS = MARKS.join('');
const GENRES = ['コント', '漫才', 'ピン'];
/** 「〇〇：」でも話者ではない見出し */
const META = new Set(['作', '作者', '脚本', '構成', '場所', '時間', '舞台', '出演', '配役', '備考', '尺', '種別', 'ネタ種別', 'きっかけ', 'メモ']);
const NAME = `[^\\s「」『』（）()【】［］\\[\\]：:、。・]{1,12}`;

const num = (s: string) => {
  const c = CIRCLED.indexOf(s);
  return c >= 0 ? c : Number(s.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10)));
};
const opOf = (s: string): CueOp | null => {
  const m = s.toUpperCase().replace(/[．・]/g, '.').match(/([CF])\.?\s*([IO])/);
  return m ? (`${m[1]}.${m[2]}` as CueOp) : null;
};
const secOf = (s: string) => {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:秒|s\b|sec)/);
  return m ? Number(m[1]) : undefined;
};
const sideOf = (s?: string): Side | undefined => (s?.includes('上手') ? 'R' : s?.includes('下手') ? 'L' : undefined);
const areaX = (s?: string) => {
  for (const k of Object.keys(AREA_X)) if (s?.includes(k)) return AREA_X[k];
  return undefined;
};

/** 「 が閉じていない行は、閉じるまで次の行とつなぐ */
function joinOpenQuotes(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    const open = (s: string) => (s.match(/「/g)?.length ?? 0) - (s.match(/」/g)?.length ?? 0);
    let k = 0;
    while (open(l) > 0 && i + 1 < lines.length && k++ < 20 && lines[i + 1].trim()) l += lines[++i].trim();
    out.push(l);
  }
  return out;
}

function clean(raw: string): string[] {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) =>
      l
        .replace(/^[\s　]+|[\s　]+$/g, '')
        // 書き出しの「0:01　」（時間を入れる）
        .replace(/^\d{1,2}:\d{2}[\s　]+/, ''),
    );
  return joinOpenQuotes(lines);
}

export function parseScriptText(text: string, base: CastMember[] = []): ImportResult {
  const cast = base.map((c) => ({ ...c }));
  const added: Role[] = [];
  const meta: Omit<ImportResult, 'items' | 'cast' | 'added'> = {};
  /** ○●の凡例：記号 → 名前 */
  const legend: Record<string, string> = {};
  const lines = clean(text);

  // 1周目：空白区切り（親父　セリフ）は、何度も出てくる名前か、知っている名前のときだけ話者にする
  const spaced = new Map<string, number>();
  for (const l of lines) {
    const m = l.match(new RegExp(`^(${NAME})[ \\u3000]+\\S`));
    if (m) spaced.set(m[1], (spaced.get(m[1]) ?? 0) + 1);
  }

  const find = (name: string) => {
    const n = legend[name] ?? name;
    return cast.find((c) => c.name === n) ?? cast.find((c) => c.mark && c.mark === n);
  };
  const role = (name: string): Role => {
    const hit = find(name);
    if (hit) return hit.id;
    const k = cast.filter((c) => c.kind === 'puppet').length;
    const n = legend[name] ?? name;
    const m: CastMember = {
      id: uid(),
      name: n,
      short: shortName(n),
      mark: MARKS[k],
      color: PALETTE[cast.length % PALETTE.length],
      kind: 'puppet',
      home: k % 2 === 0 ? 'L' : 'R',
    };
    cast.push(m);
    added.push(m.id);
    return m.id;
  };
  const isSpeaker = (name: string, sep: 'strong' | 'space') =>
    !META.has(name) && (sep === 'strong' || !!find(name) || (spaced.get(name) ?? 0) >= 3);

  const items: Item[] = [];
  const push = (it: NewItem) => items.push({ ...it, id: uid() } as Item);
  let lastSpeaker: Role | undefined;

  /** 【…】の中身。読めなければ false */
  const bracket = (b: string, rest: string): boolean => {
    b = b.trim();
    let m: RegExpMatchArray | null;
    if (b === '板付き' || b === '板付') {
      for (const part of rest.split(/[・、,]/)) {
        const p = part.trim().match(/^(.+?)(?:[（(](.+?)[）)])?$/);
        if (p) push({ t: 'move', w: role(p[1].trim()), in: true, x: areaX(p[2]) ?? 50 });
      }
      return true;
    }
    if ((m = b.match(/^(じわ|徐々に?|ゆっくり)?(明転|暗転|溶明|溶暗|カットイン|カットアウト|ブラックアウト|BO)\s*(?:\d+(?:\.\d+)?\s*秒)?$/i))) {
      const on = /明|イン/.test(m[2]);
      const soft = !!m[1] || /溶/.test(m[2]);
      const fade = secOf(b) ?? (soft ? 3 : undefined);
      push({ t: 'light', on, ...(fade ? { fade } : {}) });
      return true;
    }
    if ((m = b.match(/^ピン\s*([1-3１-３])(?:\s*[（(].*?[）)])?\s*(IN|OUT|イン|アウト|点灯|消灯)/i))) {
      const fade = secOf(b);
      push({ t: 'light', on: /IN|イン|点灯/i.test(m[2]), p: num(m[1]) as PinNo, ...(fade ? { fade } : {}) });
      return true;
    }
    if ((m = b.match(/^(?:音源|音響|曲|M)\s*([①-⑳⓪]|[0-9０-９]+)$/))) {
      const op = opOf(rest) ?? 'C.I';
      const name = rest.match(/『(.+?)』/)?.[1];
      const sec = op === 'F.I' || op === 'F.O' ? secOf(rest) : undefined;
      push({ t: 'cue', n: num(m[1]), op, ...(sec ? { sec } : {}), ...(name ? { x: name } : {}) });
      return true;
    }
    if (/^(SE|効果音)$/i.test(b)) {
      push({ t: 'se', x: rest.replace(/^[：:\s]+/, '') });
      return true;
    }
    if ((m = b.match(/^間\s*(?:(\d+(?:\.\d+)?)\s*秒?)?$/))) {
      push({ t: 'ma', s: m[1] ? Number(m[1]) : 1 });
      return true;
    }
    if ((m = b.match(/^(.+?)\s*出(?:[（(](.*?)[）)])?$/))) {
      const [from, to] = (m[2] ?? '').split(/[・、]/);
      push({ t: 'move', w: role(m[1].trim()), in: true, x: areaX(to) ?? areaX(from) ?? 50 });
      return true;
    }
    if ((m = b.match(/^(.+?)\s*ハケ(?:[（(](.*?)[）)])?$/))) {
      push({ t: 'move', w: role(m[1].trim()), in: false, side: sideOf(m[2]) ?? 'R' });
      return true;
    }
    return false;
  };

  /** （…）の中身 */
  const paren = (inner: string) => {
    let m: RegExpMatchArray | null;
    if ((m = inner.match(/^(長い|長めの|少し|短い)?間$/))) {
      push({ t: 'ma', s: m[1] === '長い' || m[1] === '長めの' ? 3 : m[1] ? 0.5 : 1 });
      return;
    }
    const who = inner.match(/^(.+?)[、,]\s*(.+)$/);
    const c = who ? find(who[1].trim()) : undefined;
    const body = who?.[2] ?? inner;
    if (c && (m = body.match(/^(下手|中央|上手)へ移動$/)) && c.kind === 'puppet') {
      push({ t: 'move', w: c.id, in: true, x: AREA_X[m[1]] });
      return;
    }
    // 小道具・大道具：（親父、卵を持つ）（卵を中央に置く）（卵を片付ける）
    if ((m = body.match(/^(?:(.+?)から)?(.+?)を(持つ|受け取る)$/)) && c?.kind === 'puppet') {
      const p = find(m[2]);
      if (p && p.kind === 'prop') return void push({ t: 'hold', w: p.id, by: c.id });
    }
    if ((m = body.match(/^(.+?)を(下手|中央|上手)(?:に置く|へ動かす)$/))) {
      const p = find(m[1]);
      if (p && p.kind !== 'puppet') return void push({ t: 'move', w: p.id, in: true, x: AREA_X[m[2]] });
    }
    if ((m = body.match(/^(.+?)を片付ける$/))) {
      const p = find(m[1]);
      if (p && p.kind !== 'puppet') return void push({ t: 'move', w: p.id, in: false, side: 'R' });
    }
    push(c ? { t: 'act', w: c.id, x: body } : { t: 'act', x: inner });
  };

  const say = (w: Role, x: string, n?: string) => {
    lastSpeaker = w;
    push({ t: 'line', w, x, ...(n ? { n } : {}) });
  };

  for (const l of lines) {
    if (!l) continue;
    let m: RegExpMatchArray | null;

    // 見出し・凡例
    if ((m = l.match(/^ユニット名?\s*[：:]\s*(.+)$/))) {
      meta.unit = m[1].trim();
      continue;
    }
    if ((m = l.match(/^(コント|漫才|ピン(?:ネタ)?)\s*[「『](.+)[」』]$/))) {
      meta.genre = GENRES.find((g) => m![1].startsWith(g));
      meta.title = m[2].trim();
      continue;
    }
    if ((m = l.match(/^(?:タイトル|題名?|ネタ名)\s*[：:]\s*(.+)$/))) {
      meta.title = m[1].replace(/^[「『]|[」』]$/g, '').trim();
      continue;
    }
    if ((m = l.match(/^(?:使用道具|小道具|道具)\s*[：:]\s*(.+)$/))) {
      meta.tools = m[1].trim();
      continue;
    }
    if ((m = l.match(/^(?:持ち込み物?|持込)\s*[：:]\s*(.+)$/))) {
      meta.bringIns = m[1].trim();
      continue;
    }
    if ((m = l.match(/^衣装\s*[：:]\s*(.+)$/))) {
      meta.costumes = m[1].trim();
      continue;
    }
    if ((m = l.match(/^(?:登場人物|キャスト)\s*[：:]\s*(.+)$/))) {
      for (const n of m[1].split(/[、,・\s　]+/)) if (n.trim()) role(n.replace(/[（(].*$/, '').trim());
      continue;
    }
    const lg = l.replace(/『』\s*([^\s（(]+)(?:[（(].*?[）)])?/g, '').trim();
    if ((lg === '' && l !== '') || (new RegExp(`^([${MARK_CHARS}]\\s*\\S+\\s*)+$`).test(lg) && !/[「：:]/.test(lg))) {
      // 『』 卵（音源）＝声だけの小道具
      for (const p of l.matchAll(/『』\s*([^\s（(]+)/g))
        if (!find(p[1])) {
          const m: CastMember = { id: uid(), name: p[1], short: shortName(p[1]), color: PALETTE[cast.length % PALETTE.length], kind: 'prop' };
          cast.push(m);
          added.push(m.id);
        }
      for (const p of lg.matchAll(new RegExp(`([${MARK_CHARS}])\\s*([^\\s${MARK_CHARS}]+)`, 'g'))) {
        legend[p[1]] = p[2];
        role(p[1]);
      }
      continue;
    }
    if (/^『』/.test(l) || /^■/.test(l) || /^きっかけ[：:]/.test(l) || /^[-=＝ー─━]{3,}$/.test(l)) continue;
    // キュー表の「01. 」
    const body = l.replace(/^\d{1,3}\.\s+/, '').replace(/\s*\[\d+:\d{2}\]$/, '');

    // 【…】
    if ((m = body.match(/^[【［\[](.+?)[】］\]]\s*(.*)$/))) {
      if (!bracket(m[1], m[2])) push({ t: 'act', x: body.replace(/^[【［\[]|[】］\]]$/g, '') });
      continue;
    }
    // （…）
    if ((m = body.match(/^[（(](.*)[）)]$/))) {
      paren(m[1].trim());
      continue;
    }
    // 括弧なしの照明・音響
    if (/^(じわ|徐々に?)?(明転|暗転|溶明|溶暗)/.test(body) && bracket(body, '')) continue;
    if ((m = body.match(/^(?:SE|効果音)\s*[：:\s]\s*(.+)$/i))) {
      push({ t: 'se', x: m[1].trim() });
      continue;
    }
    if ((m = body.match(/^(?:音源|M)\s*([①-⑳⓪]|[0-9０-９]+)\s*(.*)$/)) && opOf(m[2])) {
      bracket(`音源${m[1]}`, m[2]);
      continue;
    }
    // セリフ：親父「…」（注）／親父：…／親父<Tab>…
    if ((m = body.match(new RegExp(`^(${NAME})?\\s*[：:]?\\s*「(.*)」\\s*(?:[（(](.+)[）)])?$`)))) {
      const w = m[1] ? (isSpeaker(m[1], 'strong') ? role(m[1]) : undefined) : lastSpeaker;
      if (w) say(w, m[2], m[3]);
      else push({ t: 'act', x: body });
      continue;
    }
    if ((m = body.match(/^『(.*)』\s*(?:[（(](.+)[）)])?$/))) {
      const voice = cast.filter((c) => c.kind === 'prop');
      if (voice.length === 1) say(voice[0].id, m[1], m[2]);
      else push({ t: 'act', x: body });
      continue;
    }
    if ((m = body.match(new RegExp(`^(${NAME})\\s*(?:[：:]|\\t)\\s*(.+)$`))) && isSpeaker(m[1], 'strong')) {
      say(role(m[1]), m[2].replace(/^「|」$/g, ''));
      continue;
    }
    if ((m = body.match(new RegExp(`^(${NAME})[ \\u3000]+(.+)$`))) && isSpeaker(m[1], 'space')) {
      say(role(m[1]), m[2].replace(/^「|」$/g, ''));
      continue;
    }
    // わからない行は（動き）として残す
    push({ t: 'act', x: body });
  }

  return { items: settle(items, cast), cast, added, ...meta };
}

/**
 * 舞台に乗せる下ごしらえ。
 * - 出ても板付きでもないのに先にしゃべる人形は、板付きにする（横に並べる）
 * - 出ハケがあるのに照明が無いと、全部が板付き扱いになるので、板付きのあとに明転を入れる
 */
function settle(items: Item[], cast: CastMember[]): Item[] {
  const puppetIds = new Set(cast.filter((c) => c.kind === 'puppet').map((c) => c.id));
  const firstLight = items.findIndex((it) => it.t === 'light');
  // 頭に並んだ出ハケ（＝板付き）の数
  let lead = 0;
  while (lead < items.length && items[lead].t === 'move') lead++;
  if (firstLight >= 0 && lead < firstLight) lead = 0;
  const placed = new Set(items.slice(0, lead).flatMap((it) => (it.t === 'move' && it.in ? [it.w] : [])));
  const need: Role[] = [];
  const seen = new Set<Role>(placed);
  for (const it of items) {
    if (it.t === 'move') seen.add(it.w);
    if ((it.t === 'line' || (it.t === 'act' && it.w)) && it.w && puppetIds.has(it.w) && !seen.has(it.w)) {
      seen.add(it.w);
      need.push(it.w);
    }
  }
  const board: Item[] = need.map((w, i) => ({ id: uid(), t: 'move', w, in: true, x: Math.round((100 * (i + 1)) / (need.length + 1)) }));
  const head = [...items.slice(0, lead), ...board];
  const rest = items.slice(lead);
  const hasMove = items.some((it) => it.t === 'move') || board.length > 0;
  if (firstLight < 0 && hasMove) return [...head, { id: uid(), t: 'light', on: true }, ...rest];
  return [...head, ...rest];
}
