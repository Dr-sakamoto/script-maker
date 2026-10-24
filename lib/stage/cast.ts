import type { CastMember } from './types';

export const CHICHI_CAST: CastMember[] = [
  { id: 'oyaji', name: '親父', short: '父', mark: '○', color: '#c8743c', kind: 'puppet', home: 'L' },
  { id: 'haha', name: '母親', short: '母', mark: '●', color: '#b0567a', kind: 'puppet', home: 'R' },
  { id: 'tamago', name: '卵', short: '卵', color: '#c9a227', kind: 'prop', holder: 'oyaji' },
];

export const member = (cast: CastMember[], id: string | undefined) => cast.find((c) => c.id === id);
export const nameOf = (cast: CastMember[], id: string | undefined) => member(cast, id)?.name ?? '';
export const puppets = (cast: CastMember[]) => cast.filter((c) => c.kind === 'puppet');
/** 卵などの小道具（声は音源）は『』で囲む */
export const isVoiceProp = (cast: CastMember[], id: string) => member(cast, id)?.kind === 'prop';

/** 色を決めていない役に順に当てる色 */
export const PALETTE = ['#d9822b', '#c2507d', '#3f88c5', '#4a9b5e', '#8a63d2', '#c9a227', '#d0453a', '#5d6b7a'];
/** ○●表記の記号（人形の登場順） */
export const MARKS = ['○', '●', '△', '▲', '□', '■', '◇', '◆'];

/** 名前の頭文字（記号チップ・顔ボタン用） */
export const shortName = (name: string) => [...name.trim()][0] ?? '？';
