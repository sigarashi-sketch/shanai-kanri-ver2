'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, Check, Info, ShieldCheck } from 'lucide-react';
import { CONTRACTS, DOC_LABELS, LEVEL_STYLE, contractDecided as decided, contractLevel as levelOf, ikenOf, type DispatchContract, type Intent, type Level } from '@/lib/roumu-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { postLive } from '@/lib/live/post';
import type { IkeHaken, IkeHakenRow } from '@/lib/live/roumu';
import { stageTo, useRule } from '@/components/AlertStore';
import { numOf } from '@/lib/alert-rules';
import { PersonName } from '@/components/Person';

// 派遣契約（労務/営業管理・営業の /eigyo/haken も同じ画面）＝派遣契約の終了が近い人の通知。準委任は対象外。
//   10-25 shoya「これややこしいから派遣契約にして」で 現場・契約 → 派遣契約
//   ・契約の終わり と 抵触日（同じ派遣先の同じ組織で働ける3年の期限・個人単位）の近いほうで段階を付ける
//   ・既定は 60日前＝注意（担当営業）→ 30日前＝警告（＋労務）→ 14日前＝上限間近（＋全体管理者）。日数と宛先はアラート設定で選んだものを読む
//   ・更新の意向は選ぶだけ（自由入力にしない）。営業は「更新」「終了」を提案まで、確定は労務の権限（直す）の人。確定すれば通知は止まる（10-25）
//   ・事業所単位の抵触日と意見聴取の期限（抵触日の1か月前）・書類（個別契約書・派遣元管理台帳・就業条件明示）の有無も出す（10-25）
//   ・準委任の行も出すが、抵触日・書類・通知は対象外（派遣ではない＝現場からの指揮命令はできない）
//   ・本物（10-26）：契約の形・派遣先・契約の始まりと終わりは稼働管理情報一覧のいちばん新しい月の行（派遣/準委任）。
//     抵触日（個人単位・事業所単位）・書類・更新の意向（提案と確定）・意向確認を頼んだ印は今のシステムの haken_contracts（0370）
//     抵触日（個人単位）が空なら「同じ派遣先で派遣だった行のいちばん早い開始日＋3年」を目安で出す（組織単位までは見ていない）
//   ・見本のときの知らせには「（見本）」を付ける
const DAY = 86400000;
const slash = (iso: string) => iso.replace(/-/g, '/');
function liveContract(r: IkeHakenRow, today: number): DispatchContract & { raw: IkeHakenRow } {
  const left = (iso: string) => (iso ? Math.round((Date.parse(iso) - today) / DAY) : 99999);
  const haken = r.kind === '派遣';
  return {
    personId: r.nn, name: r.name, site: r.site || '—', sales: r.rep || '未設定', kind: r.kind,
    start: slash(r.hakenFrom || r.start), end: r.end ? slash(r.end) : '（終わりの日が無い）', daysLeft: left(r.end),
    conflictOn: haken && r.conflictOn ? slash(r.conflictOn) : '', conflictDays: haken ? left(r.conflictOn) : 99999,
    officeConflictOn: haken && r.officeConflictOn ? slash(r.officeConflictOn) : '', officeConflictDays: haken ? left(r.officeConflictOn) : 99999,
    docs: haken ? r.docs : null, intent: r.intent, confirmed: r.confirmed,
    asked: r.askedAt ? `${new Date(r.askedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} ${r.askedTo || ''}に頼んだ` : undefined,
    raw: r,
  };
}
const ORDER: Level[] = ['danger', 'warn', 'caution', 'ok'];
const INTENTS: Intent[] = ['未確認', '派遣先と調整中', '更新', '終了'];
const QUASI_NOTE = '準委任：現場からの指揮命令はできません';

