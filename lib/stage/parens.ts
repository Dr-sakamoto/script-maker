import { member } from './cast';
import type { CastMember, Role } from './types';

/** 動きの（）。役が振られていれば、その役の色で3重にする */
export function actParens(cast: CastMember[], w: Role | undefined): { open: string; close: string; color?: string } {
  const m = w ? member(cast, w) : undefined;
  return m ? { open: '（（（', close: '）））', color: m.color } : { open: '（', close: '）' };
}
