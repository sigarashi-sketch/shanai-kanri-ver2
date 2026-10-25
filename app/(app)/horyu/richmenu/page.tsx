'use client';

import { useState } from 'react';
import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { PersonName } from '@/components/Person';
import { HoryuNote, Kpi, Panel, Seg, Spark, fmtDateTime, pct, useHoryu } from '@/components/Horyu';
import { RICH_SAMPLE } from '@/lib/horyu-sample';
import type { RichPeriod, RichRes } from '@/lib/horyu';

// リッチメニューの反応（今の richmenu-stats.html を写したもの・保留）。
//   公式LINEのメニューのボタンごとに、押された回数・押した人数・反応率（分母＝そのメニューが出ている人数）・24時間以内に届いたか。
//   下は人ごと（紐付いた未経験の人だけ）。★営業中メニューは「勉強会」以外がリンクのボタンで、押されても記録が残らない（0件＝押されていないではない）
const MENU: Record<string, string> = { kadou: '稼働中', sales: '営業中', both: '両方' };

export default function RichmenuPage() {
  const [period, setPeriod] = useState<RichPeriod>('last_30d');
  const h = useHoryu<RichRes>('richmenu', RICH_SAMPLE, `&period=${period}`);
  const d = h.d;
  const [act, setAct] = useState('');
  const top = d?.actions[0]?.action || '';
  const sel = act || top;
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="リッチメニューの反応" sub={d ? `${d.period.label}（${d.period.from}〜${d.period.to}）` : ''}>
        <Seg value={period} onChange={setPeriod} options={[['last_30d', '30日'], ['last_90d', '90日'], ['last_12w', '12週']] as const} />
      </PageTitle>
      <HoryuNote>営業中メニューは「勉強会」以外がリンクのボタンで、押されても記録が残りません（0件は「押されていない」ではありません）。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="見るだけです" />
      {d && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="押された回数" value={d.totals.taps} />
          <Kpi label="押した人" value={`${d.totals.uniqueUsers}人`} />
          <Kpi label="稼働中メニューの人" value={`${d.denominators.kadou}人`} sub="稼働中メニューの反応率の分母" />
          <Kpi label="友だち" value={`${d.denominators.friends}人`} sub="営業中・両方の分母" />
        </div>
        {!!d.denominators.notes.length && <div className="text-[11.5px] text-faint">{d.denominators.notes.join(' ')}</div>}
        <Panel title="ボタンごと">
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-[12.5px]"><thead><tr className="text-left text-faint"><th className="py-1 pr-2">ボタン</th><th className="pr-2">メニュー</th><th className="text-right">回数</th><th className="text-right">人</th><th className="text-right">反応率</th><th className="text-right">24時間以内に届いた</th></tr></thead>
            <tbody>{d.actions.map((a) => <tr key={a.action + a.menu} onClick={() => setAct(a.action)} className={`cursor-pointer border-t border-line-soft ${sel === a.action ? 'bg-soft' : ''}`}><td className="py-1.5 pr-2 font-semibold">{a.label}</td><td className="pr-2">{MENU[a.menu] || a.menu}</td><td className="num text-right">{a.taps}</td><td className="num text-right">{a.uniqueUsers}</td><td className="num text-right">{pct(a.reactionRate)}</td><td className="num text-right">{pct(a.reachRate)}</td></tr>)}</tbody></table></div>
        </Panel>
        <Panel title="週ごとの押した人数" sub={d.actions.find((a) => a.action === sel)?.label || ''}>
          <Spark items={d.weekly.map((w) => ({ date: w.week.slice(5), count: w.counts[sel] || 0 }))} />
          <div className="mt-1 text-[11.5px] text-faint">上の表の行を押すとボタンを切り替えます</div>
        </Panel>
        {d.people && <Panel title="人ごと" sub={`${d.people.rows.length}人（期間内に押した、紐付いた未経験の人）`}>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-[12.5px]"><thead><tr className="text-left text-faint"><th className="py-1 pr-2">名前</th>{d.people.columns.map((c) => <th key={c.action} className="text-right">{c.label}</th>)}<th className="text-right">計</th><th className="text-right">最後</th></tr></thead>
            <tbody>{d.people.rows.map((r) => <tr key={r.name} className="border-t border-line-soft"><td className="py-1.5 pr-2"><PersonName name={r.name} /></td>{d.people!.columns.map((c) => <td key={c.action} className="num text-right">{r.counts[c.action] || ''}</td>)}<td className="num text-right font-bold">{r.total}</td><td className="num text-right text-faint">{fmtDateTime(r.lastTappedAt)}</td></tr>)}</tbody></table></div>
        </Panel>}
      </>}
    </main>
  );
}
