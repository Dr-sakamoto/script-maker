import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { member } from '../../lib/stage/cast';
import { cueWarnings, writeToken, type Dir } from '../../lib/stage/cueToken';
import { cueText, lightText } from '../../lib/stage/export';
import { initialState } from '../../lib/stage/state';
import type { CastMember, Item, Role } from '../../lib/stage/types';
import type { Synced } from '../../lib/stage/writeText';
import { chipLook } from './chips';
import { caretXY, CuePop, tokenNear, type TokenHit } from './CuePop';

type Props = {
  cast: CastMember[];
  /** 今の台本（打ったそばから入っている） */
  items: Item[];
  /** 欄の文章と、どの行がどの項目か */
  text: string;
  synced: Synced;
  /** 打った：文章が変わった */
  onText: (text: string) => void;
  /** 下の並びから直す（話者・セリフ⇔動き・前の行につなぐ） */
  onSpeaker: (id: string) => void;
  onKind: (id: string) => void;
  onJoin: (id: string) => void;
  /** 「最初」：最初に話す人を替える */
  onFirst: (w: Role) => void;
  /** 役の並びの「＋」 */
  onAddRole: (name: string) => void;
  /** 空の台本：種類ごとのひな形（漫才・コント） */
  template?: string;
  onTemplate?: () => void;
};

/**
 * かく：台本を文章で書く。打ったそばから台本に入り、下（広い画面は右）に台本の形で出る。
 * 下の並びで直すと、文章のほうも書き直される（どちらから直してもいい）
 */
