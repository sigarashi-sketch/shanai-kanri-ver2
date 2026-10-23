'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Send } from 'lucide-react';
import { READ_FIX, TS_MONTH, TS_ROWS, type TsRow, type TsState } from '@/lib/timesheet-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

// 勤務表の届き具合（労務/営業管理）＝現場の勤務表（客先の様式）の今月分が届いたかを、取引先ごと・人ごとに見る。
//   ・届いた／未着／読めない。未着は本人・取引先にお願い（あおい）、読めないは「どうしたか」を選ぶ
//   ・届いた勤務表は毎晩読み、日ごとの時間を freee の打刻と比べる（1日30分未満のずれは数えない）
//   ・?view=person で人ごとの表から開く
type View = 'partner' | 'person';
const ST: Record<TsState | 'お願い済み', { bg: string; fg: string }> = {
  届いた: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  未着: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
  読めない: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)' },
  お願い済み: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
};
const isOpen = (r: TsRow, asked: Record<string, boolean>) => (r.state === '未着' && !asked[r.id]) || r.state === '読めない';
// 並びは、はじめの「手を打つ」ものが多い順で固定（片づけるたびに取引先の枠や行が動かないように）
const FIRST_OPEN = Object.fromEntries(TS_ROWS.map((r) => [r.id, r.state !== '届いた']));
const partnerOpen = (name: string) => TS_ROWS.filter((r) => r.partner === name && FIRST_OPEN[r.id]).length;
const REASK = '取引先に読める形で出し直しをお願いした';

