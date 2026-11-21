import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { member } from '../../lib/stage/cast';
import { initialState } from '../../lib/stage/state';
import type { CastMember, Item, Role } from '../../lib/stage/types';
import type { Synced } from '../../lib/stage/writeText';
import { chipLook } from './chips';

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
        <textarea
          ref={area}
          value={p.text}
          onChange={(e) => {
            typed.current = e.target.value;
            sel.current = e.target.selectionStart;
            p.onText(e.target.value);
          }}
          onSelect={follow}
          spellCheck={false}
          placeholder={'ネタを続けて打つ。改行で話者が交代、空白なら同じ人が続ける\n@ から次の空白まで＝ト書き（行の途中でも）　、、＝……\n^1＝音源1　^1 fo＝フェードアウト　^拍手＝SE（これも途中でも）\n1 で始める＝1番の役が話す\n外れたら下の名前を押して直す'}
        />
        <ol className="bprev" ref={prev} aria-label="台本">
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
                  <span className="x">{it.x}</span>
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
                  <span className="x">
                    （{it.w ? `${member(p.cast, it.w)?.name ?? ''}、` : ''}
                    {it.x}）
                  </span>
                  <button className="fx" onPointerDown={keep} onClick={() => p.onKind(it.id)} title="セリフにする" aria-label="セリフにする">
                    「」
                  </button>
                  {join}
                </li>
              );
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
