'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, CornerUpLeft, Repeat } from 'lucide-react';
import { DAY_STYLE, judge, MONTHS, REASONS, type DayKind, type Judged } from '@/lib/check-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { PersonName } from '@/components/Person';
import { LiveBanner } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { KeihiCheckLive } from './live';

// 交通費チェック（経理管理）。月ごとに、交通費の申請（日ごと）× freee の打刻を人ごとに照らす。
//   ・1日ずつ色分け：打刻の無い日の申請／片側だけの打刻／在籍期間外の日／待機中の日／平日に打刻なし
//   ・土日祝に2日以上出勤している人はシフト勤務＝平日の打刻なしを漏れにしない
//   ・引っかかった人を選んで、理由を選んでまとめて差し戻す → 本人に知らせる（あおい）
//   申請の承認そのものは /keiri/keihi（ここは月末の見回り）
//   本物（ログイン中・10-25 shoya「いけドンにあったのは全部いれて」）：今の交通費チェックと同じく、MF経費のCSVを選んで
//     1人ずつ POST /api/live/keihi-check → 今の freee-kintai?action=keihi_check|keihi_month（読むだけ・何も保存しない）。中身は ./live.tsx
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const LEGEND: DayKind[] = ['noPunch', 'half', 'outside', 'taiki', 'leak', 'ok', 'none'];
type Tab = 'bad' | 'ok' | 'all';
type Back = { reason: string };

