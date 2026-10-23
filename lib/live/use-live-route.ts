'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveState } from '@/components/Live';

// useIke（components/Live.tsx）と同じ動きで、/api/live/<画面> を読む（今の API を複数まとめた口・GET だけ）。
//   ・401 + not_logged_in なら state='sample'（画面は見本のまま）
export function useLiveRoute<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LiveState>('loading');
  const [error, setError] = useState('');
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as T & { error?: string };
      if (my !== seq.current) return;
      if (r.status === 401 && j.error === 'not_logged_in') { setState('sample'); return; }
      if (!r.ok) { setError(j.error || `読めませんでした（${r.status}）`); setState('error'); return; }
      setData(j); setError(''); setState('live');
    } catch (e) { if (my === seq.current) { setError((e as Error).message); setState('error'); } }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { data, state, error, reload: load, live: state === 'live' };
}
