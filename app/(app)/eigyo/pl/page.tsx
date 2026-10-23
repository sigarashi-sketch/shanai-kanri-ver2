'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { MONTHS, PL, REPS, monthLabel, type RepMonth } from '@/lib/pl-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { CountUp, useMotivation } from '@/components/Motivation';

// 売上・粗利（営業）。営業別の売上・粗利・成約数・行動指標を月ごとに。棒は div、推移は小さな SVG。
//   粗利＝単価−額面−額面×19%（社保）−交通費。請求の無い退場は売上・粗利から引く（成約数には残す）
//   数字を確かめたら「この月を締める」→ 損益シミュレーションの「営業別」に載る想定
const adj = (r: RepMonth, cut: boolean) => (cut ? { ...r, uri: r.uri - r.cut, arari: r.arari - Math.round(r.cut * 0.15) } : r);
const man = (n: number) => `${n.toLocaleString('ja-JP')}万`;

function Spark({ rep, cut }: { rep: string; cut: boolean }) {
  const vs = MONTHS.map((m) => adj(PL[m][rep], cut).uri);
  const max = Math.max(...vs), min = Math.min(...vs);
  const pts = vs.map((v, i) => `${(i / (vs.length - 1)) * 60},${18 - ((v - min) / Math.max(1, max - min)) * 14}`).join(' ');
  return <svg width="64" height="22" viewBox="-2 0 64 22" aria-label={`${rep} の売上の推移`}><polyline points={pts} fill="none" stroke="var(--a)" strokeWidth="1.6" strokeLinejoin="round" /><circle cx={60} cy={pts.split(' ').at(-1)!.split(',')[1]} r="2" fill="var(--ad)" /></svg>;
}

