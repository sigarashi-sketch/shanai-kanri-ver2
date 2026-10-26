'use client';

import { useEffect, useState } from 'react';
import type { PageAccess } from '@/lib/horyu-access';

// ログインした人のロールとページ権限（/api/live/me-pages）を画面で使う（10-26）。
//   ・1回読んだら、このタブの中では使い回す（メニューと各画面で何度も聞かない）
//   ・ログインしていない・読めないときは null（メニューは全部出す・ボタンは押せない）
let memo: Promise<PageAccess | null> | null = null;
function load(): Promise<PageAccess | null> {
  if (!memo) {
    memo = fetch('/api/live/me-pages', { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as PageAccess) : null))
      .catch(() => null);
    void memo.then((v) => { if (!v) memo = null; });
  }
  return memo;
}

export function useMePages(): { pa: PageAccess | null; ready: boolean; isSuper: boolean } {
  const [pa, setPa] = useState<PageAccess | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { let on = true; void load().then((v) => { if (on) { setPa(v); setReady(true); } }); return () => { on = false; }; }, []);
  return { pa, ready, isSuper: pa?.role === 'super_admin' };
}
