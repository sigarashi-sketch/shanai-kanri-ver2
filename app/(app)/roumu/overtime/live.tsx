'use client';

import { useEffect, useState } from 'react';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { KYOTEI, LEVEL_STYLE, type Level } from '@/lib/roumu-sample';
import type { IkeToday } from '@/lib/live/today';
import type { IkeOvertime } from '@/lib/live/roumu';
import { NotifyButton, Spark, type Notify } from './parts';

// 残業・36協定（本物・10-25）。今の社内システムに残業の一覧の口は無いので、当日の出勤状況の「当月の合計」を使う：
//   GET /api/kintai-today?action=month&date= … 人ごとの当月（暦月1日〜今日）の実働・休暇のみなし・実働日数（freee の月次から・キャッシュ）
//   GET /api/kintai-today?date=&stale=1      … 氏名と担当営業（キャッシュだけ）
//   ★残業は「実働 − 実働日数 × 8時間」の目安（所定が8時間でない人・休日労働・法定外かどうかは見ていない）。見込みは平日の数で月末まで伸ばす
//   ★年の累計・45h超えの回数・2〜6か月平均・直近6か月は freee の月次の写し（roster?op=roumu&action=overtime・法定外＋法定休日）から（10-26）。最終判断は freee の勤怠と社労士で
type MonthRow = { key: string; mins: number; workMins: number; leaveMins: number; days: number; leaveDays: number; state: 'ok' | 'pending' | 'error' | 'unlinked'; detail: string };
type MonthRes = { ok: boolean; date: string; ym: string; rows: MonthRow[]; pending: number; error?: { message: string } };
const jstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function weekdays(from: string, to: string) { let n = 0; for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400e3) { const d = new Date(t).getUTCDay(); if (d && d !== 6) n++; } return n; }
const h1 = (m: number) => Math.round(m / 6) / 10;
function levelOf(p: number, caution: number, danger: number, y?: { over45: number; avg26H: number }): Level {
  if (p >= KYOTEI.spMonthly * danger) return 'danger';
  if (y && y.avg26H >= KYOTEI.avgLimit * 0.9) return 'danger';
  if (y && p > KYOTEI.monthly && y.over45 >= KYOTEI.overCount) return 'danger';
  if (p > KYOTEI.monthly) return 'warn';
  if (p >= KYOTEI.monthly * caution) return 'caution';
  return 'ok';
}

export function useOtProbe() {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => setDate(jstToday()), []);
  const names = useIke<IkeToday>(date ? `kintai-today?date=${date}&stale=1` : null);
  return { date, names };
}

