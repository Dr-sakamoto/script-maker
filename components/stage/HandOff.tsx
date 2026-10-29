import { useMemo, useRef, useState } from 'react';
import { exportDoc, type ExportKind } from '../../lib/stage/export';
import { SCRIPT_FILE_ACCEPT } from '../../lib/stage/scriptFile';
import type { Doc } from '../../lib/stage/types';

const KINDS: { v: ExportKind; label: string }[] = [
  { v: 'script', label: '台本' },
  { v: 'sound', label: '音響キュー表' },
  { v: 'light', label: '照明キュー表' },
  { v: 'stage', label: '出ハケ表' },
];

/** 書き出し。ユニット名・種類・題・役はネタ管理の登録をそのまま使う */
export function HandOff(p: {
  doc: Doc;
  onImport: (file: File) => void;
  onPaste: (text: string) => void;
  onPrint: () => void;
  children?: React.ReactNode;
}) {
  const [kind, setKind] = useState<ExportKind>('script');
  const [marks, setMarks] = useState(true);
  const [time, setTime] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => exportDoc(p.doc, kind, { marks, time }), [p.doc, kind, marks, time]);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  /** 既存の台本を貼り付けて読み込む欄 */
  const [paste, setPaste] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ta.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const download = () => {
    const blob = new Blob([JSON.stringify({ items: p.doc.items }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${p.doc.title || 'script'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="handoff">
      {p.children}
      <div className="controls">
        <span className="seg">
          {KINDS.map((k) => (
            <button key={k.v} className={k.v === kind ? 'on' : ''} onClick={() => setKind(k.v)}>
              {k.label}
            </button>
          ))}
        </span>
        <label className="opt">
          <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} />
          ○●表記
        </label>
        <label className="opt">
          <input type="checkbox" checked={time} onChange={(e) => setTime(e.target.checked)} />
          時間を入れる
        </label>
        <button className="copy" onClick={copy}>
          {copied ? '✓ コピーした' : '⧉ コピー'}
        </button>
      </div>
      <textarea ref={ta} readOnly value={text} className="export" />
      <div className="files">
        <button onClick={p.onPrint}>🖨 印刷・PDF</button>
        <button onClick={download}>⇩ JSON</button>
        <button onClick={() => file.current?.click()} title="Word（.docx）・テキスト・JSON">
          ⇧ 台本を読み込む
        </button>
        <button onClick={() => setPaste(paste == null ? '' : null)}>📋 貼り付けて読み込む</button>
        <input
          ref={file}
          type="file"
          accept={SCRIPT_FILE_ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImport(f);
            e.target.value = '';
          }}
        />
      </div>
      {paste != null && (
        <div className="paste">
          <textarea
            autoFocus
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'既存の台本をここに貼り付ける\n\n例）\n【明転】\n親父「おう、帰ったか」\n母親：ただいま\n（親父、新聞を置く）\n【音源①】C.I『電話の音』'}
          />
          <div className="files">
            <button
              disabled={!paste.trim()}
              onClick={() => {
                p.onPaste(paste);
                setPaste(null);
              }}
            >
              読み込む
            </button>
            <button onClick={() => setPaste(null)}>やめる</button>
          </div>
        </div>
      )}
    </div>
  );
}
