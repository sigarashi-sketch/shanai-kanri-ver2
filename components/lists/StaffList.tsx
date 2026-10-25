'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { PEOPLE, STATUS_COUNTS } from '@/lib/sample';
import { GhostButton, PageTitle, Pill, PrimaryButton, TONE } from '@/components/ui';
import { useMotivation } from '@/components/Motivation';
import { needText, usePerms } from '@/components/Perms';
import { isPending, useYoyaku, yoyakuLine } from '@/components/YoyakuStore';
import { LIVE_WRITE_BLOCKED, LiveBanner, useIke } from '@/components/Live';
import { tensekiMarks, toTensekiLive, type IkeTensekiList } from '@/lib/live/tenseki';
import { normName } from '@/lib/live/eigyo-common';
import { TENSEKI } from '@/lib/tenseki-sample';
import { TODAY } from '@/lib/yoyaku-sample';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { MIKEIKEN_NOTE } from '@/lib/live/mikeiken';
import { PersonName } from '@/components/Person';
import { STATUS_LABEL, STATUS_ORDER, slashDate, type LiveStaffList } from '@/lib/live/staff';

// 見本（PEOPLE）と本物（今の従業員名簿）を同じ形に揃えて並べる
type Row = {
  id: string; name: string; sub: string; status: string; site: string; siteSub?: string; contract: string; contractEnd?: string;
  station: string; price: string; sales: string; recruiter: string; kana: string; kintai: { text: string; tone: string }; tag?: string;
};
const PAGE = 150;

