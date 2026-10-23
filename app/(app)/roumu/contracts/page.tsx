'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, Check } from 'lucide-react';
import { CONTRACTS, LEVEL_STYLE, contractLevel as levelOf, type DispatchContract, type Intent, type Level } from '@/lib/roumu-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { stageTo, useRule } from '@/components/AlertStore';
import { numOf } from '@/lib/alert-rules';

// 現場・契約（労務/営業管理）＝派遣契約の終了が近い人の通知。準委任は対象外。
//   ・契約の終わり と 抵触日（同じ派遣先の同じ組織で働ける3年の期限・個人単位）の近いほうで段階を付ける
//   ・既定は 60日前＝注意（担当営業）→ 30日前＝警告（＋労務）→ 14日前＝上限間近（＋全体管理者）。日数と宛先はアラート設定で選んだものを読む
//   ・更新の意向は選ぶだけ（自由入力にしない）。「更新」「終了」が決まれば通知は止まる
const ORDER: Level[] = ['danger', 'warn', 'caution', 'ok'];
const INTENTS: Intent[] = ['未確認', '派遣先と調整中', '更新', '終了'];
const decided = (c: DispatchContract) => c.intent === '更新' || c.intent === '終了';

export default function ContractsPage() {
  const canEdit = usePerms().can('roumu', 'edit');
  const rule = useRule('contract');
  const days = rule.stages.map((s) => numOf(s.when)) as [number, number, number];
  const contractLevel = (c: DispatchContract) => levelOf(c, days);
  const STEP_TO = (lv: Level) => stageTo(rule, lv);
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<DispatchContract[]>(CONTRACTS);
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<string | null>(null);
  // 並びは、はじめの段階と残り日数で固定（意向を選ぶたびに行が下へ逃げないように。決まった行は薄くする）
  const first = Object.fromEntries(CONTRACTS.map((c) => [c.personId, contractLevel(c)]));
  const sorted = [...rows].sort((a, b) => ORDER.indexOf(first[a.personId]) - ORDER.indexOf(first[b.personId]) || Math.min(a.daysLeft, a.conflictDays) - Math.min(b.daysLeft, b.conflictDays));
  const open = rows.filter((r) => contractLevel(r) !== 'ok').length;
  const openTotal = CONTRACTS.filter((r) => contractLevel(r) !== 'ok').length;
  const undecided = rows.filter((r) => !decided(r)).length;

  const pulse = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1300); };
  const setIntent = (c: DispatchContract, intent: Intent) => {
    const prev = c.intent;
    setRows((rs) => rs.map((r) => (r.personId === c.personId ? { ...r, intent } : r)));
    pulse(c.personId); hit();
    toast({
      text: `${c.name} の更新の意向を「${intent}」にしました`,
      sub: intent === '更新' ? '→ 契約の更新の下書きと、請求の確認リストに載りました' : intent === '終了' ? '→ 待機・再アサインの候補と、営業共有リストに載りました' : '→ 担当営業のやることに残っています',
      undo: () => setRows((rs) => rs.map((r) => (r.personId === c.personId ? { ...r, intent: prev } : r))),
    });
  };
  const ask = (c: DispatchContract, to: string[]) => {
    if (to.length === 0) return;
    setAsked((a) => ({ ...a, [c.personId]: true }));
    pulse(c.personId); hit();
    toast({ text: `${c.name} の意向確認を頼みました`, sub: `→ ${to.join('・')} のやることに載りました`, undo: () => setAsked((a) => ({ ...a, [c.personId]: false })) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="現場・契約" sub="派遣契約の終わりと抵触日が近い人。更新するか決まるまで、段階ごとに知らせます（準委任は対象外）・見本データ" />

      <div className="mo-fade-up flex flex-wrap items-stretch gap-3" style={{ ['--i' as string]: 1 }}>
        <div className="flex min-w-[240px] items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <RemainRing remain={open} total={Math.max(openTotal, open)} />
          <div>
            <div className="text-[12px] text-muted">知らせる段階に入って、意向がまだ</div>
            <div className="num text-[24px] font-bold">{open}<span className="ml-0.5 text-[13px] font-semibold text-muted">人</span></div>
            <div className="text-[11.5px] text-faint">意向が決まっていない人は全部で {undecided}人</div>
          </div>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
          <span className="mr-1 text-[12px] text-muted">知らせる段階</span>
          {rule.stages.map((s, i) => (
            <span key={s.level} className="flex items-center gap-2">
              {i > 0 && <span className="text-faint">→</span>}
              <span className="rounded-[10px] px-3 py-1.5 text-[12.5px]" style={{ background: LEVEL_STYLE[s.level].bg, color: LEVEL_STYLE[s.level].fg }}><b>{s.when}・{LEVEL_STYLE[s.level].label}</b><span className="ml-1.5">{s.to.join('・')}</span></span>
            </span>
          ))}
          <Link href="/roumu/alerts" className="ml-auto text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>宛先を変える</Link>
        </div>
      </div>

      {open === 0 && (
        <div className="mo-scale-in flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px]"><Check size={18} className="text-ok" />知らせる段階の人は、全員の意向が決まりました。次に近づいた人がまた上に出ます。</div>
      )}

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-[13px]">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">派遣先</th><th className="px-2 py-2.5 font-semibold">契約の終わり</th><th className="px-2 py-2.5 font-semibold">抵触日（個人単位）</th><th className="px-2 py-2.5 font-semibold">段階</th><th className="px-2 py-2.5 font-semibold">更新の意向</th><th className="px-4 py-2.5" />
            </tr></thead>
            <tbody>
              {sorted.map((c, i) => {
                const lv = contractLevel(c);
                const s = LEVEL_STYLE[lv];
                const conflictFirst = c.conflictDays <= c.daysLeft + 31; // 次の更新で抵触日をまたぐ
                return (
                  <tr key={c.personId} className={`mo-fade-in border-t border-line-soft align-top ${flash === c.personId ? 'mo-flash' : 'row'} ${lv === 'ok' && first[c.personId] !== 'ok' ? 'opacity-60' : ''}`} style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5"><div className="font-semibold">{c.name}</div><div className="text-[11.5px] text-faint">営業 {c.sales}</div></td>
                    <td className="px-2 py-2.5">{c.site}<div className="text-[11.5px] text-faint">{c.start}〜</div></td>
                    <td className="num px-2 py-2.5">{c.end}<span className="ml-1 text-[11.5px]" style={{ color: c.daysLeft <= 45 ? 'var(--color-bad)' : 'var(--color-faint)' }}>あと{c.daysLeft}日</span></td>
                    <td className="num px-2 py-2.5">
                      {c.conflictOn}<span className="ml-1 text-[11.5px]" style={{ color: conflictFirst ? 'var(--color-bad)' : 'var(--color-faint)' }}>あと{c.conflictDays}日</span>
                      {conflictFirst && <div className="mo-shake mt-1 flex items-start gap-1 text-[11.5px] text-bad"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-bad" />次の更新で抵触日を超えます。同じ組織では続けられません</div>}
                    </td>
                    <td className="px-2 py-2.5"><span className="chip" style={{ background: s.bg, color: s.fg }}>{lv !== 'ok' ? s.label : decided(c) ? '決まり' : 'まだ先'}</span></td>
                    <td className="px-2 py-2.5">
                      <select aria-label={`${c.name} の更新の意向`} value={c.intent} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onChange={(e) => setIntent(c, e.target.value as Intent)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-[12.5px] disabled:opacity-50">
                        {INTENTS.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                      {c.asked && <div className="mt-1 text-[11.5px] text-faint">{c.asked}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {lv === 'ok' ? <span className="text-[12px] text-faint">{decided(c) ? '通知は止まりました' : `${days[0]}日前から知らせます`}</span>
                        : asked[c.personId] ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ok"><Check size={14} />今日 頼みました</span>
                        : <><button onClick={() => ask(c, STEP_TO(lv))} disabled={!canEdit || STEP_TO(lv).length === 0} title={!canEdit ? needText('edit') : STEP_TO(lv).length === 0 ? 'アラート設定で知らせを止めています' : undefined} className="inline-flex whitespace-nowrap min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><Bell size={14} />意向確認を頼む</button><div className="mt-1 text-[11px] text-faint">{STEP_TO(lv).join('・') || '知らせを止めています'}</div></>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11.5px] text-faint">抵触日・契約終了の扱い（雇用安定措置など）は派遣法の決まりに沿って、最終判断は社労士・法務に確認してください。</p>
    </main>
  );
}
