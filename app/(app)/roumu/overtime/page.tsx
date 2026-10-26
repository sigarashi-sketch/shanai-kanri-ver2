'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { KYOTEI, LEVEL_STYLE, leaveLevel, type Leave, type Level } from '@/lib/types/roumu';
import { PageTitle } from '@/components/ui';
import { usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { useIke } from '@/components/Live';
import { setMark, useMarks, type IkeOvertime } from '@/lib/live/roumu';
import { useMikeiken } from '@/components/Mikeiken';
import { stageTo, useRule } from '@/components/AlertStore';
import { numOf } from '@/lib/alert-rules';
import { PersonName } from '@/components/Person';
import { OtLive, useOtProbe } from './live';
import { NotifyButton, type Notify } from './parts';

// 残業・36協定・有給（労務/営業管理）。
//   ・残業：締め日時点の見込み（実績÷経過した所定日×今月の所定日）で、36協定の上限に近い人を色分けする
//     段階は 注意（月45hの8割）→ 警告（45h超え）→ 上限間近（特別条項の上限・6回の枠・2〜6か月平均80h）
//   ・有給：年10日以上付いた人の「1年のうちに5日」の進み具合と期限
//   段階の線と宛先はアラート設定（/roumu/alerts）で選んだものを読む（既定：注意＝担当営業／警告＝＋労務／上限間近＝＋全体管理者）
// 「月45hの8割（36h）」→ 0.8
const ratioOf = (s: string) => Number((s.match(/(\d)割/) || [])[1] || 8) / 10;
const ORDER: Level[] = ['danger', 'warn', 'caution', 'ok'];

function LevelChip({ level }: { level: Level }) {
  const s = LEVEL_STYLE[level];
  return <span className="chip" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
}

export default function OvertimePage() {
  // タブはクエリから（hydration ずれを避けて useEffect で読む）。知らせた印はタブを行き来しても消えないよう、ここで持つ
  const [tab, setTab] = useState<'ot' | 'leave'>('ot');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'leave') setTab('leave'); }, []);
  const go = (k: 'ot' | 'leave') => { setTab(k); window.history.replaceState(null, '', `/roumu/overtime${k === 'ot' ? '' : '?tab=leave'}`); };
  // 本物（10-25/10-26）：残業の今月は当日の出勤状況の「当月の合計」から（./live.tsx）。年の累計・45h超えの回数・2〜6か月平均・有給の年5日は freee の月次の写しから（roster?op=roumu&action=overtime）
  const probe = useOtProbe();
  const live = !!probe.date;
  const oq = useIke<IkeOvertime>(live ? 'roster?op=roumu&action=overtime' : null);
  const notify = useNotify(live, probe.date ? probe.date.slice(0, 7) : '');

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="残業・36協定・有給" sub="残業の今月は freee の打刻から出した目安、年の累計・45h超えの回数・平均と有給は freee の月次の写しから出した目安です" />
      {live && oq.state === 'error' && <div className="text-sm text-muted">年の累計・有給は読めませんでした（{oq.error}）</div>}
      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 1 }}>
        {([['ot', '残業・36協定'], ['leave', '有給の年5日']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className="tab">{l}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis">{tab === 'ot' ? <OtTab n={notify} probe={live ? probe : null} year={oq.data?.ok ? oq.data : null} /> : <LeaveTab n={notify} live={oq.data?.ok ? oq.data : null} loading={!live || oq.state === 'loading'} />}</div>
      <p className="text-xs text-faint">36協定の数字は新宿事業所の協定届（令和7年11月1日〜令和8年10月31日）のものです。社員の数字は freee の月次から出した目安です（有給の付与日は「残りが増えた月」から推しています）。36協定・有給の年5日の最終判断は社労士に確認してください。</p>
    </main>
  );
}

function useNotify(live = false, ym = '') {
  const canEdit = usePerms().can('roumu', 'edit');
  const { hit, toast } = useMotivation();
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState('');
  // 本物は「知らせた」の印（roumu_marks の ot-notify／leave-notify・月ごと）。宛先へ送る仕組みは無いので送らない
  const marks = useMarks(['ot-notify', 'leave-notify'], ym, live && !!ym);
  const kindOf = (key: string) => (key.startsWith('ot-') ? 'ot-notify' : 'leave-notify') as 'ot-notify' | 'leave-notify';
  const mk = (key: string) => `${ym}|${key.slice(3)}`;
  const sent: Record<string, string> = live ? Object.fromEntries(marks.rows.map((r) => [`${r.kind === 'ot-notify' ? 'ot' : 'lv'}-${r.key.split('|')[1]}`, `${new Date(r.updated_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} 知らせた印`])) : {};
  const send = (key: string, who: string, to: string[], what: string) => {
    if (!live) return;   // 読み込み中は押せない
    const kind = kindOf(key);
    setErr('');
    setMark(kind, mk(key), kind === 'ot-notify' ? '知らせた' : 'すすめた', { nn: key.slice(3), ym, note: to.join('・') })
      .then(() => { setFlash(key); setTimeout(() => setFlash(null), 1300); hit(); marks.reload(); toast({ text: `${who} の${what}を知らせた印を付けました`, sub: `→ ${to.join('・')} への連絡はチャットで（ここからは送りません）`, undo: () => { setMark(kind, mk(key), '').then(() => marks.reload()).catch((e) => setErr((e as Error).message)); } }); })
      .catch((e) => setErr(`${who}：${(e as Error).message}`));
  };
  return { canEdit: canEdit && live, sent, flash, send, err, live };
}

function EmptyRow({ cols }: { cols: number }) {
  return <tr><td colSpan={cols} className="px-4 py-8 text-center text-body text-muted">この段階の人はいません。</td></tr>;
}

/** 知らせるボタン。宛先が無い（知らせを止めている）ときは押せない。 */
function Filters({ counts, value, onChange }: { counts: Record<string, number>; value: Level | 'all'; onChange: (v: Level | 'all') => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(['all', ...ORDER] as const).map((k) => (
        <button key={k} onClick={() => onChange(k)} aria-pressed={value === k} className="fchip">
          {k === 'all' ? 'すべて' : LEVEL_STYLE[k].label} <span className="num">{counts[k] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function OtTab({ n, probe, year }: { n: Notify; probe: ReturnType<typeof useOtProbe> | null; year: IkeOvertime | null }) {
  const rule = useRule('overtime');
  const dangerRatio = ratioOf(rule.stages[2].when);
  const TO = (lv: Level) => stageTo(rule, lv);
  return (
    <div className="flex flex-col gap-3">
      <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-bad-line bg-bad-soft px-4 py-2.5 text-sm text-bad">
        <AlertTriangle size={16} className="shrink-0 text-bad" />
        <span><b>{KYOTEI.office}の36協定は {KYOTEI.validUntil} で期限です。</b>11/1 からの新しい協定を届け出たか確かめてください（届け出るまで残業はさせられません）。</span>
        <span className="text-bad">いまの協定：1日{KYOTEI.daily}h・月{KYOTEI.monthly}h・年{KYOTEI.yearly}h／特別条項 月{KYOTEI.spMonthly}h・年{KYOTEI.spYearly}h・年{KYOTEI.overCount}回／休日労働 月{KYOTEI.holidayPerMonth}回</span>
      </div>
      {!probe?.date || probe.names.state === 'loading'
        ? <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-muted">読み込み中…</div>
        : <OtLive date={probe.date} names={probe.names} caution={ratioOf(rule.stages[0].when)} danger={dangerRatio} year={year} n={n} to={TO} />}
    </div>
  );
}

function LeaveTab({ n, live, loading }: { n: Notify; live: IkeOvertime | null; loading?: boolean }) {
  const { flash } = n;
  const [f, setF] = useState<Level | 'all'>('all');
  const rule = useRule('leave');
  const TO = (lv: Level) => stageTo(rule, lv);
  const dangerDays = numOf(rule.stages[2].when);
  const mk = useMikeiken();
  const today = Date.parse(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
  // 本物：年10日以上の付与が見つかった人だけ（付与の月＝有給の残りが増えた月の目安）
  const src: Leave[] = mk.keep((live?.rows || []).filter((r) => r.leave.grantYm && r.leave.granted >= 10), 'name').map((r) => ({
    personId: r.nn, name: r.name, site: r.kubun ? `勤務区分 ${r.kubun}` : '', grantedOn: `${r.leave.grantYm.replace('-', '/')}（月の中）`, granted: r.leave.granted, taken: r.leave.taken,
    deadline: r.leave.deadline.replace(/-/g, '/'), daysLeft: Math.round((Date.parse(r.leave.deadline) - today) / 86400e3),
  })).filter((l) => l.daysLeft >= -31);
  const rows = src.map((l) => ({ l, level: leaveLevel(l, dangerDays, numOf(rule.stages[1].when) / 100) })).sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || a.l.daysLeft - b.l.daysLeft);
  const counts: Record<string, number> = { all: rows.length };
  rows.forEach((r) => { counts[r.level] = (counts[r.level] ?? 0) + 1; });
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-sm text-muted">{loading ? 'freee の月次の写しを読んでいます…' : `付与日は freee の「有給の残り」が増えた月から推した目安です（実際の付与日・日数は freee で確かめてください）。付与が見つかった人 ${src.length}人`}</div>
      {n.err && <div className="text-sm text-bad">{n.err}</div>}
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">年10日以上の有給が付いた人は、<b className="text-ink">付いた日から1年のうちに5日</b>取ってもらう義務があります。期限までの残りと、取った日数の進み具合で色を付けています。</div>
      <Filters counts={counts} value={f} onChange={setF} />
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">付いた日・日数</th><th className="px-2 py-2.5 font-semibold">取った日数（5日のうち）</th><th className="px-2 py-2.5 font-semibold">期限</th><th className="px-2 py-2.5 font-semibold">段階</th><th className="px-4 py-2.5" />
            </tr></thead>
            <tbody>
              {rows.filter((r) => f === 'all' || r.level === f).length === 0 && (loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-body text-muted">読み込み中…</td></tr> : <EmptyRow cols={6} />)}
              {rows.filter((r) => f === 'all' || r.level === f).map(({ l, level }, i) => {
                const key = `lv-${l.personId}`;
                const need = Math.max(0, 5 - l.taken);
                return (
                  <tr key={l.personId} className={`mo-fade-in border-t border-line-soft ${flash === key ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5"><div className="font-semibold"><PersonName name={l.name} className="underline-offset-2 hover:underline" /></div><div className="text-xs text-faint">{l.site}</div></td>
                    <td className="num px-2 py-2.5">{l.grantedOn}<span className="text-faint">・{l.granted}日</span></td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1" aria-label={`5日のうち${l.taken}日`}>
                        {Array.from({ length: 5 }, (_, d) => <span key={d} className="size-3.5 rounded-[4px]" style={{ background: d < l.taken ? 'var(--a)' : 'var(--color-track)' }} />)}
                        <span className="num ml-1.5">{l.taken}日</span>{need > 0 && <span className="ml-1 text-xs text-muted">あと{need}日</span>}{l.planned && <span className="ml-1.5 text-xs text-info">{l.planned}</span>}
                      </div>
                    </td>
                    <td className="num px-2 py-2.5">{l.deadline}<span className="ml-1 text-xs" style={{ color: l.daysLeft <= dangerDays ? 'var(--color-bad)' : 'var(--color-faint)' }}>あと{l.daysLeft}日</span></td>
                    <td className="px-2 py-2.5"><LevelChip level={level} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {level === 'ok' ? <span className="text-sm text-faint">{need === 0 ? '達成' : '—'}</span>
                        : <NotifyButton n={n} k={key} who={l.name} to={TO(level)} what="有給の取得のおすすめ" label="取得をすすめる" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
