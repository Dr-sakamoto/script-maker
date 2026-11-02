import { useEffect, useRef } from 'react';

/** 中身に合わせて伸びる入力（折り返す）。幅と高さは隠した写しで決める */
export function AutoText(p: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  onEnter?: () => void;
  /** 文の途中で Enter：その位置で行を分ける */
  onSplit?: (at: number) => void;
  /** 頭で Backspace：前の行につなげる */
  onMergePrev?: () => void;
  /** 値が変わるたびに、caret の位置にカーソルを置いてフォーカスする */
  focusKey?: number;
  caret?: number;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (p.focusKey == null || !ta.current) return;
    const el = ta.current;
    el.focus({ preventScroll: false });
    const at = Math.min(p.caret ?? el.value.length, el.value.length);
    el.setSelectionRange(at, at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focusKey]);
  return (
    <span className="autogrow" data-v={p.value || p.placeholder || ''}>
      <textarea
        ref={ta}
        rows={1}
        cols={1}
        className={`autotext ${p.className ?? ''}`}
        value={p.value}
        placeholder={p.placeholder}
        autoFocus={p.autoFocus}
        enterKeyHint={p.onSplit ? 'enter' : 'done'}
        onFocus={p.onFocus}
        onChange={(e) => p.onChange(e.target.value.replace(/\n/g, ''))}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          const el = e.target as HTMLTextAreaElement;
          const collapsed = el.selectionStart === el.selectionEnd;
          if (e.key === 'Enter') {
            e.preventDefault();
            const at = el.selectionStart;
            if (p.onSplit && collapsed && at > 0 && at < el.value.length) p.onSplit(at);
            else if (p.onEnter) p.onEnter();
            else el.blur();
          } else if (e.key === 'Backspace' && p.onMergePrev && collapsed && el.selectionStart === 0) {
            e.preventDefault();
            p.onMergePrev();
          }
        }}
      />
    </span>
  );
}
