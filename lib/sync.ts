import type { ScriptItem, Unit } from './types';

/**
 * 手元（この端末）とクラウドの突き合わせ。UI から切り離した純粋関数。
 * 方針は「手元にあるものは勝手に消さない」：
 * - 手元にしか無いもの（圏外で作った・送るのに失敗した）は残して、クラウドへ送り直す
 * - 両方にあるものは、最後に直した時刻が新しいほうを採る
 */

const time = (s?: string) => Date.parse(s ?? '') || 0;

export type MergedScripts = {
  scripts: ScriptItem[];
  /** クラウドへ送り直す台本（手元にしか無い／手元のほうが新しい） */
  push: ScriptItem[];
};

export function mergeScripts(local: ScriptItem[], cloud: ScriptItem[]): MergedScripts {
  const byId = new Map(cloud.map((s) => [s.id, s]));
  const push: ScriptItem[] = [];
  const seen = new Set<string>();
  const scripts: ScriptItem[] = [];

  // 手元の並びを保つ
  for (const l of local) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    const c = byId.get(l.id);
    if (!c) {
      scripts.push(l);
      push.push(l);
    } else if (time(l.updatedAt) > time(c.updatedAt)) {
      scripts.push(l);
      push.push(l);
    } else {
      // クラウドが同じか新しい。舞台の項目と人形の見た目は手元にしか無いので残す
      scripts.push({
        ...c,
        stage: l.stage,
        characters: c.characters.map((ch) => ({ ...l.characters.find((lc) => lc.id === ch.id), ...ch })),
      });
    }
  }
  // クラウドにだけある台本（ほかの端末で作った）
  for (const c of cloud) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    scripts.push(c);
  }
  return { scripts, push };
}

export type MergedUnits = {
  units: Unit[];
  /** クラウドへ送り直すユニット（手元にしか無い／手元にしか居ない演者がいる） */
  push: Unit[];
};

export function mergeUnits(local: Unit[], cloud: Unit[]): MergedUnits {
  const byId = new Map(cloud.map((u) => [u.id, u]));
  const push: Unit[] = [];
  const seen = new Set<string>();
  const units: Unit[] = [];

  for (const l of local) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    const c = byId.get(l.id);
    if (!c) {
      units.push(l);
      push.push(l);
      continue;
    }
    // 名前などはクラウドを採り、手元にしか居ない演者は足す
    const mine = (l.performers ?? []).filter((p) => !c.performers.some((cp) => cp.id === p.id));
    const merged = { ...c, performers: [...c.performers, ...mine] };
    units.push(merged);
    if (mine.length) push.push(merged);
  }
  for (const c of cloud) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    units.push(c);
  }
  return { units, push };
}
