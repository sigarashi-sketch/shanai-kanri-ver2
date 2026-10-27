'use client';
import { useEffect, useState } from 'react';
import type { Member } from '@/components/sy/compat';
import { yen, type LtvBasis, type LtvPerson } from '@/lib/sy/ltv-types';

// 名簿の詳細の「粗利・LTV」欄。admin と super admin にだけ出る（/api/s/ltv が 403 を返す人には何も出さない）。従業員だけ
export default function MemberLtv({ m }: { m: Member }) {
  const [d, setD] = useState<{ months: string[]; basis: Record<string, LtvBasis>; person: LtvPerson | null } | null>(null);
  const [state, setState] = useState<'load' | 'ok' | 'hide' | 'err'>('load');
  useEffect(() => {
    let dead = false;
    fetch(`/api/sy/s/ltv?key=${encodeURIComponent(m.key)}`).then(async (r) => {
      if (dead) return;
      if (r.status === 403 || r.status === 401) { setState('hide'); return; }
      const j = await r.json().catch(() => null);
      if (dead) return;
      if (!r.ok || !j) { setState('err'); return; }
      setD(j); setState('ok');
    }).catch(() => !dead && setState('err'));
    return () => { dead = true; };
  }, [m.key]);
  if (state === 'hide') return null;
  const p = d?.person || null;
  const months = (d?.months || []).filter((ym) => p?.months[ym]);
  return (
    <section className="mx-5 mt-4 rounded-lg ring-1 ring-ig-border">
      <div className="flex items-baseline gap-2 border-b border-ig-divider px-3 py-2">
        <h3 className="text-sm font-bold">粗利・LTV</h3><span className="text-[11px] text-ig-muted">admin だけに見えます</span>
      </div>
      {state === 'load' && <p className="p-3 text-xs text-ig-muted">読み込み中…（集計し直すときは40秒ほど）</p>}
      {state === 'err' && <p className="p-3 text-xs text-ig-danger">粗利を読めませんでした</p>}
      {state === 'ok' && !p && <p className="p-3 text-xs text-ig-muted">この人の売上・粗利の実績は まだありません</p>}
      {state === 'ok' && p && (
        <table className="w-full text-sm tabular-nums">
          <thead><tr className="text-[11px] text-ig-muted"><th className="px-3 py-1 text-left font-semibold">月</th><th className="px-3 py-1 text-right font-semibold">売上</th><th className="px-3 py-1 text-right font-semibold">粗利</th></tr></thead>
          <tbody>
            {months.map((ym) => { const v = p.months[ym]; return (
              <tr key={ym} className="border-t border-ig-divider">
                <td className="px-3 py-1">{ym.slice(0, 4)}年{Number(ym.slice(5))}月{d?.basis[ym]?.label === '勤怠仮確定' && !v.billed && <span className="ml-1 text-[10px] text-ig-muted">仮</span>}</td>
                <td className="px-3 py-1 text-right">{yen(v.sales)}</td>
                <td className={`px-3 py-1 text-right font-semibold ${v.gross < 0 ? 'text-ig-danger' : ''}`}>{yen(v.gross)}</td>
              </tr>
            ); })}
            <tr className="border-t-2 border-ig-border bg-ig-subtle">
              <td className="px-3 py-1.5 font-bold">LTV<span className="ml-1 text-[10px] font-normal text-ig-muted">粗利の累計・{months.length}か月</span></td>
              <td className="px-3 py-1.5 text-right">{yen(p.sales)}</td>
              <td className={`px-3 py-1.5 text-right text-base font-bold ${p.gross < 0 ? 'text-ig-danger' : ''}`}>{yen(p.gross)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
