'use client';

import { useState } from 'react';
import { Archive, ArrowUpRight, RefreshCw, RotateCcw } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { errText, horyuPost } from '@/lib/horyu-post';
import { JUCHU, type JuchuCase } from '@/lib/horyu-sample';
import { HoryuNote } from '../HoryuNote';

// 案件受注（保留）。今の社内システムの「案件受注」（juchu.html）。新規開拓アプリで営業が入れた案件を見て、営業共有リストへ転記する。
//   ・一覧＝今の GET /api/kaitaku-cases?action=list&archived=1（読むだけ・下げたものも一緒に取って画面で分ける）
//   ・営業共有リストへ転記＝ stock（案件ストックに P 番号で入る＝案件進捗に載る）／一覧から下げる・戻す＝ archive
//   ・書き込みは /api/live/horyu/juchu から（行き先は決め打ち）
const FIELDS: { k: keyof JuchuCase; l: string }[] = [
  { k: 'station', l: '最寄駅' }, { k: 'duties', l: '業務内容' }, { k: 'work_hours', l: '業務時間' }, { k: 'break_time', l: '休憩時間' }, { k: 'work_days', l: '勤務日数' },
  { k: 'holidays', l: '休日' }, { k: 'start_text', l: '開始時期' }, { k: 'tanka', l: '単価' }, { k: 'notes', l: 'その他特記事項' },
];
const lines = (v: unknown) => String(v ?? '').split(/\r?\n/).map((l) => l.replace(/^[\s　]*[・･\-–—*＊●○◆■>＞]+[\s　]*/, '').trim()).filter(Boolean);
const stamp = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ghost = 'inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 text-[12px] font-semibold disabled:opacity-40';
const tone = (t: string) => ({ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` });

export default function JuchuPage() {
  const jc = useIke<{ ok: boolean; cases: JuchuCase[]; migrationRequired?: boolean }>('kaitaku-cases?action=list&archived=1');
  const live = jc.live;
  const [local, setLocal] = useState<JuchuCase[]>(JUCHU);
  const cases = live ? jc.data?.cases ?? [] : local;
  const can = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const [tab, setTab] = useState<'all' | 'new' | 'done' | 'arch'>('all'), [q, setQ] = useState(''), [busy, setBusy] = useState('');
  const act = cases.filter((c) => !c.archived);
  const shown = cases.filter((c) => (tab === 'arch' ? c.archived : !c.archived) && !(tab === 'new' && c.stock_case_no) && !(tab === 'done' && !c.stock_case_no)
    && (!q || `${c.company_name} ${c.headline}`.toLowerCase().includes(q.toLowerCase())));

  const stock = async (c: JuchuCase) => {
    setBusy(c.id + 's');
    if (!live) { await new Promise((r) => setTimeout(r, 400)); setLocal((l) => l.map((x) => (x.id === c.id ? { ...x, stock_case_no: 'P261025-000000' } : x))); toast({ text: '営業共有リストへ転記しました（見本）' }); setBusy(''); return; }
    const r = await horyuPost<{ caseNo?: string }>('juchu', { op: 'stock', id: c.id });
    setBusy('');
    if (!r.ok) { toast({ text: `転記できませんでした：${errText(r)}` }); return; }
    hit(); toast({ text: `営業共有リストへ転記しました${r.data.caseNo ? `（案件番号 ${r.data.caseNo}）` : ''}`, sub: '→ 案件進捗にも載ります' }); jc.reload();
  };
  const archive = async (c: JuchuCase, archived: boolean) => {
    setBusy(c.id + 'a');
    if (!live) { setLocal((l) => l.map((x) => (x.id === c.id ? { ...x, archived } : x))); setBusy(''); return; }
    const r = await horyuPost('juchu', { op: 'archive', id: c.id, archived });
    setBusy('');
    if (!r.ok) { toast({ text: `できませんでした：${errText(r)}` }); return; }
    toast({ text: archived ? '一覧から下げました' : '一覧に戻しました' }); jc.reload();
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-24 pt-[22px]">
      <PageTitle title="案件受注" sub="新規開拓で受けた案件を確かめて、営業共有リストへ転記します" />
      <HoryuNote from="案件受注" />
      <LiveBanner state={jc.state} error={jc.error} onReload={jc.reload} note="今の案件受注です。転記・下げるは今のシステムに入ります" />
      {live && jc.data?.migrationRequired && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={tone('bad')}>案件受注の表（0119）がまだ適用されていません。適用するまで案件は届きません。</div>}
      <div className="flex flex-wrap gap-3">
        {([['受領', act.length], ['未転記', act.filter((c) => !c.stock_case_no).length], ['転記済', act.filter((c) => c.stock_case_no).length]] as const).map(([l, n]) => (
          <div key={l} className="rounded-xl border border-line bg-surface px-4 py-2.5"><div className="text-[11.5px] text-faint">{l}</div><div className="num text-[20px] font-bold">{n}</div></div>))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 border-b border-line">{([['all', 'すべて'], ['new', '未転記'], ['done', '転記済'], ['arch', '下げたもの']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-3 py-2 text-[13px]" style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>{l}</button>))}</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="会社名・案件名で絞る" className="ml-auto min-h-9 rounded-[10px] border border-field bg-surface px-2.5 text-[13px]" />
        <button className={ghost} onClick={jc.reload}><RefreshCw size={12} />再読み込み</button>
      </div>
      {jc.state === 'loading' && <div className="py-8 text-center text-[13px] text-faint">読み込み中…</div>}
      {jc.state !== 'loading' && !shown.length && <div className="rounded-xl border border-line bg-surface p-6 text-center text-[12.5px] text-muted">該当する案件がありません。</div>}
      <div className="flex flex-col gap-3">
        {shown.map((c) => (
          <article key={c.id} className="rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
              <b className="text-[14.5px]">{c.headline || '（無題の案件）'}</b><span className="text-[13px] text-muted">{c.company_name || '会社名なし'}</span>
              {c.stock_case_no ? <span className="chip" style={tone('ok')}>転記済 {c.stock_case_no}</span> : <span className="chip" style={tone('warn')}>未転記</span>}
              {c.archived && <span className="chip" style={tone('mute')}>下げ済み</span>}
              <span className="ml-auto text-[11.5px] text-faint">{[c.company_pref, c.company_area, c.company_phone && `☎ ${c.company_phone}`, c.owner_name && `担当 ${c.owner_name}`].filter(Boolean).join('　')}　受領 {stamp(c.received_at)}</span>
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 p-3 text-[12.5px]">
              {FIELDS.filter((f) => lines(c[f.k]).length).map((f) => { const ls = lines(c[f.k]); return (<div key={f.k} className="contents">
                <dt className="text-faint">{f.l}</dt><dd>{ls.length === 1 ? ls[0] : <ul className="list-disc pl-4">{ls.map((l, i) => <li key={i}>{l}</li>)}</ul>}</dd></div>); })}
              {!FIELDS.some((f) => lines(c[f.k]).length) && <><dt className="text-faint">内容</dt><dd className="text-faint">項目が未入力です</dd></>}
            </dl>
            <details className="px-3 pb-2 text-[12px]"><summary className="cursor-pointer text-muted">営業共有リストへ渡す案件文を見る</summary><pre className="mt-1 whitespace-pre-wrap rounded-lg bg-soft p-2.5 font-sans">{c.case_text}</pre></details>
            <div className="flex flex-wrap gap-2 border-t border-line-soft p-3">
              <button className="btn-primary inline-flex min-h-8 items-center gap-1 rounded-lg px-3 text-[12.5px] font-semibold disabled:opacity-40" disabled={!can || busy === c.id + 's'} title={can ? undefined : needText('edit')} onClick={() => stock(c)}>
                <ArrowUpRight size={13} />{c.stock_case_no ? '営業共有リストへ再転記' : '営業共有リストへ転記'}</button>
              <button className={ghost} disabled={!can || busy === c.id + 'a'} title={can ? undefined : needText('edit')} onClick={() => archive(c, !c.archived)}>
                {c.archived ? <><RotateCcw size={12} />一覧に戻す</> : <><Archive size={12} />一覧から下げる</>}</button>
            </div>
          </article>))}
      </div>
    </main>
  );
}