export function StaffList({ embedded = false }: { embedded?: boolean }) {
  const { hit, toast } = useMotivation();
  const canEdit = usePerms().can('jinji', 'edit');
  const { rows: yoyaku } = useYoyaku();
  const { data, state, error, reload, live } = useLiveRoute<LiveStaffList>('/api/live/staff');
  // 現場の列の下に、いちばん近い予約を1行（変更の予約と同じデータ・見本のときだけ）
  const nextOf = (id: string) => (live ? undefined : yoyaku.filter((r) => r.personId === id && isPending(r)).sort((a, b) => a.date.localeCompare(b.date))[0]);
  // 転籍（転籍台帳はページに出さず名簿に混ぜる・10-25）。台帳は今のシステムで super_admin と労務事務だけ読める＝読めなければ出ないだけ
  const tk = useIke<IkeTensekiList>(live ? 'tenseki?action=list' : null);
  const tmarks = useMemo(() => {
    if (!live) return tensekiMarks(TENSEKI, TODAY);
    if (!tk.live || !tk.data) return new Map<string, { text: string; pending: boolean }>();
    const t = toTensekiLive(tk.data);
    return tensekiMarks(t.rows, t.today);
  }, [live, tk.live, tk.data]);
  const [tab, setTab] = useState<string>('すべて');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  // 絞り込み（選ぶだけ）。空＝すべて
  const [f, setF] = useState<{ recruiter: string; sales: string; contract: string }>({ recruiter: '', sales: '', contract: '' });

  const all: Row[] = useMemo(() => (live && data
    ? data.rows.map((p) => ({
      id: p.id, name: p.name, kana: p.kana, status: p.status, site: p.site, siteSub: p.siteEki, contract: p.contract,
      contractEnd: p.statusKey === 'yotei' && p.start ? `${slashDate(p.start)} 開始` : undefined,
      station: p.station, price: p.price, sales: p.sales, recruiter: p.recruiter,
      sub: [p.company, p.joined ? `${p.joined.slice(0, 7).replace('-', '/')}入社` : ''].filter(Boolean).join('・') || '—',
      kintai: { text: '—', tone: 'mute' }, tag: p.provisional ? '仮' : p.carriedFrom ? '前月' : undefined,
    }))
    : PEOPLE.map((p) => ({ ...p, sub: `${p.no}・${p.joined.slice(0, 7)}入社`, contractEnd: p.contractEnd }))), [live, data]);
  const tabs = live
    ? [{ label: 'すべて', n: all.length }, ...STATUS_ORDER.map((k) => ({ label: STATUS_LABEL[k], n: all.filter((p) => p.status === STATUS_LABEL[k]).length })).filter((t) => t.n > 0)]
    : STATUS_COUNTS.map((s) => ({ label: s.label as string, n: s.label === 'すべて' ? all.length : all.filter((p) => p.status === s.label).length }));
  const opts = (k: 'recruiter' | 'sales' | 'contract') => Array.from(new Set(all.map((p) => p[k]).filter((v) => v && v !== '—'))).sort((a, b) => a.localeCompare(b, 'ja'));
  const rows = useMemo(() => all.filter((p) => (tab === 'すべて' || p.status === tab) && (!q || (p.name + p.kana + p.site + (p.siteSub || '') + p.station).includes(q))
    && (!f.recruiter || p.recruiter === f.recruiter) && (!f.sales || p.sales === f.sales) && (!f.contract || p.contract === f.contract)), [all, tab, q, f]);
  const shown = rows.slice(0, limit);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const block = live ? LIVE_WRITE_BLOCKED : undefined;

  // 社員一覧（人事）と、要員ページの「従業員名簿」タブ（embedded）の両方で使う。タブの中では main を二重にしない
  const Wrap = embedded ? 'div' : 'main';
  return (
    <Wrap className={`flex flex-col gap-3.5 ${embedded ? 'pb-[120px]' : 'px-6 pb-[120px] pt-[22px]'}`}>
      {!embedded && (
        <PageTitle title="社員一覧" sub={live ? '今の従業員名簿と同じ判定で状態を出しています。名前を押すとこの人の情報（右の矢印で社員ページ）' : '状態は日付つきの履歴から自動で決まります。名前を押すとこの人の情報（右の矢印で社員ページ）'}>
          {live
            ? <button disabled title={LIVE_WRITE_BLOCKED} className="min-h-10 cursor-not-allowed rounded-[10px] border border-field bg-surface px-3.5 text-[13.5px] font-semibold opacity-40">CSV</button>
            : <GhostButton onClick={() => toast({ text: `${rows.length}人を CSV に書き出しました（見本）`, sub: '→ ダウンロードに入る想定です（いまは見本なのでファイルは作りません）' })}>CSV</GhostButton>}
          {live ? <PrimaryButton disabled title={LIVE_WRITE_BLOCKED}>＋ 社員を追加</PrimaryButton>
            : canEdit ? <Link href="/jinji/nyusha" className="btn-primary inline-flex min-h-9 items-center rounded-[10px] px-3.5 text-[13px] font-bold">＋ 社員を追加</Link> : <PrimaryButton disabled title={needText('edit')}>＋ 社員を追加</PrimaryButton>}
        </PageTitle>
      )}
      <LiveBanner state={state} error={error} onReload={reload}
        note={live ? `${data?.month || ''}の名簿（見るだけ）。${MIKEIKEN_NOTE}。今月の勤怠・変更の予約はここには出していません。操作は今の社内システムの従業員名簿から${data?.warnings.length ? `／${data.warnings.join('・')}` : ''}` : undefined} />

      <div className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 1 }} role="tablist">
        {tabs.map((s) => {
          const on = tab === s.label;
          return (
            <button key={s.label} role="tab" aria-selected={on} onClick={() => { setTab(s.label); setLimit(PAGE); }}
              className="min-h-9 rounded-full border px-3.5 text-[13px]"
              style={on ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: 'var(--color-field)', background: 'var(--color-surface)' }}>
              {s.label} <span className="num">{s.n}</span>
            </button>
          );
        })}
      </div>

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
          <label className="flex min-h-9 min-w-[240px] items-center gap-2 rounded-[10px] border border-field px-3 text-faint">
            <Search size={15} /><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} aria-label="この一覧を検索" placeholder="名前・カナ・現場・最寄駅" className="flex-1 bg-transparent text-[13px] text-ink outline-none" />
          </label>
          {([['recruiter', '採用担当'], ['sales', '担当営業'], ['contract', live ? '契約区分' : '契約の形']] as const).map(([k, l]) => (
            <select key={k} aria-label={`${l}で絞る`} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px]" style={f[k] ? { borderColor: 'var(--a)', color: 'var(--ad)', fontWeight: 600 } : undefined}>
              <option value="">{l}：すべて</option>
              {opts(k).map((v) => <option key={v} value={v}>{l}：{v}</option>)}
            </select>
          ))}
          {(f.recruiter || f.sales || f.contract) && <button onClick={() => setF({ recruiter: '', sales: '', contract: '' })} className="text-[12.5px] text-muted underline">絞り込みを外す</button>}
          <span className="ml-auto text-[12.5px] text-muted"><span className="num">{rows.length}</span>人</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left">
              <th className="w-[26px] px-3.5 py-2.5"><input type="checkbox" aria-label="すべて選ぶ" checked={rows.length > 0 && rows.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
              <th className="px-2 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">状態</th><th className="px-2 py-2.5 font-semibold">{live ? '現場（上位会社）' : '現場'}</th><th className="px-2 py-2.5 font-semibold">契約</th><th className="px-2 py-2.5 font-semibold">最寄駅</th><th className="px-2 py-2.5 text-right font-semibold">単価</th><th className="px-2 py-2.5 font-semibold">今月の勤怠</th><th className="px-3.5" />
            </tr></thead>
            <tbody>
              {state === 'loading' && <tr><td colSpan={9} className="px-4 py-10 text-center text-[13px] text-muted">読み込み中…</td></tr>}
              {state !== 'loading' && shown.map((p, i) => (
                <tr key={p.id + i} className={`mo-fade-in border-t border-line-soft ${sel.has(p.id) ? '' : 'row'}`} style={{ ['--i' as string]: Math.min(i, 24) + 3, background: sel.has(p.id) ? 'var(--as)' : undefined }}>
                  <td className="px-3.5 py-2"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`${p.name}を選ぶ`} /></td>
                  <td className="px-2 py-2"><div className="flex items-center gap-2.5">
                    <div aria-hidden className="flex size-[30px] items-center justify-center rounded-full text-[12px] font-bold" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{p.name[0]}</div>
                    <div><PersonName name={p.name} id={p.id} />
                      {p.tag && <span className="chip ml-1.5" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }} title={p.tag === '仮' ? '稼働管理情報一覧にまだ載っていない人（営業リストから立てた行）' : '当月の行が無いので、前の月の行を出しています'}>{p.tag}</span>}
                      <div className="text-[11.5px] text-faint">{p.sub}</div>
                      {tmarks.get(normName(p.name)) && <Link href="/jinji/yoyaku" className="block text-[11.5px] font-semibold hover:underline" style={{ color: tmarks.get(normName(p.name))!.pending ? 'var(--ad)' : 'var(--color-muted)' }}>{tmarks.get(normName(p.name))!.text}</Link>}</div>
                  </div></td>
                  <td className="px-2 py-2"><Pill>{p.status}</Pill></td>
                  <td className="px-2 py-2">{p.site}{p.siteSub && <div className="text-[11.5px] text-faint">{p.siteSub}</div>}{nextOf(p.id) && <Link href="/jinji/yoyaku" className="block text-[11.5px] font-semibold hover:underline" style={{ color: 'var(--ad)' }}>{yoyakuLine(nextOf(p.id)!)}</Link>}</td>
                  <td className="px-2 py-2">{p.contract}{p.contractEnd && <div className="text-[11.5px] font-semibold text-warn">{p.contractEnd}</div>}</td>
                  <td className="px-2 py-2">{p.station}</td>
                  <td className="num px-2 py-2 text-right">{p.price}</td>
                  <td className="px-2 py-2 font-medium" style={{ color: TONE[p.kintai.tone] }} title={live ? '勤怠は今の社内システムの名簿の累積欠勤・ルール欠勤の列で見てください' : undefined}>{p.kintai.text}</td>
                  <td className="px-3.5 py-2"><Link href={`/jinji/staff/${p.id}`} aria-label={`${p.name}の社員ページ`}><ChevronRight size={16} className="text-faint" /></Link></td>
                </tr>
              ))}
              {state !== 'loading' && rows.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-[13px] text-muted">この条件の社員はいません{live ? '' : '（見本データは一部の人だけです）'}</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length > shown.length && (
          <button onClick={() => setLimit((n) => n + PAGE)} className="w-full border-t border-line-soft py-2.5 text-[12.5px] font-semibold" style={{ color: 'var(--ad)' }}>さらに表示（残り {rows.length - shown.length}人）</button>
        )}
        <div className="flex items-center justify-between border-t border-line-soft px-3.5 py-2.5 text-[12.5px] text-muted"><span>全{rows.length}件</span><span>{live ? `${data?.month || ''}の名簿・状態は今日（${data?.today || ''}）の判定` : '見本データは一部の人だけです'}</span></div>
      </div>

      {sel.size > 0 && (
        <div className="mo-scale-in fixed bottom-7 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-[14px] bg-sumi py-2 pl-[18px] pr-2 text-[13.5px] text-white shadow-[0_12px_32px_rgba(25,27,46,.28)]">
          <b className="num">{sel.size}人を選択中</b><span className="h-5 w-px bg-white/20" />
          <button disabled={live} title={block} onClick={() => { const before = sel; hit(); toast({ undo: () => setSel(before), text: `${sel.size}人にLINEを送る準備をしました`, sub: '→ 連絡の下書きに入りました' }); setSel(new Set()); }} className="min-h-9 rounded-[9px] bg-white/10 px-3 text-[13px] disabled:cursor-not-allowed disabled:text-white/50">LINEで送る</button>
          <button disabled={live} title={block} onClick={() => { const before = sel; hit(); toast({ undo: () => setSel(before), text: `${sel.size}人に書類の回収を依頼しました`, sub: '→ 入社手続きの提出待ちに載りました' }); setSel(new Set()); }} className="min-h-9 rounded-[9px] bg-white/10 px-3 text-[13px] disabled:cursor-not-allowed disabled:text-white/50">書類の回収を依頼</button>
          {live
            ? <span title={LIVE_WRITE_BLOCKED} className="inline-flex min-h-9 cursor-not-allowed items-center rounded-[9px] bg-white/10 px-3.5 text-[13px] text-white/50">変更を予約（{sel.size}人）</span>
            : canEdit
              ? <Link href="/jinji/yoyaku" className="btn inline-flex min-h-9 items-center rounded-[9px] px-3.5 text-[13px] font-bold" style={{ background: 'var(--a)', color: 'var(--ao)' }}>変更を予約（{sel.size}人）</Link>
              : <span title={needText('edit')} className="inline-flex min-h-9 cursor-not-allowed items-center rounded-[9px] bg-white/10 px-3.5 text-[13px] text-white/50">変更の予約は「直す」の権限が要ります</span>}
        </div>
      )}
    </Wrap>
  );
}
