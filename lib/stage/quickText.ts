import { member, puppets } from './cast';
import { withId } from './edit';
import { NAME, parseScriptText } from './importText';
import type { CastMember, Item, Role } from './types';

/**
 * 「まとめ書き」：大きな欄に一気に打った文章を、台本の項目へ振り分ける。
 * 速く打てるよう、雑に打っても見当をつけて割り振り、外れたところはあとから直せるようにする。
 *
 * - 何も付けない行 → セリフ（話者は交代）。行頭に空白 → 直前と同じ話者が続けて話す
 * - 改行していなくても、空白で区切ってあれば話者を替える。長い文のかたまりは「。！？」でも分ける
 * - `1 セリフ`（数字＋空白） → その番号の役。`名前「セリフ」`・知っている `名前：セリフ` → その役
 * - `（ト書き` → 動き（閉じ括弧は無くてもいい）。括弧が無くても「役名、〜する」「役名が〜する」は動きと見る
 * - `、、`・`・・`・`間` → 間。`明転`・`暗転`・`SE：拍手`・`【…】` などは台本の読み込みと同じ（importText.ts）
 *
 * 直すときは文章のほうを書き換える（fixQuick）。文章がいつも正で、直した結果もそのまま文章に残る。
 */
export type QuickContext = {
  /** 話者がまだ決まっていないときの最初の話者 */
  first?: Role;
  /** 直前に話した役と、その前に話した別の役（差し込む位置までの台本から） */
  prev?: Role;
  prev2?: Role;
};

/** 項目が、文章のどこから来たか（line 行目の seg 番目のかたまり） */
export type QuickRow = { line: number; seg: number };

export type QuickResult = {
  items: Item[];
  /** items と同じ並び */
  rows: QuickRow[];
  /** 元の役＋足した役 */
  cast: CastMember[];
  added: Role[];
  /** この続きで、何も付けずに打ったら話す役 */
  next?: Role;
};

/** 差し込む位置（cursor）までに話した役を、新しい順に2人 */
export function speakersBefore(items: Item[], cursor: number): Pick<QuickContext, 'prev' | 'prev2'> {
  let prev: Role | undefined;
  for (let i = Math.min(cursor, items.length - 1); i >= 0; i--) {
    const it = items[i];
    if (it.t !== 'line') continue;
    if (!prev) prev = it.w;
    else if (it.w !== prev) return { prev, prev2: it.w };
  }
  return { prev };
}

