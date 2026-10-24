import { describe, expect, it } from 'vitest';
import { CHICHI_CAST } from '../cast';
import { actParens } from '../parens';

describe('動きの（）', () => {
  it('役が振られていればその色で3重', () => {
    expect(actParens(CHICHI_CAST, 'haha')).toEqual({ open: '（（（', close: '）））', color: '#b0567a' });
  });
  it('役が無ければ普通の（）', () => {
    expect(actParens(CHICHI_CAST, undefined)).toEqual({ open: '（', close: '）' });
  });
});
