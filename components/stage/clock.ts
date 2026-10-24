import { useSyncExternalStore } from 'react';

/** 再生位置（秒）。毎フレーム変わるので React の state にせず購読させる */
let t = 0;
const subs = new Set<() => void>();
export const clock = {
  get: () => t,
  set: (v: number) => {
    t = v;
    subs.forEach((f) => f());
  },
  subscribe: (f: () => void) => {
    subs.add(f);
    return () => subs.delete(f);
  },
};
export const useClock = () => useSyncExternalStore(clock.subscribe, clock.get, clock.get);
