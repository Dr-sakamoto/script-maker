"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Unit, Performer, ScriptItem, ScriptBlock, NetaType, CueTriggerType, Cue, Sound, Character } from '../lib/types';
import { loadLocalUnits, saveLocalUnits, loadLocalScripts, saveLocalScripts, exportBackup, importBackup } from '../lib/storage';

type ViewMode = 'home' | 'unitSetup' | 'performerSetup' | 'scriptSetup' | 'editor';

const soundCueOptions = ['C.I', 'F.I', 'C.O', 'F.O'];
const lightCueOptions = ['明転', '暗転', '徐々明転', '徐々暗転'];
const netaTypes: NetaType[] = ['漫才', 'コント', 'ピン'];

function generateId() {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).substring(2, 9)}`;
}

function createBlock(type: 'dialogue' | 'stage' | 'sound' | 'light', speaker?: string, text = ''): ScriptBlock {
  const block: ScriptBlock = {
    id: `${type}-${generateId()}`,
    type,
    speaker,
    text,
  };

  if (type === 'sound' || type === 'light') {
    block.cue = {
      fadeDuration: 4,
      triggerType: 'undefined',
      triggerText: '',
    };
  }

  return block;
}

export default function HomePage() {
  const [view, setView] = useState<ViewMode>('home');
  const [units, setUnits] = useState<Unit[]>([]);
  const [scripts, setScripts] = useState<ScriptItem[]>([]);

  // Active UI IDs
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);

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

  // Editor State
  const [blocks, setBlocks] = useState<ScriptBlock[]>([]);
  const [status, setStatus] = useState('準備完了');
  const [activeCueConfigId, setActiveCueConfigId] = useState<string | null>(null);
  const [editingSoundName, setEditingSoundName] = useState('');

  // Stopwatch State
  const [time, setTime] = useState(0);
  const [timerOn, setTimerOn] = useState(false);

  // Est Speed State (characters per minute)
  const [estimatedSpeed, setEstimatedSpeed] = useState(400);

  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Memos
  const selectedUnit = useMemo(() => units.find((u) => u.id === selectedUnitId) ?? null, [units, selectedUnitId]);
  const selectedScript = useMemo(() => scripts.find((s) => s.id === selectedScriptId) ?? null, [scripts, selectedScriptId]);
  const characterOptions = useMemo(() => scriptCharacters.map((c) => c.name).filter(Boolean), [scriptCharacters]);

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

  // Stopwatch effect
  useEffect(() => {
    if (timerOn) {
      timerIntervalRef.current = setInterval(() => {
        setTime((prevTime) => prevTime + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerOn]);

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
        setScripts(dbScripts);
        saveLocalScripts(dbScripts);
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
    setSelectedScriptId(null);
    setScriptTools('');
    setScriptBringIns('');
    setScriptCostumes('');
    setBlocks([createBlock('dialogue', '演者A', '')]);
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
        blocks,
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
          blocks,
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
      setSelectedScriptId(scriptId);
      setTime(0);
      setTimerOn(false);
      setView('editor');
      setStatus('台本を作成しました');
    } catch (error) {
      setStatus('作成に失敗しました');
      console.error(error);
    }
  }

  // Load existing script to editor
  function loadScriptToEditor(script: ScriptItem) {
    setSelectedScriptId(script.id);
    setScriptTitle(script.title);
    setScriptNetaType(script.netaType);
    setScriptCharacters(script.characters);
    setScriptSounds(script.sounds);
    setScriptTools(script.tools ?? '');
    setScriptBringIns(script.bringIns ?? '');
    setScriptCostumes(script.costumes ?? '');
    setBlocks(script.blocks && script.blocks.length > 0 ? script.blocks : [createBlock('dialogue', script.characters[0]?.name || '演者A', '')]);
    setTime(0);
    setTimerOn(false);
    setView('editor');
    setStatus('台本を読み込みました');
  }

  async function saveScript() {
    if (!selectedScriptId) return;
    try {
      setStatus('保存中…');
      const updatedTime = new Date().toISOString();

      if (supabase) {
        const { error } = await supabase
          .from('scripts')
          .update({
            title: scriptTitle,
            neta_type: scriptNetaType,
            blocks,
            tools: scriptTools || null,
            bring_ins: scriptBringIns || null,
            costumes: scriptCostumes || null,
            updated_at: updatedTime,
          })
          .eq('id', selectedScriptId);
        if (error) throw error;

        // Re-sync characters (delete and insert)
        await supabase.from('characters').delete().eq('script_id', selectedScriptId);
        if (scriptCharacters.length > 0) {
          await supabase.from('characters').insert(
            scriptCharacters.map((c) => ({
              id: c.id || generateId(),
              script_id: selectedScriptId,
              name: c.name,
              performer_id: c.performerId || null,
              costume: c.costume || null,
            }))
          );
        }

        // Re-sync sounds (delete and insert)
        if (selectedUnitId) {
          await supabase.from('sounds').delete().eq('unit_id', selectedUnitId);
          if (scriptSounds.length > 0) {
            await supabase.from('sounds').insert(
              scriptSounds.map((s) => ({
                id: s.id || generateId(),
                unit_id: selectedUnitId,
                index: s.index,
                name: s.name,
              }))
            );
          }
        }
      }

      const nextScripts = scripts.map((script) =>
        script.id === selectedScriptId
          ? {
            ...script,
            title: scriptTitle,
            netaType: scriptNetaType,
            characters: scriptCharacters,
            sounds: scriptSounds,
            blocks,
            tools: scriptTools,
            bringIns: scriptBringIns,
            costumes: scriptCostumes,
            updatedAt: updatedTime,
          }
          : script
      );

      setScripts(nextScripts);
      saveLocalScripts(nextScripts);
      setStatus('保存しました');
    } catch (error) {
      setStatus('保存に失敗しました');
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

  // Block Manipulation
  function updateBlock(index: number, update: Partial<ScriptBlock>) {
    setBlocks((current) => current.map((block, idx) => (idx === index ? { ...block, ...update } : block)));
  }

  function updateBlockCue(index: number, update: Partial<Cue>) {
    setBlocks((current) =>
      current.map((block, idx) => {
        if (idx === index) {
          return {
            ...block,
            cue: {
              ...block.cue,
              fadeDuration: block.cue?.fadeDuration ?? 4,
              triggerType: block.cue?.triggerType ?? 'undefined',
              triggerText: block.cue?.triggerText ?? '',
              ...update,
            },
          };
        }
        return block;
      })
    );
  }

  function insertBlock(index: number, block: ScriptBlock) {
    setBlocks((current) => {
      const next = [...current];
      next.splice(index, 0, block);
      return next;
    });
  }

  function deleteBlock(index: number) {
    setBlocks((current) => {
      const next = current.filter((_, idx) => idx !== index);
      if (next.length === 0) {
        return [createBlock('dialogue', characterOptions[0] || '演者A', '')];
      }
      return next;
    });
  }

  // Shortcuts logic
  function handleShortcut(event: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    const block = blocks[index];

    // Enter key (inserts next logical block)
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();

      let nextBlock: ScriptBlock;
      if (block.type === 'dialogue') {
        // Dialogue -> Same Speaker
        nextBlock = createBlock('dialogue', block.speaker || characterOptions[0] || '演者A', '');
      } else if (block.type === 'stage') {
        // Stage -> Dialogue (returns to dialogue after action description)
        nextBlock = createBlock('dialogue', characterOptions[0] || '演者A', '');
      } else {
        // Sound/Light -> Dialogue default
        nextBlock = createBlock('dialogue', characterOptions[0] || '演者A', '');
      }

      insertBlock(index + 1, nextBlock);

      // Auto focus after render
      setTimeout(() => {
        const element = textareaRefs.current[nextBlock.id];
        if (element) {
          element.focus();
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return;
    }

    // Tab key (rotate characters forward)
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      if (characterOptions.length > 0) {
        const currentSpeaker = block.speaker || characterOptions[0];
        const currentIndex = characterOptions.indexOf(currentSpeaker);
        const nextSpeaker = characterOptions[(currentIndex + 1) % characterOptions.length];

        updateBlock(index, { speaker: nextSpeaker });
      }
      return;
    }

    // Shift + Tab key (rotate characters backward)
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      if (characterOptions.length > 0) {
        const currentSpeaker = block.speaker || characterOptions[0];
        const currentIndex = characterOptions.indexOf(currentSpeaker);
        const prevSpeaker = characterOptions[(currentIndex - 1 + characterOptions.length) % characterOptions.length];

        updateBlock(index, { speaker: prevSpeaker });
      }
      return;
    }

    // Alt key (toggles between dialogue and stage, keeping speaker name)
    if (event.key === 'Alt') {
      event.preventDefault();
      if (block.type === 'dialogue') {
        updateBlock(index, { type: 'stage' });
      } else if (block.type === 'stage') {
        updateBlock(index, { type: 'dialogue', speaker: block.speaker || characterOptions[0] || '演者A' });
      }
    }
  }

  // Cue additions
  function insertSound(soundCueType: string) {
    // Determine the next sound tracking label, e.g. Sound 1, Sound 2
    // We check if the sound track is registered in scriptSounds.
    // In sound blocks, text stores the sound track name index (e.g. "サレルロブロ①" + type)
    const soundLabel = scriptSounds.length > 0
      ? `${selectedUnit?.name || 'ユニット'}${scriptSounds[0].index}`
      : `${selectedUnit?.name || 'ユニット'}①`;

    const newBlock = createBlock('sound', undefined, `${soundLabel} ${soundCueType}`);

    // Add default fade parameter if it's F.I / F.O
    if (soundCueType === 'F.I' || soundCueType === 'F.O') {
      newBlock.cue = {
        fadeDuration: 4,
        triggerType: 'undefined',
        triggerText: '',
      };
    }

    setBlocks((current) => [...current, newBlock]);

    setTimeout(() => {
      const element = textareaRefs.current[newBlock.id];
      if (element) {
        element.focus();
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setActiveCueConfigId(newBlock.id);
    }, 50);
  }

  function insertLight(lightCueType: string) {
    const newBlock = createBlock('light', undefined, lightCueType);

    // Add default fade parameter if it's 徐々明転 / 徐々暗転
    if (lightCueType === '徐々明転' || lightCueType === '徐々暗転') {
      newBlock.cue = {
        fadeDuration: 4,
        triggerType: 'undefined',
        triggerText: '',
      };
    }

    setBlocks((current) => [...current, newBlock]);

    setTimeout(() => {
      const element = textareaRefs.current[newBlock.id];
      if (element) {
        element.focus();
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setActiveCueConfigId(newBlock.id);
    }, 50);
  }

  // Character count & estimated time
  const totalCharacters = useMemo(() => {
    return blocks.reduce((sum, b) => {
      if (b.type === 'dialogue' || b.type === 'stage') {
        return sum + b.text.length;
      }
      return sum;
    }, 0);
  }, [blocks]);

  const estimatedDuration = useMemo(() => {
    if (totalCharacters === 0) return { min: 0, sec: 0 };
    const totalSeconds = Math.round((totalCharacters / estimatedSpeed) * 60);
    return {
      min: Math.floor(totalSeconds / 60),
      sec: totalSeconds % 60,
    };
  }, [totalCharacters, estimatedSpeed]);

  // Unconfigured cues list
  const unconfiguredCues = useMemo(() => {
    return blocks
      .map((b, idx) => ({ block: b, index: idx }))
      .filter(({ block }) => {
        if (block.type !== 'sound' && block.type !== 'light') return false;

        // A cue is unconfigured if trigger is undefined
        const triggerUndef = !block.cue || block.cue.triggerType === 'undefined';

        // A cue is unconfigured if it is dialogue/action/time trigger but triggerText is empty
        const triggerTextEmpty = block.cue &&
          block.cue.triggerType !== 'undefined' &&
          (!block.cue.triggerText || block.cue.triggerText.trim() === '');

        return triggerUndef || triggerTextEmpty;
      });
  }, [blocks]);

  // Scroll to block and focus
  function scrollToBlock(id: string) {
    const element = textareaRefs.current[id];
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setActiveCueConfigId(id);
    }
  }

  // Trigger browser print
  function triggerPrint() {
    window.print();
  }

  // Format stopwatch time
  function formatStopwatch(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
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
            {view === 'editor' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={saveScript}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium px-4 py-2 rounded-xl transition duration-150 border border-slate-700"
                >
                  保存
                </button>
                <button
                  onClick={triggerPrint}
                  className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-md shadow-violet-500/20 transition duration-150"
                >
                  印刷 / PDF出力
                </button>
              </div>
            )}
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
                          <div className="cursor-pointer flex-1" onClick={() => loadScriptToEditor(s)}>
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
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => loadScriptToEditor(s)}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-3 py-1.5 rounded-lg border border-slate-750 transition"
                            >
                              編集する
                            </button>
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

        {/* 3-Column Editor View */}
        {view === 'editor' && selectedUnit && (
          <div className="flex-1 grid grid-cols-[300px_1fr_320px] overflow-hidden">

            {/* LEFT COLUMN: Script Meta Info */}
            <aside className="border-r border-slate-800 bg-slate-950/60 p-5 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ネタ情報</h3>
                  <div className="mt-3 bg-slate-900/60 border border-slate-850 rounded-2xl p-4 space-y-4">
                    <div>
                      <span className="text-[10px] text-slate-500">タイトル</span>
                      <input
                        value={scriptTitle}
                        onChange={(e) => setScriptTitle(e.target.value)}
                        className="w-full bg-transparent text-sm font-bold text-slate-200 border-b border-transparent focus:border-slate-700 outline-none pb-0.5 mt-0.5"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">ネタ種別</span>
                      <p className="text-sm font-semibold text-violet-400 mt-0.5">{scriptNetaType}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">ユニット</span>
                      <p className="text-sm font-semibold text-slate-300 mt-0.5">{selectedUnit.name}</p>
                    </div>
                  </div>
                </div>

                {/* Character list / mappings */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>登場人物 (Tabで切替)</span>
                    <button
                      onClick={() => {
                        // Prompt character naming quick update
                        const newName = prompt('追加するキャラクター名を入力してください:');
                        if (newName?.trim()) {
                          setScriptCharacters((prev) => [...prev, { id: generateId(), name: newName.trim(), performerId: '', costume: '' }]);
                        }
                      }}
                      className="text-[10px] text-violet-400 hover:text-violet-300 font-semibold"
                    >
                      + 追加
                    </button>
                  </h3>
                  <div className="mt-2.5 space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {scriptCharacters.map((c, idx) => (
                      <div key={c.id} className="bg-slate-900/40 border border-slate-850 rounded-xl p-2.5 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-300 truncate max-w-[120px]">{c.name || 'キャラクター'}</span>
                          <select
                            value={c.performerId}
                            onChange={(e) => {
                              const newChars = [...scriptCharacters];
                              newChars[idx].performerId = e.target.value;
                              setScriptCharacters(newChars);
                            }}
                            className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[10px] text-slate-400 focus:border-violet-500 focus:outline-none transition max-w-[110px]"
                          >
                            <option value="">配役未定</option>
                            {(selectedUnit.performers ?? []).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <input
                            value={c.costume || ''}
                            onChange={(e) => {
                              const newChars = [...scriptCharacters];
                              newChars[idx].costume = e.target.value;
                              setScriptCharacters(newChars);
                            }}
                            className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-350 focus:border-violet-500 focus:outline-none transition"
                            placeholder="衣装を入力"
                          />
                        </div>
                      </div>
                    ))}
                    {scriptCharacters.length === 0 && (
                      <p className="text-[10px] text-slate-600 italic">登録された登場人物はいません。</p>
                    )}
                  </div>
                </div>

                {/* Sound tracks register */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>登録済み音源リスト</span>
                    <button
                      onClick={() => {
                        const newName = prompt('音源名を入力してください:');
                        if (newName?.trim()) {
                          setScriptSounds((prev) => [
                            ...prev,
                            { id: generateId(), unitId: selectedUnitId || '', index: (prev.reduce((max, s) => s.index > max ? s.index : max, 0)) + 1, name: newName.trim() }
                          ]);
                        }
                      }}
                      className="text-[10px] text-violet-400 hover:text-violet-300 font-semibold"
                    >
                      + 追加
                    </button>
                  </h3>
                  <div className="mt-2.5 space-y-2">
                    {scriptSounds.length === 0 ? (
                      <p className="text-[11px] text-slate-600 italic">登録された音源はありません。</p>
                    ) : (
                      scriptSounds.map((s) => (
                        <div key={s.id} className="bg-slate-900/40 border border-slate-850 rounded-xl p-2.5 text-xs flex items-center justify-between">
                          <span className="font-semibold text-slate-400">{selectedUnit.name}{s.index}</span>
                          <span className="font-bold text-slate-300 max-w-[140px] truncate">{s.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Equipment summaries */}
                <div className="text-xs space-y-2.5 border-t border-slate-800 pt-4">
                  <div>
                    <span className="text-slate-500 font-semibold">使用道具:</span>
                    <input
                      value={scriptTools}
                      onChange={(e) => setScriptTools(e.target.value)}
                      placeholder="未登録"
                      className="bg-transparent border-b border-transparent focus:border-slate-800 outline-none text-slate-300 w-full pl-1 mt-0.5"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold">持ち込み物:</span>
                    <input
                      value={scriptBringIns}
                      onChange={(e) => setScriptBringIns(e.target.value)}
                      placeholder="未登録"
                      className="bg-transparent border-b border-transparent focus:border-slate-800 outline-none text-slate-300 w-full pl-1 mt-0.5"
                    />
                  </div>
                  {scriptCostumes && (
                    <div className="bg-red-950/20 border border-red-900/40 p-2 rounded-xl mt-2 space-y-1">
                      <span className="text-red-400 font-semibold block text-[10px]">全体衣装 (移行前データ):</span>
                      <input
                        value={scriptCostumes}
                        onChange={(e) => setScriptCostumes(e.target.value)}
                        placeholder="未登録"
                        className="bg-transparent border-b border-red-900 focus:border-red-700 outline-none text-slate-300 w-full text-[10px] pl-1"
                      />
                      <p className="text-[9px] text-slate-500">※ 登場人物ごとの衣装欄へコピー・移行し、ここを空にすることをおすすめします。</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Back button */}
              <div className="border-t border-slate-800 pt-4">
                <button
                  onClick={() => setView('home')}
                  className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold py-2.5 rounded-xl transition"
                >
                  ← ユニットホーム画面へ
                </button>
              </div>
            </aside>

            {/* CENTER COLUMN: Text Editor */}
            <section className="bg-slate-900 p-6 flex flex-col overflow-y-auto">

              {/* Floating editor options */}
              <div className="mb-4 bg-slate-950/40 border border-slate-850 p-4 rounded-2xl flex items-center justify-between gap-4 text-xs">
                {/* Mode description & estimate info */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-400">文字数:</span>
                    <span className="font-bold text-slate-200">{totalCharacters} 文字</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-400">想定時間:</span>
                    <span className="font-bold text-violet-400 bg-violet-950/40 px-2 py-0.5 rounded border border-violet-900/40">
                      {estimatedDuration.min}分{estimatedDuration.sec}秒
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span>(話速:</span>
                    <input
                      type="number"
                      value={estimatedSpeed}
                      onChange={(e) => setEstimatedSpeed(Math.max(100, parseInt(e.target.value) || 400))}
                      className="w-10 bg-slate-900 border border-slate-800 text-center font-bold text-slate-300 rounded focus:outline-none"
                    />
                    <span>文字/分)</span>
                  </div>
                </div>

                {/* Keyboard Quick Help */}
                <div className="hidden lg:flex items-center gap-3 text-slate-500 text-[10px]">
                  <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">Enter</kbd> 改行</span>
                  <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">Tab</kbd> 話者切替</span>
                  <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">Alt</kbd> セリフ⇔ト書き</span>
                </div>
              </div>

              {/* Blocks list (Main editor flow) */}
              <div className="space-y-4 flex-1">
                {blocks.map((block, index) => {
                  const isDialogue = block.type === 'dialogue';
                  const isStage = block.type === 'stage';
                  const isSound = block.type === 'sound';
                  const isLight = block.type === 'light';

                  return (
                    <div
                      key={block.id}
                      className={`relative group rounded-2xl border transition duration-150 ${isDialogue ? 'bg-slate-950/20 border-slate-800/80 hover:border-slate-700' :
                          isStage ? 'bg-slate-950/10 border-slate-800/40 hover:border-slate-755' :
                            isSound ? 'bg-blue-950/10 border-blue-950/50 border-l-4 border-l-blue-500' :
                              'bg-yellow-950/10 border-yellow-950/50 border-l-4 border-l-yellow-500'
                        }`}
                    >
                      {/* Editor Card Header */}
                      <div className="px-4 py-2 border-b border-slate-850/40 flex items-center justify-between text-xs bg-slate-950/10">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isDialogue ? 'bg-slate-800 text-slate-350' :
                              isStage ? 'bg-slate-900 text-slate-400 border border-slate-800' :
                                isSound ? 'bg-blue-950 text-blue-400 border border-blue-900/40' :
                                  'bg-yellow-950 text-yellow-500 border border-yellow-900/40'
                            }`}>
                            {isDialogue ? 'セリフ' : isStage ? 'ト書き' : isSound ? '音響' : '照明'}
                          </span>

                          {/* Dialogue Speaker Selector */}
                          {isDialogue && (
                            <select
                              value={block.speaker || characterOptions[0] || ''}
                              onChange={(e) => updateBlock(index, { speaker: e.target.value })}
                              className="bg-slate-900/80 border border-slate-800 rounded-lg px-2 py-0.5 text-xs text-slate-300 outline-none focus:border-slate-600 transition"
                            >
                              {characterOptions.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                              {characterOptions.length === 0 && (
                                <option value="">キャラクター未登録</option>
                              )}
                            </select>
                          )}

                          {/* Sound selector for Sound block */}
                          {isSound && (
                            <select
                              value={block.text.split(' ')[0] || ''}
                              onChange={(e) => {
                                const action = block.text.split(' ')[1] || 'C.I';
                                updateBlock(index, { text: `${e.target.value} ${action}` });
                              }}
                              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-0.5 text-xs text-slate-300 outline-none"
                            >
                              {scriptSounds.map((s) => (
                                <option key={s.id} value={`${selectedUnit.name}${s.index}`}>
                                  {selectedUnit.name}{s.index} ({s.name})
                                </option>
                              ))}
                              {scriptSounds.length === 0 && (
                                <option value={`${selectedUnit.name}①`}>{selectedUnit.name}① (未登録)</option>
                              )}
                            </select>
                          )}
                          {isSound && (
                            <select
                              value={block.text.split(' ')[1] || 'C.I'}
                              onChange={(e) => {
                                const soundLabel = block.text.split(' ')[0] || `${selectedUnit.name}①`;
                                updateBlock(index, { text: `${soundLabel} ${e.target.value}` });
                              }}
                              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-0.5 text-xs text-slate-300 outline-none font-bold"
                            >
                              {soundCueOptions.map((cue) => (
                                <option key={cue} value={cue}>{cue}</option>
                              ))}
                            </select>
                          )}

                          {/* Light type selector */}
                          {isLight && (
                            <select
                              value={block.text}
                              onChange={(e) => updateBlock(index, { text: e.target.value })}
                              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-0.5 text-xs text-slate-350 outline-none font-bold"
                            >
                              {lightCueOptions.map((cue) => (
                                <option key={cue} value={cue}>{cue}</option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Cue Settings Gear Button */}
                          {(isSound || isLight) && (
                            <button
                              onClick={() => setActiveCueConfigId(activeCueConfigId === block.id ? null : block.id)}
                              className={`text-[11px] px-2 py-0.5 rounded-lg border transition ${activeCueConfigId === block.id
                                  ? 'bg-violet-950 border-violet-500 text-violet-350'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                                }`}
                            >
                              きっかけ・フェード設定
                            </button>
                          )}

                          <button
                            onClick={() => deleteBlock(index)}
                            className="text-slate-500 hover:text-red-400 transition"
                            title="削除"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Editor Card Body (Text Area) */}
                      <div className="p-4 flex items-center gap-2">
                        {/* Auto-visual prefixes (Visual Sugar for script structure) */}
                        {isDialogue && (
                          <div className="flex items-center text-slate-500 text-sm select-none">
                            <span className="font-bold text-violet-400/80 mr-1">{block.speaker || '話者'}</span>
                            <span>「</span>
                          </div>
                        )}
                        {isStage && (
                          <div className="flex items-center text-slate-500 text-sm select-none">
                            {block.speaker && <span className="font-bold text-emerald-400/80 mr-1">{block.speaker}</span>}
                            <span>（</span>
                          </div>
                        )}

                        <textarea
                          ref={(element) => {
                            textareaRefs.current[block.id] = element;
                          }}
                          value={block.text}
                          onChange={(e) => updateBlock(index, { text: e.target.value })}
                          onKeyDown={(e) => handleShortcut(e, index)}
                          rows={isDialogue || isStage ? 2 : 1}
                          className={`w-full bg-transparent text-slate-100 placeholder-slate-700 outline-none transition text-sm font-medium ${isDialogue ? 'text-slate-100' :
                              isStage ? 'text-slate-350 italic' :
                                isSound ? 'text-blue-300 font-bold' :
                                  'text-yellow-300 font-bold'
                            }`}
                          placeholder={
                            isDialogue ? 'セリフを入力してください' :
                              isStage ? '動作や立ち位置を入力してください' :
                                ''
                          }
                          disabled={isSound || isLight} // Sound & Light block text are managed by dropdowns
                        />

                        {isDialogue && <div className="text-slate-500 text-sm select-none">」</div>}
                        {isStage && <div className="text-slate-500 text-sm select-none">）</div>}
                      </div>

                      {/* Cue Inline settings dropdown drawer */}
                      {(isSound || isLight) && activeCueConfigId === block.id && (
                        <div className="px-5 pb-5 pt-1 border-t border-slate-850/60 bg-slate-950/40 rounded-b-2xl space-y-4 text-xs text-slate-300">
                          <h4 className="font-bold text-slate-400 border-b border-slate-850 pb-1 flex items-center justify-between">
                            <span>キュー設定詳細</span>
                            <button
                              onClick={() => setActiveCueConfigId(null)}
                              className="text-[10px] text-slate-500 hover:text-slate-300"
                            >
                              閉じる
                            </button>
                          </h4>

                          <div className="grid gap-4 md:grid-cols-2">
                            {/* Trigger setting */}
                            <div className="space-y-2">
                              <label className="block font-semibold text-slate-400">きっかけタイプ (Trigger)</label>
                              <select
                                value={block.cue?.triggerType || 'undefined'}
                                onChange={(e) => updateBlockCue(index, { triggerType: e.target.value as CueTriggerType })}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none"
                              >
                                <option value="undefined">未定 (後で設定)</option>
                                <option value="dialogue">セリフの後 (きっかけ)</option>
                                <option value="action">動作の後 (きっかけ)</option>
                                <option value="time">経過時間後 (きっかけ)</option>
                              </select>

                              {/* Trigger context input */}
                              {block.cue?.triggerType !== 'undefined' && (
                                <input
                                  value={block.cue?.triggerText || ''}
                                  onChange={(e) => updateBlockCue(index, { triggerText: e.target.value })}
                                  placeholder={
                                    block.cue?.triggerType === 'dialogue' ? '例：「やめろおおお！！！」の後' :
                                      block.cue?.triggerType === 'action' ? '例：裸の男がお腹をさすり始めたら' :
                                        '例：音源開始から9秒後'
                                  }
                                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 mt-1.5 focus:border-violet-500 focus:outline-none transition"
                                />
                              )}
                            </div>

                            {/* Fade setting (Show only for fade action cues) */}
                            {((isSound && (block.text.endsWith('F.I') || block.text.endsWith('F.O'))) ||
                              (isLight && (block.text === '徐々明転' || block.text === '徐々暗転'))) && (
                                <div className="space-y-2">
                                  <label className="block font-semibold text-slate-400">
                                    フェード秒数: <span className="text-violet-400 font-bold">{block.cue?.fadeDuration ?? 4} 秒</span>
                                  </label>

                                  <div className="flex items-center gap-3">
                                    {/* Slider 1 to 10s */}
                                    <input
                                      type="range"
                                      min="1"
                                      max="10"
                                      value={(block.cue?.fadeDuration ?? 4) <= 10 ? (block.cue?.fadeDuration ?? 4) : 10}
                                      onChange={(e) => updateBlockCue(index, { fadeDuration: parseInt(e.target.value) })}
                                      className="flex-1 accent-violet-600 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                                    />

                                    {/* Custom number input (especially useful if > 10s) */}
                                    <input
                                      type="number"
                                      min="1"
                                      value={block.cue?.fadeDuration ?? 4}
                                      onChange={(e) => updateBlockCue(index, { fadeDuration: Math.max(1, parseInt(e.target.value) || 4) })}
                                      className="w-14 bg-slate-900 border border-slate-800 text-center rounded p-1 text-slate-200 outline-none focus:border-violet-500"
                                    />
                                  </div>
                                </div>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Float Insertion Buttons */}
              <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    const newBlock = createBlock('dialogue', characterOptions[0] || '演者A', '');
                    setBlocks((c) => [...c, newBlock]);
                    setTimeout(() => textareaRefs.current[newBlock.id]?.focus(), 50);
                  }}
                  className="bg-slate-850 hover:bg-slate-800 text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-750 transition"
                >
                  + セリフ行追加
                </button>
                <button
                  onClick={() => {
                    const newBlock = createBlock('stage', undefined, '');
                    setBlocks((c) => [...c, newBlock]);
                    setTimeout(() => textareaRefs.current[newBlock.id]?.focus(), 50);
                  }}
                  className="bg-slate-850 hover:bg-slate-800 text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-750 transition"
                >
                  + ト書き行追加
                </button>
              </div>
            </section>

            {/* RIGHT COLUMN: Palette, Warnings, Timer */}
            <aside className="border-l border-slate-800 bg-slate-950/60 p-5 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-6">

                {/* Practice Timer */}
                <div className="bg-gradient-to-tr from-slate-900 to-slate-950 border border-slate-800/80 rounded-2xl p-4 flex flex-col items-center shadow-lg">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">練習用ストップウォッチ</h3>
                  <div className="text-3xl font-mono font-bold text-slate-100 tracking-tight my-1">
                    {formatStopwatch(time)}
                  </div>
                  <div className="flex gap-2 w-full mt-3">
                    <button
                      onClick={() => setTimerOn(!timerOn)}
                      className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition ${timerOn
                          ? 'bg-rose-950 text-rose-400 border border-rose-900/40 hover:bg-rose-900/40'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-900/40 hover:bg-emerald-900/40'
                        }`}
                    >
                      {timerOn ? '一時停止' : 'スタート'}
                    </button>
                    <button
                      onClick={() => {
                        setTimerOn(false);
                        setTime(0);
                      }}
                      className="bg-slate-850 hover:bg-slate-800 text-slate-400 border border-slate-750 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                      リセット
                    </button>
                  </div>
                </div>

                {/* Queue Palettes */}
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">キューパレット</h3>

                  {/* Sound cue pallet */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold text-blue-400 block border-b border-blue-950 pb-1">音響 (青色)</span>
                    <div className="grid grid-cols-2 gap-2">
                      {soundCueOptions.map((cue) => (
                        <button
                          key={cue}
                          onClick={() => insertSound(cue)}
                          className="bg-blue-950/40 hover:bg-blue-900/40 text-blue-300 border border-blue-900/50 text-[11px] font-semibold py-2 px-3 rounded-xl transition text-center shadow-sm"
                        >
                          {cue}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Light cue pallet */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold text-yellow-500 block border-b border-yellow-950 pb-1">照明 (黄色)</span>
                    <div className="grid grid-cols-2 gap-2">
                      {lightCueOptions.map((cue) => (
                        <button
                          key={cue}
                          onClick={() => insertLight(cue)}
                          className="bg-yellow-950/30 hover:bg-yellow-900/30 text-yellow-500 border border-yellow-900/40 text-[11px] font-semibold py-2 px-3 rounded-xl transition text-center shadow-sm"
                        >
                          {cue}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Unconfigured warnings list */}
                <div className="border-t border-slate-800/80 pt-4">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>未設定チェックリスト</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${unconfiguredCues.length > 0 ? 'bg-red-950 text-red-400 border border-red-900/40' : 'bg-emerald-950 text-emerald-400'
                      }`}>
                      未設定 {unconfiguredCues.length} 件
                    </span>
                  </h3>

                  <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {unconfiguredCues.length === 0 ? (
                      <div className="text-[11px] text-slate-500 italic p-3 text-center rounded-xl bg-slate-900/10 border border-slate-850 border-dashed">
                        すべて設定済みです。提出可能です！
                      </div>
                    ) : (
                      unconfiguredCues.map(({ block, index }) => {
                        const cueLabel = block.type === 'sound' ? '音響' : '照明';
                        return (
                          <div
                            key={block.id}
                            onClick={() => scrollToBlock(block.id)}
                            className="bg-slate-900/80 border border-slate-850 hover:border-slate-750 hover:bg-slate-850 rounded-xl p-2.5 text-left text-xs cursor-pointer transition flex flex-col justify-start gap-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${block.type === 'sound' ? 'bg-blue-950 text-blue-400' : 'bg-yellow-950 text-yellow-500'
                                }`}>
                                {cueLabel}行 #{index + 1}
                              </span>
                              <span className="text-[10px] font-bold text-rose-400">きっかけ未設定</span>
                            </div>
                            <p className="text-xs font-bold text-slate-350 truncate">{block.text}</p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Close / return button */}
              <div className="border-t border-slate-800 pt-4">
                <button
                  onClick={saveScript}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold py-3 rounded-xl transition duration-150 shadow-md shadow-violet-500/10"
                >
                  台本を保存する
                </button>
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* PRINT-ONLY LAYOUT (Fully optimized for physical A4 or native browser PDF saving) */}
      {selectedUnit && selectedScript && (
        <div className="print-only">

          {/* PAGE 1: COVER PAGE */}
          <div className="print-page print-cover">
            <h1 className="print-cover-title">{scriptTitle || '無題の台本'}</h1>

            <div className="print-cover-meta">
              <div className="print-cover-meta-item">
                <strong>種別：</strong> {scriptNetaType}
              </div>
              <div className="print-cover-meta-item">
                <strong>ユニット名：</strong> {selectedUnit.name}
              </div>
              {selectedUnit.university && (
                <div className="print-cover-meta-item">
                  <strong>所属：</strong> {selectedUnit.university}
                </div>
              )}
              <div className="print-cover-meta-item">
                <strong>演者一覧：</strong> {selectedUnit.performers?.map((p) => `${p.name} (${p.grade || '学年未登録'})`).join(' / ') || '未設定'}
              </div>
              <div className="print-cover-meta-item">
                <strong>登場人物（配役）：</strong> {scriptCharacters.map((c) => {
                  const perfName = selectedUnit.performers?.find((p) => p.id === c.performerId)?.name || '未定';
                  return `${c.name} (${perfName})`;
                }).join(' / ') || '未設定'}
              </div>

              {/* Sound track index list */}
              {scriptSounds.length > 0 && (
                <div className="print-cover-meta-item">
                  <strong>音源トラックリスト：</strong>
                  <ul style={{ listStyleType: 'decimal', marginLeft: '5mm', marginTop: '2mm' }}>
                    {scriptSounds.map((s) => (
                      <li key={s.id} style={{ fontSize: '10pt', marginBottom: '1mm' }}>
                        <strong>{selectedUnit.name}{s.index}</strong>: {s.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(scriptTools || scriptBringIns || scriptCostumes || scriptCharacters.some((c) => c.costume)) && (
                <div style={{ marginTop: '5mm', fontSize: '11pt' }}>
                  <strong>【大道具・演出情報】</strong>
                  {scriptTools && <p style={{ marginLeft: '2mm', fontSize: '10pt' }}>・使用道具：{scriptTools}</p>}
                  {scriptBringIns && <p style={{ marginLeft: '2mm', fontSize: '10pt' }}>・持ち込み物：{scriptBringIns}</p>}
                  {scriptCharacters.some((c) => c.costume) && (
                    <div style={{ marginLeft: '2mm', fontSize: '10pt', display: 'flex', flexDirection: 'column', marginTop: '1mm' }}>
                      <strong>・衣装：</strong>
                      <div style={{ paddingLeft: '4mm', marginTop: '0.5mm', display: 'flex', flexDirection: 'column', gap: '0.5mm' }}>
                        {scriptCharacters
                          .filter((c) => c.costume)
                          .map((c) => {
                            const perfName = selectedUnit.performers?.find((p) => p.id === c.performerId)?.name || '未定';
                            return (
                              <div key={c.id}>
                                <span style={{ fontWeight: 'bold' }}>{c.name} ({perfName})</span>: {c.costume}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                  {scriptCostumes && !scriptCharacters.some((c) => c.costume) && (
                    <p style={{ marginLeft: '2mm', fontSize: '10pt' }}>・衣装 (全体)：{scriptCostumes}</p>
                  )}
                  {scriptCostumes && scriptCharacters.some((c) => c.costume) && (
                    <p style={{ marginLeft: '2mm', fontSize: '10pt', color: '#dc2626' }}>・衣装 (全体・移行前)：{scriptCostumes}</p>
                  )}
                </div>
              )}

              <div className="print-cover-meta-item" style={{ marginTop: '5mm' }}>
                <strong>想定時間：</strong> 約{estimatedDuration.min}分{estimatedDuration.sec}秒 ({totalCharacters}文字)
              </div>
            </div>
          </div>

          {/* PAGE 2+: BODY TEXT LAYOUT */}
          <div className="print-page" style={{ paddingTop: '10mm' }}>
            <div className="print-header">
              <span>台本：{scriptTitle} ({scriptNetaType})</span>
              <span>ユニット：{selectedUnit.name}</span>
            </div>

            {/* KONTO (コント) - 2-Column layout for PA Stage staff */}
            {scriptNetaType === 'コント' ? (
              <table className="print-table">
                <thead>
                  <tr>
                    <th className="print-table-col-main">台本本文 (セリフ・ト書き)</th>
                    <th className="print-table-col-cue">きっかけ ＆ 音響・照明演出指示</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((block) => {
                    const isDialogue = block.type === 'dialogue';
                    const isStage = block.type === 'stage';
                    const isSound = block.type === 'sound';
                    const isLight = block.type === 'light';

                    if (isDialogue || isStage) {
                      return (
                        <tr key={block.id}>
                          <td className="print-table-col-main">
                            {isDialogue ? (
                              <strong>{block.speaker || '○'}「{block.text}」</strong>
                            ) : (
                              <span className="print-line-stage">
                                {block.speaker ? `${block.speaker}（${block.text}）` : `（${block.text}）`}
                              </span>
                            )}
                          </td>
                          <td className="print-table-col-cue"></td>
                        </tr>
                      );
                    } else {
                      // Cue rows (Sound / Light)
                      // Render cue details in cue column, aligned horizontally!
                      const triggerLabel = block.cue && block.cue.triggerType !== 'undefined'
                        ? `（${block.cue.triggerText}）をきっかけに、`
                        : '';

                      const fadeLabel = block.cue?.fadeDuration &&
                        (block.text.endsWith('F.I') || block.text.endsWith('F.O') || block.text === '徐々明転' || block.text === '徐々暗転')
                        ? `${block.cue.fadeDuration}秒かけて`
                        : '';

                      const cueLabel = block.type === 'sound' ? '音響' : '照明';

                      return (
                        <tr key={block.id} style={{ background: '#fcfcfc' }}>
                          <td className="print-table-col-main" style={{ color: '#888', fontSize: '9pt' }}>
                            --- 【{cueLabel}：{block.text}】 ---
                          </td>
                          <td className="print-table-col-cue">
                            <div className={block.type === 'sound' ? 'print-line-sound' : 'print-line-light'}>
                              {triggerLabel}{fadeLabel}【{block.text}】
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            ) : (
              // MANZAI / PIN (漫才・ピン) - Single Column list style
              <div className="print-line-list">
                {blocks.map((block) => {
                  const isDialogue = block.type === 'dialogue';
                  const isStage = block.type === 'stage';
                  const isSound = block.type === 'sound';

                  if (isDialogue) {
                    return (
                      <div key={block.id} className="print-line">
                        <strong>{block.speaker || '○'}「{block.text}」</strong>
                      </div>
                    );
                  }
                  if (isStage) {
                    return (
                      <div key={block.id} className="print-line print-line-stage">
                        {block.speaker ? `${block.speaker}（{block.text}）` : `（${block.text}）`}
                      </div>
                    );
                  }

                  // Sound or light cue
                  const triggerLabel = block.cue && block.cue.triggerType !== 'undefined'
                    ? `（${block.cue.triggerText}）きっかけ：`
                    : '';

                  const fadeLabel = block.cue?.fadeDuration &&
                    (block.text.endsWith('F.I') || block.text.endsWith('F.O') || block.text === '徐々明転' || block.text === '徐々暗転')
                    ? `${block.cue.fadeDuration}秒かけて`
                    : '';

                  return (
                    <div key={block.id} className="print-line">
                      <span className={block.type === 'sound' ? 'print-line-sound' : 'print-line-light'}>
                        {triggerLabel}{fadeLabel}【{block.text}】
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
