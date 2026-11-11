import { useEffect, useMemo, useRef, useState } from 'react';
import { member } from '../../lib/stage/cast';
import { fixQuick, parseQuick, type QuickContext, type QuickFix } from '../../lib/stage/quickText';
import { initialState } from '../../lib/stage/state';
import type { CastMember, Item } from '../../lib/stage/types';
import { chipLook } from './chips';

type Props = {
  cast: CastMember[];
  /** 差し込む位置までの話者（何も付けない行の話者を決める） */
  ctx: QuickContext;
  /** 台本に入れる。入れたら true */
  onSubmit: (text: string) => boolean;
  /** 1行ずつ打つ欄に戻る */
  onClose: () => void;
  /** 打ちかけの文字をこの名前で端末にとっておく */
  draftKey?: string;
};

const draftName = (k: string) => `stage:batch:${k}`;
function readDraft(k?: string): string {
  if (!k) return '';
  try {
    return localStorage.getItem(draftName(k)) ?? '';
  } catch {
    return '';
  }
}
function writeDraft(k: string | undefined, v: string) {
  if (!k) return;
  try {
    if (v) localStorage.setItem(draftName(k), v);
    else localStorage.removeItem(draftName(k));
  } catch {
    /* noop */
  }
}

/** まとめ書き：大きな欄に一気に打って、あとから行に分ける。分かれ方はその場で下に出し、外れたところは押して直す */
export function BatchBar(p: Props) {
  const [text, setTextRaw] = useState(() => readDraft(p.draftKey));
  const setText = (v: string) => {
    setTextRaw(v);
    writeDraft(p.draftKey, v);
  };
  const area = useRef<HTMLTextAreaElement>(null);
  const prev = useRef<HTMLOListElement>(null);
  const fixed = useRef(false);
  const r = useMemo(() => parseQuick(text, p.cast, p.ctx), [text, p.cast, p.ctx]);
  const init = useMemo(() => initialState(r.cast), [r.cast]);
  const speaking = p.cast.filter((c) => c.kind !== 'set');
  const mac = useMemo(() => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform), []);

  // 打った分だけ欄を伸ばす（上限は CSS）。分かれ方は最後の行が見えるように
  useEffect(() => {
    const el = area.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    }
    // 打っているときは最後の行を見せる。直したときは、直した行から動かさない
    const pv = prev.current;
    if (pv && !fixed.current) pv.scrollTop = pv.scrollHeight;
    fixed.current = false;
  }, [text]);

  /** 割り振りを直す：文章のほうを書き換える（直した結果も文章に残る） */
  const fix = (i: number, f: QuickFix) => {
    const t = fixQuick(text, p.cast, p.ctx, i, f);
    if (t == null) return;
    fixed.current = true;
    setText(t);
  };
  /** 押してもキーボードを閉じない */
  const keep = (e: React.PointerEvent) => e.preventDefault();
  const canSwap = speaking.length > 1;

  const send = () => {
    if (!r.items.length) return;
    if (p.onSubmit(text)) setText('');
    area.current?.focus();
  };

  const label = (it: Item) => {
    if (it.t === 'move') return `${member(r.cast, it.w)?.name ?? '?'} ${it.in ? '出' : 'ハケ'}`;
    return chipLook(r.cast, it, init).text;
  };

  return (
    <div className="batchbar">
      <div className="bhead">
        <span className="nums" aria-label="役の番号">
          {speaking.map((c, i) => (
            <span key={c.id} style={{ '--c': c.color } as React.CSSProperties}>
              <i>{i + 1}</i>
              {c.name}
            </span>
          ))}
        </span>
        <button className="one" onClick={p.onClose} title="1行ずつ打つ欄に戻る">
          1行ずつ
        </button>
      </div>
      <div className="bbody">
        <textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          rows={4}
          spellCheck={false}
          placeholder={'ネタを続けて打つ。雑でいい\n改行か空白で話者が交代。外れたら下の名前を押して直す\n（ト書き　、、＝間　暗転　SE：拍手\n1 セリフ＝番号の役が話す'}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        {r.items.length > 0 && (
          <ol className="bprev" ref={prev} aria-label="台本に入る形">
            {r.items.map((it, i) => {
              const before = r.items[i - 1];
              const join = (before?.t === 'line' || before?.t === 'act') && (
                <button className="fx" onPointerDown={keep} onClick={() => fix(i, 'join')} title="前の行につなぐ" aria-label="前の行につなぐ">
                  ⤴
                </button>
              );
              if (it.t === 'line') {
                const m = member(r.cast, it.w);
                return (
                  <li key={it.id} className="l">
                    <button
                      className="who"
                      style={{ color: m?.color }}
                      disabled={!canSwap}
                      onPointerDown={keep}
                      onClick={() => fix(i, 'speaker')}
                      title="押すと話者が替わる"
                    >
                      {m?.name ?? '?'}
                      {r.added.includes(it.w) ? '（新しい役）' : ''}
                    </button>
                    <span className="x">{it.x}</span>
                    <button className="fx" onPointerDown={keep} onClick={() => fix(i, 'kind')} title="動き（ト書き）にする" aria-label="動きにする">
                      （）
                    </button>
                    {join}
                  </li>
                );
              }
              if (it.t === 'act')
                return (
                  <li key={it.id} className="a">
                    <span className="x">
                      （{it.w ? `${member(r.cast, it.w)?.name ?? ''}、` : ''}
                      {it.x}）
                    </span>
                    <button className="fx" onPointerDown={keep} onClick={() => fix(i, 'kind')} title="セリフにする" aria-label="セリフにする">
                      「」
                    </button>
                    {join}
                  </li>
                );
              return (
                <li key={it.id} className="c">
                  <span>{label(it)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <div className="bfoot">
        <span className="next">
          {r.next && member(r.cast, r.next) ? (
            <>
              次の行：<b style={{ color: member(r.cast, r.next)?.color }}>{member(r.cast, r.next)?.name}</b>
            </>
          ) : null}
        </span>
        <button className="send" onClick={send} disabled={!r.items.length}>
          台本に入れる{r.items.length ? `（${r.items.length}）` : ''}
          <kbd>{mac ? '⌘' : 'Ctrl'}↵</kbd>
        </button>
      </div>
    </div>
  );
}
