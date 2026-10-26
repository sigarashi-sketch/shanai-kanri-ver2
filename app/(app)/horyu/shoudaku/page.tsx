'use client';

import { useState } from 'react';
import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { PersonName } from '@/components/Person';
import { HoryuNote, Kpi, Panel, Seg, fmtDate, fmtDateTime, useHoryu, HoryuLoading } from '@/components/Horyu';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { OUTCOME_LABEL, type Outcome, type Story, type StoryList } from '@/lib/horyu';

// 承諾者ストーリー（今の shoudaku.html を写したもの・保留）。
//   承諾した人を新しい順に、結末（参画・辞退・ぽあ・進行中）と決着までの日数で並べる。行を押すと、その人の承諾から決着までの出来事
//   （ヒアリング・案件・LINE・面談・状態）と「ボールを持っていた側」の合計を出す。見るだけ
const TONE: Record<Outcome, string> = { sankaku: 'ok', jitai: 'bad', poa: 'warn', open: 'info' };
const DAYS = [['30', '30日'], ['60', '60日'], ['120', '120日'], ['180', '180日'], ['365', '1年']] as const;
const WHO: Record<string, string> = { member: '本人', staff: '社内', client: '客先', system: '記録' };
const BALL: Record<string, string> = { member: '本人', company: '社内', client: '客先', interview_wait: '面談待ち' };

export default function ShoudakuStory() {
  const [days, setDays] = useState<(typeof DAYS)[number][0]>('120');
  const [f, setF] = useState<Outcome | 'all'>('all');
  const [pick, setPick] = useState('');
  const h = useHoryu<StoryList>('story', `&days=${days}`);
  const d = h.d;
  const one = useLiveRoute<Story>(pick && h.live ? `/api/live/horyu?view=story-person&name=${encodeURIComponent(pick)}` : null);
  const st: Story | null = pick && one.live ? one.data : null;
  const rows = (d?.people || []).filter((p) => f === 'all' || p.outcome === f);

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="承諾者ストーリー" sub="承諾から決着（参画・辞退・ぽあ）までを1人ずつ">
        <Seg value={days} onChange={setDays} options={DAYS} />
      </PageTitle>
      <HoryuNote>人は未経験の人だけ。本文は今のシステムで連絡先・URL を伏せたものです。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="見るだけです" />
      <HoryuLoading state={h.state} />
      {d && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(['sankaku', 'jitai', 'poa'] as const).map((k) => <Kpi key={k} label={`${OUTCOME_LABEL[k]}までの日数（中央値）`} value={d.medians[k] == null ? '—' : `${d.medians[k]}日`} sub={`${d.counts[k]}名`} />)}
          <Kpi label="進行中" value={`${d.people.filter((p) => p.outcome === 'open').length}名`} sub={`承諾 ${d.people.length}名（直近${d.days}日）`} />
        </div>
        <div className="grid gap-3.5 xl:grid-cols-[1fr_1.1fr]">
          <Panel title="承諾した人" sub={`${rows.length}名`} right={<Seg value={f} onChange={setF} options={[['all', 'すべて'], ['sankaku', '参画'], ['jitai', '辞退'], ['poa', 'ぽあ'], ['open', '進行中']] as const} />}>
            <ul className="flex flex-col text-sm">
              {rows.map((p) => (
                <li key={p.name + p.shoudaku_at}>
                  <button onClick={() => setPick(p.name)} className={`grid w-full grid-cols-[1fr_auto] items-center gap-2 border-t border-line-soft px-1 py-2 text-left first:border-t-0 ${pick === p.name ? 'bg-soft' : ''}`}>
                    <span className="flex flex-wrap items-center gap-2"><b>{p.name}</b><span className="text-faint">承諾 {fmtDate(p.shoudaku_at)}・{p.tantou || '—'}</span></span>
                    <span className="flex items-center gap-2"><span className="chip" style={{ background: `var(--tone-${TONE[p.outcome]}-bg)`, color: `var(--tone-${TONE[p.outcome]}-fg)` }}>{OUTCOME_LABEL[p.outcome]}</span><span className="num w-[52px] text-right">{p.days == null ? '—' : `${p.days}日`}</span></span>
                  </button>
                </li>
              ))}
            </ul>
            {!rows.length && <div className="py-3 text-center text-sm text-faint">いません</div>}
          </Panel>
          <Panel title={st ? `${st.name} のストーリー` : 'ストーリー'} sub={st ? `${OUTCOME_LABEL[st.outcome]}${st.outcome_at ? `（${fmtDate(st.outcome_at)}）` : ''}` : '左の人を押すと出ます'} right={st && <PersonName name={st.name}>この人の情報</PersonName>}>
            {pick && h.live && one.state === 'loading' && <div className="text-sm text-faint">読み込み中…</div>}
            {pick && h.live && one.state === 'error' && <div className="text-sm text-bad">{one.error}</div>}
            {st && <>
              <div className="mb-3 flex flex-wrap gap-1.5 text-sm">{Object.entries(st.ball_totals).map(([k, v]) => <span key={k} className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{BALL[k]}が持っていた {Math.round((v / 864e5) * 10) / 10}日</span>)}</div>
              <ol className="relative flex flex-col gap-2 border-l border-line pl-4">
                {st.events.map((e, i) => (
                  <li key={i} className="text-sm">
                    <i className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full" style={{ background: e.who === 'member' ? 'var(--a)' : 'var(--color-faint)' }} />
                    <div className="flex flex-wrap gap-2 text-xs text-faint"><span className="num">{fmtDateTime(new Date(e.t).toISOString())}</span><span>{WHO[e.who] || e.who}{e.sender ? `（${e.sender}）` : ''}</span>{e.estimated && <span>文面からの推定</span>}</div>
                    {e.title && <div className="font-semibold">{e.title}{e.sub && <span className="ml-1 font-normal text-muted">{e.sub}</span>}</div>}
                    {e.text && <div className={`mt-0.5 whitespace-pre-wrap rounded-lg px-2.5 py-1.5 ${e.who === 'member' ? 'bg-soft' : 'border border-line-soft'}`}>{e.text}</div>}
                  </li>
                ))}
              </ol>
            </>}
          </Panel>
        </div>
      </>}
    </main>
  );
}
