'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useIke } from '@/components/Live';
import { PersonName } from '@/components/Person';
import { useMikeiken } from '@/components/Mikeiken';
import { MonthPicker, monthsUpTo } from './month';
import { shiftMonthOf, type IkeShiftDetail, type IkeShiftList } from '@/lib/live/shift';

// 当月の実績（シフト表のタブ・10-27 shoya「当月のシフトの実績がみれるリスト」）。
//   今月（暦の月）に本人が入れたシフトを人ごとに：出勤の日数・時間・今日までに出た日（シフト上）・これから・休み・空欄。行を開くと日ごとの時間
//   ・上で月を選べる（既定＝今月・過去12か月まで・10-28 shoya「過去分も」）。過去の月は「今日まで」が全部・「これから」は0
//   ・材料はシフト表と同じ GET /api/shift-calendar?action=list&month=／detail（見るだけ）。打刻の実績は「当日の出勤状況」の「出勤の記録」
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const hrs = (s: string, e: string, over: boolean) => {
  const m = (x: string) => { const [h, mm] = x.split(':').map(Number); return h * 60 + mm; };
  if (!s || !e) return 0;
  return Math.max(0, (m(e) + (over || m(e) <= m(s) ? 1440 : 0) - m(s)) / 60);
};

export function JissekiTab({ last }: { last: string }) {
  const [today, setToday] = useState('');
  useEffect(() => setToday(jstToday()), []);
  const thisMonth = today.slice(0, 7);
  const options = useMemo(() => (thisMonth ? monthsUpTo(last && last > thisMonth ? last : thisMonth) : []), [last, thisMonth]);
  const [picked, setPicked] = useState('');
  const month = picked || thisMonth;
  const lq = useIke<IkeShiftList>(month ? `shift-calendar?action=list&month=${month}` : null);
  const mk = useMikeiken();
  const rows = useMemo(() => mk.keep(lq.data?.ok ? lq.data.rows : [], 'name'), [lq.data, mk]);
  const [details, setDetails] = useState<Record<string, IkeShiftDetail | undefined>>({});
  useEffect(() => {
    if (!lq.live || !month) return;
    let stop = false;
    const ids = rows.map((r) => r.lineUserId);
    (async () => {
      for (let i = 0; i < ids.length && !stop; i += 6) {
        const got = await Promise.all(ids.slice(i, i + 6).map((u) => fetch(`/api/ike/shift-calendar?action=detail&month=${month}&user=${encodeURIComponent(u)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null) as Promise<IkeShiftDetail | null>));
        if (!stop) setDetails((d) => ({ ...d, ...Object.fromEntries(got.filter((x): x is IkeShiftDetail => !!x?.ok).map((x) => [x.lineUserId, x])) }));
      }
    })();
    return () => { stop = true; };
  }, [lq.live, rows, month]);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const M = shiftMonthOf(month || jstToday().slice(0, 7));
  const list = rows.map((r) => {
    const d = details[r.lineUserId];
    const work = (d?.days || []).filter((x) => x.kind === 'work');
    const past = work.filter((x) => x.date <= today);
    return { r, d, past: past.length, pastH: past.reduce((a, x) => a + hrs(x.start, x.end, x.overnight), 0), rest: work.length - past.length };
  }).filter((x) => !q || x.r.name.includes(q)).sort((a, b) => a.r.name.localeCompare(b.r.name, 'ja'));
  const tot = list.reduce((a, x) => ({ work: a.work + x.r.work, hours: a.hours + x.r.hours, past: a.past + x.past }), { work: 0, hours: 0, past: 0 });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        {month && <MonthPicker value={month} options={options} onChange={(m) => { setPicked(m); setDetails({}); }} mark={thisMonth} markLabel="今月" />}
        <b className="text-body text-ink">{M.year}年{M.label}のシフトの実績</b>
        <span>{list.length}人・出勤 {tot.work}日（今日まで {tot.past}日）・{Math.round(tot.hours)}時間</span>
        <input aria-label="氏名で探す" placeholder="氏名で探す" value={q} onChange={(e) => setQ(e.target.value)} className="ml-auto min-h-9 w-48 rounded-[10px] border border-field bg-surface px-2.5 text-body" />
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">提出</th>
              <th className="px-2 py-2.5 text-right font-semibold">出勤（シフト）</th><th className="px-2 py-2.5 text-right font-semibold">今日まで</th><th className="px-2 py-2.5 text-right font-semibold">これから</th>
              <th className="px-2 py-2.5 text-right font-semibold">休み</th><th className="px-2 py-2.5 text-right font-semibold">空欄</th><th className="px-4 py-2.5 text-right font-semibold">時間</th>
            </tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-muted">{!lq.live ? (lq.state === 'loading' ? '読み込み中…' : '読めませんでした') : `${M.label}のシフトを入れた人はいません`}</td></tr>}
              {list.map(({ r, d, past, pastH, rest }) => (
                <FragmentRow key={r.lineUserId} open={open === r.lineUserId} onToggle={() => setOpen((o) => (o === r.lineUserId ? null : r.lineUserId))}
                  cells={<>
                    <td className="px-4 py-2"><span className="inline-flex items-center gap-1"><ChevronDown size={14} className={`text-faint transition-transform ${open === r.lineUserId ? '' : '-rotate-90'}`} /><PersonName name={r.name} className="font-semibold" /></span></td>
                    <td className="px-2 py-2"><span className="chip" style={{ background: `var(--tone-${r.submittedAt ? 'ok' : 'caution'}-bg)`, color: `var(--tone-${r.submittedAt ? 'ok' : 'caution'}-fg)` }}>{r.submittedAt ? '提出済み' : '下書き'}</span></td>
                    <td className="num px-2 py-2 text-right">{r.work}日</td>
                    <td className="num px-2 py-2 text-right">{d ? `${past}日・${Math.round(pastH * 10) / 10}h` : '…'}</td>
                    <td className="num px-2 py-2 text-right text-muted">{d ? `${rest}日` : '…'}</td>
                    <td className="num px-2 py-2 text-right text-muted">{r.off}日</td>
                    <td className="num px-2 py-2 text-right text-muted">{r.blank}日</td>
                    <td className="num px-4 py-2 text-right">{r.hours}h</td>
                  </>}
                  detail={<td colSpan={8} className="bg-soft px-4 py-2.5">
                    {!d ? <span className="text-sm text-faint">日ごとを読み込み中…</span> : !d.days.length ? <span className="text-sm text-faint">日ごとの入力はありません</span> : (
                      <div className="flex flex-wrap gap-1.5 text-sm">
                        {d.days.map((x) => { const dw = new Date(`${x.date}T00:00:00Z`).getUTCDay(); return (
                          <span key={x.date} title={x.note || undefined} className="num rounded-md border border-line bg-surface px-2 py-1" style={{ opacity: x.date > today ? 0.6 : 1 }}>
                            {Number(x.date.slice(8))}日({DOW[dw]}) {x.kind === 'work' ? `${x.start}〜${x.overnight ? '翌' : ''}${x.end}` : '休'}
                          </span>); })}
                      </div>
                    )}
                  </td>} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ open, onToggle, cells, detail }: { open: boolean; onToggle: () => void; cells: React.ReactNode; detail: React.ReactNode }) {
  return (<>
    <tr onClick={onToggle} className="row cursor-pointer border-t border-line-soft">{cells}</tr>
    {open && <tr className="border-t border-line-soft">{detail}</tr>}
  </>);
}
