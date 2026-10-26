'use client';

import { useEffect, useState } from 'react';
import { LiveBanner } from '@/components/Live';
import { jinjiPostRead } from '@/lib/live/jinji';
import { HOURS_FROM, SEIKYU_STAGE, type SeikyuStage } from '@/lib/live/seikyu';

// 社員ページの「請求」タブ（10-26 shoya「社員ページの請求タブも本番データでつないで」）。
//   今のシステムの POST /api/jinji-v2?action=seikyu を読むだけ。★請求の仕様は変えない・計算もし直さない（10-23 shoya「請求のとこは絶対に崩してほしくない」）
//   ・上＝請求書作成の計算：請求書作成（/keiri/seikyu-make）が作った控えのこの人の行をそのまま（今月・先月）。段階の呼び名は今の請求書の画面と同じ
//   ・下＝ミンミカの請求書：月・請求書番号ごと（行を押すと明細）
//   ・金額は 経理・営業の管理者（今のシステムのロール）だけ。ほかの人には状態・取引先・時間だけ出る
//   ・直すのは今までどおり 請求書作成／請求書づくり の画面で（ここからは何も書かない）
type Line = { d: string; q: number | null; u: string; p: number | null; a: number | null };
type Calc = { ym: string; builtAt: string; stage: string; partner: string; site: string; subject: string; billingDate: string; dueDate: string;
  workHours: number | null; hoursFrom: string; sheetFile: string; arrival: string; route: string; reasons: string[]; mnmNumbers: string[]; mnmStatus: string; mnmSent: boolean; confirmed: boolean;
  subtotal?: number | null; tax?: number | null; total?: number | null; lines?: Line[]; notes?: string[] };
type Inv = { ym: string; number: string; status: string; billingDate: string; sentAt: string; subject: string; partner: string; company: string; amount: number | null; lines: Line[] };
type Res = { ok: boolean; money: boolean; calc: Calc[]; mnm: Inv[] };

const yen = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('ja-JP')}円`);
const ymJa = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`;
const slash = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).replace(/-/g, '/') : d || '—');
const ARRIVAL: Record<string, string> = { missing: '未着', arrived: '届いた', na: '提出不要' };

