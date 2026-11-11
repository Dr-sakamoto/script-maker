import { supabase } from './supabaseClient';
import type { ScriptItem, Unit } from './types';

/**
 * ユニットと演者をクラウド（Supabase）に送る。繋がっていなければ何もしない。
 * 無ければ作り、あれば上書きする。
 */
export async function pushUnit(unit: Unit): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('units').upsert({ id: unit.id, name: unit.name, university: unit.university ?? null });
    if (error) throw error;
    if (unit.performers?.length) {
      const res = await supabase
        .from('performers')
        .upsert(unit.performers.map((p) => ({ id: p.id, unit_id: unit.id, name: p.name, grade: p.grade ?? null })));
      if (res.error) throw res.error;
    }
    return true;
  } catch (e) {
    console.error('cloud sync failed (unit)', e);
    return false;
  }
}

/**
 * 台本をクラウド（Supabase）に送る。繋がっていなければ何もしない。
 * クラウドに無い台本（圏外で作った・前に送り損ねた）は作る。ユニットは先に送ってあること。
 * 舞台の項目（stage）と人形の色はクラウドの列が無いので送らない（ローカルだけ）。
 * 本文は blocks（舞台の項目から起こしたもの）で送る。
 * 失敗したら false（ローカルの保存は済んでいる。次に一覧を開いたとき送り直す）。
 */
export async function pushScript(script: ScriptItem): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('scripts').upsert({
      id: script.id,
      unit_id: script.unitId,
      title: script.title,
      neta_type: script.netaType,
      blocks: script.blocks,
      tools: script.tools || null,
      bring_ins: script.bringIns || null,
      costumes: script.costumes || null,
      updated_at: script.updatedAt ?? new Date().toISOString(),
    });
    if (error) throw error;

    // 役は先に上書きしてから、もう居ない役だけ消す（消してから入れ直すと、入れ損ねたとき空になる）
    if (script.characters.length > 0) {
      const up = await supabase.from('characters').upsert(
        script.characters.map((c) => ({
          id: c.id,
          script_id: script.id,
          name: c.name,
          performer_id: c.performerId || null,
          costume: c.costume || null,
        })),
      );
      if (up.error) throw up.error;
    }
    const keep = new Set(script.characters.map((c) => c.id));
    const now = await supabase.from('characters').select('id').eq('script_id', script.id);
    if (now.error) throw now.error;
    const gone = (now.data ?? []).map((r: { id: string }) => r.id).filter((id) => !keep.has(id));
    if (gone.length > 0) {
      const del = await supabase.from('characters').delete().in('id', gone);
      if (del.error) throw del.error;
    }

    // 音源はユニットの持ち物なので、消さずに番号ごとに上書きする
    if (script.sounds.length > 0) {
      const res = await supabase
        .from('sounds')
        .upsert(
          script.sounds.map((s) => ({ id: s.id, unit_id: script.unitId, index: s.index, name: s.name })),
          { onConflict: 'unit_id,index' },
        );
      if (res.error) throw res.error;
    }
    return true;
  } catch (e) {
    console.error('cloud sync failed', e);
    return false;
  }
}
