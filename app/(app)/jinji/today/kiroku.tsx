'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageTitle } from '@/components/ui';
import { LiveBanner, useIke } from '@/components/Live';
import { PersonName } from '@/components/Person';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { shiftMonthOf } from '@/lib/live/shift';

// 出勤の記録（当日の出勤状況のタブ・10-27 shoya「シフト表のこんな感じのやつに 欠勤 出勤 未打刻の記録残して欲しい 別タブで」）。
//   シフト表と同じ「日×人」のマスに、その日が 出勤／欠勤／未打刻／休み だったかを出す（見るだけ）。
//   ・材料は 3D の出勤ボードと同じ GET /api/attendance-board?date=（1日1回・判定は今のシステム）。月の1日〜今日を3日ずつ読む
//   ・記録を写して持たない＝開くたびに今のシステムから読む（今日の分は今の時点の判定）
//   ・本物は未経験の人だけ（他のタブと同じ）
type St = 'in' | 'absent' | 'off' | 'unknown';
type BoardPerson = { key: string; name: string; st: St; reason?: string; cause?: string; tin?: string; tout?: string; kubun?: string; tantou?: string };
type Board = { ok: boolean; today?: string; people?: BoardPerson[]; error?: { message?: string } | string };

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const ymOf = (back: number) => { const d = new Date(Date.now() + 9 * 3600_000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };

// マスの出し方。不明は理由（cause）で分ける：打刻なし＝未打刻、それ以外（freee 取れず・出勤前・予定だけ）は「?」
type Cell = { label: string; tone: string; title: string; kind: 'in' | 'absent' | 'miss' | 'off' | 'q' };
function cellOf(p: BoardPerson): Cell {
  const t = [p.tin && `出勤 ${p.tin}`, p.tout && `退勤 ${p.tout}`, p.reason].filter(Boolean).join('・');
  if (p.st === 'in') return { label: '出', tone: 'ok', title: t || '出勤', kind: 'in' };
  if (p.st === 'absent') return { label: '欠', tone: 'bad', title: t || '欠勤', kind: 'absent' };
  if (p.st === 'off') return { label: '休', tone: 'mute', title: p.reason || '休み', kind: 'off' };
  if (!p.cause || p.cause === 'nopunch') return { label: '未', tone: 'caution', title: '未打刻（打刻なし）', kind: 'miss' };
  return { label: '?', tone: 'mute', title: p.cause === 'nofreee' ? 'freee から取れなかった' : p.cause === 'before' ? '夜勤・出勤前' : '予定だけ', kind: 'q' };
}

export function KirokuTab({ tabs }: { tabs: React.ReactNode }) {
  const [back, setBack] = useState(0);
  const [today, setToday] = useState('');
  useEffect(() => setToday(jstToday()), []);
  const ym = today ? ymOf(back) : '';
  const M = shiftMonthOf(ym || jstToday().slice(0, 7));
  const lastDay = !ym ? 0 : ym === today.slice(0, 7) ? Number(today.slice(8, 10)) : M.days;
  // 今日の分でログインしているか・読めるかを先に確かめる（ほかの日はそのあと）
  const first = useIke<Board>(ym ? `attendance-board?date=${ym}-01` : null);
  const [boards, setBoards] = useState<Record<string, Board | null>>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!first.live || !ym) return;
    let stop = false;
    setBoards({ [`${ym}-01`]: first.data ?? null });
    setLoading(true);
    const dates = Array.from({ length: Math.max(0, lastDay - 1) }, (_, i) => `${ym}-${String(i + 2).padStart(2, '0')}`);
    (async () => {
      for (let i = 0; i < dates.length && !stop; i += 3) {
        const got = await Promise.all(dates.slice(i, i + 3).map((d) => fetch(`/api/ike/attendance-board?date=${d}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null) as Promise<Board | null>));
        if (!stop) setBoards((b) => ({ ...b, ...Object.fromEntries(dates.slice(i, i + 3).map((d, j) => [d, got[j]])) }));
      }
      if (!stop) setLoading(false);
    })();
    return () => { stop = true; };
  }, [first.live, first.data, ym, lastDay]);

  const mk = useMikeiken();
  const live = first.live;
  const rows = useMemo(() => {
    const by = new Map<string, { key: string; name: string; tantou: string; kubun: string; cells: (Cell | null)[] }>();
    for (let d = 1; d <= lastDay; d++) {
      const b = boards[`${ym}-${String(d).padStart(2, '0')}`];
      for (const p of b?.ok ? b.people || [] : []) {
        let r = by.get(p.key);
        if (!r) { r = { key: p.key, name: p.name, tantou: p.tantou || '', kubun: p.kubun || '', cells: Array.from({ length: M.days }, () => null) }; by.set(p.key, r); }
        r.cells[d - 1] = cellOf(p);
        if (p.tantou) r.tantou = p.tantou;
        if (p.kubun) r.kubun = p.kubun;
      }
    }
    const list = mk.keep([...by.values()], 'name');
    const n = (r: (typeof list)[number], k: Cell['kind']) => r.cells.filter((c) => c?.kind === k).length;
    // 欠勤・未打刻が多い人ほど上
    return list.map((r) => ({ ...r, cnt: { in: n(r, 'in'), absent: n(r, 'absent'), miss: n(r, 'miss') } }))
      .sort((a, b) => b.cnt.absent - a.cnt.absent || b.cnt.miss - a.cnt.miss || a.name.localeCompare(b.name, 'ja'));
  }, [boards, ym, lastDay, M.days, mk]);
  const failed = Object.entries(boards).filter(([, b]) => !b?.ok).map(([d]) => Number(d.slice(8, 10)));
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(false);
  const shown = rows.filter((r) => (!q || r.name.includes(q) || r.tantou.includes(q)) && (!only || r.cnt.absent || r.cnt.miss));
  const days = Array.from({ length: M.days }, (_, i) => ({ d: i + 1, dow: (M.firstDow + i) % 7 }));
  const tot = rows.reduce((a, r) => ({ absent: a.absent + r.cnt.absent, miss: a.miss + r.cnt.miss }), { absent: 0, miss: 0 });

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="当日の出勤状況" sub={`${M.year}年${M.label}の出勤の記録（1日〜${lastDay ? `${lastDay}日` : '今日'}）。3D の出勤ボードと同じ判定を日ごとに並べています`}>
        <div className="flex rounded-[10px] border border-field bg-surface p-0.5 text-sm font-semibold">
          {[0, 1].map((mi) => <button key={mi} onClick={() => setBack(mi)} className={`min-h-8 rounded-lg px-3 ${back === mi ? 'text-white' : 'text-muted'}`} style={back === mi ? { background: 'var(--a)', color: 'var(--ao)' } : undefined}>{mi === 0 ? '今月' : '先月'}</button>)}
        </div>
      </PageTitle>
      {tabs}
      <LiveBanner state={first.state} error={first.error} onReload={() => { setBoards({}); first.reload(); }}
        note={`見るだけです（打刻・欠勤の扱いは「一覧」「欠勤管理」と今のシステムで）。${loading ? '日ごとに読み込み中…' : ''}${failed.length ? `読めなかった日：${failed.join('・')}日` : ''}`} />
      <MikeikenNote mk={mk} live={live} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {[['出', 'ok', '出勤'], ['欠', 'bad', '欠勤'], ['未', 'caution', '未打刻'], ['休', 'mute', '休み'], ['?', 'mute', 'freee 取れず・出勤前・予定だけ']].map(([l, t, n]) => (
          <span key={n} className="chip" style={{ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` }}>{l} {n}</span>
        ))}
        <span className="ml-auto">欠勤 {tot.absent}・未打刻 {tot.miss}（{rows.length}人）</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="氏名・担当で探す" placeholder="氏名・担当で探す" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-9 w-56 rounded-[10px] border border-field bg-surface px-2.5 text-body" />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />欠勤・未打刻がある人だけ</label>
      </div>

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 1 }}>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead><tr className="th-row">
              <th className="sticky left-0 z-10 min-w-[200px] bg-soft px-3 py-2 text-left font-semibold">社員</th>
              {days.map(({ d, dow }) => <th key={d} className={`w-8 px-0 py-1.5 text-center font-semibold ${dow === 0 ? 'text-bad' : dow === 6 ? 'text-ok' : ''}`}><div className="num">{d}</div><div className="text-xs font-normal text-faint">{DOW[dow]}</div></th>)}
              <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">出勤</th>
              <th className="whitespace-nowrap px-2 py-2 text-left font-semibold">欠勤</th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">未打刻</th>
            </tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={M.days + 4} className="px-4 py-6 text-center text-body text-muted">{!live ? (first.state === 'loading' ? '読み込み中…' : '読めませんでした') : loading ? '読み込み中…' : '当てはまる人はいません'}</td></tr>}
              {shown.map((r, pi) => (
                <tr key={r.key} className="mo-fade-in row border-t border-line-soft" style={{ ['--i' as string]: Math.min(pi, 20) }}>
                  <td className="sticky left-0 z-10 bg-surface px-3 py-2 align-top">
                    <PersonName name={r.name} />
                    <div className="text-xs text-faint">{[r.tantou && `担当 ${r.tantou}`, r.kubun && `勤務区分 ${r.kubun}`].filter(Boolean).join('・')}</div>
                  </td>
                  {r.cells.map((c, i) => (
                    <td key={i} className="p-0.5">
                      <span title={c ? `${i + 1}日：${c.title}` : i < lastDay ? `${i + 1}日：記録なし` : ''} className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold"
                        style={{ background: c ? `var(--tone-${c.tone}-bg)` : 'transparent', color: c ? `var(--tone-${c.tone}-fg)` : undefined, opacity: c?.kind === 'off' || c?.kind === 'q' ? 0.6 : 1, border: c ? 'none' : '1px dashed var(--color-line)' }}>{c?.label}</span>
                    </td>
                  ))}
                  <td className="num px-3 py-2 text-muted">{r.cnt.in}日</td>
                  <td className={`num px-2 py-2 ${r.cnt.absent ? 'font-semibold text-bad' : 'text-muted'}`}>{r.cnt.absent}日</td>
                  <td className={`num px-3 py-2 ${r.cnt.miss ? 'font-semibold' : 'text-muted'}`} style={r.cnt.miss ? { color: 'var(--tone-caution-fg)' } : undefined}>{r.cnt.miss}日</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