const DIGITS = '１２３４５６７８９';
const OPEN = /^[（(【［\[]/;
const trim = (s: string) => s.replace(/^[\s　]+|[\s　]+$/g, '');
const known = (cast: CastMember[], name: string) => cast.some((c) => c.name === name || (c.mark && c.mark === name));
/** 「。！？」で分けるのは、これより長い文のかたまりだけ（短い行は1人が続けて話したものと見る） */
const BLOB = 40;

/**
 * 1行を、話者が替わりそうなところで分ける。
 * - 空白（日本語どうしの間）は区切り
 * - 長い文のかたまり（改行なしで続けて打った・音声入力）は「。！？」でも分ける
 * 書式のある行（括弧・番号・名前：…）は分けない。行頭の空白（同じ人が続ける印）は最初のかたまりに残す
 */
export function segmentsOf(raw: string, cast: CastMember[] = []): string[] {
  const body = trim(raw);
  if (!body) return [];
  const lead = raw.match(/^[ \t　]*/)?.[0] ?? '';
  if (/^[（(【［\[「『]/.test(body) || /^[1-9１-９][ 　]/.test(body)) return [raw];
  if (new RegExp(`^${NAME}\\s*[：:「\\t]`).test(body)) return [raw];
  const head = body.match(new RegExp(`^(${NAME})[ \\u3000]`));
  if (head && known(cast, head[1])) return [raw];

  let parts = body.split(/(?<=[^\x00-\x7F])[ 　]+(?=[^\x00-\x7F])/);
  const ends = body.match(/[。！？!?]+(?=[^。！？!?」』）)\s])/g)?.length ?? 0;
  if (body.length > BLOB && ends >= 2)
    parts = parts.flatMap((p) => (/[「（(『]/.test(p) ? [p] : p.split(/(?<=[。！？!?])(?=[^。！？!?」』）)\s])/)));
  parts = parts.map(trim).filter(Boolean);
  return parts.map((p, i) => (i === 0 ? lead + p : p));
}

export function parseQuick(text: string, base: CastMember[], ctx: QuickContext = {}): QuickResult {
  let cast = base;
  const added: Role[] = [];
  const items: Item[] = [];
  const rows: QuickRow[] = [];
  let { prev, prev2 } = ctx;
  let at: QuickRow = { line: 0, seg: 0 };
  const push = (it: Item) => {
    items.push(it);
    rows.push(at);
  };

  /** prev の次に話す役：その前に話していた役。いなければ隣の人形 */
  const after = (): Role | undefined => {
    if (!prev) return ctx.first ?? puppets(cast)[0]?.id;
    if (prev2 && member(cast, prev2)) return prev2;
    const ps = puppets(cast).map((c) => c.id);
    const i = ps.indexOf(prev);
    return i < 0 ? (ps[0] ?? prev) : ps[(i + 1) % ps.length];
  };
  const spoke = (w: Role) => {
    if (w === prev) return;
    prev2 = prev;
    prev = w;
  };
  const say = (w: Role | undefined, x: string) => {
    if (!w) return void push(withId({ t: 'act', x }));
    spoke(w);
    push(withId({ t: 'line', w, x }));
  };
  const bare = (x: string, cont: boolean) => say(cont ? (prev ?? after()) : after(), x);
  /** 括弧の無いト書き：「役名、〜する」「役名が〜する」（動詞で終わり、！？が無い） */
  const looksAct = (l: string): boolean => {
    const names = cast.filter((c) => c.kind === 'puppet').map((c) => c.name).sort((a, b) => b.length - a.length);
    const name = names.find((n) => n && l.startsWith(n));
    if (!name) return false;
    const m = l.slice(name.length).match(/^(?:、|が|は)(.+[うくぐすつぬぶむる])。?$/);
    if (!m || /[！？!?「」]/.test(m[1])) return false;
    push(withId({ t: 'act', w: cast.find((c) => c.name === name)!.id, x: m[1] }));
    return true;
  };

  const one = (raw: string) => {
    const cont = /^[ \t　]/.test(raw);
    let l = trim(raw);
    if (!l) return;
    let m: RegExpMatchArray | null;

    // 間：、、／・・／‥（打った数だけ長く）／間
    if ((m = l.match(/^(?:([、,，・.．。])\1+|‥+|…+)$/))) return void push(withId({ t: 'ma', s: m[1] ? l.length - 1 : l.length }));
    if (l === '間') return void push(withId({ t: 'ma', s: 1 }));
    // 番号で話者：1 セリフ
    if ((m = l.match(/^([1-9１-９])[ 　]+(.+)$/))) {
      const n = DIGITS.indexOf(m[1]) >= 0 ? DIGITS.indexOf(m[1]) + 1 : Number(m[1]);
      const who = cast.filter((c) => c.kind !== 'set')[n - 1];
      if (who) return say(who.id, m[2].replace(/^「|」$/g, ''));
    }
    // 「セリフ」だけ（閉じなくてもいい）→ 交代して話す。ト書きに見えてもセリフにする印でもある
    if (/^「/.test(l)) return bare(l.replace(/^「|」$/g, ''), cont);
    // 知らない名前の「名前：…」は役にしない（「結論：やめとけ」「10:30に集合」を役にしないため）
    if ((m = l.match(new RegExp(`^(${NAME})\\s*[：:\\t]`))) && !known(cast, m[1]) && !/^(SE|効果音)$/i.test(m[1])) return bare(l, cont);
    // ト書きは閉じ括弧を省ける
    if (/^[（(]/.test(l) && !/[）)]$/.test(l)) l += '）';

    const r = parseScriptText(l, cast, { settle: false });
    const only = r.items.length === 1 ? r.items[0] : undefined;
    // 見出し扱いで消えた行・読めなかった行は、セリフとして残す（ト書きに見えるものは動き）
    if (r.items.length === 0 || (only?.t === 'act' && !only.w && !OPEN.test(l))) {
      if (!looksAct(l)) bare(l, cont);
      return;
    }
    cast = r.cast;
    added.push(...r.added);
    for (const it of r.items) {
      if (it.t === 'line') spoke(it.w);
      push(it);
    }
  };

  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((raw, line) =>
      segmentsOf(raw, cast).forEach((s, seg) => {
        at = { line, seg };
        one(s);
      }),
    );
  return { items, rows, cast, added, next: after() };
}

export type QuickFix = 'speaker' | 'kind' | 'join';

/** かたまりから、話者の印（行頭の空白・番号）と括弧を外した中身 */
function core(s: string): string {
  let t = trim(s);
  const m = t.match(/^[1-9１-９][ 　]+(.+)$/);
  if (m) t = m[1];
  if (/^[（(]/.test(t)) return t.replace(/^[（(]/, '').replace(/[）)]$/, '');
  return t.replace(/^「/, '').replace(/」$/, '');
}

/**
 * 割り振りを直す。i 番目の項目について、文章のほうを書き換えて返す（直せなければ null）。
 * - speaker：話者を次の役に替える（続きの行の交代もそれに合わせて変わる）
 * - kind：セリフ ⇔ 動き
 * - join：前の行につなぐ
 * 1行にいくつも入っていたら、そのとき行に分けて書き直す。
 */
export function fixQuick(text: string, cast: CastMember[], ctx: QuickContext, i: number, fix: QuickFix): string | null {
  const r = parseQuick(text, cast, ctx);
  const it = r.items[i];
  const row = r.rows[i];
  if (!it || !row || (it.t !== 'line' && it.t !== 'act')) return null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const segs = segmentsOf(lines[row.line], cast);
  const s = core(segs[row.seg]);
  const put = (next: string[]) => {
    lines.splice(row.line, 1, ...next);
    return lines.join('\n');
  };

  if (fix === 'kind') {
    // 動きに見えてしまうセリフは「」で包んで、セリフだと決める
    segs[row.seg] = it.t === 'line' ? `（${s}）` : `「${trim(segs[row.seg]).replace(/^[（(]|[）)]$/g, '')}」`;
    return put(segs);
  }

  if (fix === 'speaker') {
    if (it.t !== 'line') return null;
    const speaking = r.cast.filter((c) => c.kind !== 'set');
    const k = speaking.findIndex((c) => c.id === it.w);
    if (speaking.length < 2 || k < 0) return null;
    const to = speaking[(k + 1) % speaking.length];
    let before: Role | undefined = ctx.prev;
    for (let j = i - 1; j >= 0; j--) {
      const p = r.items[j];
      if (p.t === 'line') {
        before = p.w;
        break;
      }
    }
    const n = speaking.indexOf(to) + 1;
    // 直前と同じ人なら「行頭の空白」、違えば番号（10人目からは 名前「…」）
    segs[row.seg] = to.id === before ? `　${s}` : n <= 9 ? `${n} ${s}` : `${to.name}「${s}」`;
    return put(segs);
  }

  // join：前の項目（セリフ・動き）の後ろにつなぐ
  const p = r.items[i - 1];
  const prow = r.rows[i - 1];
  if (!p || (p.t !== 'line' && p.t !== 'act')) return null;
  const glue = (a: string) => (/[）)]$/.test(trim(a)) ? trim(a).replace(/[）)]$/, `${s}）`) : /」$/.test(trim(a)) ? trim(a).replace(/」$/, `${s}」`) : a + s);
  if (prow.line === row.line) {
    segs.splice(row.seg - 1, 2, glue(segs[row.seg - 1]));
    return put(segs);
  }
  const psegs = segmentsOf(lines[prow.line], cast);
  psegs[psegs.length - 1] = glue(psegs[psegs.length - 1]);
  segs.splice(row.seg, 1);
  lines.splice(prow.line, row.line - prow.line + 1, ...psegs, ...segs);
  return lines.join('\n');
}
