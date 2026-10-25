'use client';

import { useState } from 'react';
import { LiveBanner, useIke } from '@/components/Live';
import { sampleStats } from '@/lib/mendan-sample';
import { pct, type StatsResp } from '@/lib/live/keisai';

// 案件ページの反応（今の /case-stats.html・見るだけ）。返ってくるのは数だけ（名前は来ない）
const PERIODS = [{ v: 'last_30d', label: '直近30日' }, { v: 'last_90d', label: '直近90日' }, { v: 'last_12w', label: '直近12週' }, { v: 'custom', label: '日付で選ぶ' }] as const;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function StatsTab() {
  const [period, setPeriod] = useState<string>('last_30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const path = period === 'custom' ? (YMD.test(from) && YMD.test(to) ? `case-stats?period=custom&from=${from}&to=${to}` : null) : `case-stats?period=${period}`;
  const st = useIke<StatsResp>(path);
  const d = st.live ? st.data : st.state === 'sample' ? sampleStats() : null;
  const maxW = Math.max(1, ...(d?.weekly ?? []).map((w) => w.detailOpen));
  return (
    <>
      <LiveBanner state={path ? st.state : 'live'} error={st.error} onReload={st.reload} note="案件ページ（公式LINEの案件情報）の反応です。数だけで、名前は出ません" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="期間" className="min-h-9 rounded-[10px] border border-field bg-surface px-2.5 text-[13px]">
          {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
        </select>
        {period === 'custom' && <>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="いつから" className="min-h-9 rounded-[10px] border border-field bg-surface px-2.5 text-[13px]" />〜
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="いつまで" className="min-h-9 rounded-[10px] border border-field bg-surface px-2.5 text-[13px]" />
        </>}
        {d && <span className="text-[12px] text-faint">友だち {d.friends.toLocaleString()}人・操作した人 {d.totals.users}人・操作 {d.totals.events.toLocaleString()}回</span>}
      </div>
      {!d ? <div className="rounded-xl border border-line bg-surface px-5 py-8 text-center text-[13px] text-muted">{period === 'custom' && !path ? '日付を2つ選んでください' : '読み込み中…'}</div> : (<>
        <section className="rounded-xl border border-line bg-surface">
          <div className="border-b border-line-soft px-4 py-2.5"><h2 className="text-[14.5px] font-bold">流れ（実人数）</h2></div>
          <ol className="flex flex-col gap-1.5 px-4 py-3">
            {d.funnel.steps.map((s) => {
              const top = d.funnel.steps[0]?.users || 1;
              return (
                <li key={s.key} className="grid grid-cols-[minmax(120px,200px)_1fr_auto] items-center gap-3 text-[13px]">
                  <div><div className="font-semibold">{s.label}</div><div className="text-[11px] text-faint">{s.hint}</div></div>
                  <div className="h-3 overflow-hidden rounded-full bg-soft"><div className="mo-bar h-full rounded-full" style={{ width: `${Math.min(100, (s.users / top) * 100)}%`, background: 'var(--a)' }} /></div>
                  <div className="num w-[120px] text-right"><b>{s.users}</b>人 <span className="text-[11.5px] text-faint">{s.passRate == null ? '' : `通過 ${pct(s.passRate)}`}</span></div>
                </li>
              );
            })}
          </ol>
        </section>
        <div className="grid gap-3.5 lg:grid-cols-2">
          <section className="overflow-x-auto rounded-xl border border-line bg-surface">
            <div className="border-b border-line-soft px-4 py-2.5"><h2 className="text-[14.5px] font-bold">ボタン別の反応</h2></div>
            <table className="w-full min-w-[480px] border-collapse text-[13px]">
              <thead><tr className="th-row text-left"><th className="px-3 py-2 font-semibold">ボタン</th><th className="px-2 py-2 text-right font-semibold">人</th><th className="px-2 py-2 text-right font-semibold">反応率</th><th className="px-3 py-2 text-right font-semibold">前週比</th></tr></thead>
              <tbody>{d.buttons.map((b) => (
                <tr key={b.event} className="row border-t border-line-soft"><td className="px-3 py-2">{b.label}<div className="text-[11px] text-faint">{b.denominatorLabel ? `分母：${b.denominatorLabel}` : ''}</div></td>
                  <td className="num px-2 py-2 text-right">{b.users}</td><td className="num px-2 py-2 text-right">{pct(b.reactionRate)}</td>
                  <td className="num px-3 py-2 text-right" style={{ color: b.deltaPt == null ? undefined : b.deltaPt >= 0 ? 'var(--color-ok)' : 'var(--color-bad)' }}>{b.deltaPt == null ? '—' : `${b.deltaPt >= 0 ? '+' : ''}${b.deltaPt.toFixed(1)}pt`}</td></tr>))}
                {d.buttons.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">まだありません</td></tr>}</tbody>
            </table>
          </section>
          <section className="overflow-x-auto rounded-xl border border-line bg-surface">
            <div className="border-b border-line-soft px-4 py-2.5"><h2 className="text-[14.5px] font-bold">週ごと（詳細を開いた人・応募した人）</h2></div>
            <table className="w-full min-w-[360px] border-collapse text-[13px]">
              <tbody>{d.weekly.map((w) => (
                <tr key={w.week} className="border-t border-line-soft first:border-t-0"><td className="num whitespace-nowrap px-3 py-1.5 text-muted">{w.week}</td>
                  <td className="w-full px-2 py-1.5"><div className="h-2.5 overflow-hidden rounded-full bg-soft"><div className="mo-bar h-full rounded-full" style={{ width: `${(w.detailOpen / maxW) * 100}%`, background: 'var(--a)' }} /></div></td>
                  <td className="num whitespace-nowrap px-3 py-1.5 text-right">{w.detailOpen}人・応募 {w.applySubmit}</td></tr>))}</tbody>
            </table>
          </section>
        </div>
        <section className="overflow-x-auto rounded-xl border border-line bg-surface">
          <div className="border-b border-line-soft px-4 py-2.5"><h2 className="text-[14.5px] font-bold">案件別</h2></div>
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left"><th className="px-3 py-2 font-semibold">案件</th><th className="px-2 py-2 text-right font-semibold">一覧で見た</th><th className="px-2 py-2 text-right font-semibold">詳細</th><th className="px-2 py-2 text-right font-semibold">開封率</th><th className="px-2 py-2 text-right font-semibold">応募</th><th className="px-3 py-2 text-right font-semibold">応募率</th></tr></thead>
            <tbody>{d.posts.map((p) => (
              <tr key={p.postId} className="row border-t border-line-soft"><td className="px-3 py-2">{p.title}<div className="text-[11px] text-faint">{p.area ?? ''}{p.pinned ? '・固定' : ''}</div></td>
                <td className="num px-2 py-2 text-right">{p.cardImpr}</td><td className="num px-2 py-2 text-right">{p.detailOpen}</td><td className="num px-2 py-2 text-right">{pct(p.openRate)}</td>
                <td className="num px-2 py-2 text-right">{p.applySubmit}</td><td className="num px-3 py-2 text-right">{pct(p.applyRate)}</td></tr>))}
              {d.posts.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">まだありません</td></tr>}</tbody>
          </table>
          {!!d.meta?.notes?.length && <div className="px-4 py-2 text-[11.5px] text-faint">{d.meta.notes.map((n) => <div key={n}>※ {n}</div>)}</div>}
        </section>
      </>)}
    </>
  );
}
