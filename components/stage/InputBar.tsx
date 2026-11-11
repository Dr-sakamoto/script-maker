import { useEffect, useRef, useState } from 'react';
import { member } from '../../lib/stage/cast';
import type { CastMember, Role } from '../../lib/stage/types';

type Props = {
  cast: CastMember[];
  role: Role;
  kind: 'line' | 'act';
  onRole: (r: Role) => void;
  onKind: (k: 'line' | 'act') => void;
  onSubmit: (text: string) => void;
  onMa: () => void;
  onSE: (text: string) => void;
  /** 役チップの「＋」：新しい役 */
  onAddRole: (name: string) => void;
  /** 役チップの長押し：名前を変える */
  onRename: (r: Role, name: string) => void;
  autoFocus?: boolean;
  /** 打ちかけの文字をこの名前で端末にとっておく（モードを切り替えても、開き直しても残る） */
  draftKey?: string;
  /** まとめ書き（大きな欄に一気に打つ）へ切り替える */
  onBatch?: () => void;
};

const draftName = (k: string) => `stage:draft:${k}`;
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

/** 指で触る端末か（キーボードの近道の案内を出し分ける） */
function useCoarse() {
  const [v, setV] = useState(false);
  useEffect(() => setV(matchMedia('(pointer: coarse)').matches), []);
  return v;
}

export function InputBar(p: Props) {
  const [text, setTextRaw] = useState(() => readDraft(p.draftKey));
  const setText = (v: string) => {
    setTextRaw(v);
    writeDraft(p.draftKey, v);
  };
  const coarse = useCoarse();
  const input = useRef<HTMLInputElement>(null);
  const m = member(p.cast, p.role);
  // 打てる役：人形と、声を出す小道具（大道具は話さない）
  const roles = p.cast.filter((c) => c.kind === 'puppet' || c.kind === 'prop');
  const order = roles.map((c) => c.id);
  const send = () => {
    if (!text.trim()) return;
    p.onSubmit(text.trim());
    setText('');
  };
  /** チップを触ってもキーボードを閉じない */
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();

  const press = useRef<{ t: number; fired: boolean } | null>(null);
  const roleDown = (c: CastMember) => (e: React.PointerEvent) => {
    keep(e);
    const t = window.setTimeout(() => {
      if (press.current) press.current.fired = true;
      navigator.vibrate?.(15);
      const name = prompt('役の名前', c.name)?.trim();
      if (name && name !== c.name) p.onRename(c.id, name);
    }, 500);
    press.current = { t, fired: false };
  };
  const roleUp = (c: CastMember) => () => {
    const pr = press.current;
    press.current = null;
    if (!pr) return;
    clearTimeout(pr.t);
    if (!pr.fired) p.onRole(c.id);
  };
  const roleCancel = () => {
    if (press.current) clearTimeout(press.current.t);
    press.current = null;
  };

  const hint = coarse ? '' : '　Enter 次へ・Tab 話者・Alt 「」⇔（）';
  const what = p.kind === 'line' ? 'セリフ' : '動き';

  return (
    <div className="inputbar">
      <div className="roles" role="radiogroup" aria-label="話者">
        {roles.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={c.id === p.role}
            className={`rolechip${c.id === p.role ? ' on' : ''}${c.kind === 'prop' ? ' prop' : ''}`}
            style={{ '--c': c.color } as React.CSSProperties}
            onPointerDown={roleDown(c)}
            onPointerUp={roleUp(c)}
            onPointerLeave={roleCancel}
            onPointerCancel={roleCancel}
            onContextMenu={(e) => e.preventDefault()}
            title="タップで話者・長押しで名前"
          >
            {c.name}
          </button>
        ))}
        <button
          className="rolechip add"
          aria-label="役を足す"
          onPointerDown={keep}
          onClick={() => {
            const name = prompt('新しい役の名前')?.trim();
            if (name) p.onAddRole(name);
            input.current?.focus();
          }}
        >
          ＋
        </button>
        {p.onBatch && (
          <button className="rolechip batch" onPointerDown={keep} onClick={p.onBatch} title="大きな欄に一気に打って、あとから行に分ける">
            ≡ まとめ書き
          </button>
        )}
      </div>
      <div className="typing">
        <button
          className="kind"
          onPointerDown={keep}
          onClick={() => p.onKind(p.kind === 'line' ? 'act' : 'line')}
          title={p.kind === 'line' ? 'セリフ（押すと動き）' : '動き（押すとセリフ）'}
        >
          {p.kind === 'line' ? (m?.kind === 'prop' ? '『』' : '「」') : '（）'}
        </button>
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`${m?.name ?? ''}の${what}${hint}`}
          autoFocus={p.autoFocus}
          enterKeyHint="send"
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              send();
            } else if (e.key === 'Tab') {
              // これまでのエディタと同じ：Tab で次の話者、Shift+Tab で前の話者
              e.preventDefault();
              const d = e.shiftKey ? order.length - 1 : 1;
              p.onRole(order[(order.indexOf(p.role) + d) % order.length]);
            } else if (e.key === 'Alt') {
              // Alt でセリフ ⇔ 動き
              e.preventDefault();
              p.onKind(p.kind === 'line' ? 'act' : 'line');
            }
          }}
        />
        {coarse && (
          <button className="send" onPointerDown={keep} onClick={send} disabled={!text.trim()} aria-label="入れる">
            ↵
          </button>
        )}
        <button className="ma" onPointerDown={keep} onClick={p.onMa} title="間">
          ・・
        </button>
        <button
          className="se"
          title="SE"
          onPointerDown={keep}
          onClick={() => {
            p.onSE(text.trim());
            setText('');
          }}
        >
          SE
        </button>
      </div>
    </div>
  );
}
