'use client';

import { useEffect, useState } from 'react';
import { LiveBanner } from '@/components/Live';
import { SkeletonRows } from '@/components/ui';

// それゆけの画面の中には、サーバで読んだものを最初に渡すものがある（月次アンケート・イベント出欠・アンケート作成）。
//   ver2 では /api/sy/ で読んでから渡す。読めない間は灰色の帯、読めなければ理由とログインの案内
export function SyLoad<T>({ path, children }: { path: string; children: (d: T) => React.ReactNode }) {
  const [st, setSt] = useState<{ d?: T; err?: string; n: number }>({ n: 0 });
  useEffect(() => {
    let dead = false;
    fetch(path, { cache: 'no-store' }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (dead) return;
      if (!r.ok || j?.ok === false) setSt((s) => ({ ...s, err: j?.error || `読めませんでした（${r.status}）` }));
      else setSt((s) => ({ ...s, d: j as T, err: undefined }));
    }).catch((e) => { if (!dead) setSt((s) => ({ ...s, err: (e as Error).message })); });
    return () => { dead = true; };
  }, [path, st.n]);
  if (st.err) return <div className="px-6 pt-[22px]"><LiveBanner state="error" error={st.err} onReload={() => setSt((s) => ({ n: s.n + 1 }))} /></div>;
  if (!st.d) return <div className="px-6 pt-[22px]"><SkeletonRows /></div>;
  return <>{children(st.d)}</>;
}
