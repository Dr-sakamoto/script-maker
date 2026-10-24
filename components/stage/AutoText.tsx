/** 中身に合わせて伸びる入力（折り返す）。幅と高さは隠した写しで決める */
export function AutoText(p: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  onEnter?: () => void;
}) {
  return (
    <span className="grow" data-v={p.value || p.placeholder || ''}>
      <textarea
        rows={1}
        cols={1}
        className={`autotext ${p.className ?? ''}`}
        value={p.value}
        placeholder={p.placeholder}
        autoFocus={p.autoFocus}
        onFocus={p.onFocus}
        onChange={(e) => p.onChange(e.target.value.replace(/\n/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            p.onEnter ? p.onEnter() : (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
    </span>
  );
}
