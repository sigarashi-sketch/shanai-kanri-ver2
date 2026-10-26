'use client';

import { useEffect, useState } from 'react';
import { LiveBanner } from '@/components/Live';
import { jinjiPostRead } from '@/lib/live/jinji';

// 社員ページの「勤怠」タブ（10-26 shoya「入ってない本番データもぶちこんで」「勤怠とかも」）。
//   今のシステムの POST /api/jinji-v2?action=kintai＝DB に写した freee の勤怠だけを読む（freee は呼ばない・何も書かない）。
//   毎晩の写しで退職した人の月も残っている（freee から消えても見られる）。写っていない月は出ない（今の名簿の「稼働管理」で開くと写る）
//   左＝写してある月の一覧（総労働・出勤日数・欠勤）、右＝選んだ月の日ごと（今の稼働管理の月次と同じ列）
//   同姓同名で freee の番号が決まらないときは、番号を選んでもらう（別人の勤怠を出さない）
type Month = { ym: string; totalWorkMins: number; workDays: number; absences: number; overtimeMins: number };
type Day = { date: string; weekday: string; kind: string; kindBase: string; clockIn: string; clockOut: string; breakTime: string; workTime: string; late: number; early: number; empty: boolean };
type View = { periodStart: string; periodEnd: string; freeeYear: number; freeeMonth: number; recordCount: number; days: Day[];
  summary: { totalWork: string; overtime: string; workDays: number; absences: number; holidayWork: string; latenightWork: string } };
type Res = { ok: boolean; found: boolean; ym: string; months: Month[]; view: View | null; pick?: { company_id: string; employee_id: string; num: string }[] };

