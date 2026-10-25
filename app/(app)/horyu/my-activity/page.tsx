'use client';

import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { HoryuNote, Kpi, Panel, useHoryu } from '@/components/Horyu';
import { MYACT_SAMPLE } from '@/lib/horyu-sample';
import type { MyActRes } from '@/lib/horyu';

// 自分の行動（今の画面の上の「今日の処理」・金曜の「週のふりかえり」・月間の参画リング＝/api/my-activity を1枚にしたもの・保留）。
//   ★数字は自分の分だけ（今のシステムがログインした人の行しか読まない）。他の人と並べない
const KIND: Record<string, string> = { ikou: '意向確認', mendan: '面談', roster: '名簿', teiji: '提示', kintai: '勤怠', other: 'その他' };
const WD = ['月', '火', '水', '木', '金', '土', '日'];
const diff = (a: number, b: number) => (a - b > 0 ? `先週より +${a - b}` : a - b < 0 ? `先週より ${a - b}` : '先週と同じ');

export default function MyActivityPage() {
  const h = useHoryu<MyActRes>('myact', MYACT_SAMPLE);
  const d = h.d;
  const g = d?.goal;
  const ratio = g && g.goal > 0 && g.done != null ? Math.min(1, g.done / g.goal) : 0;
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="自分の行動" sub="今日の処理・今週のふりかえり・今月の参画（自分の分だけ）" />
      <HoryuNote>数字はあなたの分だけです。ほかの人とは並べません。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="見るだけです" />
      {d && !d.signedIn && <div className="text-sm text-muted">ログインした人が分からないので 0 から始まっています</div>}
      {d && <div className="grid gap-3.5 lg:grid-cols-3">
        <Panel title="今日の処理" sub={d.today?.weekAvg != null ? `先週の1日平均 ${d.today.weekAvg}件` : undefined}>
          {d.today ? <>
            <div className="num text-3xl font-bold">{d.today.today}<span className="ml-1 text-body font-normal">件</span></div>
            <div className="mt-1 flex flex-wrap gap-1.5">{Object.entries(d.today.kinds).filter(([, v]) => v).map(([k, v]) => <span key={k} className="chip" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{KIND[k] || k} {v}</span>)}</div>
            <div className="mt-3 flex gap-1">{WD.map((w, i) => <span key={w} className="flex size-7 items-center justify-center rounded-full text-xs font-semibold" style={d.today!.days[i] ? { background: 'var(--a)', color: 'var(--ao)' } : { background: 'var(--color-soft)', color: 'var(--color-faint)' }}>{w}</span>)}</div>
            <div className="mt-1 text-xs text-faint">今週、入力があった日</div>
          </> : <div className="text-sm text-faint">読めませんでした</div>}
        </Panel>
        <Panel title="今月の参画" sub={g ? g.month : ''}>
          {g && g.goal > 0 ? <div className="flex items-center gap-4">
            <svg viewBox="0 0 44 44" className="size-24 -rotate-90"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--color-line)" strokeWidth="5" /><circle cx="22" cy="22" r="18" fill="none" stroke="var(--a)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${ratio * 113.1} 113.1`} /></svg>
            <div><div className="num text-2xl font-bold">{g.done ?? '—'}<span className="text-body font-normal"> / {g.goal}名</span></div><div className="text-sm text-muted">参画決定のチェックが今月付いた人（全体）</div></div>
          </div> : <div className="text-sm text-faint">今月の目標が決まっていません（今の社内システムの設定）</div>}
        </Panel>
        <Panel title="今週のふりかえり" sub={d.week ? `${d.week.from.slice(5)}〜${d.week.to.slice(5)}` : ''}>
          {d.week ? <div className="grid grid-cols-2 gap-2">
            <Kpi label="面談の登録" value={d.week.mendan} sub={diff(d.week.mendan, d.week.mendanPrev)} />
            <Kpi label="意向確認" value={d.week.ikou} sub={`OK率 ${d.week.okRate ?? '—'}%・${diff(d.week.ikou, d.week.ikouPrev)}`} />
            <Kpi label="関わった参画決定" value={`${d.week.sankaku.n}名`} sub={d.week.sankaku.avgDays != null ? `承諾から平均 ${d.week.sankaku.avgDays}日` : undefined} />
            <Kpi label="初回提示3日以内（全体）" value={`${d.week.firstOffer.x}/${d.week.firstOffer.y}`} sub={`先週 ${d.week.firstOffer.prevX}/${d.week.firstOffer.prevY}`} />
          </div> : <div className="text-sm text-faint">読めませんでした</div>}
        </Panel>
      </div>}
    </main>
  );
}
