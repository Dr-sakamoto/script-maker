import { supabase } from './supabaseClient';
import type { ScriptItem } from './types';

/**
 * 台本をクラウド（Supabase）に送る。繋がっていなければ何もしない。
 * 舞台の項目（stage）と人形の色はクラウドの列が無いので送らない（ローカルだけ）。
 * 本文は blocks（舞台の項目から起こしたもの）で送る。失敗してもローカルの保存は済んでいるので黙って戻る。
 */
export async function pushScript(script: ScriptItem): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('scripts')
      .update({
        title: script.title,
        neta_type: script.netaType,
        blocks: script.blocks,
        tools: script.tools || null,
        bring_ins: script.bringIns || null,
        costumes: script.costumes || null,
        updated_at: script.updatedAt ?? new Date().toISOString(),
      })
      .eq('id', script.id);
    if (error) throw error;

    await supabase.from('characters').delete().eq('script_id', script.id);
    if (script.characters.length > 0) {
      await supabase.from('characters').insert(
        script.characters.map((c) => ({
          id: c.id,
          script_id: script.id,
          name: c.name,
          performer_id: c.performerId || null,
          costume: c.costume || null,
        })),
      );
    }
    // 音源はユニットの持ち物なので、消さずに番号ごとに上書きする
    if (script.sounds.length > 0) {
      await supabase
        .from('sounds')
        .upsert(
          script.sounds.map((s) => ({ id: s.id, unit_id: script.unitId, index: s.index, name: s.name })),
          { onConflict: 'unit_id,index' },
        );
    }
    return true;
  } catch (e) {
    console.error('cloud sync failed', e);
    return false;
  }
}