export default function ContractsPage() {
  const { can } = usePerms();
  const canEdit = can('roumu', 'edit') || can('eigyo', 'edit');
  const canConfirm = can('roumu', 'edit');   // 確定は労務の権限だけ（営業は提案まで）
  const rule = useRule('contract');
  const days = rule.stages.map((s) => numOf(s.when)) as [number, number, number];
  const contractLevel = (c: DispatchContract) => levelOf(c, days);
  const STEP_TO = (lv: Level) => stageTo(rule, lv);
  const { hit, toast } = useMotivation();
  const hq = useIke<IkeHaken>('roster?op=roumu&action=haken');
  const live = hq.live && !!hq.data?.ok;
  const mk = useMikeiken();
  const mihon = (t: string) => (live ? t : `${t}（見本）`);
  const [today] = useState(() => Date.parse(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)));
  // 本物は未経験の人だけ。準委任は終わりが近い人だけ（通知の対象外・参考に出す）
  const liveRows = live ? mk.keep(hq.data!.rows, 'name').map((r) => liveContract(r, today)).filter((c) => c.kind === '派遣' || c.daysLeft <= days[0]) : [];
  const [rows0, setRows] = useState<DispatchContract[]>(CONTRACTS);
  const rows: DispatchContract[] = live ? liveRows : rows0;
  const [werr, setWerr] = useState('');
  const write = async (body: Record<string, unknown>) => { setWerr(''); try { await postLive('/api/live/roumu', body); hq.reload(); return true; } catch (e) { setWerr((e as Error).message); return false; } };
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);   // 準委任の説明を開いた行
  // 並びは、はじめの段階と残り日数で固定（意向を選ぶたびに行が下へ逃げないように。決まった行は薄くする）
  const [firstLive, setFirstLive] = useState<Record<string, Level> | null>(null);
  useEffect(() => { if (live && !firstLive) setFirstLive(Object.fromEntries(liveRows.map((c) => [c.personId, contractLevel(c)]))); }, [live, firstLive, liveRows]);
  const first: Record<string, Level> = live ? { ...Object.fromEntries(liveRows.map((c) => [c.personId, contractLevel(c)])), ...(firstLive || {}) } : Object.fromEntries(CONTRACTS.map((c) => [c.personId, contractLevel(c)]));
  const near = (c: DispatchContract) => Math.min(c.daysLeft, c.conflictDays, ikenOf(c)?.days ?? Infinity);
  const sorted = [...rows].sort((a, b) => (a.kind === '準委任' ? 1 : 0) - (b.kind === '準委任' ? 1 : 0) || ORDER.indexOf(first[a.personId]) - ORDER.indexOf(first[b.personId]) || near(a) - near(b));
  const open = rows.filter((r) => contractLevel(r) !== 'ok').length;
  const openTotal = live ? Object.values(first).filter((l) => l !== 'ok').length : CONTRACTS.filter((r) => contractLevel(r) !== 'ok').length;
  const undecided = rows.filter((r) => r.kind === '派遣' && !decided(r)).length;

  const pulse = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1300); };
  // 意向を選ぶ＝提案（確定は外れる）。更新・終了は労務が「確定」するまで通知は止まらない
  const setIntent = (c: DispatchContract, intent: Intent) => {
    if (live) {
      const prev = c.intent;
      write({ action: 'haken-save', nn: c.personId, name: c.name, intent }).then((ok) => { if (!ok) return; pulse(c.personId); hit();
        toast({ text: `${c.name} の更新の意向を「${intent}」${intent === '更新' || intent === '終了' ? 'で提案しました' : 'にしました'}`, sub: intent === '更新' || intent === '終了' ? '→ 労務の確定を待っています（確定するまで知らせは続きます）' : '→ 今の社内システムに残しました', undo: () => { write({ action: 'haken-save', nn: c.personId, intent: prev }); } }); });
      return;
    }
    const prev = { intent: c.intent, confirmed: c.confirmed };
    const proposal = intent === '更新' || intent === '終了';
    setRows((rs) => rs.map((r) => (r.personId === c.personId ? { ...r, intent, confirmed: false } : r)));
    pulse(c.personId); hit();
    toast({
      text: proposal ? `${c.name} の更新の意向を「${intent}」で提案しました` : `${c.name} の更新の意向を「${intent}」にしました`,
      sub: proposal ? mihon('→ 労務の確定を待っています（確定するまで通知は続きます）') : mihon('→ 担当営業のやることに残っています'),
      undo: () => setRows((rs) => rs.map((r) => (r.personId === c.personId ? { ...r, ...prev } : r))),
    });
  };
  const confirmIntent = (c: DispatchContract) => {
    if (!canConfirm) return;
    if (live) {
      write({ action: 'haken-confirm', nn: c.personId }).then((ok) => { if (!ok) return; pulse(c.personId); hit();
        toast({ text: `${c.name} の「${c.intent}」を確定しました`, sub: '→ 知らせは止まりました', undo: () => { write({ action: 'haken-confirm', nn: c.personId, undo: true }); } }); });
      return;
    }
    setRows((rs) => rs.map((r) => (r.personId === c.personId ? { ...r, confirmed: true } : r)));
    pulse(c.personId); hit();
    toast({
      text: `${c.name} の「${c.intent}」を確定しました`,
      sub: mihon(c.intent === '更新' ? '→ 通知は止まりました。契約の更新の下書きと、請求の確認リストに載りました' : '→ 通知は止まりました。待機・再アサインの候補に載りました'),
      undo: () => setRows((rs) => rs.map((r) => (r.personId === c.personId ? { ...r, confirmed: false } : r))),
    });
  };
  const ask = (c: DispatchContract, to: string[]) => {
    if (to.length === 0) return;
    if (live) {
      write({ action: 'haken-ask', nn: c.personId, to }).then((ok) => { if (!ok) return; pulse(c.personId); hit();
        toast({ text: `${c.name} の意向確認を頼んだ印を付けました`, sub: `→ ${to.join('・')} への連絡はチャットで（ここからは送りません）`, undo: () => { write({ action: 'haken-ask', nn: c.personId, undo: true }); } }); });
      return;
    }
    setAsked((a) => ({ ...a, [c.personId]: true }));
    pulse(c.personId); hit();
    toast({ text: `${c.name} の意向確認を頼みました`, sub: mihon(`→ ${to.join('・')} のやることに載りました`), undo: () => setAsked((a) => ({ ...a, [c.personId]: false })) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="派遣契約" sub={live ? `派遣契約の終わりと抵触日が近い人（稼働管理情報一覧の ${hq.data?.tab} の行）。更新するか決まるまで段階で色を付けます（準委任は通知の対象外・終わりが近い人だけ参考に出す）` : '派遣契約の終わりと抵触日が近い人。更新するか決まるまで、段階ごとに知らせます（準委任は通知の対象外）・見本データ'} />
      <LiveBanner state={hq.live && !hq.data?.ok ? 'error' : hq.state} error={hq.error || hq.data?.error} onReload={hq.reload} note="抵触日・書類・更新の意向は本物に書きます。抵触日（個人単位）が空の人は、同じ派遣先で派遣だった行のいちばん早い開始日から3年の目安（組織単位までは見ていません）。意向確認を頼むは印だけ（送りません）" />
      <MikeikenNote mk={mk} live={live} />
      {werr && <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{werr}</div>}
      <p className="flex items-start gap-1.5 text-sm text-muted"><ShieldCheck size={14} className="mt-0.5 shrink-0" />抵触日・意見聴取・雇用安定措置など法令の最終判断は社労士に確認してください。更新・終了は営業が提案して、労務が確定します。</p>

      <div className="mo-fade-up flex flex-wrap items-stretch gap-3" style={{ ['--i' as string]: 1 }}>
        <div className="flex min-w-[240px] items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <RemainRing remain={open} total={Math.max(openTotal, open)} />
          <div>
            <div className="text-sm text-muted">知らせる段階に入って、意向がまだ</div>
            <div className="num text-xl font-bold">{open}<span className="ml-0.5 text-body font-semibold text-muted">人</span></div>
            <div className="text-xs text-faint">意向が決まっていない人は全部で {undecided}人</div>
          </div>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
          <span className="mr-1 text-sm text-muted">知らせる段階</span>
          {rule.stages.map((s, i) => (
            <span key={s.level} className="flex items-center gap-2">
              {i > 0 && <span className="text-faint">→</span>}
              <span className="rounded-[10px] px-3 py-1.5 text-sm" style={{ background: LEVEL_STYLE[s.level].bg, color: LEVEL_STYLE[s.level].fg }}><b>{s.when}・{LEVEL_STYLE[s.level].label}</b><span className="ml-1.5">{s.to.join('・')}</span></span>
            </span>
          ))}
          <Link href="/roumu/alerts" className="ml-auto text-sm font-semibold" style={{ color: 'var(--ad)' }}>宛先を変える</Link>
        </div>
      </div>

      {open === 0 && (
        <div className="mo-scale-in flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-body"><Check size={18} className="text-ok" />知らせる段階の人は、全員の意向が決まりました。次に近づいた人がまた上に出ます。</div>
      )}

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1480px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">契約の形</th><th className="px-2 py-2.5 font-semibold">派遣先</th><th className="px-2 py-2.5 font-semibold">契約の終わり</th><th className="px-2 py-2.5 font-semibold">抵触日（個人単位）</th><th className="px-2 py-2.5 font-semibold">事業所単位の抵触日</th><th className="px-2 py-2.5 font-semibold">意見聴取の期限</th><th className="px-2 py-2.5 font-semibold">書類</th><th className="px-2 py-2.5 font-semibold">段階</th><th className="px-2 py-2.5 font-semibold">更新の意向</th><th className="px-4 py-2.5" />
            </tr></thead>
            <tbody>
              {sorted.map((c, i) => {
                const lv = contractLevel(c);
                const s = LEVEL_STYLE[lv];
                const quasi = c.kind === '準委任';
                const conflictFirst = !quasi && c.conflictDays <= c.daysLeft + 31; // 次の更新で抵触日をまたぐ
                const iken = ikenOf(c);
                const proposed = (c.intent === '更新' || c.intent === '終了') && !c.confirmed;
                const naCell = <td className="px-2 py-2.5 text-sm text-faint" title={QUASI_NOTE}>—（対象外）</td>;
                return (
                  <tr key={c.personId} className={`mo-fade-in border-t border-line-soft align-top ${flash === c.personId ? 'mo-flash' : 'row'} ${lv === 'ok' && first[c.personId] !== 'ok' ? 'opacity-60' : ''}`} style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5"><div className="font-semibold"><PersonName name={c.name} className="underline-offset-2 hover:underline" /></div><div className="text-xs text-faint">営業 {c.sales}</div></td>
                    <td className="px-2 py-2.5">
                      <span className="chip" title={quasi ? QUASI_NOTE : '労働者派遣契約'} style={quasi ? { background: 'var(--tone-purple-bg)', color: 'var(--tone-purple-fg)' } : { background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}>{c.kind}</span>
                      {quasi && (
                        <button onClick={() => setOpenNote(openNote === c.personId ? null : c.personId)} aria-expanded={openNote === c.personId} title={QUASI_NOTE} className="ml-1 inline-flex align-middle text-faint hover:text-ink" aria-label="準委任の説明"><Info size={13} /></button>
                      )}
                      {quasi && openNote === c.personId && <div className="mo-fade-in mt-1 max-w-[180px] text-xs text-muted">{QUASI_NOTE}</div>}
                    </td>
                    <td className="px-2 py-2.5">{c.site}<div className="text-xs text-faint">{c.start}〜</div></td>
                    <td className="num px-2 py-2.5">{c.end}<span className="ml-1 text-xs" style={{ color: c.daysLeft <= 45 ? 'var(--color-bad)' : 'var(--color-faint)' }}>あと{c.daysLeft}日</span></td>
                    {quasi ? naCell : (
                      <td className="num px-2 py-2.5">
                        {live && <DateEdit value={(c as { raw?: IkeHakenRow }).raw?.conflictGuess ? '' : (c as { raw?: IkeHakenRow }).raw?.conflictOn || ''} label={`${c.name} の抵触日（個人単位）`} canEdit={canConfirm} onSave={(v) => write({ action: 'haken-save', nn: c.personId, name: c.name, conflictOn: v })} />}
                        {c.conflictOn ? <>{c.conflictOn}<span className="ml-1 text-xs" style={{ color: conflictFirst ? 'var(--color-bad)' : 'var(--color-faint)' }}>あと{c.conflictDays}日</span></> : <span className="text-faint">—</span>}
                        {live && (c as { raw?: IkeHakenRow }).raw?.conflictGuess && c.conflictOn && <div className="text-xs text-faint">目安（派遣の始まり {c.start}＋3年）</div>}
                        {conflictFirst && <div className="mo-shake mt-1 flex items-start gap-1 text-xs text-bad"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-bad" />次の更新で抵触日を超えます。同じ組織では続けられません</div>}
                      </td>
                    )}
                    {quasi ? naCell : (
                      <td className="num px-2 py-2.5">
                        {live && <DateEdit value={(c as { raw?: IkeHakenRow }).raw?.officeConflictOn || ''} label={`${c.name} の事業所単位の抵触日`} canEdit={canConfirm} onSave={(v) => write({ action: 'haken-save', nn: c.personId, name: c.name, officeConflictOn: v })} />}
                        {c.officeConflictOn ? <>{c.officeConflictOn}<span className="ml-1 text-xs" style={{ color: c.officeConflictDays <= c.daysLeft + 31 ? 'var(--color-bad)' : 'var(--color-faint)' }}>あと{c.officeConflictDays}日</span></> : <span className="text-faint">{live ? '派遣先の通知を入れる' : '—'}</span>}</td>
                    )}
                    {quasi || !iken ? naCell : (
                      <td className="num px-2 py-2.5" title="派遣先が延ばすなら、この日までに過半数労働組合などの意見を聞く">
                        {iken.on}<span className="ml-1 text-xs" style={{ color: iken.days <= 30 ? 'var(--color-bad)' : 'var(--color-faint)' }}>{iken.days >= 0 ? `あと${iken.days}日` : '期限切れ'}</span>
                      </td>
                    )}
                    {quasi || !c.docs ? naCell : (
                      <td className="px-2 py-2.5">
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {DOC_LABELS.map((d) => {
                            const on = c.docs![d.key];
                            const chip = on ? <><Check size={11} />{d.label}</> : <>{d.label} 無し</>;
                            const style = on ? { background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' } : { background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' };
                            if (!live) return <span key={d.key} className="chip" style={style}>{chip}</span>;
                            return <button key={d.key} className="chip disabled:cursor-not-allowed" style={style} disabled={!canConfirm} title={canConfirm ? (on ? 'そろっていない に戻す' : 'そろった にする') : '書類の印は労務の権限（直す）の人だけ'}
                              onClick={() => write({ action: 'haken-save', nn: c.personId, name: c.name, docs: { ...c.docs!, [d.key]: !on } }).then((ok) => { if (ok) { hit(); toast({ text: `${c.name} の${d.label}を「${on ? '無し' : 'そろった'}」にしました`, sub: '→ 今の社内システムに残しました' }); } })}>{chip}</button>;
                          })}
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-2.5"><span className="chip" style={{ background: s.bg, color: s.fg }}>{quasi ? '対象外' : lv !== 'ok' ? s.label : decided(c) ? '決まり' : 'まだ先'}</span></td>
                    <td className="px-2 py-2.5">
                      <select aria-label={`${c.name} の更新の意向`} value={c.intent} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} onChange={(e) => setIntent(c, e.target.value as Intent)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-sm disabled:opacity-50">
                        {INTENTS.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                      {proposed && (
                        <div className="mt-1 flex flex-col items-start gap-1">
                          <span className="chip" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>提案中（労務の確定待ち）</span>
                          <button onClick={() => confirmIntent(c)} disabled={!canConfirm} title={canConfirm ? `「${c.intent}」で確定する` : '確定は労務の権限（直す）が要ります。営業は提案まで'}
                            className="inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><Check size={13} />確定する</button>
                          {!canConfirm && <span className="text-xs text-faint">確定は労務の権限の人だけ</span>}
                        </div>
                      )}
                      {c.intent !== '未確認' && !proposed && decided(c) && <div className="mt-1 text-xs text-ok">確定ずみ</div>}
                      {c.asked && <div className="mt-1 text-xs text-faint">{c.asked}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {quasi ? <span className="text-sm text-faint">準委任は知らせません</span> : lv === 'ok' ? <span className="text-sm text-faint">{decided(c) ? '通知は止まりました' : `${days[0]}日前から知らせます`}</span>
                        : asked[c.personId] ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-ok"><Check size={14} />今日 頼みました</span>
                        : <><button onClick={() => ask(c, STEP_TO(lv))} disabled={!canEdit || STEP_TO(lv).length === 0} title={!canEdit ? needText('edit') : STEP_TO(lv).length === 0 ? 'アラート設定で知らせを止めています' : undefined} className="inline-flex whitespace-nowrap min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><Bell size={14} />意向確認を頼む</button><div className="mt-1 text-xs text-faint">{STEP_TO(lv).join('・') || '知らせを止めています'}</div></>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-faint">最終判断は社労士に確認してください（抵触日・意見聴取・契約終了の扱い（雇用安定措置など）・書類の要否）。準委任の人に現場が直接指示を出すと偽装請負になるおそれがあります。</p>
    </main>
  );
}

// 抵触日の手入れ（内勤の入力）。空にすると目安（個人単位）／空欄（事業所単位）に戻る
function DateEdit({ value, label, canEdit, onSave }: { value: string; label: string; canEdit: boolean; onSave: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(value), [value]);
  return <input type="date" aria-label={label} value={v} disabled={!canEdit || busy} title={canEdit ? '派遣先の通知・社労士の確認に合わせて入れる（空にすると目安に戻す）' : '抵触日は労務の権限（直す）の人だけ'}
    onChange={(e) => setV(e.target.value)} onBlur={() => { if (v === value) return; setBusy(true); onSave(v).finally(() => setBusy(false)); }}
    className="mb-1 block min-h-7 rounded-lg border border-field bg-surface px-1.5 text-xs disabled:opacity-50" />;
}
