import { member, puppets } from './cast';
import { withId } from './edit';
import { NAME, parseScriptText } from './importText';
import type { CastMember, Item, Role } from './types';

/**
 * 「まとめ書き」：大きな欄に一気に打った文章を、行ごとに台本の項目へ振り分ける。
 * 速く打てるよう、何も付けない行はセリフにして話者を自動で交代させる。
 *
 * - 何も付けない行 → セリフ（話者は交代）。行頭に空白 → 直前と同じ話者が続けて話す
 * - `1 セリフ`（数字＋空白） → その番号の役。`名前「セリフ」`・知っている `名前：セリフ` → その役
 * - `（ト書き` → 動き（閉じ括弧は無くてもいい）。`、、`・`・・` → 間（打った数だけ長く）
 * - `明転`・`暗転`・`SE：拍手`・`【…】` などは、台本の読み込みと同じ（importText.ts）
 */
export type QuickContext = {
  /** 話者がまだ決まっていないときの最初の話者 */
  first?: Role;
  /** 直前に話した役と、その前に話した別の役（差し込む位置までの台本から） */
  prev?: Role;
  prev2?: Role;
};

export type QuickResult = {
  items: Item[];
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

export function parseQuick(text: string, base: CastMember[], ctx: QuickContext = {}): QuickResult {
  let cast = base;
  const added: Role[] = [];
  const items: Item[] = [];
  let { prev, prev2 } = ctx;

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
    if (!w) return void items.push(withId({ t: 'act', x }));
    spoke(w);
    items.push(withId({ t: 'line', w, x }));
  };
  const bare = (x: string, cont: boolean) => say(cont ? (prev ?? after()) : after(), x);
  const known = (name: string) => cast.some((c) => c.name === name || (c.mark && c.mark === name));

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const cont = /^[ \t　]/.test(raw);
    let l = raw.replace(/^[\s　]+|[\s　]+$/g, '');
    if (!l) continue;
    let m: RegExpMatchArray | null;

    // 間：、、／・・／‥（打った数だけ長く）
    if ((m = l.match(/^(?:([、,，・.．。])\1+|‥+|…+)$/))) {
      items.push(withId({ t: 'ma', s: m[1] ? l.length - 1 : l.length }));
      continue;
    }
    // 番号で話者：1 セリフ
    if ((m = l.match(/^([1-9１-９])[ 　]+(.+)$/))) {
      const n = DIGITS.indexOf(m[1]) >= 0 ? DIGITS.indexOf(m[1]) + 1 : Number(m[1]);
      const who = cast.filter((c) => c.kind !== 'set')[n - 1];
      if (who) {
        say(who.id, m[2].replace(/^「|」$/g, ''));
        continue;
      }
    }
    // 「セリフ」だけ（閉じなくてもいい）→ 交代して話す
    if (/^「/.test(l)) {
      bare(l.replace(/^「|」$/g, ''), cont);
      continue;
    }
    // 知らない名前の「名前：…」は役にしない（「結論：やめとけ」「10:30に集合」を役にしないため）
    if ((m = l.match(new RegExp(`^(${NAME})\\s*[：:\\t]`))) && !known(m[1]) && !/^(SE|効果音)$/i.test(m[1])) {
      bare(l, cont);
      continue;
    }
    // ト書きは閉じ括弧を省ける
    if (/^[（(]/.test(l) && !/[）)]$/.test(l)) l += '）';

    const r = parseScriptText(l, cast, { settle: false });
    const only = r.items.length === 1 ? r.items[0] : undefined;
    // 見出し扱いで消えた行・読めなかった行は、セリフとして残す
    if (r.items.length === 0 || (only?.t === 'act' && !only.w && !OPEN.test(l))) {
      bare(l, cont);
      continue;
    }
    cast = r.cast;
    added.push(...r.added);
    for (const it of r.items) {
      if (it.t === 'line') spoke(it.w);
      items.push(it);
    }
  }
  return { items, cast, added, next: after() };
}
