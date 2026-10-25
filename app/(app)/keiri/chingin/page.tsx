'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { arari, FARE_LABEL, ROWS, SALARY_LABEL, WELFARE_RATE, type ArariRow, type FareSrc, type SalarySrc } from '@/lib/chingin-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { CountUp, RemainRing, useMotivation } from '@/components/Motivation';
import { LIVE_WRITE_BLOCKED, LiveBanner, useIke, type LiveState } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { toArari, type ArariLive } from '@/lib/live/chingin';
import { PersonName } from '@/components/Person';
import { ChinginPl } from './pl';

// 想定賃金・粗利（経理管理）。人ごとに 売上（請求・税抜）− 給与 − 交通費 − 法定福利（19%）＝ 粗利 と粗利率。
//   ・額面の正はミンミカの内定月給（現場の契約単価の欄は使わない）。内定が無い人は 仮21万
//   ・交通費は 経費の申請の実額 ＞ 定期代の見積もり ＞ 仮25,000円
//   ・「仮」の値が残っている人を、選ぶだけで本当の値に置きかえて片づける
//   ・粗利率の低い人を上に。取引先・営業で絞る
//   本物（ログイン中）：今の GET /api/seikyu?action=arari（請求書ベースの粗利）を読むだけ。金額は今の API の答えのまま。
//     給与・交通費を手で直す（arari-fare / arari-salary）は押せない（今の「請求書ベースの粗利」の画面から）
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
  // 並び順は「並べ直す」を押すまで固定（値を選ぶたびに行が動いて、押そうとした行が逃げないように）
  const [order, setOrder] = useState<Record<string, number>>(() => Object.fromEntries(ROWS.map((r) => [r.id, arari(r).rate])));

  const [ym, setYm] = useState('');
  const lv = useIke<ArariLive>(`seikyu?action=arari${ym ? `&ym=${ym}` : ''}`);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('client')) setClient(q.get('client')!);
    if (q.get('sales')) setSales(q.get('sales')!);
  }, []);

  const shown = rows.filter((r) => (client === 'すべて' || r.client === client) && (sales === 'すべて' || r.sales === sales))
    .map((r) => ({ r, a: arari(r) })).sort((x, y) => (order[x.r.id] ?? x.a.rate) - (order[y.r.id] ?? y.a.rate));
  const stale = shown.some(({ r, a }) => order[r.id] !== a.rate);
  const resort = () => setOrder(Object.fromEntries(rows.map((r) => [r.id, arari(r).rate])));
  const sum = shown.reduce((s, { r, a }) => ({ billed: s.billed + r.billed, cost: s.cost + a.salary + a.fare + a.welfare, gross: s.gross + a.gross }), { billed: 0, cost: 0, gross: 0 });
  const tempAll = rows.filter(isTemp);
  const totalTemp = ROWS.filter(isTemp).length;

  const setSrc = (r: ArariRow, k: 'salarySrc' | 'fareSrc', v: SalarySrc | FareSrc) => {
    const prev = r[k];
    const nr = { ...r, [k]: v } as ArariRow;
    setRows((rs) => rs.map((x) => (x.id === r.id ? nr : x)));
    setFlash(r.id); setTimeout(() => setFlash(null), 1300); hit();
    const was = arari(r), now = arari(nr);
    toast({
      text: `${r.name} の${k === 'salarySrc' ? '給与' : '交通費'}を「${k === 'salarySrc' ? SALARY_LABEL[v as SalarySrc] : FARE_LABEL[v as FareSrc]}」にしました`,
      sub: `→ 粗利 ${yen(was.gross)} → ${yen(now.gross)}（${pct(now.rate)}）・営業別の粗利に反映`,
      // この行のこの値だけ元に戻す（続けてほかの行を選んだ後でも、そちらは消えない）
      undo: () => setRows((rs) => rs.map((x) => (x.id === r.id ? ({ ...x, [k]: prev } as ArariRow) : x))),
    });
  };

  // 部品にせず関数で描く（描くたびに部品が作り直されて、選んだ直後に select が消えて付け直されるのを防ぐ）
  const srcCell = (r: ArariRow, k: 'salarySrc' | 'fareSrc', value: number) => {
    const opts = Object.keys(k === 'salarySrc' ? r.salary : r.fare) as (SalarySrc | FareSrc)[];
    const cur = r[k];
    const label = (s: string) => (k === 'salarySrc' ? SALARY_LABEL[s as SalarySrc] : FARE_LABEL[s as FareSrc]);
    return (
      <td key={k} className="num px-2 py-2.5 text-right">
        {yen(value)}
        {cur === 'temp' && opts.length > 1 ? (
          <select aria-label={`${r.name} の${k === 'salarySrc' ? '給与' : '交通費'}の元`} value={cur} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(e) => setSrc(r, k, e.target.value as SalarySrc)} className="mt-0.5 block w-full rounded-md border px-1 text-xs disabled:opacity-50" style={{ borderColor: 'var(--color-warn)', background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>
            {opts.map((s) => <option key={s} value={s}>{s === 'temp' ? `${label(s)}のまま` : `${label(s)} ${yen((k === 'salarySrc' ? r.salary : r.fare)[s as never] ?? 0)}`}</option>)}
          </select>
        ) : <div className="text-xs text-faint">{label(cur)}</div>}
      </td>
    );
  };

  if (lv.live && lv.data) return <LiveChingin d={lv.data} ym={ym || lv.data.ym} setYm={setYm} state={lv.state} error={lv.error} reload={lv.reload} />;

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="想定賃金・粗利" sub="10月分。売上（請求・税抜）− 給与 − 交通費 − 法定福利（19%）＝ 粗利。粗利率の低い人を上に・見本データ">
        <Link href="/keiri/seikyu" className="btn-secondary">請求書へ</Link>
      </PageTitle>
      <LiveBanner state={lv.state} error={lv.error} onReload={lv.reload} />

      <div className="mo-fade-up grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" style={{ ['--i' as string]: 1 }}>
        {([['売上（請求）', sum.billed], ['原価（給与＋交通費＋法定福利）', sum.cost], ['粗利', sum.gross]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-sm text-muted">{l}</div>
            <div className="text-xl font-bold">¥<CountUp to={v} /></div>
            {l === '粗利' && <div className={`text-sm text-${rateTone(sum.billed ? sum.gross / sum.billed : 0)}`}>粗利率 {pct(sum.billed ? sum.gross / sum.billed : 0)}</div>}
          </div>
        ))}
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <RemainRing remain={tempAll.length} total={totalTemp} />
          <div className="text-sm"><b>仮の値が残る {tempAll.length}人</b><div className="text-muted">選ぶだけで本当の値に</div></div>
        </div>
      </div>

      {tempAll.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-6 text-center">
          <Check className="mx-auto text-ok" size={24} />
          <div className="mt-1.5 text-md font-bold">仮の値はもうありません</div>
          <div className="mt-1 text-sm text-muted">給与と交通費が、全員 本当の値（内定の月給・本人提示・経費の申請・定期代）になりました。</div>
        </div>
      )}

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 text-sm">
          <label className="flex items-center gap-1.5 text-muted">取引先
            <select value={client} onChange={(e) => setClient(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-ink">{['すべて', ...uniq(rows.map((r) => r.client))].map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="flex items-center gap-1.5 text-muted">営業
            <select value={sales} onChange={(e) => setSales(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-ink">{['すべて', ...uniq(rows.map((r) => r.sales))].map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <span className="ml-auto text-faint">{shown.length}人・粗利率の低い順</span>
          {stale && <button onClick={resort} className="min-h-8 whitespace-nowrap rounded-lg border px-2.5 text-sm font-semibold" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>いまの粗利率で並べ直す</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">取引先・営業</th><th className="px-2 py-2.5 text-right font-semibold">売上（請求）</th><th className="px-2 py-2.5 text-right font-semibold">給与（額面）</th><th className="px-2 py-2.5 text-right font-semibold">交通費</th><th className="px-2 py-2.5 text-right font-semibold">法定福利 {WELFARE_RATE * 100}%</th><th className="px-2 py-2.5 text-right font-semibold">粗利</th><th className="px-4 py-2.5 text-right font-semibold">粗利率</th>
            </tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">この取引先・営業の組み合わせの人はいません。絞り込みを「すべて」に戻してください。</td></tr>}
              {shown.map(({ r, a }, i) => {
                const t = rateTone(a.rate);
                return (
                  <tr key={r.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === r.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5"><PersonName name={r.name} className="font-semibold hover:underline underline-offset-2" />{isTemp(r) && <div><span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>仮の値あり</span></div>}</td>
                    <td className="px-2 py-2.5">{r.client}<div className="text-xs text-faint">営業 {r.sales}</div></td>
                    <td className="num px-2 py-2.5 text-right">{yen(r.billed)}</td>
                    {srcCell(r, 'salarySrc', a.salary)}
                    {srcCell(r, 'fareSrc', a.fare)}
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
      <p className="text-xs text-faint">売上は送付した請求書（税抜・請求した交通費を含む）。法定福利は給与の19%で見積もった概算です。給与・社会保険料・税の扱いの最終判断は社労士・税理士に確認してください。</p>
      <ChinginPl live={false} />
    </main>
  );
}

// ---------------- 本物（今の「請求書ベースの粗利」の答えをそのまま出す・見るだけ） ----------------
const ymJa = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月分`;
function LiveChingin({ d, ym, setYm, state, error, reload }: { d: ArariLive; ym: string; setYm: (v: string) => void; state: LiveState; error: string; reload: () => void }) {
  // 未経験の人だけ（今のプロパーリストに入っている人）。売上・原価・粗利の合計も絞った人で出す（計算そのものは今の答えのまま）
  const mk = useMikeiken();
  const rows = mk.keep(toArari(d), 'name');
  const [client, setClient] = useState('すべて');
  const [shozoku, setShozoku] = useState('すべて');
  const shown = rows.filter((r) => (client === 'すべて' || r.company === client) && (shozoku === 'すべて' || r.shozoku === shozoku)).sort((a, b) => a.rate - b.rate);
  const sum = shown.reduce((s, r) => ({ billed: s.billed + r.sales, cost: s.cost + r.salary + r.fare + r.welfare, gross: s.gross + r.gross }), { billed: 0, cost: 0, gross: 0 });
  const temp = rows.filter((r) => r.temp);
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="想定賃金・粗利" sub={`${ymJa(d.ym)}。格納した請求書の売上（税抜）− 給与 − 交通費 − 法定福利（${Math.round((d.rates?.welfare ?? WELFARE_RATE) * 100)}%）＝ 粗利。粗利率の低い人を上に`}>
        {d.months?.length > 0 && (
          <select aria-label="作業月" value={ym} onChange={(e) => setYm(e.target.value)} className="min-h-10 rounded-[10px] border border-field bg-surface px-2 text-body">
            {d.months.map((m) => <option key={m} value={m}>{ymJa(m)}</option>)}
          </select>
        )}
        <Link href="/keiri/seikyu" className="btn-secondary">請求書へ</Link>
      </PageTitle>
      <LiveBanner state={state} error={error} onReload={reload} note="今の「請求書ベースの粗利」の計算そのままです。給与・交通費を手で直すのは今の画面から（ここでは変えられません）" />
      <MikeikenNote mk={mk} live={true} />

      <div className="mo-fade-up grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" style={{ ['--i' as string]: 1 }}>
        {([['売上（請求）', sum.billed], ['原価（給与＋交通費＋法定福利）', sum.cost], ['粗利', sum.gross]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-sm text-muted">{l}</div>
            <div className="text-xl font-bold">{v < 0 ? '−' : ''}¥<CountUp to={Math.abs(v)} /></div>
            {l === '粗利' && <div className={`text-sm text-${rateTone(sum.billed ? sum.gross / sum.billed : 0)}`}>粗利率 {pct(sum.billed ? sum.gross / sum.billed : 0)}</div>}
          </div>
        ))}
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <RemainRing remain={temp.length} total={rows.length} />
          <div className="text-sm"><b>仮の値が残る {temp.length}人</b><div className="text-muted">直すのは今の画面から</div></div>
        </div>
      </div>
      {d.unknown?.length > 0 && <div className="rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)', borderColor: 'var(--tone-warn-bar)' }}>誰の分か決まらない請求書が {d.unknown.length}件あります（粗利に入っていません）。今の請求書作成の「格納」で人を選んでください。</div>}

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 text-sm">
          <label className="flex items-center gap-1.5 text-muted">取引先
            <select value={client} onChange={(e) => setClient(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-ink">{['すべて', ...uniq(rows.map((r) => r.company))].map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="flex items-center gap-1.5 text-muted">所属
            <select value={shozoku} onChange={(e) => setShozoku(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-ink">{['すべて', ...uniq(rows.map((r) => r.shozoku))].map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <span className="ml-auto text-faint">{shown.length}人・粗利率の低い順</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">取引先・所属</th><th className="px-2 py-2.5 text-right font-semibold">売上（請求）</th><th className="px-2 py-2.5 text-right font-semibold">給与（額面）</th><th className="px-2 py-2.5 text-right font-semibold">交通費</th><th className="px-2 py-2.5 text-right font-semibold">法定福利</th><th className="px-2 py-2.5 text-right font-semibold">粗利</th><th className="px-4 py-2.5 text-right font-semibold">粗利率</th>
            </tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">この月に格納した請求書がまだありません（または絞り込みに当たる人がいません）。</td></tr>}
              {shown.map((r, i) => {
                const t = rateTone(r.rate);
                return (
                  <tr key={r.key} className="row mo-fade-in border-t border-line-soft align-top" style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5"><PersonName name={r.name} className="font-semibold underline-offset-2 hover:underline" />{r.temp && <div><span className="chip" title={LIVE_WRITE_BLOCKED} style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>仮の値あり</span></div>}{r.warn.map((w) => <div key={w} className="text-xs text-bad">{w}</div>)}</td>
                    <td className="px-2 py-2.5">{r.company}<div className="text-xs text-faint">{r.shozoku}</div></td>
                    <td className="num px-2 py-2.5 text-right">{yen(r.sales)}</td>
                    <td className="num px-2 py-2.5 text-right">{yen(r.salary)}<div className="text-xs text-faint">{r.salaryLabel}</div></td>
                    <td className="num px-2 py-2.5 text-right">{yen(r.fare)}<div className="text-xs text-faint">{r.fareLabel}</div></td>
                    <td className="num px-2 py-2.5 text-right text-muted">{yen(r.welfare)}</td>
                    <td className="num px-2 py-2.5 text-right font-bold">{yen(r.gross)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="chip num" style={{ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` }}>{pct(r.rate)}</span>
                      <div className="ml-auto mt-1 h-1.5 w-20 overflow-hidden rounded-full" style={{ background: 'var(--color-track)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, r.rate * 200))}%`, background: `var(--tone-${t}-bar, var(--tone-${t}-fg))` }} /></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-faint">売上は格納した請求書（税抜）。法定福利は給与の19%で見積もった概算です。給与・社会保険料・税の扱いの最終判断は社労士・税理士に確認してください。</p>
      <ChinginPl live />
    </main>
  );
}
