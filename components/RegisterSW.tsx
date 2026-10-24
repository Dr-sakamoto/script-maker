'use client';

import { useEffect } from 'react';

/** 本番だけ Service Worker を登録する（開発中は古い画面が残って邪魔なので登録しない） */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const reg = () =>
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
          // 舞台の3D部品は開いたあとで読み込まれるので、圏外でも開けるよう先に読んでおく（通信節約中は読まない）
          const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
          if (conn?.saveData) return;
          const warm = () => void import('./stage/StageApp').catch(() => {});
          const ric = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
          ric ? ric(warm) : setTimeout(warm, 2000);
        })
        .catch(() => {});
    if (document.readyState === 'complete') reg();
    else window.addEventListener('load', reg, { once: true });
  }, []);
  return null;
}