export function PersonSeikyu({ name }: { name: string }) {
  const [r, setR] = useState<Res | null>(null);
  const [err, setErr] = useState('');
  const [n, setN] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    setErr('');
    jinjiPostRead<Res>('seikyu', { name }).then((j) => { if (!off) setR(j); }).catch((e) => { if (!off) setErr((e as Error).message); });
    return () => { off = true; };
  }, [name, n]);
  if (err) return <LiveBanner state="error" error={`請求を読めませんでした（${err}）`} onReload={() => setN((x) => x + 1)} />;
  if (!r) return <div className="text-body text-muted">請求を読み込み中…</div>;
  return (
    <div className="flex flex-col gap-4">
      {!r.money && <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-sm text-muted">金額は経理・営業の管理者だけに出ます（今のシステムのロール）。ここでは状態・取引先・時間だけ出しています</div>}

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="px-[18px] py-3.5"><h2 className="text-md font-bold">請求書作成の計算</h2>
          <div className="text-sm text-faint">請求書作成が作った控えのこの人の行（今月・先月）。直すのは<a href="/keiri/seikyu-make" className="mx-0.5 underline underline-offset-2">請求書作成</a>から</div></div>
        {r.calc.length === 0 ? <div className="border-t border-line-soft px-[18px] py-6 text-center text-sm text-muted">請求書作成にこの人の行はありません（今月・先月）</div>
          : r.calc.map((c) => {
            const st = SEIKYU_STAGE[c.stage as SeikyuStage];
            return (
              <div key={c.ym + c.partner} className="border-t border-line-soft px-[18px] py-3.5 text-body">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <b>{ymJa(c.ym)}</b>
                  {st && <span className="chip" title={st.hint} style={{ background: `var(--tone-${st.tone}-bg)`, color: `var(--tone-${st.tone}-fg)` }}>{st.label}</span>}
                  <span>{c.partner || '—'}</span>{c.site && <span className="text-muted">{c.site}</span>}
                  {r.money && <span className="ml-auto text-md font-bold num">{yen(c.total)}<span className="ml-1.5 text-xs font-normal text-faint">税抜 {yen(c.subtotal)}・税 {yen(c.tax)}</span></span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                  <span>時間 <b className="num text-ink">{c.workHours == null ? '—' : `${c.workHours}h`}</b>（{HOURS_FROM[c.hoursFrom] || c.hoursFrom || '—'}）</span>
                  <span>勤務表 {ARRIVAL[c.arrival] || c.arrival || '—'}{c.route ? `（${c.route}）` : ''}</span>
                  <span>請求日 {slash(c.billingDate)}・支払期限 {slash(c.dueDate)}</span>
                  {c.mnmNumbers.length > 0 && <span>ミンミカ {c.mnmNumbers.join('・')}</span>}
                </div>
                {c.reasons.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{c.reasons.map((x) => <li key={x} className="rounded-md bg-warn-soft px-2 py-0.5 text-sm text-warn">{x}</li>)}</ul>}
                {r.money && c.lines && c.lines.length > 0 && <Lines lines={c.lines} />}
                {r.money && c.notes && c.notes.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-muted">{c.notes.map((x) => <li key={x}>{x}</li>)}</ul>}
                <div className="mt-1.5 text-xs text-faint">控えを作った時刻 {new Date(c.builtAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            );
          })}
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="px-[18px] py-3.5"><h2 className="text-md font-bold">ミンミカの請求書</h2><div className="text-sm text-faint">月・請求書番号ごと（新しい順）{r.money ? '。行を押すと明細' : ''}</div></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-body">
            <thead><tr className="th-row text-left"><th className="px-[18px] py-2 font-semibold">月</th><th className="px-2 py-2 font-semibold">請求先</th><th className="px-2 py-2 font-semibold">番号</th><th className="px-2 py-2 font-semibold">状態</th><th className="px-2 py-2 font-semibold">請求日</th>{r.money && <th className="px-[18px] py-2 text-right font-semibold">金額</th>}</tr></thead>
            <tbody>
              {r.mnm.length === 0 && <tr><td colSpan={r.money ? 6 : 5} className="px-[18px] py-6 text-center text-sm text-muted">ミンミカの請求書はまだありません</td></tr>}
              {r.mnm.map((v) => {
                const k = v.ym + v.number;
                const on = open === k;
                return [
                  <tr key={k} onClick={() => r.money && setOpen(on ? null : k)} className={`border-t border-line-soft ${r.money ? 'cursor-pointer hover:bg-[var(--row-hover)]' : ''}`}>
                    <td className="whitespace-nowrap px-[18px] py-2">{ymJa(v.ym)}</td><td className="px-2 py-2">{v.partner || '—'}<div className="text-xs text-faint">{v.subject}</div></td>
                    <td className="num px-2 py-2 text-sm">{v.number || '—'}</td><td className="px-2 py-2">{v.status || '—'}</td><td className="num px-2 py-2">{slash(v.billingDate)}</td>
                    {r.money && <td className="num px-[18px] py-2 text-right">{yen(v.amount)}</td>}
                  </tr>,
                  on && <tr key={k + ':d'}><td colSpan={6} className="bg-soft px-[18px] pb-3"><Lines lines={v.lines} /></td></tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Lines({ lines }: { lines: Line[] }) {
  return (
    <table className="mt-2 w-full border-collapse text-sm">
      <tbody>{lines.map((l, i) => (
        <tr key={i} className="border-t border-line-soft">
          <td className="py-1 pr-2">{l.d}</td>
          <td className="num whitespace-nowrap px-2 py-1 text-right text-muted">{l.q == null ? '' : `${l.q}${l.u ? ` ${l.u}` : ''}`}{l.p == null ? '' : ` × ${l.p.toLocaleString('ja-JP')}`}</td>
          <td className="num whitespace-nowrap py-1 pl-2 text-right">{l.a == null ? '' : yen(l.a)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
