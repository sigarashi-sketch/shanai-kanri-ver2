'use client';

import { useState } from 'react';
import { useIke } from '@/components/Live';
import { useMikeiken, type Mikeiken } from '@/components/Mikeiken';

// 想定賃金の「月ごとの損益・損益分岐・シナリオ」（10-25 今の /chingin.html から移し替え・読むだけ）。
//   本物：GET /api/chingin?action=month-summary&ym=&rows=1（月ごとの人の売上・給与・社保・交通費・粗利）を直近6か月
//         ＋ GET /api/chingin?action=pl&ym=（販管費の行。手入力が無い月は事業計画の内訳）
//   ・人は未経験の人だけで足し直す（合計に入る人＝eligible だけ。決まりは今のシステムのまま）
//   ・損益分岐＝販管費 ÷ 1人あたりの粗利（直近3か月の確定した月の平均）。シナリオは人数と1人あたり粗利を選ぶだけ
//   ★保存（販管費・損益分岐の入力・スプレッドシートへの書き出し）は今の社内システムから
type SumRow = { key: string; name: string; eligible: boolean; sales: number; wage: number; shaho: number; fare: number; grossNet: number; issues: string[] };
type MonthSum = { ok?: boolean; summary?: { ym: string; label: string; provisional: boolean; through: string }; rows?: SumRow[]; error?: unknown };
type Pl = { ok?: boolean; ym: string; inputs?: { sga: { label: string; amount: number | null }[] }; sgaSource?: { kind: string } | null };
type M = { ym: string; provisional: boolean; n: number; sales: number; cost: number; gross: number; ok: boolean; loading: boolean };

