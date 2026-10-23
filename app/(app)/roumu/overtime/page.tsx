'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, Check } from 'lucide-react';
import { KYOTEI, LEAVES, LEVEL_STYLE, MONTH, OVERTIME, leaveLevel, otLevel, projection, type Level } from '@/lib/roumu-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { stageTo, useRule } from '@/components/AlertStore';
import { numOf } from '@/lib/alert-rules';

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

/** 今月の実績（濃い）と見込み（薄い）を、45h と特別条項の上限の線つきで描く。 */
function OtBar({ actual, proj, lv }: { actual: number; proj: number; lv: Level }) {
  const max = KYOTEI.spMonthly + 10;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="relative h-2.5 w-[180px] rounded-full bg-sunken" aria-hidden>
      <div className="mo-bar absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: pct(proj), background: LEVEL_STYLE[lv].bar }} />
      <div className="mo-bar absolute inset-y-0 left-0 rounded-full" style={{ width: pct(actual), background: LEVEL_STYLE[lv].bar }} />
      <div className="absolute -inset-y-1 w-px bg-muted" style={{ left: pct(KYOTEI.monthly) }} />
      <div className="absolute -inset-y-1 w-px bg-bad" style={{ left: pct(KYOTEI.spMonthly) }} />
    </div>
  );
}

