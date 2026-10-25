'use client';

import { Lock } from 'lucide-react';
import { CountUp } from '@/components/Motivation';
import type { Mikeiken } from '@/components/Mikeiken';
import { fareOverMax, grossIsRough, manOf, rate, repFromIkeLines, type HeRep, type IkePlReps } from '@/lib/live/home-eigyo';

// 売上・粗利（本物・10-25）。今の GET /api/nippo?action=pl-reps&ym= の答えをそのまま出す（計算は今のシステムの api/_nippo_pl.ts）。
//   ・明細が返ってくる担当（全体管理者・管理者は全員、ほかは自分）は、未経験の人の明細だけで足し直す
//   ・行動指標（送った案件・面談など）は今のシステムの actLabels の列をそのまま
//   ・請求の無い退場は売上・粗利から引いた形で返ってくる（件数は別に出す）
const man = (yen: number) => `${manOf(yen).toLocaleString('ja-JP')}万`;
const jstYm = (back: number) => { const j = new Date(Date.now() + 9 * 3600e3); const d = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() - back, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const mLabel = (ym: string) => `${Number(ym.slice(5))}月`;

export function PlLive({ data, mk, ym, onYm }: { data: IkePlReps; mk: Mikeiken; ym: string; onYm: (ym: string) => void }) {
  const hasLines = (t: string) => data.all || t === data.me;
  const kept = mk.set ? data.lines.filter((l) => l.ym === data.ym && mk.has(l.name)) : [];
  const cur = data.reps.filter((r) => r.ym === data.ym);
  const reps: (HeRep & { acts: Record<string, number> })[] = cur.map((r) => ({ ...(hasLines(r.tantou) && mk.set ? repFromIkeLines(r.tantou, kept) : r), acts: r.acts || {} }));
  const prev = Object.fromEntries(data.reps.filter((r) => r.ym === data.prev).map((r) => [r.tantou, r]));
  const sum = reps.reduce((s, r) => ({ u: s.u + r.uriage, g: s.g + r.gross, b: s.b + r.grossBase, n: s.n + r.count, nb: s.nb + r.noBillCount, fm: s.fm + r.fareMissing, np: s.np + r.noPrice, ng: s.ng + r.noGakumen }), { u: 0, g: 0, b: 0, n: 0, nb: 0, fm: 0, np: 0, ng: 0 });
  const prevU = Object.values(prev).reduce((s, r) => s + r.uriage, 0);
  const maxU = Math.max(1, ...reps.map((r) => r.uriage));
  const acts = data.actLabels || [];
  const notFiltered = reps.filter((r) => !hasLines(r.tantou)).length;
  const rough = grossIsRough({ count: sum.n, noPrice: sum.np, noBillCount: sum.nb, noGakumen: sum.ng, fareMissing: sum.fm });
  return (
    <>
      <div className="mo-fade-up flex flex-wrap items-center gap-1.5" style={{ ['--i' as string]: 1 }}>
        {[4, 3, 2, 1, 0].map((b) => jstYm(b)).map((m) => (
          <button key={m} onClick={() => onYm(m)} className={`min-h-8 rounded-full border px-3 text-[12.5px] ${ym === m ? 'font-semibold' : 'text-muted'}`} style={ym === m ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{mLabel(m)}</button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-faint" title="今の社内システムに月を締める操作が無いので押せません"><Lock size={12} />月の締めは今の社内システムに無いので、ここでは締めません</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { k: '売上', v: manOf(sum.u), unit: '万', sub: prevU ? `${mLabel(data.prev)}より ${sum.u >= prevU ? '+' : '−'}${man(Math.abs(sum.u - prevU))}` : '' },
          { k: '粗利', v: manOf(sum.g), unit: '万', sub: `粗利率 ${rate(sum.g, sum.b).toFixed(1)}%${rough ? '（参考値）' : ''}` },
          { k: '成約数', v: sum.n, unit: '件', sub: sum.nb ? `うち請求の無い退場 ${sum.nb}件` : '' },
          { k: '交通費未取得', v: sum.fm, unit: '件', sub: `粗利が最大 ${man(fareOverMax(sum.fm))} 多め` },
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
            <th className="px-4 py-2.5 font-semibold">営業</th><th className="px-2 py-2.5 font-semibold">売上と粗利</th><th className="px-2 py-2.5 text-right font-semibold">粗利率</th><th className="px-2 py-2.5 text-right font-semibold">成約</th>
            {acts.map((a) => <th key={a} className="px-2 py-2.5 text-right font-semibold">{a}</th>)}
            <th className="px-4 py-2.5 text-right font-semibold">{mLabel(data.prev)}の売上</th>
          </tr></thead>
          <tbody>
            {reps.map((r, i) => (
              <tr key={r.tantou} className="row border-t border-line-soft">
                <td className="px-4 py-2.5 font-semibold">{r.tantou}{r.noBillCount > 0 && <div className="text-[11px] font-normal text-warn">請求なし退場 {r.noBillCount}件（−{man(r.noBillUriage)}）</div>}{!hasLines(r.tantou) && <div className="text-[11px] font-normal text-faint">明細なし＝今のシステムの合計のまま</div>}</td>
                <td className="w-[34%] px-2 py-2.5">
                  <div className="relative h-5 rounded-md bg-sunken">
                    <div className="mo-bar absolute inset-y-0 left-0 rounded-md" style={{ width: `${(r.uriage / maxU) * 100}%`, background: 'var(--al)', ['--i' as string]: i }} />
                    <div className="mo-bar absolute inset-y-0 left-0 rounded-md" style={{ width: `${(Math.max(0, r.gross) / maxU) * 100}%`, background: 'var(--a)', ['--i' as string]: i }} />
                  </div>
                  <div className="num mt-0.5 whitespace-nowrap text-[11.5px] text-muted">売上 {man(r.uriage)}・粗利 {man(r.gross)}{r.fareMissing ? `・交通費未取得 ${r.fareMissing}件` : ''}</div>
                </td>
                <td className="num px-2 py-2.5 text-right">{r.grossBase ? `${rate(r.gross, r.grossBase).toFixed(1)}%` : '—'}</td>
                <td className="num px-2 py-2.5 text-right font-semibold">{r.count}件</td>
                {acts.map((a) => <td key={a} className="num px-2 py-2.5 text-right">{r.acts[a] ?? '—'}</td>)}
                <td className="num px-4 py-2.5 text-right text-muted">{prev[r.tantou] ? man(prev[r.tantou].uriage) : '—'}</td>
              </tr>
            ))}
            {reps.length === 0 && <tr><td colSpan={5 + acts.length} className="px-4 py-8 text-center text-[12.5px] text-muted">この月の成約はありません</td></tr>}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft px-4 py-2 text-[11.5px] text-muted">
          <span>粗利＝単価−額面−額面×19%（社保）−交通費（交通費は運賃の辞書にある分だけ・無いものは0円で数えています）</span>
          {notFiltered > 0 && <span>明細が返らない担当 {notFiltered}人は未経験で絞れていません</span>}
          {(data.notes || []).map((n) => <span key={n}>{n}</span>)}
        </div>
      </div>
      <p className="text-[11.5px] text-faint">比べるのは各自の先月とだけにしています（順位は出しません）。売上・粗利の計算や税の扱いは、最終判断は社労士・税理士・法務に確認してください。</p>
    </>
  );
}
