'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { PersonName } from '@/components/Person';
import { HoryuNote, Panel, useHoryu } from '@/components/Horyu';
import { NYUUJOU_SAMPLE } from '@/lib/horyu-sample';
import type { NyuujouItem, NyuujouRes } from '@/lib/horyu';

// 入場日カレンダー（今の nyuujou.html を写したもの・保留）。プロパーリストの入場日を月のカレンダーに並べる。
//   読むのは /api/live/horyu?view=nyuujou（joined?action=nyuujou・未経験の人だけ）。見るだけ
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const addMonth = (ym: string, k: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const tone = (x: NyuujouItem) => (x.jitai ? 'bad' : x.poa ? 'warn' : x.kettei ? 'ok' : 'mute');

export default function NyuujouPage() {
  const h = useHoryu<NyuujouRes>('nyuujou', NYUUJOU_SAMPLE);
  const d = h.d;
  const today = d?.today || new Date().toISOString().slice(0, 10);
  const [ym, setYm] = useState('');
  const cur = ym || today.slice(0, 7);
  const byDay = useMemo(() => {
    const m = new Map<string, NyuujouItem[]>();
    for (const x of d?.items || []) { const a = m.get(x.date) || []; a.push(x); m.set(x.date, a); }
    return m;
  }, [d]);
  const [y, mo] = cur.split('-').map(Number);
  const first = new Date(y, mo - 1, 1).getDay();
  const days = new Date(y, mo, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const upcoming = (d?.items || []).filter((x) => x.date >= today && !x.jitai).slice(0, 30);

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="入場日カレンダー" sub="プロパーリストの入場日（現場に入る日）を月ごとに">
        <div className="flex items-center gap-1">
          <button aria-label="前の月" onClick={() => setYm(addMonth(cur, -1))} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5"><ChevronLeft size={16} /></button>
          <span className="min-w-[96px] text-center text-[14px] font-bold">{y}年{mo}月</span>
          <button aria-label="次の月" onClick={() => setYm(addMonth(cur, 1))} className="min-h-10 rounded-[10px] border border-field bg-surface px-2.5"><ChevronRight size={16} /></button>
        </div>
      </PageTitle>
      <HoryuNote>人は未経験の人だけ。色：緑＝参画決定・黄＝ぽあ・赤＝辞退。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="見るだけです。入場日はプロパーリストで直します" />
      {d && <>
        <section className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface">
          <div className="grid grid-cols-7 border-b border-line-soft text-center text-[11.5px] text-faint">{WD.map((w) => <div key={w} className="py-1.5">{w}</div>)}</div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const key = day ? `${cur}-${String(day).padStart(2, '0')}` : '';
              const xs = key ? byDay.get(key) || [] : [];
              return (
                <div key={i} className={`min-h-[78px] border-b border-r border-line-soft p-1 text-[11.5px] ${key === today ? 'bg-soft' : ''}`}>
                  {day && <div className={`num mb-0.5 font-semibold ${key === today ? '' : 'text-faint'}`} style={key === today ? { color: 'var(--ad)' } : undefined}>{day}</div>}
                  <div className="flex flex-col gap-0.5">
                    {xs.map((x) => <span key={x.name} className="truncate rounded px-1" style={{ background: `var(--tone-${tone(x)}-bg)`, color: `var(--tone-${tone(x)}-fg)` }}><PersonName name={x.name} className="font-semibold" /></span>)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <div className="grid gap-3.5 lg:grid-cols-2">
          <Panel title="これからの入場" sub={`${upcoming.length}名（辞退を除く）`}>
            <ul className="flex flex-col text-[12.5px]">{upcoming.map((x) => <li key={x.name + x.date} className="flex flex-wrap gap-2 border-t border-line-soft py-1.5 first:border-t-0"><span className="num w-[84px]">{x.date.slice(5).replace('-', '/')}</span><PersonName name={x.name} /><span className="text-muted">{x.shozoku || '—'}・{x.eki || '—'}</span><span className="ml-auto text-faint">採用担当 {x.tantou || '—'}</span></li>)}</ul>
            {!upcoming.length && <div className="py-2 text-center text-[12.5px] text-faint">いません</div>}
          </Panel>
          <Panel title="日付として読めない入場日" sub="プロパーリストの書き方を直すと載ります">
            <ul className="flex flex-col text-[12.5px]">{d.unreadable.map((x) => <li key={x.name} className="flex gap-2 border-t border-line-soft py-1.5 first:border-t-0"><PersonName name={x.name} /><span className="text-muted">「{x.raw}」</span><span className="ml-auto text-faint">{x.tantou}</span></li>)}</ul>
            {!d.unreadable.length && <div className="py-2 text-center text-[12.5px] text-faint">ありません</div>}
          </Panel>
        </div>
      </>}
    </main>
  );
}