function topReason(j: Judged) {
  const k = (Object.entries(j.issues) as [DayKind, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
  return k ? REASONS[k] : REASONS.leak;
}

export default function KeihiCheckPage() {
  const canApprove = usePerms().can('keiri', 'approve');
  const { hit, toast } = useMotivation();
  const [mkey, setMkey] = useState(MONTHS[0].key);
  const [tab, setTab] = useState<Tab>('bad');
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('auto');
  const [back, setBack] = useState<Record<string, Back>>({});
  const [flash, setFlash] = useState<string[]>([]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get('month'); if (m && MONTHS.some((x) => x.key === m)) setMkey(m);
    const t = q.get('tab'); if (t === 'ok' || t === 'all') setTab(t);
  }, []);

  const login = useLiveRoute<{ ok: boolean }>('/api/live/keihi-check');
  const mk = useMikeiken();
  const month = MONTHS.find((m) => m.key === mkey)!;
  const judged = useMemo(() => month.people.map((p) => judge(month, p)).sort((a, b) => b.n - a.n), [month]);
  const targets = judged.filter((j) => j.n > 0);
  const remain = targets.filter((j) => !back[j.p.id]);
  const rows = tab === 'bad' ? remain : tab === 'ok' ? judged.filter((j) => j.n === 0) : judged;
  const picked = remain.filter((j) => sel[j.p.id]);

  const sendBack = (js: Judged[]) => {
    if (!canApprove || js.length === 0) return;
    const ids = js.map((j) => j.p.id);
    setBack((b) => ({ ...b, ...Object.fromEntries(js.map((j) => [j.p.id, { reason: reason === 'auto' ? topReason(j) : reason }])) }));
    setSel({}); setFlash(js.map((j) => j.p.id)); setTimeout(() => setFlash([]), 1300);
    hit(js.length);
    toast({
      text: js.length > 1 ? `${js.length}人の${month.label.replace(/（.*/, '')}の交通費を差し戻しました` : `${js[0].p.name} の交通費を差し戻しました`,
      sub: '→ 本人に理由と日付を知らせました（あおい）・経費の申請は「差し戻し」に',
      undo: () => setBack((b) => { const n = { ...b }; ids.forEach((id) => delete n[id]); return n; }),
    });
  };

  if (login.live) return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="交通費チェック" sub="MF経費の明細と freee の出勤の打刻を、人ごと・1日ずつ照らします">
        <Link href="/keiri/keihi" className="btn-secondary">交通費・経費の承認へ</Link>
      </PageTitle>
      <LiveBanner state="live" note="照らすだけです（何も保存しません）。差し戻しは MF経費で、ここに出る文面をコピーして使ってください" />
      <MikeikenNote mk={mk} live />
      <KeihiCheckLive mk={mk} />
      <p className="text-xs text-faint">出勤＝出勤か退勤の打刻がある日。在籍期間は名簿の入社日・退社日、待機中は退場日〜次の入場日の前。判定は今の社内システムの交通費チェックと同じです。</p>
    </main>
  );

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="交通費チェック" sub="交通費の申請（日ごと）と勤怠の打刻を、人ごと・1日ずつ照らします・見本データ">
        <select aria-label="対象の月" value={mkey} onChange={(e) => { setMkey(e.target.value); setSel({}); }} className="min-h-10 rounded-[10px] border border-field bg-surface px-2 text-body">
          {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <Link href="/keiri/keihi" className="btn-secondary">交通費・経費の承認へ</Link>
      </PageTitle>
      <LiveBanner state={login.state === 'error' ? 'error' : login.state} error={login.error} onReload={login.reload} />

      <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={remain.length} total={targets.length} />
        <div className="text-body"><b>差し戻し対象 残り {remain.length}人</b><span className="ml-2 text-muted">照らした {judged.length}人・問題なし {judged.length - targets.length}人</span>
          {!canApprove && <div className="text-sm text-bad">{needText('approve')}</div>}
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {LEGEND.map((k) => <span key={k} className="chip" style={{ background: DAY_STYLE[k].bg, color: DAY_STYLE[k].fg }}>{DAY_STYLE[k].label}</span>)}
        </div>
      </div>

      {targets.length > 0 && remain.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-md font-bold">{month.label} の見回りはおしまいです</div>
          <div className="mt-1 text-sm text-muted">{targets.length}人を差し戻し、本人に知らせました。出し直しが来たら「交通費・経費」に並びます。</div>
        </div>
      )}

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft px-4 py-2.5">
          {([['bad', `差し戻し対象 ${remain.length}`], ['ok', `問題なし ${judged.length - targets.length}`], ['all', `すべて ${judged.length}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`min-h-8 whitespace-nowrap rounded-full border px-3 text-sm ${tab === k ? 'font-semibold' : 'text-muted'}`} style={tab === k ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{l}</button>
          ))}
          {tab === 'bad' && remain.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select aria-label="差し戻す理由" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-sm">
                <option value="auto">理由：人ごとに いちばん多いもの</option>
                {Object.values(REASONS).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={() => sendBack(picked)} disabled={!canApprove || picked.length === 0} title={!canApprove ? needText('approve') : undefined} className="btn-danger solid btn-sm"><CornerUpLeft size={14} />選んだ {picked.length}人を差し戻す</button>
              <button onClick={() => sendBack(remain)} disabled={!canApprove} title={!canApprove ? needText('approve') : undefined} className="btn-danger btn-sm">{remain.length}人 ぜんぶ差し戻す</button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="w-10 px-4 py-2.5" /><th className="px-2 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">1日ずつ（上＝日・○＝申請あり）</th><th className="px-2 py-2.5 font-semibold">引っかかったこと</th><th className="px-4 py-2.5 text-right font-semibold">申請額</th>
            </tr></thead>
            <tbody>
              {rows.map((j, i) => (
                <tr key={j.p.id} className={`mo-fade-in border-t border-line-soft align-top ${flash.includes(j.p.id) ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                  <td className="px-4 py-2.5">{j.n > 0 && !back[j.p.id] && <input type="checkbox" aria-label={`${j.p.name} を選ぶ`} disabled={!canApprove} title={!canApprove ? needText('approve') : undefined} checked={!!sel[j.p.id]} onChange={(e) => setSel((s) => ({ ...s, [j.p.id]: e.target.checked }))} />}</td>
                  <td className="px-2 py-2.5">
                    <PersonName name={j.p.name} className="font-semibold hover:underline underline-offset-2" />
                    <div className="text-xs text-faint">{j.p.site}</div>
                    {j.shift && <span className="chip mt-1 inline-flex items-center gap-1" style={{ background: 'var(--al)', color: 'var(--ad)' }}><Repeat size={11} />シフト勤務</span>}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap gap-[3px]">
                      {j.days.map((d) => {
                        const s = DAY_STYLE[d.kind];
                        return (
                          <div key={d.d} title={`${month.month}/${d.d}（${DOW[d.dow]}）${s.label}${d.claim ? '・申請あり' : ''}`} className="flex w-[26px] flex-col items-center rounded-md py-0.5 text-xs leading-tight" style={{ background: s.bg, color: s.fg, outline: s.issue ? '1px solid currentColor' : undefined }}>
                            <span className="num font-semibold">{d.d}</span><span className="opacity-70">{DOW[d.dow]}</span><span>{d.claim ? '○' : ' '}</span>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-sm">
                    {back[j.p.id] ? <span className="text-bad">差し戻し済み：{back[j.p.id].reason}</span>
                      : j.n === 0 ? <span className="text-ok">問題なし</span>
                      : <ul className="flex flex-col gap-0.5">{(Object.entries(j.issues) as [DayKind, number][]).map(([k, n]) => <li key={k} style={{ color: DAY_STYLE[k].fg }}>{DAY_STYLE[k].label} {n}日</li>)}</ul>}
                    {j.shift && j.n === 0 && <div className="text-xs text-faint">土日祝に出勤あり＝平日の打刻なしは漏れにしていません</div>}
                  </td>
                  <td className="num px-4 py-2.5 text-right">{j.p.amount ? yen(j.p.amount) : '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-body text-muted">ここに出す人はいません</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-faint">出勤＝出勤か退勤の打刻がある日。在籍期間は名簿の入社日・退社日、待機中は退場日〜次の入場日の前。差し戻しは経費の申請を「差し戻し」に戻して本人に知らせる想定です（本物につなぐまでは見本の中だけで動きます）。</p>
    </main>
  );
}
