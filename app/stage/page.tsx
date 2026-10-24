'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { chichiSample } from '../../lib/stage/chichi';
import { loadLocalScripts, loadLocalUnits, saveLocalScripts, saveLocalUnits } from '../../lib/storage';
import type { ScriptItem, Unit } from '../../lib/types';
import './stage.css';

// three.js はブラウザでだけ動かす
const StageApp = dynamic(() => import('../../components/stage/StageApp'), { ssr: false });

type Loaded = { script?: ScriptItem; unit?: Unit; scripts: ScriptItem[]; units: Unit[] };

/** /stage?id=<台本id>。台本・役・音源はネタ管理に登録したものを使う */
export default function StagePage() {
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    const scripts = loadLocalScripts();
    const units = loadLocalUnits();
    const script = scripts.find((s) => s.id === id);
    setData({ script, unit: units.find((u) => u.id === script?.unitId), scripts, units });
  }, []);

  if (!data) return <div className="stage-app" />;
  if (data.script) return <StageApp key={data.script.id} script={data.script} unit={data.unit} />;

  const addSample = () => {
    const { unit, script } = chichiSample();
    const units = loadLocalUnits();
    const scripts = loadLocalScripts();
    if (!units.some((u) => u.id === unit.id)) saveLocalUnits([...units, unit]);
    if (!scripts.some((s) => s.id === script.id)) saveLocalScripts([...scripts, script]);
    window.location.href = `/stage?id=${script.id}`;
  };

  return (
    <div className="stage-app picker">
      <header>
        <a className="docbtn" href="/" aria-label="ネタ一覧へ">
          ←
        </a>
        <b>舞台で開くネタ</b>
      </header>
      <main>
        {data.units.map((u) => {
          const list = data.scripts.filter((s) => s.unitId === u.id);
          if (!list.length) return null;
          return (
            <section key={u.id}>
              <h2>{u.name}</h2>
              {list.map((s) => (
                <a key={s.id} href={`/stage?id=${s.id}`}>
                  <span>{s.title || '無題'}</span>
                  <small>
                    {s.netaType}・{s.characters.map((c) => c.name).join('／')}
                  </small>
                </a>
              ))}
            </section>
          );
        })}
        {!data.scripts.length && <p className="hint">ネタがまだありません。ネタ一覧でユニットとネタを作ると、ここから舞台で開けます。</p>}
        <button onClick={addSample}>＋ サンプル『父』（サレルロブロ）を追加して開く</button>
      </main>
    </div>
  );
}
