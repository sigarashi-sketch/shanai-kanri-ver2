'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { useIke } from '@/components/Live';
import { SkeletonRows } from '@/components/ui';
import type { PartnerList } from '@/lib/live/proper';

// 営業共有リストの中身（今の /api/partner-list?action=list・営業中の人だけ・読むだけ）
export function SharedLive() {
  const pl = useIke<PartnerList>('partner-list?action=list');
  const [q, setQ] = useState('');
  const people = (pl.data?.people ?? []).filter((p) => !q || `${p.name}${p.eki}${p.kibou}`.includes(q));
  if (pl.state === 'sample') return <p className="text-body text-muted">ログインすると見られます。<a href="/api/ike-auth/start" className="font-semibold underline">ログイン</a></p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted">今の営業共有リスト（営業中の人だけ）。</p>
        <label className="ml-auto flex min-h-9 items-center gap-2 rounded-[10px] border border-field bg-surface px-3 text-faint"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="営業共有リストを検索" placeholder="名前・最寄駅・希望" className="w-44 bg-transparent text-body text-ink outline-none" /></label>
      </div>
      {pl.state === 'error' && <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{pl.error}</div>}
      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 1 }}>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-body">
          <thead><tr className="th-row text-left">
            <th className="px-4 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 font-semibold">稼働</th><th className="px-2 py-2.5 font-semibold">稼働できる日</th><th className="px-2 py-2.5 font-semibold">希望</th><th className="px-4 py-2.5 text-right font-semibold">並行数</th>
          </tr></thead>
          <tbody>
            {pl.state === 'loading' && <tr><td colSpan={6} className="p-0"><SkeletonRows /></td></tr>}
            {people.slice(0, 300).map((p, i) => (
              <tr key={p.id} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: Math.min(i, 20) }}>
                <td className="px-4 py-2.5 font-semibold">{p.name}{p.tags.length > 0 && <span className="ml-1.5 text-xs font-normal text-muted">{p.tags.slice(0, 3).join('・')}</span>}</td>
                <td className="px-2 py-2.5">{p.eki || '—'}</td><td className="px-2 py-2.5">{p.kadou || '—'}</td><td className="px-2 py-2.5">{p.kanouBi || '—'}</td>
                <td className="px-2 py-2.5">{p.kibou || '—'}</td><td className="num px-4 py-2.5 text-right">{p.heikou || '—'}</td>
              </tr>
            ))}
            {pl.state === 'live' && people.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">{q ? 'この条件の人はいません' : 'まだありません'}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
