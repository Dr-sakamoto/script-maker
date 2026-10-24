import type { CastMember } from './types';

export const CHICHI_CAST: CastMember[] = [
  { id: 'oyaji', name: '親父', short: '父', mark: '○', color: '#c8743c', kind: 'puppet', home: 'L', look: 'father' },
  { id: 'haha', name: '母親', short: '母', mark: '●', color: '#b0567a', kind: 'puppet', home: 'R', look: 'mother' },
  { id: 'tamago', name: '卵', short: '卵', color: '#c9a227', kind: 'prop', holder: 'oyaji', look: 'egg' },
];

export const member = (cast: CastMember[], id: string | undefined) => cast.find((c) => c.id === id);
export const nameOf = (cast: CastMember[], id: string | undefined) => member(cast, id)?.name ?? '';
export const puppets = (cast: CastMember[]) => cast.filter((c) => c.kind === 'puppet');
/** 卵などの小道具（声は音源）は『』で囲む */
export const isVoiceProp = (cast: CastMember[], id: string) => member(cast, id)?.kind === 'prop';
