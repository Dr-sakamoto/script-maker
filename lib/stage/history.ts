import type { Doc } from './types';

type Snap = { doc: Doc; cursor: number };
export type HistState = Snap & { past: Snap[]; future: Snap[]; group?: string };

export type HistAction =
  | { type: 'commit'; doc: Doc; cursor?: number; group?: string }
  | { type: 'cursor'; cursor: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; doc: Doc; cursor?: number };

const LIMIT = 300;

/**
 * 元に戻す／やり直す。group が直前と同じ変更（同じ欄への連続入力など）は1回分にまとめる。
 */
export function histReducer(s: HistState, a: HistAction): HistState {
  switch (a.type) {
    case 'commit': {
      const cursor = a.cursor ?? s.cursor;
      const doc = { ...a.doc, updatedAt: Date.now() };
      if (a.group && a.group === s.group) return { ...s, doc, cursor };
      const past = [...s.past, { doc: s.doc, cursor: s.cursor }].slice(-LIMIT);
      return { doc, cursor, past, future: [], group: a.group };
    }
    case 'cursor':
      return { ...s, cursor: a.cursor, group: undefined };
    case 'undo': {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return { ...prev, past: s.past.slice(0, -1), future: [{ doc: s.doc, cursor: s.cursor }, ...s.future] };
    }
    case 'redo': {
      const [next, ...rest] = s.future;
      if (!next) return s;
      return { ...next, past: [...s.past, { doc: s.doc, cursor: s.cursor }], future: rest };
    }
    case 'load':
      return { doc: a.doc, cursor: a.cursor ?? a.doc.items.length - 1, past: [], future: [] };
  }
}

export const initHist = (doc: Doc): HistState => ({ doc, cursor: doc.items.length - 1, past: [], future: [] });