export function OtLive({ date, names, caution, danger, year, n, to }: { date: string; names: ReturnType<typeof useIke<IkeToday>>; caution: number; danger: number; year: IkeOvertime | null; n: Notify; to: (lv: Level) => string[] }) {
  const yOf = new Map((year?.rows || []).map((r) => [r.nn, r.ot]));
  const month = useIke<MonthRes>(`kintai-today?action=month&date=${date}`);
  const mk = useMikeiken();
  const ok = month.live && month.data?.ok !== false;
  const nameOf = new Map((names.data?.rows || []).map((r) => [r.key, r]));
  const start = date.slice(0, 8) + '01';
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const passed = Math.max(1, weekdays(start, date)), all = weekdays(start, end);
  const rows = (ok ? month.data!.rows : [])
    .map((r) => ({ r, p: nameOf.get(r.key) }))
    .filter((x) => x.p && x.r.state !== 'unlinked')
    .map(({ r, p }) => {
      const over = Math.max(0, r.workMins - r.days * 480);
      const proj = Math.round(h1(over) / passed * all);
      const y = yOf.get(r.key);
      return { key: r.key, name: p!.name, rep: p!.rep, total: h1(r.mins), work: h1(r.workMins), days: r.days, over: h1(over), proj, state: r.state, level: levelOf(proj, caution, danger, y), y };
    });
  const kept = mk.keep(rows, 'name').sort((a, b) => b.proj - a.proj);
  const ORDER: Level[] = ['danger', 'warn', 'caution', 'ok'];
  const cnt = (l: Level) => kept.filter((x) => x.level === l).length;
  const err = month.state === 'error' ? month.error : month.data?.ok === false ? month.data.error?.message || '読めませんでした' : '';
  return (
    <div className="flex flex-col gap-3">
      <LiveBanner state={err ? 'error' : month.state} error={err} onReload={month.reload} note="見るだけです。残業は「実働 − 実働日数×8時間」の目安です（所定・休日労働・法定外かどうかは見ていません）" />
      <MikeikenNote mk={mk} live />
      {ok && (month.data!.pending || 0) > 0 && <div className="flex items-center gap-2 text-sm text-warn">freee からまだ取れていない人が {month.data!.pending}人います<button onClick={month.reload} className="font-semibold underline">続きを読む</button></div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['今月の経過', `${passed}/${all}日`, `${date.slice(5).replace('-', '/')} まで（平日で数えています）`],
          ['45h を超えそう（目安）', `${kept.filter((x) => x.proj > KYOTEI.monthly).length}人`, '月末までの見込み（目安）'],
          ['上限間近（目安）', `${cnt('danger')}人`, `特別条項の月 ${KYOTEI.spMonthly}h の${Math.round(danger * 10)}割を超える見込み`],
          ['注意（目安）', `${cnt('caution')}人`, `月 ${KYOTEI.monthly}h の${Math.round(caution * 10)}割に届く見込み`],
        ].map(([l, n, s]) => (
          <div key={l} className="rounded-xl border border-line bg-surface px-4 py-3"><div className="text-sm text-muted">{l}</div><div className="num text-xl font-bold">{n}</div><div className="text-xs text-faint">{s}</div></div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-body">
            <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 text-right font-semibold">今月の総労働</th><th className="px-2 py-2.5 text-right font-semibold">実働日数</th><th className="px-2 py-2.5 font-semibold">残業の目安（いま → 月末の見込み）</th><th className="px-2 py-2.5 font-semibold">年の累計</th><th className="px-2 py-2.5 font-semibold">45h超え</th><th className="px-2 py-2.5 font-semibold">2〜6か月平均</th><th className="px-2 py-2.5 font-semibold">6か月</th><th className="px-2 py-2.5 font-semibold">段階</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody>
              {[...kept].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || b.proj - a.proj).map((x) => (
                <tr key={x.key} className="row border-t border-line-soft">
                  <td className="px-4 py-2.5"><PersonName name={x.name} className="font-semibold underline-offset-2 hover:underline" /><div className="text-xs text-faint">営業 {x.rep || '—'}</div></td>
                  <td className="num px-2 py-2.5 text-right">{x.state === 'pending' ? <span className="text-faint">取得中</span> : `${x.total}h`}</td>
                  <td className="num px-2 py-2.5 text-right">{x.days}日</td>
                  <td className="num px-2 py-2.5"><span className="mr-1 rounded bg-sunken px-1 text-xs text-faint">目安</span><b>{x.over}h</b><span className="text-muted"> → {x.proj}h</span></td>
                  <td className="num px-2 py-2.5">{x.y ? <>{x.y.yearExcessH}<span className="text-faint">／{KYOTEI.special ? KYOTEI.spYearly : KYOTEI.yearly}h</span></> : <span className="text-faint">—</span>}</td>
                  <td className="num px-2 py-2.5" style={{ color: x.y && x.y.over45 >= KYOTEI.overCount - 1 ? 'var(--color-bad)' : undefined }}>{x.y ? <>{x.y.over45}<span className="text-faint">／{KYOTEI.overCount}回</span></> : <span className="text-faint">—</span>}</td>
                  <td className="num px-2 py-2.5" style={{ color: x.y && x.y.avg26H >= KYOTEI.avgLimit * 0.9 ? 'var(--color-bad)' : undefined }} title={x.y?.avg26Months ? `直近${x.y.avg26Months}か月の平均がいちばん大きい` : undefined}>{x.y ? `${x.y.avg26H}h` : <span className="text-faint">—</span>}</td>
                  <td className="px-2 py-2.5">{x.y && x.y.trend.length > 1 ? <Spark xs={x.y.trend} /> : <span className="text-faint">—</span>}</td>
                  <td className="px-2 py-2.5"><span title="目安" className="chip" style={{ background: LEVEL_STYLE[x.level].bg, color: LEVEL_STYLE[x.level].fg }}>{LEVEL_STYLE[x.level].label}</span></td>
                  <td className="px-4 py-2.5 text-right">{x.level === 'ok' ? <span className="text-sm text-faint">—</span> : <NotifyButton n={n} k={`ot-${x.key}`} who={x.name} to={to(x.level)} what="残業の見込み" label="知らせた" />}</td>
                </tr>
              ))}
              {kept.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-muted">{month.state === 'loading' ? 'freee の月次を読んでいます…（数十秒かかることがあります）' : '出せる人がいません'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {n.err && <div className="text-sm text-bad">{n.err}</div>}
      <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-sm text-muted">年の累計（時間外のみ）・45h超えの回数・2〜6か月平均（休日労働込み）・6か月は freee の月次の写しから出した目安です{year ? `（${year.through.replace('-', '/')} まで・年の始まり ${year.startMonth}/1）` : '（読んでいます…）'}。「知らせた」は印を残すだけで、宛先へは送りません（連絡はチャットで）。最終判断は社労士に確認してください。</div>
    </div>
  );
}
