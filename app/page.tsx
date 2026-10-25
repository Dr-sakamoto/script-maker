"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Unit, Performer, ScriptItem, NetaType, Sound, Character } from '../lib/types';
import { loadLocalUnits, saveLocalUnits, loadLocalScripts, saveLocalScripts, exportBackup, importBackup } from '../lib/storage';

type ViewMode = 'home' | 'unitSetup' | 'performerSetup' | 'scriptSetup';

const netaTypes: NetaType[] = ['漫才', 'コント', 'ピン'];

function generateId() {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).substring(2, 9)}`;
}

const STAGE_COLORS = ['#d9822b', '#c2507d', '#3f88c5', '#4a9b5e', '#8a63d2', '#c9a227', '#d0453a', '#5d6b7a'];

/** 舞台（/stage）での見た目：人形の色と、人形か小道具か。見た目は全員共通で色だけ変わる */
function StageLook({ char, chars, index, onChange }: { char: Character; chars: Character[]; index: number; onChange: (patch: Partial<Character>) => void }) {
  const others = chars.filter((o) => o.id !== char.id && o.kind !== 'prop');
  return (
    <div className="flex items-center gap-2 text-[10px] text-slate-400">
      <span>舞台</span>
      <input
        type="color"
        value={char.color || STAGE_COLORS[index % STAGE_COLORS.length]}
        onChange={(e) => onChange({ color: e.target.value })}
        className="h-5 w-7 cursor-pointer rounded border border-slate-800 bg-transparent p-0"
        title="人形の色"
      />
      <select
        value={char.kind === 'prop' ? `prop:${char.holder ?? ''}` : 'puppet'}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === 'puppet' ? { kind: undefined, holder: undefined } : { kind: 'prop', holder: v.slice(5) || undefined });
        }}
        className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[10px] text-slate-400 focus:border-violet-500 focus:outline-none"
      >
        <option value="puppet">人形</option>
        {others.map((o) => (
          <option key={o.id} value={`prop:${o.id}`}>
            {o.name || 'キャラ'}が持つ小道具
          </option>
        ))}
      </select>
    </div>
  );
}

export default function HomePage() {
  const [view, setView] = useState<ViewMode>('home');
  const [units, setUnits] = useState<Unit[]>([]);
  const [scripts, setScripts] = useState<ScriptItem[]>([]);

  // Active UI IDs
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  // Creation States
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitUniversity, setNewUnitUniversity] = useState('');
  const [newPerformerName, setNewPerformerName] = useState('');
  const [newPerformerGrade, setNewPerformerGrade] = useState('');

  // Script Settings State
  const [scriptTitle, setScriptTitle] = useState('');
  const [scriptNetaType, setScriptNetaType] = useState<NetaType>('漫才');
  const [scriptCharacters, setScriptCharacters] = useState<Character[]>([]);
  const [scriptSounds, setScriptSounds] = useState<Sound[]>([]);
  const [scriptTools, setScriptTools] = useState('');
  const [scriptBringIns, setScriptBringIns] = useState('');
  const [scriptCostumes, setScriptCostumes] = useState('');

  const [status, setStatus] = useState('準備完了');

  // Memos
  const selectedUnit = useMemo(() => units.find((u) => u.id === selectedUnitId) ?? null, [units, selectedUnitId]);

  // Filter scripts by unit
  const filteredScripts = useMemo(() => {
    if (!selectedUnitId) return [];
    return scripts.filter((s) => s.unitId === selectedUnitId);
  }, [scripts, selectedUnitId]);

  // Load Data
  useEffect(() => {
    loadData();
  }, []);

  // Save changes to local storage
  useEffect(() => {
    if (units.length > 0) {
      saveLocalUnits(units);
    }
  }, [units]);

  useEffect(() => {
    if (scripts.length > 0) {
      saveLocalScripts(scripts);
    }
  }, [scripts]);

  async function loadData() {
    setStatus('データを読み込み中…');
    // Load local storage first
    const localUnits = loadLocalUnits();
    const localScripts = loadLocalScripts();

    setUnits(localUnits);
    setScripts(localScripts);

    if (!supabase) {
      setStatus('ローカル保存モード (クラウド未接続)');
      return;
    }

    try {
      const [unitsRes, scriptsRes] = await Promise.all([
        supabase.from('units').select('*'),
        supabase.from('scripts').select('*'),
      ]);

      if (unitsRes.error) throw unitsRes.error;
      if (scriptsRes.error) throw scriptsRes.error;

      // Merge local with db if needed, or prefer db.
      // For MVP simplicity, if cloud data exists, we load it, else stick to local.
      if (unitsRes.data && unitsRes.data.length > 0) {
        // We need to fetch performers for each unit
        const performersRes = await supabase.from('performers').select('*');
        const dbUnits = unitsRes.data.map((u: any) => ({
          id: u.id,
          name: u.name,
          university: u.university ?? undefined,
          performers: performersRes.data
            ? performersRes.data.filter((p: any) => p.unit_id === u.id).map((p: any) => ({
              id: p.id,
              name: p.name,
              grade: p.grade ?? undefined,
            }))
            : [],
        }));
        setUnits(dbUnits);
        saveLocalUnits(dbUnits);
      }

      if (scriptsRes.data && scriptsRes.data.length > 0) {
        // Fetch characters and sounds
        const [charsRes, soundsRes] = await Promise.all([
          supabase.from('characters').select('*'),
          supabase.from('sounds').select('*'),
        ]);

        const dbScripts = scriptsRes.data.map((s: any) => ({
          id: s.id,
          unitId: s.unit_id,
          title: s.title,
          netaType: s.neta_type as NetaType,
          tools: s.tools ?? '',
          bringIns: s.bring_ins ?? '',
          costumes: s.costumes ?? '',
          blocks: s.blocks ?? [],
          characters: charsRes.data
            ? charsRes.data.filter((c: any) => c.script_id === s.id).map((c: any) => ({
              id: c.id,
              name: c.name,
              performerId: c.performer_id ?? '',
              costume: c.costume ?? '',
            }))
            : [],
          sounds: soundsRes.data
            ? soundsRes.data.filter((sound: any) => sound.unit_id === s.unit_id).map((sound: any) => ({
              id: sound.id,
              unitId: s.unit_id,
              index: sound.index,
              name: sound.name,
            }))
            : [],
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        }));
        // 舞台（/stage）の項目と人形の色はローカルにだけあるので、手元の分を残す
        const merged = dbScripts.map((s: ScriptItem) => {
          const local = localScripts.find((l) => l.id === s.id);
          if (!local) return s;
          return {
            ...s,
            stage: local.stage,
            characters: s.characters.map((c) => ({ ...local.characters.find((lc) => lc.id === c.id), ...c })),
          };
        });
        setScripts(merged);
        saveLocalScripts(merged);
      }
      setStatus('クラウド同期完了');
    } catch (error) {
      console.error(error);
      setStatus('ローカル保存モード (クラウド同期エラー)');
    }
  }

  // Backup handlers
  function handleBackupExport() {
    exportBackup(units, scripts);
    setStatus('バックアップファイルをダウンロードしました');
  }

  function handleBackupImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        const imported = importBackup(result);
        if (imported) {
          setUnits(imported.units);
          setScripts(imported.scripts);
          saveLocalUnits(imported.units);
          saveLocalScripts(imported.scripts);
          setStatus('バックアップデータを正常にインポートしました');
        } else {
          setStatus('インポートに失敗しました。正しいファイル形式か確認してください。');
        }
      }
    };
    reader.readAsText(file);
  }

  // Unit setup handlers
  function startUnitSetup() {
    setNewUnitName('');
    setNewUnitUniversity('');
    setView('unitSetup');
  }

  async function createUnit() {
    if (!newUnitName.trim()) return;
    try {
      setStatus('ユニットを作成中…');
      const unitId = generateId();

      if (supabase) {
        const { error } = await supabase.from('units').insert({
          id: unitId,
          name: newUnitName,
          university: newUnitUniversity || null,
        });
        if (error) throw error;
      }

      const newUnit: Unit = {
        id: unitId,
        name: newUnitName,
        university: newUnitUniversity || undefined,
        performers: [],
      };

      const nextUnits = [...units, newUnit];
      setUnits(nextUnits);
      saveLocalUnits(nextUnits);
      setSelectedUnitId(unitId);
      setView('performerSetup');
      setStatus('ユニットを作成しました。演者を追加してください。');
    } catch (error) {
      setStatus('作成に失敗しました');
      console.error(error);
    }
  }

  async function addPerformer() {
    if (!selectedUnitId || !newPerformerName.trim()) return;
    try {
      setStatus('演者を追加中…');
      const performerId = generateId();

      if (supabase) {
        const { error } = await supabase.from('performers').insert({
          id: performerId,
          unit_id: selectedUnitId,
          name: newPerformerName,
          grade: newPerformerGrade || null,
        });
        if (error) throw error;
      }

      const nextUnits = units.map((unit) =>
        unit.id === selectedUnitId
          ? {
            ...unit,
            performers: [
              ...(unit.performers ?? []),
              {
                id: performerId,
                name: newPerformerName,
                grade: newPerformerGrade || undefined,
              },
            ],
          }
          : unit
      );

      setUnits(nextUnits);
      saveLocalUnits(nextUnits);
      setNewPerformerName('');
      setNewPerformerGrade('');
      setStatus('演者を追加しました');
    } catch (error) {
      setStatus('追加に失敗しました');
      console.error(error);
    }
  }

  // Script setup handlers
  function startScriptSetup() {
    setScriptTitle('');
    setScriptNetaType('コント');
    setScriptCharacters([{ id: generateId(), name: '演者A', performerId: '', costume: '' }]);
    setScriptSounds([]);
    setScriptTools('');
    setScriptBringIns('');
    setScriptCostumes('');
    setView('scriptSetup');
  }

  async function createScript() {
    if (!selectedUnitId || !scriptTitle.trim()) return;
    try {
      setStatus('台本を作成中…');
      const scriptId = generateId();

      const newScript: ScriptItem = {
        id: scriptId,
        unitId: selectedUnitId,
        title: scriptTitle,
        netaType: scriptNetaType,
        characters: scriptCharacters.map((c) => ({
          ...c,
          id: c.id || generateId(),
          name: c.name || 'キャラ',
          performerId: c.performerId,
          costume: c.costume || '',
        })),
        sounds: scriptSounds.map((s) => ({
          id: s.id || generateId(),
          unitId: selectedUnitId,
          index: s.index,
          name: s.name || '効果音',
        })),
        blocks: [],
        tools: scriptTools,
        bringIns: scriptBringIns,
        costumes: scriptCostumes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (supabase) {
        const { error } = await supabase.from('scripts').insert({
          id: scriptId,
          unit_id: selectedUnitId,
          title: scriptTitle,
          neta_type: scriptNetaType,
          blocks: [],
          tools: scriptTools || null,
          bring_ins: scriptBringIns || null,
          costumes: scriptCostumes || null,
        });
        if (error) throw error;

        // Insert characters
        if (newScript.characters.length > 0) {
          await supabase.from('characters').insert(
            newScript.characters.map((c) => ({
              id: c.id,
              script_id: scriptId,
              name: c.name,
              performer_id: c.performerId || null,
              costume: c.costume || null,
            }))
          );
        }
        // Insert sounds
        if (newScript.sounds.length > 0) {
          await supabase.from('sounds').insert(
            newScript.sounds.map((s) => ({
              id: s.id,
              unit_id: selectedUnitId,
              index: s.index,
              name: s.name,
            }))
          );
        }
      }

      const nextScripts = [...scripts, newScript];
      setScripts(nextScripts);
      saveLocalScripts(nextScripts);
      setStatus('台本を作成しました');
      // 作ったらそのまま舞台でつくる
      window.location.href = `/stage?id=${scriptId}&mode=make`;
    } catch (error) {
      setStatus('作成に失敗しました');
      console.error(error);
    }
  }

  // Delete script
  async function deleteScript(id: string) {
    if (!confirm('本当にこの台本を削除しますか？')) return;
    try {
      setStatus('台本を削除中…');
      if (supabase) {
        const { error } = await supabase.from('scripts').delete().eq('id', id);
        if (error) throw error;
      }
      const nextScripts = scripts.filter((s) => s.id !== id);
      setScripts(nextScripts);
      saveLocalScripts(nextScripts);
      setStatus('台本を削除しました');
    } catch (e) {
      console.error(e);
      setStatus('削除に失敗しました');
    }
  }

  return (
    <>
      {/* SCREEN UI */}
      <main className="screen-only min-h-screen bg-slate-900 text-slate-100 flex flex-col transition-all duration-300">

        {/* Header */}
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 py-4 sticky top-0 z-40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-violet-600 to-indigo-500 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/10">
              <span className="font-black text-xl text-white">台</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-violet-200 to-slate-200 bg-clip-text text-transparent">
                芸人向け台本制作エディタ <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-normal">MVP v1.0</span>
              </h1>
              <p className="text-xs text-slate-400">大学お笑い・学生芸人・NOROSHIに最適化されたスマート台本ツール</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
              {status}
            </span>
          </div>
        </header>

        {/* Home View */}
        {view === 'home' && (
          <div className="max-w-7xl mx-auto w-full px-6 py-8 flex-1 flex flex-col justify-start">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-100">マイユニット</h2>
                <p className="text-sm text-slate-400">お笑いユニット（コンビ・トリオ・ピン）を選択して台本を作成・管理します。</p>
              </div>
              <button
                onClick={startUnitSetup}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-violet-500/10 transition duration-150 text-sm"
              >
                新規ユニット作成
              </button>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-10">
              {units.length === 0 ? (
                <div className="col-span-full rounded-2xl border-2 border-dashed border-slate-800 p-12 text-center text-slate-500 bg-slate-950/20">
                  <svg className="mx-auto h-12 w-12 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p className="text-base font-semibold text-slate-400">ユニットがまだありません</p>
                  <p className="text-xs text-slate-500 mt-1">最初のコンビやピンの情報を登録しましょう。</p>
                </div>
              ) : (
                units.map((unit) => (
                  <div
                    key={unit.id}
                    className={`rounded-2xl border p-6 text-left transition duration-200 cursor-pointer relative group ${selectedUnitId === unit.id
                        ? 'border-violet-500 bg-violet-950/20 shadow-md shadow-violet-500/5'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/60'
                      }`}
                    onClick={() => setSelectedUnitId(unit.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-100 group-hover:text-violet-300 transition duration-150">{unit.name}</h3>
                        <p className="text-xs text-slate-400 mt-1">{unit.university || '所属大学未登録'}</p>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400">
                        演者: {unit.performers?.length ?? 0}名
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1">
                      {unit.performers?.map((p) => (
                        <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-750">
                          {p.name} {p.grade && `(${p.grade})`}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Selected Unit Details & Scripts list */}
            {selectedUnit && (
              <div className="bg-slate-950/30 border border-slate-800 rounded-2xl p-6 mt-2 flex-1 flex flex-col md:flex-row gap-8">

                {/* Left side: Unit settings / performers */}
                <div className="md:w-1/3 border-b md:border-b-0 md:border-r border-slate-800 pb-6 md:pb-0 md:pr-8 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-200 flex items-center justify-between">
                      <span>{selectedUnit.name} の構成員</span>
                      <button
                        onClick={() => setView('performerSetup')}
                        className="text-xs text-violet-400 hover:text-violet-300 transition"
                      >
                        演者を追加 / 編集
                      </button>
                    </h3>
                    <div className="space-y-2.5 mt-4">
                      {selectedUnit.performers?.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">演者が登録されていません。</p>
                      ) : (
                        selectedUnit.performers?.map((p) => (
                          <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-sm">
                            <span className="font-semibold text-slate-300">{p.name}</span>
                            {p.grade && <span className="text-xs text-slate-500 bg-slate-950 px-2 py-0.5 rounded-md">{p.grade}</span>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-slate-800/80">
                    <button
                      onClick={startScriptSetup}
                      className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium px-4 py-3 rounded-xl shadow-lg shadow-violet-500/10 transition duration-150 text-sm flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      このユニットで新規ネタ作成
                    </button>
                  </div>
                </div>

                {/* Right side: Scripts list */}
                <div className="flex-1 flex flex-col">
                  <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center justify-between">
                    <span>作成した台本一覧</span>
                    <span className="text-xs font-normal text-slate-400">合計 {filteredScripts.length} 件</span>
                  </h3>

                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[350px] pr-2">
                    {filteredScripts.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-slate-500 bg-slate-900/10">
                        <p className="text-sm">このユニットの台本はまだありません。</p>
                        <button
                          onClick={startScriptSetup}
                          className="text-xs text-violet-400 hover:text-violet-300 font-semibold mt-2 underline"
                        >
                          最初の台本を作成
                        </button>
                      </div>
                    ) : (
                      filteredScripts.map((s) => (
                        <div
                          key={s.id}
                          className="bg-slate-900/60 border border-slate-850 hover:border-slate-700 rounded-xl p-4 flex items-center justify-between transition group"
                        >
                          <a href={`/stage?id=${s.id}&mode=make`} className="cursor-pointer flex-1 block">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-200 group-hover:text-violet-300 transition">{s.title}</h4>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.netaType === '漫才' ? 'bg-orange-950/60 text-orange-400 border border-orange-900/40' :
                                  s.netaType === 'コント' ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-900/40' :
                                    'bg-purple-950/60 text-purple-400 border border-purple-900/40'
                                }`}>
                                {s.netaType}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              登場人物: {s.characters.map((c) => c.name).join(', ') || '未設定'}
                            </p>
                          </a>

                          <div className="flex items-center gap-2">
                            <a
                              href={`/stage?id=${s.id}&mode=make`}
                              className="text-xs bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 font-medium px-3 py-1.5 rounded-lg border border-amber-900/50 transition"
                              title="人形劇をいじって台本をつくる"
                            >
                              つくる
                            </a>
                            <a
                              href={`/stage?id=${s.id}&mode=write`}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-3 py-1.5 rounded-lg border border-slate-750 transition"
                              title="台本を速記する"
                            >
                              かく
                            </a>
                            <a
                              href={`/stage?id=${s.id}&mode=hand`}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-3 py-1.5 rounded-lg border border-slate-750 transition"
                              title="書き出し・印刷"
                            >
                              わたす
                            </a>
                            <button
                              onClick={() => deleteScript(s.id)}
                              className="text-xs hover:bg-red-950 hover:text-red-400 text-slate-500 font-medium p-1.5 rounded-lg transition"
                              title="削除"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Global backup utilities in footer */}
            <div className="mt-auto pt-8 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 gap-4 flex-wrap">
              <span>大学お笑い台本ツール (Offline-ready with LocalStorage)</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBackupExport}
                  className="text-slate-400 hover:text-slate-200 transition underline flex items-center gap-1"
                >
                  バックアップ保存 (JSON)
                </button>
                <label className="text-slate-400 hover:text-slate-200 transition underline cursor-pointer flex items-center gap-1">
                  バックアップ読込 (JSON)
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleBackupImport}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Unit Setup View */}
        {view === 'unitSetup' && (
          <div className="max-w-md mx-auto w-full px-6 py-12 flex-1 flex flex-col justify-center">
            <div className="bg-slate-950/40 border border-slate-800 rounded-3xl p-8 shadow-xl">
              <h2 className="text-2xl font-bold text-slate-100">新規ユニット作成</h2>
              <p className="text-xs text-slate-400 mt-1">コンビ、トリオ、またはピン名などを登録します。</p>

              <div className="mt-6 space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-slate-300">ユニット名 *</span>
                  <input
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 focus:border-violet-500 focus:outline-none transition"
                    placeholder="例：ダウンタウン"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-slate-300">所属サークル（任意）</span>
                  <input
                    value={newUnitUniversity}
                    onChange={(e) => setNewUnitUniversity(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 focus:border-violet-500 focus:outline-none transition"
                    placeholder="例：〇〇大学落語研究会"
                  />
                </label>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={createUnit}
                    className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium px-4 py-3 rounded-xl transition duration-150 text-sm shadow-md"
                  >
                    作成して演者登録へ
                  </button>
                  <button
                    onClick={() => setView('home')}
                    className="flex-1 border border-slate-850 bg-slate-900 hover:bg-slate-850 text-slate-300 font-medium px-4 py-3 rounded-xl transition duration-150 text-sm"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Performer Setup View */}
        {view === 'performerSetup' && selectedUnit && (
          <div className="max-w-3xl mx-auto w-full px-6 py-12 flex-1 flex flex-col justify-start">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-100">{selectedUnit.name} - 演者登録</h2>
                <p className="text-sm text-slate-400">このお笑いユニットに所属する演者の芸名・学年を登録します。</p>
              </div>
              <button
                onClick={() => setView('home')}
                className="bg-slate-800 hover:bg-slate-705 text-slate-200 text-sm font-semibold px-5 py-2.5 rounded-xl border border-slate-750 transition"
              >
                登録完了して戻る
              </button>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              {/* Form card */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-3xl p-6 h-fit">
                <h3 className="font-bold text-slate-200 mb-4">新規演者追加</h3>

                <div className="space-y-4">
                  <label className="block space-y-1.5">
                    <span className="text-sm font-semibold text-slate-350">芸名 *</span>
                    <input
                      value={newPerformerName}
                      onChange={(e) => setNewPerformerName(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-slate-100 focus:border-violet-500 focus:outline-none transition text-sm"
                      placeholder="例：坂本"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-semibold text-slate-350">学年（任意）</span>
                    <input
                      value={newPerformerGrade}
                      onChange={(e) => setNewPerformerGrade(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-slate-100 focus:border-violet-500 focus:outline-none transition text-sm"
                      placeholder="例：3年"
                    />
                  </label>

                  <button
                    onClick={addPerformer}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-4 py-2.5 rounded-xl transition duration-150 border border-slate-700 text-sm shadow-md"
                  >
                    演者を追加する
                  </button>
                </div>
              </div>

              {/* List card */}
              <div className="bg-slate-950/20 border border-slate-800 rounded-3xl p-6 flex flex-col justify-start">
                <h3 className="font-bold text-slate-200 mb-4">現在のメンバー一覧</h3>

                <div className="space-y-3">
                  {(selectedUnit.performers ?? []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-slate-500">
                      <p className="text-xs">演者がまだいません。左側から追加してください。</p>
                    </div>
                  ) : (
                    (selectedUnit.performers ?? []).map((performer, pIdx) => (
                      <div key={performer.id} className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 flex items-center justify-between text-sm">
                        <div>
                          <span className="font-bold text-slate-200">{performer.name}</span>
                          {performer.grade && <span className="text-xs text-slate-500 ml-2">({performer.grade})</span>}
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm(`${performer.name} を削除しますか？`)) return;
                            try {
                              if (supabase) {
                                await supabase.from('performers').delete().eq('id', performer.id);
                              }
                              const nextUnits = units.map((u) => {
                                if (u.id === selectedUnit.id) {
                                  return {
                                    ...u,
                                    performers: u.performers.filter((p) => p.id !== performer.id),
                                  };
                                }
                                return u;
                              });
                              setUnits(nextUnits);
                              saveLocalUnits(nextUnits);
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="text-xs hover:text-red-400 text-slate-500 transition"
                        >
                          削除
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Script Setup / Basic settings View */}
        {view === 'scriptSetup' && selectedUnit && (
          <div className="max-w-4xl mx-auto w-full px-6 py-12 flex-1 flex flex-col justify-start">
            <h2 className="text-2xl font-bold text-slate-100 mb-6">新規台本の設定</h2>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Left Settings */}
              <div className="space-y-5 bg-slate-950/40 border border-slate-800 p-6 rounded-3xl">
                <h3 className="font-bold text-slate-200 mb-2 border-b border-slate-800 pb-2">基本設定</h3>

                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-slate-350">ネタ名 *</span>
                  <input
                    value={scriptTitle}
                    onChange={(e) => setScriptTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-slate-100 focus:border-violet-500 focus:outline-none transition text-sm"
                    placeholder="例：コンビニ"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-slate-355">ネタ種別 *</span>
                  <select
                    value={scriptNetaType}
                    onChange={(e) => setScriptNetaType(e.target.value as NetaType)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-slate-100 focus:border-violet-500 focus:outline-none transition text-sm"
                  >
                    {netaTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Character mapping */}
                <div className="space-y-2">
                  <span className="text-sm font-semibold text-slate-350 block">登場人物設定 (配役・衣装)</span>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {scriptCharacters.map((char, idx) => (
                      <div key={char.id} className="bg-slate-950/40 border border-slate-850 p-3 rounded-2xl space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={char.name}
                            onChange={(e) => {
                              const newChars = [...scriptCharacters];
                              newChars[idx].name = e.target.value;
                              setScriptCharacters(newChars);
                            }}
                            className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 focus:border-violet-500 focus:outline-none transition text-xs"
                            placeholder="キャラ名 (例: お父さん)"
                          />
                          <select
                            value={char.performerId}
                            onChange={(e) => {
                              const newChars = [...scriptCharacters];
                              newChars[idx].performerId = e.target.value;
                              setScriptCharacters(newChars);
                            }}
                            className="rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-2 text-slate-100 focus:border-violet-500 focus:outline-none transition text-xs"
                          >
                            <option value="">配役未指定</option>
                            {(selectedUnit.performers ?? []).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => setScriptCharacters((current) => current.filter((_, i) => i !== idx))}
                            className="rounded-xl bg-red-950/40 text-red-400 hover:bg-red-900/40 px-3 py-2 transition text-xs"
                          >
                            削除
                          </button>
                        </div>
                        <input
                          value={char.costume || ''}
                          onChange={(e) => {
                            const newChars = [...scriptCharacters];
                            newChars[idx].costume = e.target.value;
                            setScriptCharacters(newChars);
                          }}
                          className="w-full rounded-xl border border-slate-800/80 bg-slate-900/50 px-3 py-1.5 text-slate-200 focus:border-violet-500 focus:outline-none transition text-xs"
                          placeholder="衣装 (例: 青のTシャツ、黒のズボン)"
                        />
                        <StageLook
                          char={char}
                          chars={scriptCharacters}
                          index={idx}
                          onChange={(patch) => setScriptCharacters((cur) => cur.map((x, i) => (i === idx ? { ...x, ...patch } : x)))}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setScriptCharacters((current) => [...current, { id: generateId(), name: '', performerId: '', costume: '' }])}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 text-slate-300 px-4 py-2 transition text-xs text-center block border-dashed"
                  >
                    登場人物（配役）を追加
                  </button>
                </div>

                {/* Sound registration */}
                <div className="space-y-2">
                  <span className="text-sm font-semibold text-slate-350 block">音源トラック登録</span>
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                    {scriptSounds.map((sound, idx) => (
                      <div key={sound.id} className="flex gap-2">
                        <span className="flex items-center rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-slate-400 text-xs">
                          {selectedUnit.name}{sound.index}
                        </span>
                        <input
                          value={sound.name}
                          onChange={(e) => {
                            const newSounds = [...scriptSounds];
                            newSounds[idx].name = e.target.value;
                            setScriptSounds(newSounds);
                          }}
                          className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 focus:border-violet-500 focus:outline-none transition text-xs"
                          placeholder="音源名 (例: 出囃子, 爆発音)"
                        />
                        <button
                          onClick={() => setScriptSounds((current) => current.filter((_, i) => i !== idx))}
                          className="rounded-xl bg-red-950/40 text-red-400 hover:bg-red-900/40 px-3 py-2 transition text-xs"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setScriptSounds((current) => [
                      ...current,
                      { id: generateId(), unitId: selectedUnitId || '', index: (current.reduce((max, s) => s.index > max ? s.index : max, 0)) + 1, name: '' }
                    ])}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 text-slate-300 px-4 py-2 transition text-xs text-center block border-dashed"
                  >
                    音源トラックを追加
                  </button>
                </div>
              </div>

              {/* Right Settings */}
              <div className="space-y-5 bg-slate-950/40 border border-slate-800 p-6 rounded-3xl flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-200 mb-2 border-b border-slate-800 pb-2">演出情報（任意）</h3>

                  <div className="space-y-4">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-semibold text-slate-350">使用道具</span>
                      <textarea
                        value={scriptTools}
                        onChange={(e) => setScriptTools(e.target.value)}
                        rows={2}
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-slate-100 focus:border-violet-500 focus:outline-none transition text-xs"
                        placeholder="例：机×1、丸椅子×2"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-sm font-semibold text-slate-350">持ち込み物</span>
                      <textarea
                        value={scriptBringIns}
                        onChange={(e) => setScriptBringIns(e.target.value)}
                        rows={2}
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-slate-100 focus:border-violet-500 focus:outline-none transition text-xs"
                        placeholder="例：模造紙、ハリセン"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 pt-6 border-t border-slate-800 mt-6">
                  <button
                    onClick={createScript}
                    className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium px-4 py-3 rounded-xl transition duration-150 text-sm shadow-md"
                  >
                    作成してエディタへ
                  </button>
                  <button
                    onClick={() => setView('home')}
                    className="flex-1 border border-slate-850 bg-slate-900 hover:bg-slate-850 text-slate-300 font-medium px-4 py-3 rounded-xl transition duration-150 text-sm"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

    </>
  );
}