const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const ymJa = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function PersonKintai({ name }: { name: string }) {
  const [ym, setYm] = useState('');
  const [emp, setEmp] = useState<{ company_id: string; employee_id: string } | null>(null);
  const [r, setR] = useState<Res | null>(null);
  const [err, setErr] = useState('');
  const [n, setN] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let off = false;
    setErr(''); setBusy(true);
    jinjiPostRead<Res>('kintai', { name, ...(ym ? { ym } : {}), ...(emp ?? {}) })
      .then((j) => { if (!off) setR(j); })
      .catch((e) => { if (!off) setErr((e as Error).message); })
      .finally(() => { if (!off) setBusy(false); });
    return () => { off = true; };
  }, [name, ym, emp, n]);

  if (err) return <LiveBanner state="error" error={`勤怠を読めませんでした（${err}）`} onReload={() => setN((x) => x + 1)} />;
  if (!r) return <div className="text-body text-muted">勤怠を読み込み中…</div>;
  if (!r.found) return <Empty text="freee にこの名前の従業員が見つかりませんでした（freee に入る前の人、または名前の表記が違う人）" />;
  if (r.pick?.length) {
    return (
      <section className="rounded-xl border border-line bg-surface px-5 py-4 text-body">
        <h2 className="text-md font-bold">同じ名前の人が freee に2人以上います</h2>
        <p className="mt-1 text-sm text-muted">名簿の勤怠の紐付けが無いので決められません。freee の従業員番号を選んでください（別の人の勤怠を出さないため）</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {r.pick.map((p) => <button key={p.company_id + p.employee_id} type="button" className="btn border border-line bg-surface" onClick={() => { setEmp({ company_id: p.company_id, employee_id: p.employee_id }); setYm(''); }}>番号 {p.num || p.employee_id}</button>)}
        </div>
      </section>
    );
  }
  if (!r.months.length) return <Empty text="この人の勤怠はまだ写っていません（毎晩少しずつ写しています。今の名簿の「稼働管理」で月を開くとすぐ写ります）" />;
  const v = r.view;
  const cur = r.ym;
  return (
    <div className="flex flex-wrap items-start gap-4">
      <section className="w-full overflow-hidden rounded-xl border border-line bg-surface sm:w-[300px]">
        <div className="px-[18px] py-3.5"><h2 className="text-md font-bold">月ごと</h2><div className="text-sm text-faint">DB に写した freee の勤怠（退職した人も残ります）</div></div>
        <table className="w-full border-collapse text-body">
          <thead><tr className="th-row text-left"><th className="px-[18px] py-2 font-semibold">月</th><th className="px-2 py-2 text-right font-semibold">総労働</th><th className="px-2 py-2 text-right font-semibold">出勤</th><th className="px-[18px] py-2 text-right font-semibold">欠勤</th></tr></thead>
          <tbody>{r.months.map((m) => (
            <tr key={m.ym} onClick={() => setYm(m.ym)} aria-selected={m.ym === cur} className={`cursor-pointer border-t border-line-soft ${m.ym === cur ? 'font-semibold' : 'hover:bg-[var(--row-hover)]'}`}
              style={m.ym === cur ? { background: 'var(--as)', color: 'var(--ad)' } : undefined}>
              <td className="px-[18px] py-2">{ymJa(m.ym)}</td><td className="num px-2 py-2 text-right">{hm(m.totalWorkMins)}</td>
              <td className="num px-2 py-2 text-right">{m.workDays}日</td><td className={`num px-[18px] py-2 text-right ${m.absences ? 'text-bad' : ''}`}>{m.absences || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <section className={`min-w-0 flex-[999_1_560px] overflow-hidden rounded-xl border border-line bg-surface ${busy ? 'opacity-60' : ''}`}>
        {!v ? <div className="px-[18px] py-6 text-body text-muted">{ymJa(cur)}の日ごとの勤怠は写っていません</div> : (
          <>
            <div className="px-[18px] py-3.5">
              <h2 className="text-md font-bold">{ymJa(cur)}<span className="ml-2 text-sm font-normal text-faint">{md(v.periodStart)}〜{md(v.periodEnd)}（freee の {v.freeeYear}年{v.freeeMonth}月度）</span></h2>
              <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span>総労働 <b className="num">{v.summary.totalWork}</b></span><span>残業 <b className="num">{v.summary.overtime}</b></span>
                <span>出勤 <b className="num">{v.summary.workDays}日</b></span><span className={v.summary.absences ? 'text-bad' : ''}>欠勤 <b className="num">{v.summary.absences}日</b></span>
                <span className="text-muted">休日労働 {v.summary.holidayWork}・深夜 {v.summary.latenightWork}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-body">
                <thead><tr className="th-row text-left"><th className="px-[18px] py-2 font-semibold">日</th><th className="px-2 py-2 font-semibold">区分</th><th className="px-2 py-2 font-semibold">出勤</th><th className="px-2 py-2 font-semibold">退勤</th><th className="px-2 py-2 text-right font-semibold">休憩</th><th className="px-[18px] py-2 text-right font-semibold">労働</th></tr></thead>
                <tbody>{v.days.map((d) => {
                  const off = d.weekday === '土' || d.weekday === '日';
                  return (
                    <tr key={d.date} className={`border-t border-line-soft ${d.empty ? 'text-faint' : ''}`}>
                      <td className={`whitespace-nowrap px-[18px] py-1.5 ${off ? 'text-muted' : ''}`}>{md(d.date)}（{d.weekday}）</td>
                      <td className={`px-2 py-1.5 ${d.kindBase === '欠勤' ? 'text-bad' : ''}`}>{d.kind || '—'}{(d.late || d.early) ? <span className="ml-1 text-xs text-warn">{d.late ? `遅刻${d.late}分` : ''}{d.early ? `早退${d.early}分` : ''}</span> : null}</td>
                      <td className="num px-2 py-1.5">{d.clockIn || '—'}</td><td className="num px-2 py-1.5">{d.clockOut || '—'}</td>
                      <td className="num px-2 py-1.5 text-right">{d.breakTime || '—'}</td><td className="num px-[18px] py-1.5 text-right">{d.workTime || '—'}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <section className="rounded-xl border border-dashed border-field bg-surface px-6 py-10 text-center text-body text-muted">{text}</section>;
}
