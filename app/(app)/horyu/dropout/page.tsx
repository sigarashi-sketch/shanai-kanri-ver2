'use client';

import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { PersonName } from '@/components/Person';
import { HoryuNote, Kpi, Panel, fmtDate, useHoryu } from '@/components/Horyu';
import { DROPOUT_SAMPLE } from '@/lib/horyu-sample';
import type { DropoutRes } from '@/lib/horyu';

// dropout した人（今の dropout-list.html を写したもの・保留）。dropout（飛び）の印が付いた人を新しい順に、営業リストの担当・チェックを重ねて。
//   印を付ける・外すのはプロパーリスト・従業員名簿のボタン（ここは見るだけ）
const PHASE: Record<string, string> = { eigyo: '営業中', kettei: '参画決定後', kadou: '稼働中' };

export default function DropoutPage() {
  const h = useHoryu<DropoutRes>('dropout', DROPOUT_SAMPLE);
  const rows = h.d?.rows || [];
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="dropout した人" sub="連絡が取れなくなった（飛んだ）人" />
      <HoryuNote>人は未経験の人だけ。印はプロパーリスト・従業員名簿で付け外しします。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="見るだけです" />
      {h.d && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(['eigyo', 'kettei', 'kadou'] as const).map((p) => <Kpi key={p} label={`${PHASE[p]}に dropout`} value={`${rows.filter((r) => r.phase === p).length}名`} />)}
          <Kpi label="合計" value={`${rows.length}名`} />
        </div>
        <Panel title="一覧" sub="新しい順">
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-[12.5px]"><thead><tr className="text-left text-faint"><th className="py-1 pr-2">名前</th><th className="pr-2">dropout</th><th className="pr-2">いつの段階</th><th className="pr-2">採用担当</th><th className="pr-2">所属</th><th className="pr-2">承諾日</th><th className="pr-2">入場日</th><th>状態</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.name + r.at} className="border-t border-line-soft">
              <td className="py-1.5 pr-2"><PersonName name={r.name} /></td><td className="num pr-2">{fmtDate(r.at)}</td><td className="pr-2">{PHASE[r.phase] || r.phase || '—'}</td>
              <td className="pr-2">{r.tantou || '—'}</td><td className="pr-2">{r.shozoku || '—'}</td><td className="num pr-2">{r.shoudakuBi || '—'}</td><td className="num pr-2">{r.nyuujouBi || '—'}</td>
              <td className="flex flex-wrap gap-1 py-1.5">{r.taisha && <span className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>退社{r.taishaBi ? ` ${r.taishaBi}` : ''}</span>}{r.taiki && <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>待機</span>}{r.jitai && <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>辞退</span>}{r.sankakuKettei && <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>参画決定</span>}{!r.inSales && <span className="text-faint">営業リストに無し</span>}</td>
            </tr>)}</tbody></table></div>
          {!rows.length && <div className="py-3 text-center text-[12.5px] text-faint">いません</div>}
        </Panel>
      </>}
    </main>
  );
}
