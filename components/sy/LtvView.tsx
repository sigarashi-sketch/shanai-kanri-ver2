'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { normName } from '@/lib/sy/name';
import { yen, ymLabel, type LtvData, type LtvPerson } from '@/lib/sy/ltv-types';
import { MemberDrawer } from '@/components/sy/compat';
import { useRoster } from '@/components/sy/useRoster';
import { PageHeader, inputCls } from '@/components/sy/ui';
import { useKept } from '@/components/sy/compat';

// 粗利・LTV（admin と super admin だけ。2026-10-07 shoya「要員の名前あって各月の売上がかいてて LTVがある感じ」）。
//   1行＝要員。月ごとに 売上（上）と 粗利（下・小さく）、右に 売上の累計 と LTV（粗利の累計）。見出しを押すと並べ替え。
//   名前を押すと 従業員名簿と同じ詳細パネル（情報・チャット）
type SortKey = 'ltv' | 'sales' | 'name' | 'nyusha' | `m:${string}`;
export default function LtvView() {
  const [d, setD] = useState<LtvData | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: 'ltv', asc: false });
  const { members, clubs, patchMember } = useRoster();
  const [openKey, setOpenKey] = useKept<string | null>('open', null);   // 更新しても開いていた人に戻す（lib/keep.ts）
  useEffect(() => {
    fetch('/api/sy/s/ltv').then(async (r) => { const j = await r.json().catch(() => null); if (!r.ok || !j || j.error) { setErr(j?.error || '読み込みに失敗しました'); return; } setD(j); }).catch(() => setErr('通信に失敗しました'));
  }, []);
  const keyOfNorm = useMemo(() => { const x = new Map<string, string>(); (members || []).forEach((m) => { const k = normName(m.name); if (!x.has(k) || m.kind === 'employee') x.set(k, m.key); }); return x; }, [members]);
  const openM = openKey ? (members || []).find((m) => m.key === openKey) || null : null;
  const closeMember = useCallback(() => setOpenKey(null), []);

  const months = useMemo(() => d?.months || [], [d]);
  const rows = useMemo(() => {
    const t = q.trim().replace(/[\s　]+/g, '');
    const val = (p: LtvPerson): number | string => sort.k === 'ltv' ? p.gross : sort.k === 'sales' ? p.sales : sort.k === 'name' ? p.name : sort.k === 'nyusha' ? p.nyusha || '9999' : p.months[sort.k.slice(2)]?.sales ?? -Infinity;
    return (d?.people || []).filter((p) => !t || (p.name + p.shozoku).replace(/[\s　]+/g, '').includes(t))
      .sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ja'); return sort.asc ? c : -c; });
  }, [d, q, sort]);
  const total = useMemo(() => {
    const m: Record<string, { sales: number; gross: number }> = {}; let sales = 0, gross = 0;
    rows.forEach((p) => { sales += p.sales; gross += p.gross; months.forEach((ym) => { const v = p.months[ym]; if (!v) return; m[ym] = { sales: (m[ym]?.sales || 0) + v.sales, gross: (m[ym]?.gross || 0) + v.gross }; }); });
    return { m, sales, gross };
  }, [rows, months]);
  const th = (k: SortKey, children: React.ReactNode, left?: boolean) => (
    <button onClick={() => setSort((s) => (s.k === k ? { k, asc: !s.asc } : { k, asc: k === 'name' || k === 'nyusha' }))} className={`inline-flex items-center gap-0.5 font-semibold hover:text-ig-text ${sort.k === k ? 'text-ig-text' : ''} ${left ? '' : 'ml-auto'}`}>
      {children}{sort.k === k && (sort.asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  );
  const neg = (n: number) => (n < 0 ? 'text-ig-danger' : '');

  return (
    <div>
      <PageHeader title="粗利・LTV" sub={err ? '' : !d ? '集計中…（ためていないときは40秒ほど）' : `${rows.length}人・${months.length ? `${months[0].replace('-', '年')}月〜${months[months.length - 1].replace('-', '年')}月` : ''}・admin だけに見えます`}>
        <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ig-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・所属" className={`${inputCls} w-52 pl-9`} /></label>
      </PageHeader>
      <div className="space-y-3 p-4 md:p-6">
        {err && <div className="rounded-lg bg-ig-subtle p-6 text-center text-sm text-ig-danger">{err}</div>}
        {!err && !d && <div className="rounded-lg bg-ig-subtle p-10 text-center text-sm text-ig-muted">いけいけどんどんで 月ごとの売上・粗利を集計しています…</div>}
        {d && (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[['売上の累計', yen(total.sales), ''], ['LTV（粗利の累計）の合計', yen(total.gross), neg(total.gross)], ['1人あたりの LTV', yen(rows.length ? total.gross / rows.length : 0), ''], ['粗利率', total.sales > 0 ? (total.gross / total.sales * 100).toFixed(1) + '%' : '—', '']].map(([k, v, c]) => (
                <div key={k} className="rounded-lg border border-ig-border bg-white px-3 py-2"><div className="text-[11px] text-ig-muted">{k}</div><div className={`text-lg font-bold tabular-nums ${c}`}>{v}</div></div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-lg border border-ig-border bg-white">
              <table className="w-full border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-ig-divider bg-ig-subtle text-[11px] text-ig-muted">
                    <th className="sticky left-0 z-10 bg-ig-subtle px-3 py-2 text-left">{th('name', '要員', true)}</th>
                    <th className="whitespace-nowrap px-3 py-2 text-left">{th('nyusha', '入社日', true)}</th>
                    {months.map((ym) => (
                      <th key={ym} className="whitespace-nowrap border-l border-ig-divider px-3 py-2 text-right">
                        <span className="flex flex-col items-end">{th(`m:${ym}`, `${ymLabel(ym)}の売上`)}<span className="text-[10px] font-normal">{d.basis[ym]?.label || ''}</span></span>
                      </th>
                    ))}
                    <th className="whitespace-nowrap border-l border-ig-divider px-3 py-2 text-right"><span className="flex">{th('sales', '売上の累計')}</span></th>
                    <th className="whitespace-nowrap px-3 py-2 text-right"><span className="flex">{th('ltv', 'LTV')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => { const mk = keyOfNorm.get(normName(p.name)) || ''; return (
                    <tr key={p.key} data-ctx-name={p.name} data-ctx-key={mk} className="border-b border-ig-divider last:border-b-0 hover:bg-ig-subtle">
                      <td className="sticky left-0 z-10 max-w-[11rem] bg-white px-3 py-1.5">
                        {mk ? <button onClick={() => setOpenKey(mk)} title="名簿の詳細・チャットを開く" className="block max-w-full truncate text-left font-semibold underline decoration-ig-border underline-offset-2 hover:text-ig-primary hover:decoration-ig-primary">{p.name}</button>
                          : <span className="block truncate font-semibold">{p.name}</span>}
                        <span className="block truncate text-[11px] text-ig-muted">{p.shozoku || '　'}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-ig-muted">{p.nyusha || '—'}</td>
                      {months.map((ym) => { const v = p.months[ym]; return (
                        <td key={ym} className="whitespace-nowrap border-l border-ig-divider px-3 py-1.5 text-right">
                          {v ? <><div>{yen(v.sales)}</div><div className={`text-[11px] ${v.gross < 0 ? 'text-ig-danger' : 'text-ig-muted'}`}>粗利 {yen(v.gross)}</div></> : <span className="text-ig-border">—</span>}
                        </td>
                      ); })}
                      <td className="whitespace-nowrap border-l border-ig-divider px-3 py-1.5 text-right">{yen(p.sales)}</td>
                      <td className={`whitespace-nowrap px-3 py-1.5 text-right font-bold ${neg(p.gross)}`}>{yen(p.gross)}</td>
                    </tr>
                  ); })}
                  {rows.length === 0 && <tr><td colSpan={months.length + 4} className="p-8 text-center text-sm text-ig-muted">該当する人がいません</td></tr>}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-ig-border bg-ig-subtle font-bold">
                      <td className="sticky left-0 z-10 bg-ig-subtle px-3 py-2">合計（{rows.length}人）</td><td />
                      {months.map((ym) => <td key={ym} className="whitespace-nowrap border-l border-ig-divider px-3 py-2 text-right"><div>{yen(total.m[ym]?.sales || 0)}</div><div className={`text-[11px] font-normal ${neg(total.m[ym]?.gross || 0) || 'text-ig-muted'}`}>粗利 {yen(total.m[ym]?.gross || 0)}</div></td>)}
                      <td className="whitespace-nowrap border-l border-ig-divider px-3 py-2 text-right">{yen(total.sales)}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right ${neg(total.gross)}`}>{yen(total.gross)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="text-[11px] leading-relaxed text-ig-muted">
              数字は いけいけどんどんの「想定賃金・粗利」と同じ計算です（月次PLスプレッドシートの「要員別」シートと同じ）。売上＝請求書があれば請求書の額、無ければ 単価×勤怠。粗利＝売上−給与−社保−交通費。LTV＝粗利の累計（実績）。
              今月ぶんは月の途中で数字が歪むので入れていません。「勤怠仮確定」の月は 請求書がそろうと数字が変わります。集計は6時間ごとに取り直します{d.at && `（いまの数字: ${new Date(d.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 時点）`}。
            </p>
          </>
        )}
      </div>
      {openM && <MemberDrawer m={openM} clubs={clubs} onClose={closeMember} onPatch={(p) => patchMember(openM.key, p)} />}
    </div>
  );
}