const man = (y: number) => `${y < 0 ? '−' : ''}${Math.round(Math.abs(y) / 10000).toLocaleString('ja-JP')}万`;
const jstYm = (back: number) => { const j = new Date(Date.now() + 9 * 3600e3); const d = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() - back, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const mLabel = (ym: string) => `${Number(ym.slice(5))}月`;
const YMS = [5, 4, 3, 2, 1, 0].map(jstYm);
// 見本（本物の数字ではない）
const SAMPLE: M[] = YMS.map((ym, i) => { const n = 60 + i * 3; const sales = n * 520000; const gross = Math.round(sales * (0.2 + i * 0.004)); return { ym, provisional: i === 5, n, sales, cost: sales - gross, gross, ok: true, loading: false }; });
const SAMPLE_SGA = 7_800_000;
const HEADS = [-10, -5, 0, 5, 10, 20, 30];
const PER = [-20, -10, -5, 0, 5, 10, 20];

function useMonth(ym: string, on: boolean, mk: Mikeiken): M {
  const r = useIke<MonthSum>(on ? `chingin?action=month-summary&ym=${ym}&rows=1` : null);
  const rows = r.data?.ok && r.data.rows ? mk.keep(r.data.rows, 'name').filter((x) => x.eligible) : [];
  const sales = rows.reduce((s, x) => s + (x.sales || 0), 0), gross = rows.reduce((s, x) => s + (x.grossNet || 0), 0);
  return { ym, provisional: !!r.data?.summary?.provisional, n: rows.length, sales, gross, cost: sales - gross, ok: !!r.data?.ok, loading: r.state === 'loading' };
}

export function ChinginPl({ live }: { live: boolean }) {
  const mk = useMikeiken();
  // 6か月ぶんを並べて読む（数は決まっているので順番は変わらない）
  const ms = [useMonth(YMS[0], live, mk), useMonth(YMS[1], live, mk), useMonth(YMS[2], live, mk), useMonth(YMS[3], live, mk), useMonth(YMS[4], live, mk), useMonth(YMS[5], live, mk)];
  const months = live ? ms : SAMPLE;
  const done = months.filter((m) => m.ok && !m.provisional && m.n > 0);
  const last3 = done.slice(-3);
  const perHead = last3.length ? last3.reduce((s, m) => s + m.gross / m.n, 0) / last3.length : 0;
  const base = last3[last3.length - 1];
  const plYm = base?.ym || YMS[4];
  const pl = useIke<Pl>(live ? `chingin?action=pl&ym=${plYm}` : null);
  const sga = live ? (pl.data?.inputs?.sga || []).reduce((s, l) => s + (Number(l.amount) || 0), 0) : SAMPLE_SGA;
  const bep = perHead > 0 ? Math.ceil(sga / perHead) : 0;
  const [dh, setDh] = useState(0);
  const [dp, setDp] = useState(0);
  const heads = Math.max(0, (base?.n || 0) + dh);
  const per = perHead * (1 + dp / 100);
  const op = Math.round(heads * per - sga);
  const maxS = Math.max(1, ...months.map((m) => m.sales));
  const sel = 'min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px]';

  return (
    <section className="mo-fade-up flex flex-col gap-3" style={{ ['--i' as string]: 4 }}>
      <h2 className="text-[15px] font-bold">月ごとの損益・損益分岐・シナリオ{!live && <span className="ml-2 text-[12px] font-normal text-faint">見本データ</span>}</h2>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">月</th><th className="px-2 py-2.5 font-semibold">売上と粗利</th><th className="px-2 py-2.5 text-right font-semibold">人数</th><th className="px-2 py-2.5 text-right font-semibold">原価</th><th className="px-2 py-2.5 text-right font-semibold">粗利率</th><th className="px-4 py-2.5 text-right font-semibold">1人あたり粗利</th></tr></thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m.ym} className="row border-t border-line-soft">
                <td className="px-4 py-2.5 font-semibold">{mLabel(m.ym)}{m.provisional && <span className="ml-1 text-[11px] font-normal text-faint">（月の途中）</span>}</td>
                <td className="w-[38%] px-2 py-2.5">{m.loading ? <span className="text-[12px] text-faint">読んでいます…</span> : !m.ok ? <span className="text-[12px] text-faint">読めませんでした</span> : <>
                  <div className="relative h-4 rounded-md bg-sunken">
                    <div className="mo-bar absolute inset-y-0 left-0 rounded-md" style={{ width: `${(m.sales / maxS) * 100}%`, background: 'var(--al)', ['--i' as string]: i }} />
                    <div className="mo-bar absolute inset-y-0 left-0 rounded-md" style={{ width: `${(Math.max(0, m.gross) / maxS) * 100}%`, background: 'var(--a)', ['--i' as string]: i }} />
                  </div>
                  <div className="num mt-0.5 text-[11.5px] text-muted">売上 {man(m.sales)}・粗利 {man(m.gross)}</div></>}
                </td>
                <td className="num px-2 py-2.5 text-right">{m.ok ? `${m.n}人` : '—'}</td>
                <td className="num px-2 py-2.5 text-right">{m.ok ? man(m.cost) : '—'}</td>
                <td className="num px-2 py-2.5 text-right">{m.ok && m.sales ? `${((m.gross / m.sales) * 100).toFixed(1)}%` : '—'}</td>
                <td className="num px-4 py-2.5 text-right">{m.ok && m.n ? man(m.gross / m.n) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <div className="text-[12px] text-muted">損益分岐（販管費をまかなえる人数）</div>
          <div className="num text-[24px] font-bold">{bep ? `${bep}人` : '—'}{base && bep ? <span className={`ml-2 text-[13px] font-semibold ${base.n >= bep ? 'text-ok' : 'text-bad'}`}>いま {base.n}人（{base.n >= bep ? `+${base.n - bep}` : `−${bep - base.n}`}）</span> : null}</div>
          <div className="text-[11.5px] text-faint">販管費 {man(sga)}／月（{mLabel(plYm)}・{live ? (pl.data?.sgaSource ? '事業計画の内訳' : '手入力') : '見本'}）÷ 1人あたり粗利 {man(perHead)}（確定した直近{last3.length}か月の平均）</div>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <div className="text-[12px] text-muted">シナリオ（選ぶだけ）</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
            <select aria-label="人数の増減" value={dh} onChange={(e) => setDh(Number(e.target.value))} className={sel}>{HEADS.map((x) => <option key={x} value={x}>人数 {x > 0 ? `+${x}` : x}人</option>)}</select>
            <select aria-label="1人あたり粗利の増減" value={dp} onChange={(e) => setDp(Number(e.target.value))} className={sel}>{PER.map((x) => <option key={x} value={x}>1人あたり粗利 {x > 0 ? `+${x}` : x}%</option>)}</select>
          </div>
          <div className="num mt-1.5 text-[13px]">{heads}人 × {man(per)} − 販管費 {man(sga)} ＝ <b className={op >= 0 ? 'text-ok' : 'text-bad'}>営業利益 {man(op)}／月</b></div>
        </div>
      </div>
      <p className="text-[11.5px] text-faint">{live ? '未経験の人だけで足し直しています（合計に入る人の決まりは今の想定賃金と同じ）。' : ''}販管費の入力・損益分岐の前提の保存・スプレッドシートへの書き出しは今の社内システムの想定賃金の画面から。税・労務の扱いは税理士・社労士に確認してください。</p>
    </section>
  );
}