export default function TimesheetPage() {
  const canEdit = usePerms().can('roumu', 'edit');
  const { hit, toast } = useMotivation();
  const [view, setView] = useState<View>('partner');
  const [rows, setRows] = useState<TsRow[]>(TS_ROWS);
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('view') === 'person') setView('person'); }, []);

  const open = rows.filter((r) => isOpen(r, asked));
  const initial = TS_ROWS.filter((r) => r.state !== '届いた').length;
  const partners = [...new Set(rows.map((r) => r.partner))].map((name) => ({ name, rs: rows.filter((r) => r.partner === name) }))
    .sort((a, b) => partnerOpen(b.name) - partnerOpen(a.name));
  const pulse = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1300); };

  const ask = (rs: TsRow[]) => {
    const ids = rs.map((r) => r.id);
    setAsked((a) => ({ ...a, ...Object.fromEntries(ids.map((id) => [id, true])) }));
    if (rs.length === 1) pulse(rs[0].id);
    hit(rs.length);
    toast({ text: rs.length > 1 ? `${rs.length}人ぶんの勤務表をお願いしました` : `${rs[0].name} の勤務表をお願いしました`, sub: `→ あおいから本人に、担当営業から取引先に「${TS_MONTH.label}を ${TS_MONTH.due} までに」と送りました`, undo: () => setAsked((a) => { const n = { ...a }; ids.forEach((id) => delete n[id]); return n; }) });
  };
  const resolve = (r: TsRow, how: string) => {
    // 出し直しをお願いしたものは「届いた」にせず、未着（お願い済み）に戻して届くのを待つ
    const reask = how === REASK;
    const prev = { state: r.state, unreadable: r.unreadable };
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, state: reask ? '未着' : '届いた', unreadable: how } : x)));
    if (reask) setAsked((a) => ({ ...a, [r.id]: true }));
    pulse(r.id); hit();
    toast({
      text: `${r.name} の勤務表を「${how}」にしました`,
      sub: reask ? '→ 担当営業から取引先に出し直しをお願いしました・届いたら毎晩の読み取りで時間が出ます' : '→ 勤怠の締めと請求書づくりに反映しました',
      undo: () => { setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...prev } : x))); if (reask) setAsked((a) => { const n = { ...a }; delete n[r.id]; return n; }); },
    });
  };

  const diff = (r: TsRow) => {
    if (r.sheetH == null || r.freeeH == null) return <span className="text-[12px] text-faint">{r.state === '届いた' ? '手で確かめた' : '—'}</span>;
    const d = Math.round((r.freeeH - r.sheetH) * 10) / 10;
    const off = r.offDays ?? 0;
    const big = off >= 3;
    return <div className="text-[12px]"><span className="num whitespace-nowrap">勤務表 {r.sheetH}h／freee {r.freeeH}h</span>
      <div className={big ? 'font-semibold text-warn' : off ? 'text-muted' : 'text-ok'}>{off ? `差 ${d > 0 ? '+' : ''}${d}h・30分以上ずれた日 ${off}日${big ? '' : '（少ないので様子見）'}` : '合っている（ずれは丸めの内）'}</div></div>;
  };
  const action = (r: TsRow) => {
    if (r.state === '未着') return asked[r.id] ? <span className="chip" style={{ background: ST['お願い済み'].bg, color: ST['お願い済み'].fg }}>お願い済み</span>
      : <button onClick={() => ask([r])} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} className="min-h-8 rounded-lg border border-field bg-surface px-2.5 text-[12px] font-semibold disabled:opacity-40">お願いする（あおい）</button>;
    if (r.state === '読めない') return <select aria-label="どうしたか" value="" disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onChange={(e) => e.target.value && resolve(r, e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-[12px] disabled:opacity-40"><option value="">どうしたか選ぶ</option>{READ_FIX.map((x) => <option key={x}>{x}</option>)}</select>;
    return <span className="text-[12px] text-faint">{r.arrivedAt} 着</span>;
  };
  // 部品にせず関数で描く（描くたびに行が作り直されて選択中の欄が閉じないように）
  const row = (r: TsRow, showPartner?: boolean) => (
    <tr key={r.id} className={`border-t border-line-soft align-top ${flash === r.id ? 'mo-flash' : 'row'}`}>
      <td className="px-4 py-2.5"><Link href={`/jinji/staff/${r.personId}`} className="font-semibold hover:underline">{r.name}</Link><div className="text-[11.5px] text-faint">{r.site}</div></td>
      {showPartner && <td className="px-2 py-2.5 text-[12.5px]">{r.partner}</td>}
      <td className="px-2 py-2.5 text-[12px] text-muted">{r.route}</td>
      <td className="px-2 py-2.5"><span className="chip" style={{ background: ST[r.state].bg, color: ST[r.state].fg }}>{r.state}</span>{r.state !== '届いた' && r.unreadable && <div className="mt-1 text-[11.5px] text-muted">{r.unreadable}</div>}</td>
      <td className="px-2 py-2.5">{diff(r)}</td>
      <td className="px-4 py-2.5">{action(r)}</td>
    </tr>
  );
  const head = (showPartner?: boolean) => <thead><tr className="th-row text-left"><th className="px-4 py-2 font-semibold">社員</th>{showPartner && <th className="px-2 py-2 font-semibold">取引先</th>}<th className="px-2 py-2 font-semibold">届く道すじ</th><th className="px-2 py-2 font-semibold">今月分</th><th className="px-2 py-2 font-semibold">freee の打刻との差</th><th className="px-4 py-2 font-semibold" /></tr></thead>;
  const waitingAsk = rows.filter((r) => r.state === '未着' && !asked[r.id]);

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="勤務表の届き具合" sub={`現場の勤務表（客先の様式）の${TS_MONTH.label}・届く目安は ${TS_MONTH.due}・見本データ`}>
        <div className="flex rounded-[10px] border border-field bg-surface p-0.5 text-[12.5px] font-semibold">
          {([['partner', '取引先ごと'], ['person', '人ごと']] as const).map(([k, l]) => <button key={k} onClick={() => setView(k)} className={`min-h-8 rounded-lg px-3 ${view === k ? 'text-white' : 'text-muted'}`} style={view === k ? { background: 'var(--a)' } : undefined}>{l}</button>)}
        </div>
      </PageTitle>

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={open.length} total={initial} />
        <div className="text-[13px]"><b>手を打つ勤務表 残り {open.length}件</b>
          <span className="ml-2 text-muted">届いた {rows.filter((r) => r.state === '届いた').length}・未着 {rows.filter((r) => r.state === '未着').length}（お願い済み {rows.filter((r) => r.state === '未着' && asked[r.id]).length}）・読めない {rows.filter((r) => r.state === '読めない').length}</span>
          {!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}
        </div>
        <button onClick={() => waitingAsk.length && ask(waitingAsk)} disabled={!canEdit || waitingAsk.length === 0} title={!canEdit ? needText('edit') : undefined} className="btn-primary ml-auto inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-40"><Send size={15} />未着 {waitingAsk.length}人にまとめてお願い</button>
        <Link href="/roumu/shime" className="text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>勤怠の締めへ</Link>
      </div>

      {open.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-8 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-[15px] font-bold">今月の勤務表は、手を打つものがなくなりました</div>
          <div className="mt-1 text-[12.5px] text-muted">お願いした分が届いたら、毎晩の読み取りで freee との差が出ます。</div>
        </div>
      )}

      {view === 'partner' ? partners.map((p, i) => (
        <section key={p.name} className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: i + 2 }}>
          <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5"><b className="text-[14px]">{p.name}</b><span className="text-[12px] text-muted">{p.rs.filter((r) => r.state === '届いた').length} / {p.rs.length}人 届いた</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-[13px]">{head()}<tbody>{p.rs.map((r) => row(r))}</tbody></table></div>
        </section>
      )) : (
        <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <div className="overflow-x-auto"><table className="w-full min-w-[860px] border-collapse text-[13px]">{head(true)}<tbody>{[...rows].sort((a, b) => Number(FIRST_OPEN[b.id]) - Number(FIRST_OPEN[a.id])).map((r) => row(r, true))}</tbody></table></div>
        </div>
      )}
      <p className="text-[11.5px] text-faint">取引先の「送付不要」は、こちらから上位に送らなくてよいという意味で、届かない理由にはしていません。勤務表は届いたものを毎晩読み、1日30分未満のずれは合っている扱いにしています（見本の中だけで動きます）。</p>
    </main>
  );
}
