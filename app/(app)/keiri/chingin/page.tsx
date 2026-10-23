'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { arari, FARE_LABEL, ROWS, SALARY_LABEL, WELFARE_RATE, type ArariRow, type FareSrc, type SalarySrc } from '@/lib/chingin-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { CountUp, RemainRing, useMotivation } from '@/components/Motivation';

// 想定賃金・粗利（経理管理）。人ごとに 売上（請求・税抜）− 給与 − 交通費 − 法定福利（19%）＝ 粗利 と粗利率。
//   ・額面の正はミンミカの内定月給（現場の契約単価の欄は使わない）。内定が無い人は 仮21万
//   ・交通費は 経費の申請の実額 ＞ 定期代の見積もり ＞ 仮25,000円
//   ・「仮」の値が残っている人を、選ぶだけで本当の値に置きかえて片づける
//   ・粗利率の低い人を上に。取引先・営業で絞る
const yen = (n: number) => `${n < 0 ? '−' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`;
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const rateTone = (r: number) => (r < 0.15 ? 'bad' : r < 0.25 ? 'warn' : 'ok');
const isTemp = (r: ArariRow) => r.salarySrc === 'temp' || r.fareSrc === 'temp';
const uniq = (xs: string[]) => [...new Set(xs)];

export default function ChinginPage() {
  const canEdit = usePerms().can('keiri', 'edit');
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<ArariRow[]>(ROWS);
  const [client, setClient] = useState('すべて');
  const [sales, setSales] = useState('すべて');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('client')) setClient(q.get('client')!);
    if (q.get('sales')) setSales(q.get('sales')!);
  }, []);

  const shown = rows.filter((r) => (client === 'すべて' || r.client === client) && (sales === 'すべて' || r.sales === sales))
    .map((r) => ({ r, a: arari(r) })).sort((x, y) => x.a.rate - y.a.rate);
  const sum = shown.reduce((s, { r, a }) => ({ billed: s.billed + r.billed, cost: s.cost + a.salary + a.fare + a.welfare, gross: s.gross + a.gross }), { billed: 0, cost: 0, gross: 0 });
  const tempAll = rows.filter(isTemp);
  const totalTemp = ROWS.filter(isTemp).length;

  const setSrc = (r: ArariRow, k: 'salarySrc' | 'fareSrc', v: SalarySrc | FareSrc) => {
    const before = rows;
    const nr = { ...r, [k]: v } as ArariRow;
    setRows((rs) => rs.map((x) => (x.id === r.id ? nr : x)));
    setFlash(r.id); setTimeout(() => setFlash(null), 1300); hit();
    const was = arari(r), now = arari(nr);
    toast({
      text: `${r.name} の${k === 'salarySrc' ? '給与' : '交通費'}を「${k === 'salarySrc' ? SALARY_LABEL[v as SalarySrc] : FARE_LABEL[v as FareSrc]}」にしました`,
      sub: `→ 粗利 ${yen(was.gross)} → ${yen(now.gross)}（${pct(now.rate)}）・営業別の粗利に反映`,
      undo: () => setRows(before),
    });
  };

  function SrcCell({ r, k, value }: { r: ArariRow; k: 'salarySrc' | 'fareSrc'; value: number }) {
    const opts = Object.keys(k === 'salarySrc' ? r.salary : r.fare) as (SalarySrc | FareSrc)[];
    const cur = r[k];
    const label = (s: string) => (k === 'salarySrc' ? SALARY_LABEL[s as SalarySrc] : FARE_LABEL[s as FareSrc]);
    return (
      <td className="num px-2 py-2.5 text-right">
        {yen(value)}
        {cur === 'temp' && opts.length > 1 ? (
          <select aria-label={`${r.name} の${k === 'salarySrc' ? '給与' : '交通費'}の元`} value={cur} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(e) => setSrc(r, k, e.target.value as SalarySrc)} className="mt-0.5 block w-full rounded-md border px-1 text-[11px] disabled:opacity-50" style={{ borderColor: 'var(--color-warn)', background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>
            {opts.map((s) => <option key={s} value={s}>{s === 'temp' ? `${label(s)}のまま` : `${label(s)} ${yen((k === 'salarySrc' ? r.salary : r.fare)[s as never] ?? 0)}`}</option>)}
          </select>
        ) : <div className="text-[11px] text-faint">{label(cur)}</div>}
      </td>
    );
  }

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="想定賃金・粗利" sub="10月分。売上（請求・税抜）− 給与 − 交通費 − 法定福利（19%）＝ 粗利。粗利率の低い人を上に・見本データ">
        <Link href="/keiri/seikyu" className="inline-flex min-h-10 items-center rounded-[10px] border border-field bg-surface px-3.5 text-[13px] font-semibold">請求書へ</Link>
      </PageTitle>

      <div className="mo-fade-up grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" style={{ ['--i' as string]: 1 }}>
        {([['売上（請求）', sum.billed], ['原価（給与＋交通費＋法定福利）', sum.cost], ['粗利', sum.gross]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-[12px] text-muted">{l}</div>
            <div className="text-[20px] font-bold">¥<CountUp to={v} /></div>
            {l === '粗利' && <div className={`text-[12px] text-${rateTone(sum.billed ? sum.gross / sum.billed : 0)}`}>粗利率 {pct(sum.billed ? sum.gross / sum.billed : 0)}</div>}
          </div>
        ))}
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <RemainRing remain={tempAll.length} total={totalTemp} />
          <div className="text-[12.5px]"><b>仮の値が残る {tempAll.length}人</b><div className="text-muted">選ぶだけで本当の値に</div></div>
        </div>
      </div>

      {tempAll.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-6 text-center">
          <Check className="mx-auto text-ok" size={24} />
          <div className="mt-1.5 text-[14.5px] font-bold">仮の値はもうありません</div>
          <div className="mt-1 text-[12.5px] text-muted">給与と交通費が、全員 本当の値（内定月給・本人提示・経費の申請・定期代）になりました。</div>
        </div>
      )}

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 text-[12.5px]">
          <label className="flex items-center gap-1.5 text-muted">取引先
            <select value={client} onChange={(e) => setClient(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-ink">{['すべて', ...uniq(rows.map((r) => r.client))].map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="flex items-center gap-1.5 text-muted">営業
            <select value={sales} onChange={(e) => setSales(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-ink">{['すべて', ...uniq(rows.map((r) => r.sales))].map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <span className="ml-auto text-faint">{shown.length}人・粗利率の低い順</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">取引先・営業</th><th className="px-2 py-2.5 text-right font-semibold">売上（請求）</th><th className="px-2 py-2.5 text-right font-semibold">給与（額面）</th><th className="px-2 py-2.5 text-right font-semibold">交通費</th><th className="px-2 py-2.5 text-right font-semibold">法定福利 {WELFARE_RATE * 100}%</th><th className="px-2 py-2.5 text-right font-semibold">粗利</th><th className="px-4 py-2.5 text-right font-semibold">粗利率</th>
            </tr></thead>
            <tbody>
              {shown.map(({ r, a }, i) => {
                const t = rateTone(a.rate);
                return (
                  <tr key={r.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === r.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5"><Link href={`/jinji/staff/${r.personId}`} className="font-semibold hover:underline">{r.name}</Link>{isTemp(r) && <div><span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>仮の値あり</span></div>}</td>
                    <td className="px-2 py-2.5">{r.client}<div className="text-[11.5px] text-faint">営業 {r.sales}</div></td>
                    <td className="num px-2 py-2.5 text-right">{yen(r.billed)}</td>
                    <SrcCell r={r} k="salarySrc" value={a.salary} />
                    <SrcCell r={r} k="fareSrc" value={a.fare} />
                    <td className="num px-2 py-2.5 text-right text-muted">{yen(a.welfare)}</td>
                    <td className="num px-2 py-2.5 text-right font-bold">{yen(a.gross)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="chip num" style={{ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` }}>{pct(a.rate)}</span>
                      <div className="ml-auto mt-1 h-1.5 w-20 overflow-hidden rounded-full" style={{ background: 'var(--color-track)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, a.rate * 200))}%`, background: `var(--tone-${t}-bar, var(--tone-${t}-fg))` }} /></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11.5px] text-faint">売上は送付した請求書（税抜・請求した交通費を含む）。法定福利は給与の19%で見積もった概算です。給与・社会保険料・税の扱いの最終判断は社労士・税理士に確認してください。</p>
    </main>
  );
}
