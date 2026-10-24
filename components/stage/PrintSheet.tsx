import { exportScript, lineOfItem, triggerOf } from '../../lib/stage/export';
import { soundRegistry } from '../../lib/stage/bridge';
import { circled } from '../../lib/stage/export';
import { timeline } from '../../lib/stage/timing';
import type { Doc } from '../../lib/stage/types';

/** 印刷・PDF 用。A4 の表紙と本文（コントは「本文｜きっかけと音響・照明」の2列）。画面では隠れ、印刷のときだけ出る */
export function PrintSheet({ doc }: { doc: Doc }) {
  const tl = timeline(doc.items);
  const chars = doc.items.reduce((n, it) => n + (it.t === 'line' || it.t === 'act' ? [...it.x.replace(/\s/g, '')].length : 0), 0);
  const min = Math.floor(tl.total / 60);
  const sec = Math.round(tl.total % 60);
  const perf = (id?: string) => doc.performers?.find((x) => x.id === id)?.name || '未定';
  const people = doc.cast.filter((c) => c.kind === 'puppet' || (c.kind === 'prop' && !c.id.startsWith('set-')));
  const reg = soundRegistry(doc);
  const nums = Object.keys(reg).map(Number).sort((a, b) => a - b);
  const costumes = people.filter((c) => doc.assign?.[c.id]?.costume);
  const board = exportScript(doc, { marks: false, time: false })
    .split('\n')
    .find((l) => l.startsWith('【板付き】'));
  const rows = doc.items.map((it, i) => ({ it, line: lineOfItem(doc, i, false), i }));
  const isBody = (t: string) => t === 'line' || t === 'act';

  return (
    <div className="print-sheet">
      <div className="print-page print-cover">
        <h1 className="print-cover-title">{doc.title || '無題の台本'}</h1>
        <div className="print-cover-meta">
          <div className="print-cover-meta-item">
            <strong>種別：</strong> {doc.genre}
          </div>
          <div className="print-cover-meta-item">
            <strong>ユニット名：</strong> {doc.unit}
          </div>
          {doc.university && (
            <div className="print-cover-meta-item">
              <strong>所属：</strong> {doc.university}
            </div>
          )}
          <div className="print-cover-meta-item">
            <strong>演者一覧：</strong> {doc.performers?.map((x) => `${x.name} (${x.grade || '学年未登録'})`).join(' / ') || '未設定'}
          </div>
          <div className="print-cover-meta-item">
            <strong>登場人物（配役）：</strong>{' '}
            {people.map((c) => `${c.name} (${c.kind === 'puppet' ? perf(doc.assign?.[c.id]?.performerId) : '小道具'})`).join(' / ') || '未設定'}
          </div>
          {nums.length > 0 && (
            <div className="print-cover-meta-item">
              <strong>音源トラックリスト：</strong>
              <ul style={{ listStyleType: 'none', marginTop: '2mm' }}>
                {nums.map((n) => (
                  <li key={n} style={{ fontSize: '10pt', marginBottom: '1mm' }}>
                    <strong>
                      {doc.unit}
                      {circled(n)}
                    </strong>
                    ：{reg[n]}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(doc.tools || doc.bringIns || doc.costumes || costumes.length > 0) && (
            <div style={{ marginTop: '5mm', fontSize: '11pt' }}>
              <strong>【大道具・演出情報】</strong>
              {doc.tools && <p style={{ marginLeft: '2mm', fontSize: '10pt' }}>・使用道具：{doc.tools}</p>}
              {doc.bringIns && <p style={{ marginLeft: '2mm', fontSize: '10pt' }}>・持ち込み物：{doc.bringIns}</p>}
              {costumes.length > 0 && (
                <div style={{ marginLeft: '2mm', fontSize: '10pt' }}>
                  <strong>・衣装：</strong>
                  {costumes.map((c) => (
                    <div key={c.id} style={{ paddingLeft: '4mm' }}>
                      <b>
                        {c.name} ({perf(doc.assign?.[c.id]?.performerId)})
                      </b>
                      ：{doc.assign?.[c.id]?.costume}
                    </div>
                  ))}
                </div>
              )}
              {doc.costumes && <p style={{ marginLeft: '2mm', fontSize: '10pt' }}>・衣装（全体）：{doc.costumes}</p>}
            </div>
          )}
          <div className="print-cover-meta-item" style={{ marginTop: '5mm' }}>
            <strong>想定時間：</strong> 約{min}分{sec}秒 ({chars}文字)
          </div>
        </div>
      </div>

      <div className="print-page" style={{ paddingTop: '10mm' }}>
        <div className="print-header">
          <span>
            台本：{doc.title} ({doc.genre})
          </span>
          <span>ユニット：{doc.unit}</span>
        </div>
        {board && <p className="print-line">{board}</p>}
        {doc.genre === 'コント' ? (
          <table className="print-table">
            <thead>
              <tr>
                <th className="print-table-col-main">台本本文 (セリフ・動き)</th>
                <th className="print-table-col-cue">きっかけ ＆ 音響・照明・出ハケ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ it, line, i }) =>
                line == null ? null : isBody(it.t) ? (
                  <tr key={it.id}>
                    <td className="print-table-col-main">{it.t === 'line' ? <strong>{line}</strong> : <span className="print-line-stage">{line}</span>}</td>
                    <td className="print-table-col-cue" />
                  </tr>
                ) : (
                  <tr key={it.id} style={{ background: '#fcfcfc' }}>
                    <td className="print-table-col-main" style={{ color: '#aaa', fontSize: '9pt' }}>
                      ―
                    </td>
                    <td className="print-table-col-cue">
                      <div className={it.t === 'light' ? 'print-line-light' : it.t === 'cue' || it.t === 'se' ? 'print-line-sound' : ''}>{line}</div>
                      <div style={{ fontSize: '8pt', color: '#666' }}>きっかけ：{triggerOf(doc, i, false)}</div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        ) : (
          <div className="print-line-list">
            {rows.map(({ it, line }) =>
              line == null ? null : (
                <div key={it.id} className={`print-line${it.t === 'act' ? ' print-line-stage' : ''}`}>
                  {it.t === 'line' ? (
                    <strong>{line}</strong>
                  ) : it.t === 'light' ? (
                    <span className="print-line-light">{line}</span>
                  ) : it.t === 'cue' || it.t === 'se' ? (
                    <span className="print-line-sound">{line}</span>
                  ) : (
                    line
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
