import { useState } from 'react';
import { member } from '../model/cast';
import type { CastMember, Role } from '../model/types';

type Props = {
  cast: CastMember[];
  role: Role;
  kind: 'line' | 'act';
  onRole: (r: Role) => void;
  onKind: (k: 'line' | 'act') => void;
  onSubmit: (text: string) => void;
  onMa: () => void;
  onSE: (text: string) => void;
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
        placeholder={p.kind === 'line' ? `${m?.name ?? ''}のセリフ` : '動き'}
        enterKeyHint="send"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            send();
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