export default function PlPage() {
  const canApprove = usePerms().can('eigyo', 'approve');
  const { hit, toast } = useMotivation();
  const [month, setMonth] = useState(MONTHS.at(-1)!);
  const [cut, setCut] = useState(true);
  const [closed, setClosed] = useState<Record<string, boolean>>({ '2026-06': true, '2026-07': true, '2026-08': true });
  const [flash, setFlash] = useState(false);

  useEffect(() => { const m = new URLSearchParams(window.location.search).get('month'); if (m && MONTHS.includes(m)) setMonth(m); }, []);

  const rows = REPS.map((r) => ({ rep: r, ...adj(PL[month][r], cut), cutRaw: PL[month][r].cut }));
  const sum = rows.reduce((s, r) => ({ uri: s.uri + r.uri, arari: s.arari + r.arari, n: s.n + r.n, sent: s.sent + r.sent, mendan: s.mendan + r.mendan }), { uri: 0, arari: 0, n: 0, sent: 0, mendan: 0 });
  const maxUri = Math.max(...rows.map((r) => r.uri));
  const prev = MONTHS[MONTHS.indexOf(month) - 1];
  const prevUri = prev ? REPS.reduce((s, r) => s + adj(PL[prev][r], cut).uri, 0) : 0;
  const cutTotal = rows.reduce((s, r) => s + r.cutRaw, 0);

  const close = () => {
    if (!canApprove || closed[month]) return;
    const m = month;
    setClosed((c) => ({ ...c, [m]: true })); setFlash(true); setTimeout(() => setFlash(false), 1300);
    hit();
    toast({ text: `${monthLabel(month)}の営業別の数字を締めました`, sub: '→ 損益シミュレーションの「営業別」と、月次の損益に反映しました', undo: () => setClosed((c) => ({ ...c, [m]: false })) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="売上・粗利" sub="営業別（担当営業＝成約者）。未経験の要員の成約だけを数えています・見本データ">
        <button onClick={close} disabled={!canApprove || closed[month]} title={!canApprove ? needText('approve') : closed[month] ? 'この月は締めてあります' : undefined} className="btn-primary inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-4 text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40"><Lock size={15} />{closed[month] ? `${monthLabel(month)}は締めました` : `${monthLabel(month)}を締める`}</button>
      </PageTitle>

      <div className="mo-fade-up flex flex-wrap items-center gap-1.5" style={{ ['--i' as string]: 1 }}>
        {MONTHS.map((m) => (
          <button key={m} onClick={() => { setMonth(m); window.history.replaceState(null, '', `?month=${m}`); }} className={`min-h-8 rounded-full border px-3 text-[12.5px] ${month === m ? 'font-semibold' : 'text-muted'}`} style={month === m ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>
            {monthLabel(m)}{closed[m] && <Lock size={10} className="ml-1 inline" />}
          </button>
        ))}
        <label className="ml-auto flex flex-wrap items-center gap-2 text-[12.5px] text-muted"><input type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} />請求の無い退場を差し引く{cutTotal > 0 && <span className="text-faint">（この月 {man(cutTotal)}）</span>}</label>
      </div>

      <div className={`grid gap-3 sm:grid-cols-4 ${flash ? 'mo-flash' : ''}`}>
        {[
          { k: '売上', v: sum.uri, unit: '万', sub: prev ? `先月より ${sum.uri >= prevUri ? '+' : '−'}${Math.abs(sum.uri - prevUri)}万` : '' },
          { k: '粗利', v: sum.arari, unit: '万', sub: `粗利率 ${((sum.arari / sum.uri) * 100).toFixed(1)}%` },
          { k: '成約数', v: sum.n, unit: '件', sub: `面談からの成約 ${Math.round((sum.n / sum.mendan) * 100)}%` },
          { k: '送った案件', v: sum.sent, unit: '件', sub: `面談 ${sum.mendan}件` },
        ].map((x, i) => (
          <div key={x.k} className="mo-fade-up rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: i + 2 }}>
            <div className="text-[12px] text-muted">{x.k}</div>
            <div className="text-[22px] font-bold"><CountUp to={x.v} /><span className="ml-0.5 text-[13px] font-semibold text-muted">{x.unit}</span></div>
            <div className="text-[11.5px] text-faint">{x.sub}</div>
          </div>
        ))}
      </div>

      <div className="mo-fade-up overflow-x-auto rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 6 }}>
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead><tr className="th-row text-left">
            <th className="px-4 py-2.5 font-semibold">営業</th><th className="px-2 py-2.5 font-semibold">売上と粗利</th><th className="px-2 py-2.5 text-right font-semibold">粗利率</th><th className="px-2 py-2.5 text-right font-semibold">成約</th><th className="px-2 py-2.5 text-right font-semibold">送った案件</th><th className="px-2 py-2.5 text-right font-semibold">面談</th><th className="px-4 py-2.5 font-semibold">売上の推移</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.rep} className="row border-t border-line-soft">
                <td className="px-4 py-2.5 font-semibold">{r.rep}{r.cutRaw > 0 && cut && <div className="text-[11px] font-normal text-warn">請求なし退場 −{man(r.cutRaw)}</div>}</td>
                <td className="w-[38%] px-2 py-2.5">
                  <div className="relative h-5 rounded-md bg-sunken">
                    <div className="mo-bar absolute inset-y-0 left-0 rounded-md" style={{ width: `${(r.uri / maxUri) * 100}%`, background: 'var(--al)', ['--i' as string]: i }} />
                    <div className="mo-bar absolute inset-y-0 left-0 rounded-md" style={{ width: `${(r.arari / maxUri) * 100}%`, background: 'var(--a)', ['--i' as string]: i }} />
                  </div>
                  <div className="num mt-0.5 whitespace-nowrap text-[11.5px] text-muted">売上 {man(r.uri)}・粗利 {man(r.arari)}</div>
                </td>
                <td className="num px-2 py-2.5 text-right">{((r.arari / r.uri) * 100).toFixed(1)}%</td>
                <td className="num px-2 py-2.5 text-right font-semibold">{r.n}件</td>
                <td className="num px-2 py-2.5 text-right">{r.sent}</td>
                <td className="num px-2 py-2.5 text-right">{r.mendan}</td>
                <td className="px-4 py-2.5"><Spark rep={r.rep} cut={cut} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft px-4 py-2 text-[11.5px] text-muted">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: 'var(--al)' }} />売上</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: 'var(--a)' }} />粗利</span>
          <span>粗利＝単価−額面−額面×19%（社保）−交通費</span>
        </div>
      </div>
      <p className="text-[11.5px] text-faint">数字は見本です。比べるのは各自の先月とだけにしています（順位は出しません）。売上・粗利の計算や税の扱いは、最終判断は社労士・税理士・法務に確認してください。</p>
    </main>
  );
}
