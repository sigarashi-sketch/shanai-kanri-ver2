'use client';

import { useState } from 'react';
import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { PersonName } from '@/components/Person';
import { HoryuNote, Panel, fmtDate, fmtDateTime, useHoryu } from '@/components/Horyu';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { NARR_PERSON_SAMPLE, NARR_SAMPLE } from '@/lib/horyu-sample';
import { NARR_LABEL, type NarrPerson, type NarrRes } from '@/lib/horyu';

// 決着ナラティブ（今の narratives.html の「読む」部分を写したもの・保留）。
//   決着（辞退・参画・連絡途絶）した人が、決着の前に何と言っていたかを木（結末／大分類／葉）にまとめたもの。
//   木の枝を押すとその発言、発言を押すとその人の会話（決着の前の窓）が出る。
//   ★抽出・整理（extract / cluster / 取り込み）は写していない（書く操作・費用がかかる操作のため）。健康欄は出さない
const TONE = { jitai: 'bad', sankaku: 'ok', poa: 'warn', pending: 'mute' } as const;

export default function NarrativesPage() {
  const [run, setRun] = useState('');
  const h = useHoryu<NarrRes>('narr', NARR_SAMPLE, run ? `&run=${run}` : '');
  const d = h.d;
  const [path, setPath] = useState('');
  const [row, setRow] = useState('');
  const runId = d?.run?.id || '';
  const one = useLiveRoute<NarrPerson>(row && h.live ? `/api/live/horyu?view=narr-person&run=${runId}&row=${row}` : null);
  const person: NarrPerson | null = !row ? null : h.live ? (one.live ? one.data : null) : NARR_PERSON_SAMPLE;
  const hits = (d?.rows || []).filter((r) => !path || r.node_path === path || r.node_path.startsWith(path + '/'));

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="決着ナラティブ" sub="決着の前に、本人が何と言っていたか">
        {d && d.runs.length > 0 && <select aria-label="どの回の抽出か" value={run || runId} onChange={(e) => { setRun(e.target.value); setPath(''); setRow(''); }} className="min-h-10 rounded-[10px] border border-field bg-surface px-2 text-body">
          {d.runs.map((r) => <option key={r.id} value={r.id}>v{r.version}（{r.status}・{r.done}/{r.total}人・{fmtDate(r.created_at)}）</option>)}
        </select>}
      </PageTitle>
      <HoryuNote>見るだけです。抽出・整理のやり直しは今の社内システムの画面から。健康の欄は出していません。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="見るだけです" />
      {d && !d.run && <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-body text-muted">終わった抽出がまだありません</div>}
      {d?.run && <div className="grid gap-3.5 xl:grid-cols-[300px_1fr_1fr]">
        <Panel title="木" sub={`${d.rows.length}件の発言`}>
          <button onClick={() => setPath('')} className={`mb-1 w-full rounded-md px-2 py-1 text-left text-sm ${!path ? 'bg-soft font-semibold' : ''}`}>すべて</button>
          <ul className="flex flex-col">
            {d.nodes.map((n) => (
              <li key={n.path}>
                <button onClick={() => { setPath(n.path); setRow(''); }} className={`flex w-full items-center gap-2 rounded-md py-1 pr-1 text-left text-sm ${path === n.path ? 'bg-soft font-semibold' : ''}`} style={{ paddingLeft: 8 + (n.depth - 1) * 14 }}>
                  <span className="truncate">{n.path.split('/').pop()}</span>
                  <span className="ml-auto flex gap-0.5">{(Object.keys(n.outcome_counts) as (keyof typeof TONE)[]).filter((k) => n.outcome_counts[k]).map((k) => <span key={k} className="chip !px-1.5" style={{ background: `var(--tone-${TONE[k]}-bg)`, color: `var(--tone-${TONE[k]}-fg)` }}>{n.outcome_counts[k]}</span>)}</span>
                </button>
              </li>
            ))}
          </ul>
          {!!d.hypotheses.items.length && <div className="mt-3 border-t border-line-soft pt-2">
            <div className="text-sm font-semibold">数字の側の事前登録の仮説{d.hypotheses.updated_at && <span className="ml-1 font-normal text-faint">{fmtDate(d.hypotheses.updated_at)}</span>}</div>
            <ul className="mt-1 flex flex-col gap-1 text-xs">{d.hypotheses.items.map((x) => <li key={x.label}><b>{x.label}</b><div className="break-all text-muted">{x.value}</div></li>)}</ul>
          </div>}
        </Panel>
        <Panel title={path || 'すべての発言'} sub={`${hits.length}件`}>
          <ul className="flex flex-col gap-1.5">
            {hits.map((r) => (
              <li key={r.id}>
                <button onClick={() => setRow(r.row_key)} className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${row === r.row_key ? 'border-field bg-soft' : 'border-line-soft'}`}>
                  <div>「{r.quote}」</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-faint">
                    <span className="chip" style={{ background: `var(--tone-${TONE[r.outcome]}-bg)`, color: `var(--tone-${TONE[r.outcome]}-fg)` }}>{NARR_LABEL[r.outcome]}</span>
                    {r.said_at && <span>{fmtDate(r.said_at)}</span>}{r.settle_band && <span>決着まで {r.settle_band}</span>}{r.commute_dir && <span>通勤 {r.commute_dir}</span>}<span className="truncate">{r.node_path}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={person ? person.name : 'その人の会話'} sub={person ? `${NARR_LABEL[person.outcome]}${person.outcome_at ? `（${fmtDate(person.outcome_at)}）` : ''}・住まい ${person.home_area || '—'}・現場 ${person.site_area || '—'}` : '発言を押すと出ます'} right={person && <PersonName name={person.name}>この人の情報</PersonName>}>
          {row && h.live && one.state === 'loading' && <div className="text-sm text-faint">読み込み中…</div>}
          {row && h.live && one.state === 'error' && <div className="text-sm text-bad">{one.error}</div>}
          {person && <ul className="flex flex-col gap-1.5">{person.messages.map((m, i) => (
            <li key={i} className={`text-sm ${m.in_window ? '' : 'opacity-50'}`}>
              <div className="text-xs text-faint">{fmtDateTime(m.at)}・{m.speaker === 'member' ? '本人' : '社内'}・{m.channel}</div>
              <div className={`whitespace-pre-wrap rounded-lg px-2.5 py-1.5 ${m.used ? 'font-semibold' : ''} ${m.speaker === 'member' ? 'bg-soft' : 'border border-line-soft'}`} style={m.used ? { boxShadow: 'inset 3px 0 0 var(--a)' } : undefined}>{m.text}</div>
            </li>
          ))}</ul>}
        </Panel>
      </div>}
    </main>
  );
}
