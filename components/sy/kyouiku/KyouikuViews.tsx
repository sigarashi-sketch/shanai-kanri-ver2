'use client';
import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, MousePointerClick, Users } from 'lucide-react';
import { Chip } from '@/components/sy/ui';
import type { ViewsData } from '@/lib/sy/kyouiku-views-types';

// bdsh の クリック数（/kyouiku「クリック数」タブ・2026-10-19 shoya）。
//   コースごとに「コースを開いた回数・人数」と「レッスンを開いた回数」。行を押すと レッスンごとの回数と よく開いた人
//   記録は 受講ページの lib/kyouiku-view.ts → saiyou.kyouiku_views。記録を始めたのは 2026-10-19 から（それより前の数字は無い）
const PERIODS: [number, string][] = [[7, '7日'], [30, '30日'], [90, '90日'], [0, '全期間']];
const when = (s: string) => (s ? new Date(s).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export default function KyouikuViews() {
  const [days, setDays] = useState(30);
  const [staff, setStaff] = useState(false);
  const [d, setD] = useState<ViewsData | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState('');

  useEffect(() => {
    let alive = true;
    fetch(`/api/sy/s/kyouiku/views?days=${days}&staff=${staff ? 1 : 0}`).then(async (r) => {
      const j = await r.json(); if (!alive) return;
      if (!r.ok || !j.ok) { setErr(j.error || '読み込めませんでした'); setD(null); } else { setErr(''); setD(j); }
    }).catch(() => alive && setErr('通信に失敗しました'));
    return () => { alive = false; };
  }, [days, staff]);

  const max = Math.max(1, ...(d?.courses || []).map((c) => c.opens));
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map(([n, l]) => <Chip key={n} on={days === n} onClick={() => setDays(n)}>{l}</Chip>)}
        <span className="mx-1 h-5 w-px bg-ig-border" />
        <Chip on={staff} onClick={() => setStaff(!staff)}>内勤の分も数える</Chip>
        <span className="ml-auto text-xs text-ig-muted">2026-10-19 から記録しています</span>
      </div>

      {err && <p className="mt-4 rounded-lg bg-ig-hover p-3 text-sm text-ig-danger">{err}</p>}
      {!err && !d && <p className="mt-6 text-sm text-ig-muted">読み込み中…</p>}
      {d && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Kpi label="クリック数（合計）" value={d.total} unit="回" Icon={MousePointerClick} sub="コース＋レッスンを開いた回数" />
            <Kpi label="コースを開いた回数" value={d.courses.reduce((s, c) => s + c.opens, 0)} unit="回" Icon={MousePointerClick} sub={`レッスン ${d.courses.reduce((s, c) => s + c.lessonOpens, 0)} 回`} />
            <Kpi label="開いた人" value={d.people} unit="人" Icon={Users} sub={staff ? '要員＋内勤' : '要員だけ'} />
          </div>

          {d.courses.length === 0 ? <p className="mt-6 text-sm text-ig-muted">この期間の記録はまだありません。</p> : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-ig-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-ig-hover text-left text-xs text-ig-muted">
                  <tr><th className="px-3 py-2">コース</th><th className="w-[30%] px-3 py-2">コースを開いた回数</th><th className="px-3 py-2 text-right">人数</th><th className="px-3 py-2 text-right">レッスンを開いた回数</th><th className="px-3 py-2">最後</th></tr>
                </thead>
                <tbody>
                  {d.courses.map((c) => {
                    const on = open === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr className="cursor-pointer border-t border-ig-border hover:bg-ig-hover" onClick={() => setOpen(on ? '' : c.id)}>
                          <td className="px-3 py-2 font-semibold"><span className="inline-flex items-center gap-1">{on ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{c.name}</span></td>
                          <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-ig-hover"><div className="h-2 rounded-full bg-ig-primary" style={{ width: `${(c.opens / max) * 100}%` }} /></div><span className="w-12 text-right tabular-nums">{c.opens}</span></div></td>
                          <td className="px-3 py-2 text-right tabular-nums">{c.people}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{c.lessonOpens}</td>
                          <td className="px-3 py-2 text-xs text-ig-muted">{when(c.last)}</td>
                        </tr>
                        {on && (
                          <tr className="border-t border-ig-border bg-ig-hover/40">
                            <td colSpan={5} className="px-3 py-3">
                              <div className="grid gap-4 md:grid-cols-[1fr_240px]">
                                <div>
                                  <p className="mb-1 text-xs font-semibold text-ig-muted">レッスンごと（開いた回数の多い順）</p>
                                  {c.lessons.length === 0 ? <p className="text-xs text-ig-muted">レッスンを開いた記録はまだありません。</p> : (
                                    <table className="w-full text-xs"><tbody>
                                      {c.lessons.map((l) => (
                                        <tr key={l.id} className="border-t border-ig-border/60"><td className="py-1 pr-2">{l.title}</td><td className="w-16 py-1 text-right tabular-nums">{l.opens}回</td><td className="w-14 py-1 text-right tabular-nums text-ig-muted">{l.people}人</td><td className="w-28 py-1 pl-2 text-ig-muted">{when(l.last)}</td></tr>
                                      ))}
                                    </tbody></table>
                                  )}
                                </div>
                                <div>
                                  <p className="mb-1 text-xs font-semibold text-ig-muted">コースをよく開いた人</p>
                                  {c.who.length === 0 ? <p className="text-xs text-ig-muted">—</p> : (
                                    <ul className="text-xs">{c.who.slice(0, 15).map((w) => <li key={w.name} className="flex justify-between border-t border-ig-border/60 py-1"><span>{w.name}</span><span className="tabular-nums text-ig-muted">{w.opens}回</span></li>)}</ul>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, unit, sub, Icon }: { label: string; value: number; unit: string; sub?: string; Icon: typeof Users }) {
  return (
    <div className="rounded-2xl border border-ig-border p-4">
      <p className="flex items-center gap-1 text-xs text-ig-muted"><Icon size={14} />{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString()}<span className="ml-1 text-sm font-normal text-ig-muted">{unit}</span></p>
      {sub && <p className="mt-0.5 text-xs text-ig-muted">{sub}</p>}
    </div>
  );
}
