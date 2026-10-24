import { useState } from 'react';
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
  autoFocus?: boolean;
};

export function InputBar(p: Props) {
  const [text, setText] = useState('');
  const m = member(p.cast, p.role);
  const order = p.cast.map((c) => c.id);
  const send = () => {
    if (!text.trim()) return;
    p.onSubmit(text.trim());
    setText('');
  };
  return (
    <div className="inputbar">
      <button
        className="face"
        style={{ background: m?.color }}
        title={m?.name}
        onClick={() => p.onRole(order[(order.indexOf(p.role) + 1) % order.length])}
      >
        {m?.short}
      </button>
      <button className="kind" onClick={() => p.onKind(p.kind === 'line' ? 'act' : 'line')} title={p.kind === 'line' ? 'セリフ' : '動き'}>
        {p.kind === 'line' ? (m?.kind === 'prop' ? '『』' : '「」') : '（）'}
      </button>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={p.kind === 'line' ? `${m?.name ?? ''}のセリフ　Enter 次へ・Tab 話者・Alt 「」⇔（）` : `${m?.name ?? ''}の動き　Enter 次へ・Tab 話者・Alt 「」⇔（）`}
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
      <button className="ma" onClick={p.onMa} title="間">
        ・・
      </button>
      <button
        className="se"
        title="SE"
        onClick={() => {
          p.onSE(text.trim());
          setText('');
        }}
      >
        SE
      </button>
    </div>
  );
}