function Spark({ xs }: { xs: number[] }) {
  const w = 64, h = 22, max = Math.max(KYOTEI.monthly + 5, ...xs);
  const pts = xs.map((v, i) => `${(i / (xs.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  const y45 = h - (KYOTEI.monthly / max) * h;
  return (
    <svg width={w} height={h} aria-label={`直近6か月 ${xs.join('・')}時間`} role="img">
      <line x1="0" x2={w} y1={y45} y2={y45} stroke="var(--color-field)" strokeDasharray="2 2" />
      <polyline points={pts} fill="none" stroke="var(--a)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export default function OvertimePage() {
  // タブはクエリから（hydration ずれを避けて useEffect で読む）。知らせた印はタブを行き来しても消えないよう、ここで持つ
  const [tab, setTab] = useState<'ot' | 'leave'>('ot');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'leave') setTab('leave'); }, []);
  const go = (k: 'ot' | 'leave') => { setTab(k); window.history.replaceState(null, '', `/roumu/overtime${k === 'ot' ? '' : '?tab=leave'}`); };
  const notify = useNotify();

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="残業・36協定・有給" sub={`${MONTH.label}（締め ${MONTH.closeOn}）・所定 ${MONTH.workdays}日のうち ${MONTH.passed}日経過・見本データ`} />
      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 1 }}>
        {([['ot', '残業・36協定'], ['leave', '有給の年5日']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className="px-3.5 py-2.5 text-[14px]"
            style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>{l}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis">{tab === 'ot' ? <OtTab n={notify} /> : <LeaveTab n={notify} />}</div>
      <p className="text-[11.5px] text-faint">36協定の数字は新宿事業所の協定届（令和7年11月1日〜令和8年10月31日）のものです。社員の数字は見本です。扱いに迷うものは社労士に確認してください。</p>
    </main>
  );
}

function useNotify() {
  const canEdit = usePerms().can('roumu', 'edit');
  const { hit, toast } = useMotivation();
  const [sent, setSent] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const send = (key: string, who: string, to: string[], what: string) => {
    setFlash(key); setTimeout(() => setFlash(null), 1300);
    setSent((s) => ({ ...s, [key]: `今日 ${to.join('・')}へ` }));
    hit();
    toast({ text: `${who} の${what}を知らせました`, sub: `→ ${to.join('・')} のやることに載りました`, undo: () => setSent((s) => { const n = { ...s }; delete n[key]; return n; }) });
  };
  return { canEdit, sent, flash, send };
}
type Notify = ReturnType<typeof useNotify>;

function EmptyRow({ cols }: { cols: number }) {
  return <tr><td colSpan={cols} className="px-4 py-8 text-center text-[13px] text-muted">この段階の人はいません。</td></tr>;
}

/** 知らせるボタン。宛先が無い（知らせを止めている）ときは押せない。 */
function NotifyButton({ n, k, who, to, what, label }: { n: Notify; k: string; who: string; to: string[]; what: string; label: string }) {
  if (n.sent[k]) return <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-ok"><Check size={14} />{n.sent[k]}</span>;
  const none = to.length === 0;
  return (
    <>
      <button onClick={() => n.send(k, who, to, what)} disabled={!n.canEdit || none} title={!n.canEdit ? needText('edit') : none ? 'アラート設定で知らせを止めています' : `${to.join('・')}に知らせる`} className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[12.5px] font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><Bell size={14} />{label}</button>
      <div className="mt-1 text-[11px] text-faint">{none ? '知らせを止めています' : to.join('・')}</div>
    </>
  );
}

function Filters({ counts, value, onChange }: { counts: Record<string, number>; value: Level | 'all'; onChange: (v: Level | 'all') => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(['all', ...ORDER] as const).map((k) => (
        <button key={k} onClick={() => onChange(k)} className="min-h-9 rounded-full border px-3.5 text-[13px]"
          style={value === k ? { borderColor: 'var(--a)', background: 'var(--as)', color: 'var(--ad)', fontWeight: 700 } : { borderColor: 'var(--color-field)', background: 'var(--color-surface)' }}>
          {k === 'all' ? 'すべて' : LEVEL_STYLE[k].label} <span className="num">{counts[k] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function OtTab({ n }: { n: Notify }) {
  const { flash } = n;
  const rule = useRule('overtime');
  const dangerRatio = ratioOf(rule.stages[2].when);
  const TO = (lv: Level) => stageTo(rule, lv);
  const [f, setF] = useState<Level | 'all'>('all');
  const rows = OVERTIME.map((o) => ({ o, p: projection(o), ...otLevel(o, ratioOf(rule.stages[0].when), dangerRatio) })).sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || b.p - a.p);
  const counts: Record<string, number> = { all: rows.length };
  rows.forEach((r) => { counts[r.level] = (counts[r.level] ?? 0) + 1; });
  const yearCap = KYOTEI.special ? KYOTEI.spYearly : KYOTEI.yearly;

  return (
    <div className="flex flex-col gap-3">
      <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-bad-line bg-bad-soft px-4 py-2.5 text-[12.5px] text-bad">
        <AlertTriangle size={16} className="shrink-0 text-bad" />
        <span><b>{KYOTEI.office}の36協定は {KYOTEI.validUntil} で期限です。</b>11/1 からの新しい協定を届け出たか確かめてください（届け出るまで残業はさせられません）。</span>
        <span className="text-bad">いまの協定：1日{KYOTEI.daily}h・月{KYOTEI.monthly}h・年{KYOTEI.yearly}h／特別条項 月{KYOTEI.spMonthly}h・年{KYOTEI.spYearly}h・年{KYOTEI.overCount}回／休日労働 月{KYOTEI.holidayPerMonth}回</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['協定の上限（月）', `${KYOTEI.monthly}h`, `特別条項 ${KYOTEI.spMonthly}h（休日込み）・年${KYOTEI.overCount}回まで`],
          ['協定の上限（年）', `${KYOTEI.yearly}h`, `特別条項 ${KYOTEI.spYearly}h・${KYOTEI.yearStart}起算`],
          ['45h を超えそう', `${rows.filter((r) => r.p > KYOTEI.monthly).length}人`, '締め日時点の見込み'],
          ['上限間近', `${counts.danger ?? 0}人`, `月${Math.round(KYOTEI.spMonthly * dangerRatio)}h超え見込み・${KYOTEI.overCount}回の枠・平均${KYOTEI.avgLimit}h`],
        ].map(([l, n, s], i) => (
          <div key={l} className="mo-fade-up rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: i }}>
            <div className="text-[12px] text-muted">{l}</div><div className="num text-[22px] font-bold">{n}</div><div className="text-[11.5px] text-faint">{s}</div>
          </div>
        ))}
      </div>
      <Filters counts={counts} value={f} onChange={setF} />
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th>
              <th className="px-2 py-2.5 font-semibold">今月（実績／見込み）<span className="ml-1 font-normal text-faint">線＝{KYOTEI.monthly}h・{KYOTEI.spMonthly}h</span></th>
              <th className="px-2 py-2.5 font-semibold">年の累計</th><th className="px-2 py-2.5 font-semibold">45h超え</th><th className="px-2 py-2.5 font-semibold">2〜6か月平均</th><th className="px-2 py-2.5 font-semibold">6か月</th>
              <th className="px-2 py-2.5 font-semibold">段階</th><th className="px-4 py-2.5" />
            </tr></thead>
            <tbody>
              {rows.filter((r) => f === 'all' || r.level === f).length === 0 && <EmptyRow cols={8} />}
              {rows.filter((r) => f === 'all' || r.level === f).map(({ o, p, level, reason }, i) => {
                const key = `ot-${o.personId}`;
                return (
                  <tr key={o.personId} className={`mo-fade-in border-t border-line-soft align-top ${flash === key ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5"><div className="font-semibold">{o.name}</div><div className="text-[11.5px] text-faint">{o.site}・営業 {o.sales}</div></td>
                    <td className="px-2 py-2.5"><div className="flex items-center gap-2.5"><OtBar actual={o.actual} proj={p} lv={level} /><span className="num whitespace-nowrap"><b>{o.actual}h</b><span className="text-muted"> → {p}h</span></span></div>{o.holiday > 0 && <div className="mt-1 text-[11.5px] text-faint">休日労働 {o.holiday}h を含む</div>}</td>
                    <td className="num px-2 py-2.5">{o.yearTotal}<span className="text-faint">／{yearCap}h</span></td>
                    <td className="num px-2 py-2.5" style={{ color: o.over45 >= KYOTEI.overCount - 1 ? 'var(--color-bad)' : undefined }}>{o.over45}<span className="text-faint">／{KYOTEI.overCount}回</span></td>
                    <td className="num px-2 py-2.5" style={{ color: o.avg26 >= KYOTEI.avgLimit * 0.9 ? 'var(--color-bad)' : undefined }}>{o.avg26}h</td>
                    <td className="px-2 py-2.5"><Spark xs={o.trend} /></td>
                    <td className="max-w-[260px] px-2 py-2.5"><LevelChip level={level} />{reason && <div className="mt-1 text-[11.5px] text-muted">{reason}</div>}</td>
                    <td className="px-4 py-2.5 text-right">
                      {level === 'ok' ? <span className="text-[12px] text-faint">—</span>
                        : <NotifyButton n={n} k={key} who={o.name} to={TO(level)} what="残業の見込み" label="知らせる" />}
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

function LeaveTab({ n }: { n: Notify }) {
  const { flash } = n;
  const [f, setF] = useState<Level | 'all'>('all');
  const rule = useRule('leave');
  const TO = (lv: Level) => stageTo(rule, lv);
  const dangerDays = numOf(rule.stages[2].when);
  const rows = LEAVES.map((l) => ({ l, level: leaveLevel(l, dangerDays, numOf(rule.stages[1].when) / 100) })).sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || a.l.daysLeft - b.l.daysLeft);
  const counts: Record<string, number> = { all: rows.length };
  rows.forEach((r) => { counts[r.level] = (counts[r.level] ?? 0) + 1; });
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">年10日以上の有給が付いた人は、<b className="text-ink">付いた日から1年のうちに5日</b>取ってもらう義務があります。期限までの残りと、取った日数の進み具合で色を付けています。</div>
      <Filters counts={counts} value={f} onChange={setF} />
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">付いた日・日数</th><th className="px-2 py-2.5 font-semibold">取った日数（5日のうち）</th><th className="px-2 py-2.5 font-semibold">期限</th><th className="px-2 py-2.5 font-semibold">段階</th><th className="px-4 py-2.5" />
            </tr></thead>
            <tbody>
              {rows.filter((r) => f === 'all' || r.level === f).length === 0 && <EmptyRow cols={6} />}
              {rows.filter((r) => f === 'all' || r.level === f).map(({ l, level }, i) => {
                const key = `lv-${l.personId}`;
                const need = Math.max(0, 5 - l.taken);
                return (
                  <tr key={l.personId} className={`mo-fade-in border-t border-line-soft ${flash === key ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5"><div className="font-semibold">{l.name}</div><div className="text-[11.5px] text-faint">{l.site}</div></td>
                    <td className="num px-2 py-2.5">{l.grantedOn}<span className="text-faint">・{l.granted}日</span></td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1" aria-label={`5日のうち${l.taken}日`}>
                        {Array.from({ length: 5 }, (_, d) => <span key={d} className="size-3.5 rounded-[4px]" style={{ background: d < l.taken ? 'var(--a)' : 'var(--color-track)' }} />)}
                        <span className="num ml-1.5">{l.taken}日</span>{need > 0 && <span className="ml-1 text-[11.5px] text-muted">あと{need}日</span>}{l.planned && <span className="ml-1.5 text-[11.5px] text-info">{l.planned}</span>}
                      </div>
                    </td>
                    <td className="num px-2 py-2.5">{l.deadline}<span className="ml-1 text-[11.5px]" style={{ color: l.daysLeft <= dangerDays ? 'var(--color-bad)' : 'var(--color-faint)' }}>あと{l.daysLeft}日</span></td>
                    <td className="px-2 py-2.5"><LevelChip level={level} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {level === 'ok' ? <span className="text-[12px] text-faint">{need === 0 ? '達成' : '—'}</span>
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
