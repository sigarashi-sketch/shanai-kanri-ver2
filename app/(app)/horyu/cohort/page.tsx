'use client';

import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { Bars, HoryuNote, Kpi, Panel, pct, useHoryu } from '@/components/Horyu';
import { COHORT_SAMPLE } from '@/lib/horyu-sample';
import type { CohortRes } from '@/lib/horyu';

// 承諾者の月別・段階（今のホームの「承諾者分析」の数字＝/api/cohort?kpi=1 を写したもの・保留）。
//   承諾した月ごとの参画・辞退、承諾→営業開始→案件打診→客先面談→参画のどこで落ちたか、営業開始までの日数と辞退率、1週間ルール。
//   数字だけ（人の名前は出ない）。データは毎日ミンミカから同期したもの
const WAIT_LABEL: Record<string, string> = { '0-7': '7日以内', '8-14': '8〜14日', '15-30': '15〜30日', '31+': '31日以上', missing: '日付なし' };

export default function CohortPage() {
  const h = useHoryu<CohortRes>('cohort', COHORT_SAMPLE);
  const d = h.d;
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="承諾者の月別・段階" sub="承諾した人がどこまで進み、どこで落ちたか" />
      <HoryuNote>数字だけの画面です（人の名前は出ません）。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="見るだけです" />
      {d && !d.ready && <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">まだ同期されたデータがありません</div>}
      {d && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="承諾" value={`${d.totals.accepted}名`} sub={`決着 ${d.totals.settled}名`} />
          <Kpi label="参画" value={`${d.totals.confirmed}名`} tone="ok" />
          <Kpi label="辞退" value={`${d.totals.declined}名`} tone="bad" />
          <Kpi label="実質辞退率" value={pct(d.totals.effectiveDeclineRateSettled)} sub={`承諾全体に対して ${pct(d.totals.effectiveDeclineRateOverall)}`} />
        </div>
        <div className="grid gap-3.5 lg:grid-cols-2">
          <Panel title="段階ごとの残り" sub="承諾を100%として">
            <ul className="flex flex-col gap-1.5">{d.funnel.map((f) => (
              <li key={f.stage} className="grid grid-cols-[72px_1fr_auto] items-center gap-2 text-sm">
                <span>{f.label}</span>
                <span className="h-4 overflow-hidden rounded-r bg-soft"><i className="mo-bar block h-full rounded-r" style={{ width: `${f.fromAcceptedPct ?? 0}%`, background: 'var(--a)' }} /></span>
                <span className="num w-[150px] text-right">{f.count}名（{pct(f.fromAcceptedPct)}）{f.dropFromPrevPct != null && <small className="ml-1 text-bad">−{f.dropFromPrevPct}%</small>}</span>
              </li>
            ))}</ul>
          </Panel>
          <Panel title="営業開始までの日数と辞退率" sub={`中央値 ${d.waitDays.median ?? '—'}日・上位10% ${d.waitDays.p90 ?? '—'}日`}>
            <Bars items={Object.entries(d.waitDays.byBucket).map(([k, v]) => ({ key: `${WAIT_LABEL[k] || k}（${v.n}名）`, count: v.declineRate ?? 0 }))} fmt={(v) => `辞退 ${v}%`} />
            <div className="mt-2 text-sm text-muted">1週間ルール（承諾から7日以内に営業開始）：<b>{pct(d.oneWeekRule.complianceRate)}</b>（{d.oneWeekRule.within7}/{d.oneWeekRule.evaluable}名）</div>
          </Panel>
        </div>
        <Panel title="承諾した月ごと">
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="text-left text-faint"><th className="py-1 pr-2">承諾月</th><th className="text-right">承諾</th><th className="text-right">参画</th><th className="text-right">辞退</th><th className="text-right">営業中</th><th className="text-right">営業前</th><th className="text-right">参画率（決着）</th><th className="text-right">辞退率（決着）</th></tr></thead>
            <tbody>{d.monthly.map((m) => <tr key={m.month} className="border-t border-line-soft"><td className="num py-1.5 pr-2">{m.month}</td><td className="num text-right">{m.total}</td><td className="num text-right">{m.confirmed}</td><td className="num text-right">{m.declined}</td><td className="num text-right">{m.inSales}</td><td className="num text-right">{m.beforeSales}</td><td className="num text-right">{pct(m.participateRateSettled)}</td><td className="num text-right">{pct(m.declineRateSettled)}</td></tr>)}</tbody></table></div>
        </Panel>
        {!!d.declineByStage.length && <Panel title="辞退した段階"><Bars items={d.declineByStage.map((x) => ({ key: x.stage, count: x.count }))} fmt={(v) => `${v}件`} /></Panel>}
      </>}
    </main>
  );
}