export function Writer(p: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const prev = useRef<HTMLOListElement>(null);
  const init = useMemo(() => initialState(p.cast), [p.cast]);
  const speaking = p.cast.filter((c) => c.kind !== 'set');
  const canSwap = speaking.length > 1;
  const first = p.items.find((it) => it.t === 'line')?.w ?? speaking.find((c) => c.kind === 'puppet')?.id;
  /** 押してもキーボードを閉じない */
  const keep = (e: React.PointerEvent) => e.preventDefault();

  // 外から文章が書き直されたとき（下の並びで直した・元に戻した）、カーソルの位置を保つ
  const sel = useRef(0);
  const typed = useRef(p.text);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || p.text === typed.current) return;
    typed.current = p.text;
    if (document.activeElement === el) {
      const at = Math.min(sel.current, p.text.length);
      el.setSelectionRange(at, at);
    }
  }, [p.text]);

  // 今打っている行の項目を、下の並びで見えるところへ
  const lineAt = (pos: number) => p.text.slice(0, pos).split('\n').length - 1;
  const follow = () => {
    const el = area.current;
    const list = prev.current;
    if (!el || !list) return;
    sel.current = el.selectionStart;
    const line = lineAt(el.selectionStart);
    let id: string | undefined;
    for (let k = Math.min(line, p.synced.byLine.length - 1); k >= 0 && !id; k--) id = p.synced.byLine[k]?.[0]?.id;
    const li = id ? list.querySelector<HTMLElement>(`[data-id="${id}"]`) : null;
    if (li) {
      const top = li.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - li.offsetHeight) list.scrollTop = top - list.clientHeight / 3;
      list.querySelectorAll('.cur').forEach((x) => x.classList.remove('cur'));
      li.classList.add('cur');
    }
  };
  useEffect(follow, [p.text, p.synced]);

  // --- ・m1・・l の吹き出し
  const latest = useRef(p);
  latest.current = p;
  const [pop, setPop] = useState<{ hit: TokenHit; focus: boolean; x: number; y: number } | null>(null);
  /** 選んだあと・閉じたあとは、カーソルがいったん離れるまで幽霊を出さない */
  const hide = useRef(-1);
  const timer = useRef<number | undefined>(undefined);
  /** 吹き出しで今の向き：その行の台本の項目から（向きを書いていなければ、流れで決まった向き） */
  const dirOf = (hit: TokenHit): Dir => {
    if (hit.tk.dir) return hit.tk.dir;
    const row = latest.current.synced.byLine[hit.line] ?? [];
    const same = row.filter((it) => (hit.tk.kind === 'cue' ? it.t === 'cue' : it.t === 'light' && !it.p));
    const it = same[hit.nth];
    if (it?.t === 'cue') return it.op === 'C.I' || it.op === 'F.I' ? 'in' : 'out';
    if (it?.t === 'light') return it.on ? 'in' : 'out';
    return 'in';
  };
  const openAt = (pos: number, focus: boolean) => {
    const el = area.current;
    if (!el) return;
    const hit = tokenNear(el.value, pos);
    if (!hit) return void setPop(null);
    const xy = caretXY(el, hit.end);
    const w = el.clientWidth;
    setPop({ hit, focus, x: Math.max(4, Math.min(xy.x - 20, w - 236)), y: Math.min(xy.y + 4, el.clientHeight - 8) });
  };
  /** 打ったばかりの ・m1・・l（向きが書いていない）：少し待ってから、秒数の欄にカーソルを合わせて出す */
  const afterType = (el: HTMLTextAreaElement) => {
    clearTimeout(timer.current);
    const pos = el.selectionStart;
    const hit = tokenNear(el.value, pos);
    if (hit && pos === hit.end && !hit.tk.dir) timer.current = window.setTimeout(() => openAt(pos, true), 450);
  };
  /** カーソルが ・m1・・l に近づいたら、幽霊のように薄く出す */
  const ghostAt = (el: HTMLTextAreaElement) => {
    if (el.selectionStart !== el.selectionEnd) return;
    const hit = tokenNear(el.value, el.selectionStart);
    if (!hit) {
      hide.current = -1;
      if (pop && !pop.focus) setPop(null);
      return;
    }
    if (hit.start === hide.current || pop?.hit.start === hit.start) return;
    openAt(el.selectionStart, false);
  };
  const pick = (dir: Dir, sec: number) => {
    const el = area.current;
    if (!el || !pop) return;
    const { hit } = pop;
    const tok = writeToken(hit.tk.head, dir, sec, hit.tk.kind === 'cue' ? hit.tk.name : undefined);
    const next = el.value.slice(0, hit.start) + tok + el.value.slice(hit.end);
    hide.current = hit.start;
    sel.current = hit.start + tok.length;
    setPop(null);
    el.focus();
    p.onText(next);
  };
  const closePop = () => {
    if (pop) hide.current = pop.hit.start;
    setPop(null);
    if (pop?.focus) area.current?.focus();
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // --- 清書：矛盾の指摘と、同じ行のきっかけのマーカー
  const warns = useMemo(() => cueWarnings(p.items), [p.items]);
  const warnOf = useMemo(() => new Map(warns.map((w) => [w.id, w.msg])), [warns]);
  /** i 番目のセリフ・動きのあとに続く、同じ行に書いた音源・照明のきっかけ */
  const marksOf = (i: number) => {
    const out: { k: string; cls: 'snd' | 'lgt' }[] = [];
    for (let j = i + 1; j < p.items.length; j++) {
      const it = p.items[j];
      if (it.t !== 'cue' && it.t !== 'light') break;
      if (it.k) out.push({ k: it.k, cls: it.t === 'cue' ? 'snd' : 'lgt' });
    }
    return out;
  };
  /** 文にマーカーを引く（音源＝青緑、照明＝黄。両方なら両方の色） */
  const marked = (text: string, marks: { k: string; cls: 'snd' | 'lgt' }[]) => {
    const ranges: { s: number; e: number; cls: Set<string> }[] = [];
    for (const m of marks) {
      const s0 = text.lastIndexOf(m.k);
      if (s0 < 0) continue;
      const hit = ranges.find((r) => r.s === s0 && r.e === s0 + m.k.length);
      if (hit) hit.cls.add(m.cls);
      else if (!ranges.some((r) => s0 < r.e && r.s < s0 + m.k.length)) ranges.push({ s: s0, e: s0 + m.k.length, cls: new Set([m.cls]) });
    }
    if (!ranges.length) return text;
    ranges.sort((a, b) => a.s - b.s);
    const out: React.ReactNode[] = [];
    let at = 0;
    ranges.forEach((r, n) => {
      if (r.s > at) out.push(text.slice(at, r.s));
      out.push(
        <mark key={n} className={`mk ${r.cls.size > 1 ? 'both' : [...r.cls][0]}`}>
          {text.slice(r.s, r.e)}
        </mark>,
      );
      at = r.e;
    });
    if (at < text.length) out.push(text.slice(at));
    return out;
  };
  const showItem = (id: string) => {
    const li = prev.current?.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!li || !prev.current) return;
    prev.current.scrollTop = li.offsetTop - prev.current.offsetTop - prev.current.clientHeight / 3;
    li.classList.remove('flash');
    void li.offsetWidth;
    li.classList.add('flash');
  };

  const label = (it: Item) => {
    if (it.t === 'move') return `${member(p.cast, it.w)?.name ?? '?'} ${it.in ? '出' : 'ハケ'}`;
    return chipLook(p.cast, it, init).text;
  };

  return (
    <div className="batchbar writer">
      <div className="bhead">
        <span className="nums" role="radiogroup" aria-label="最初に話す人（数字は「1 セリフ」の番号）">
          {canSwap && <em>最初</em>}
          {speaking.map((c, i) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={c.id === first}
              className={c.id === first ? 'on' : ''}
              style={{ '--c': c.color } as React.CSSProperties}
              disabled={!canSwap}
              onPointerDown={keep}
              onClick={() => p.onFirst(c.id)}
              title="押すと、この人から話し始める（セリフの話者を入れ替える）"
            >
              <i>{i + 1}</i>
              {c.name}
            </button>
          ))}
        </span>
        <button
          className="add"
          aria-label="役を足す"
          title="役を足す"
          onPointerDown={keep}
          onClick={() => {
            const name = prompt('新しい役の名前')?.trim();
            if (name) p.onAddRole(name);
            area.current?.focus();
          }}
        >
          ＋
        </button>
      </div>
      <div className="bbody">
        <div className="wbox">
          <textarea
            ref={area}
            value={p.text}
            onChange={(e) => {
              typed.current = e.target.value;
              sel.current = e.target.selectionStart;
              p.onText(e.target.value);
              if (!(e.nativeEvent as InputEvent).isComposing) afterType(e.target);
            }}
            onCompositionEnd={(e) => afterType(e.currentTarget)}
            onSelect={(e) => {
              follow();
              ghostAt(e.currentTarget);
            }}
            onScroll={() => pop && !pop.focus && setPop(null)}
            spellCheck={false}
            placeholder={'ネタを続けて打つ。改行で話者が交代、空白なら同じ人が続ける\n行頭の @＝ト書き（途中の @なく＝直前のセリフの（なく））　、、＝……\n・m1＝音源①　・l＝照明（吹き出しでイン・アウトと秒数。秒数なし＝カット）\n同じ行に書くと、その前のセリフ・動きがきっかけになる\n1 で始める＝1番の役が話す\n外れたら下の名前を押して直す'}
          />
          {pop && <CuePop key={pop.hit.start} hit={pop.hit} dir={dirOf(pop.hit)} x={pop.x} y={pop.y} focus={pop.focus} onPick={pick} onClose={closePop} />}
        </div>
        <ol className="bprev" ref={prev} aria-label="台本">
          {warns.length > 0 && (
            <li className="warns" role="status">
              {warns.map((w) => (
                <button key={w.id + w.msg} onPointerDown={keep} onClick={() => showItem(w.id)}>
                  ⚠ {w.msg}
                </button>
              ))}
            </li>
          )}
          {p.items.length === 0 && (
            <li className="c">
              打ったそばから、ここに台本の形で出る
              {p.template && p.onTemplate && (
                <button className="tmpl" onClick={p.onTemplate}>
                  {p.template}のひな形を入れる
                </button>
              )}
            </li>
          )}
          {p.items.map((it, i) => {
            const before = p.items[i - 1];
            const join = (before?.t === 'line' || before?.t === 'act') && (
              <button className="fx" onPointerDown={keep} onClick={() => p.onJoin(it.id)} title="前の行につなぐ" aria-label="前の行につなぐ">
                ⤴
              </button>
            );
            if (it.t === 'line') {
              const m = member(p.cast, it.w);
              return (
                <li key={it.id} data-id={it.id} className="l">
                  <button className="who" style={{ color: m?.color }} disabled={!canSwap} onPointerDown={keep} onClick={() => p.onSpeaker(it.id)} title="押すと話者が替わる（この行だけ）">
                    {m?.name ?? '?'}
                  </button>
                  <span className="x">{marked(it.x, marksOf(i))}</span>
                  <button className="fx" onPointerDown={keep} onClick={() => p.onKind(it.id)} title="動き（ト書き）にする" aria-label="動きにする">
                    （）
                  </button>
                  {join}
                </li>
              );
            }
            if (it.t === 'act')
              return (
                <li key={it.id} data-id={it.id} className="a">
                  <span className="x">{marked(`（${it.w ? `${member(p.cast, it.w)?.name ?? ''}、` : ''}${it.x}）`, marksOf(i))}</span>
                  <button className="fx" onPointerDown={keep} onClick={() => p.onKind(it.id)} title="セリフにする" aria-label="セリフにする">
                    「」
                  </button>
                  {join}
                </li>
              );
            // 音源・照明は清書の形（【音源①】F.O 5秒・【明転】）。矛盾していたら指摘する
            if (it.t === 'cue' || (it.t === 'light' && !it.p)) {
              const w = warnOf.get(it.id);
              return (
                <li key={it.id} data-id={it.id} className={`q ${it.t === 'cue' ? 'snd' : 'lgt'}${w ? ' bad' : ''}`} title={w}>
                  <span className="x">{it.t === 'cue' ? cueText(it) : lightText(it)}</span>
                  {w && <em className="why">⚠ {w}</em>}
                </li>
              );
            }
            return (
              <li key={it.id} data-id={it.id} className="c">
                <span>{label(it)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
