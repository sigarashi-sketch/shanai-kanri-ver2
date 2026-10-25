'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CornerUpLeft, FileCheck2, Paperclip } from 'lucide-react';
import { APPS, MASTER, MONTHLY, PAY_MONTH, S_REJECT, amountOf, yen, type SState, type ShikakuApp } from '@/lib/shikaku-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { CountUp, RemainRing, useMotivation } from '@/components/Motivation';
import { LIVE_WRITE_BLOCKED, LiveBanner, NotInLegacy, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { shikakuFromIke, type IkeShikakuList, type LiveMonthly, type LiveShikakuApp } from '@/lib/live/shikaku';
import { PersonName } from '@/components/Person';
import { ShikakuLiveActions } from '@/components/jinji/ShikakuLiveActions';

// 資格手当（人事管理）＝本人の申請を 合格証の確認 → 承認 → 給与に反映 の順に片づける。
//   ・手当の額は資格から決まる（本人は額を入れない）。「現場経験で加算」は承認のときに選ぶだけ
//   ・確認・反映は「直す」、承認は「承認」の権限。差し戻しの理由は選ぶだけ
//   ・「毎月の手当」タブで、いま手当が付いている人と 1か月の合計を見る（?tab=monthly）
type Tab = 'apps' | 'monthly';
const STAGES: SState[] = ['確認待ち', '承認待ち', '反映待ち'];
const defReason = (a: ShikakuApp) => (a.files.includes('合格証') ? S_REJECT[0] : '合格証が付いていない');
const STAGE_TONE: Record<SState, string> = { 確認待ち: 'caution', 承認待ち: 'info', 反映待ち: 'purple', 反映ずみ: 'ok', 差し戻し: 'mute' };

export default function ShikakuPage() {
  const { can } = usePerms();
  const canEdit = can('jinji', 'edit'), canApprove = can('jinji', 'approve');
  const { hit, toast } = useMotivation();
  const [tab, setTab] = useState<Tab>('apps');
  // 並びは開いたときの「段階 → 申請日」で固定（処理しても行が跳ねない）
  const [sApps, setApps] = useState<ShikakuApp[]>(() => [...APPS].sort((a, b) => STAGES.indexOf(a.state) - STAGES.indexOf(b.state) || a.filedAt.localeCompare(b.filedAt)));
  const [sMonthly, setMonthly] = useState(MONTHLY);
  // 本物：今の社内システムの資格手当の申請（未確認＝確認待ち・承認＝毎月の手当）。本物のときは確認・差し戻し・承認・反映を止める
  const ike = useIke<IkeShikakuList>('shikaku-apply?action=list');
  const live = ike.live;
  const mk = useMikeiken();   // 本物は未経験の人だけ（今のプロパーリストに入っている人）
  const L = useMemo(() => shikakuFromIke(ike.data ? { ...ike.data, rows: mk.keep(ike.data.rows || [], 'name') } : null), [ike.data, mk]);
  const apps: ShikakuApp[] = live ? L.apps : sApps;
  const monthly = live ? L.monthly : sMonthly;
  const amt = (a: ShikakuApp) => (a as LiveShikakuApp).amount ?? amountOf(a);
  const urlOf = (a: ShikakuApp, f: string) => (f === '合格証' ? (a as LiveShikakuApp).certUrl : (a as LiveShikakuApp).receiptUrl);
  const noW = live ? LIVE_WRITE_BLOCKED : undefined;
  const [stage, setStage] = useState<SState | 'すべて'>('すべて');
  const [reason, setReason] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'monthly') setTab('monthly'); }, []);

  const open = apps.filter((a) => STAGES.includes(a.state));
  const rows = open.filter((a) => stage === 'すべて' || a.state === stage);
  const total = monthly.reduce((s, m) => s + m.amount, 0);

  const update = (a: ShikakuApp, patch: Partial<ShikakuApp>, text: string, sub: string, extra?: () => void, undoExtra?: () => void) => {
    // 変えた項目だけ、この申請の元の値に戻す（続けて別の申請を処理しても巻き込まない）
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, a[k as keyof ShikakuApp]])) as Partial<ShikakuApp>;
    setApps((xs) => xs.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
    extra?.();
    setFlash(a.id); setTimeout(() => setFlash(null), 1300); hit();
    toast({ text, sub, undo: () => { setApps((xs) => xs.map((x) => (x.id === a.id ? { ...x, ...prev } : x))); undoExtra?.(); } });
  };
  const confirm = (a: ShikakuApp) => update(a, { state: '承認待ち' }, `${a.name} の合格証を確かめました`, '→ 承認する人のやることに載りました');
  const reject = (a: ShikakuApp) => { const r = reason[a.id] ?? defReason(a); update(a, { state: '差し戻し', reason: r }, `${a.name} の申請を差し戻しました`, `→ 本人に「${r}」で戻しました（インフォメーション）`); };
  const approve = (a: ShikakuApp) => update(a, { state: '反映待ち' }, `${a.name} の${a.cert}を承認しました（月 ${yen(amountOf(a))}）`, `→ ${PAY_MONTH}の給与に足す一覧に載りました`);
  const reflect = (a: ShikakuApp) => {
    const label = a.plus && MASTER[a.cert]?.plus ? `${a.cert}（${MASTER[a.cert].plus!.label}）` : a.cert;
    update(a, { state: '反映ずみ' }, `${a.name} の手当を給与に反映しました`, `→ freee の${PAY_MONTH}の給与に「資格手当 ${yen(amountOf(a))}」を足しました・毎月の手当に載りました`,
      () => setMonthly((m) => [...m, { personId: a.personId, name: a.name, cert: label, amount: amountOf(a), since: '2026/11' }]),
      () => setMonthly((m) => m.filter((x) => !(x.personId === a.personId && x.cert === label && x.since === '2026/11'))));
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="資格手当" sub={`本人の申請（LINE の資格手当申請から）を、合格証の確認 → 承認 → 給与に反映 の順に片づけます${live ? '' : '・見本データ'}`} />
      <LiveBanner state={ike.state} error={ike.error} onReload={ike.reload} note="今の社内システムの段階は「未確認・承認・却下」だけです。未確認を確認待ちに、承認ずみを毎月の手当に出しています。段階・確定手当額はプルダウン／欄から選ぶとすぐ保存されます" />
      <MikeikenNote mk={mk} live={ike.live} />
      {live && <NotInLegacy what="「承認待ち」「給与に反映」の段と現場経験の加算" />}
      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 1 }}>
        {([['apps', `申請 ${open.length}`], ['monthly', '毎月の手当']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); window.history.replaceState(null, '', k === 'monthly' ? '?tab=monthly' : window.location.pathname); }} className="tab">{l}</button>
        ))}
      </div>

      <div key={tab} className="mo-axis flex flex-col gap-3">
        {tab === 'apps' ? (<>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <RemainRing remain={open.length} total={apps.length} />
            <div className="text-body"><b>片づける申請 {open.length}件</b>
              <div className="text-sm text-muted">確認・反映は「直す」、承認は「承認」の権限で押せます。{!canApprove && <span className="text-bad"> 承認には{needText('approve')}</span>}</div>
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {(['すべて', ...STAGES] as const).map((s) => {
                const n = s === 'すべて' ? open.length : open.filter((a) => a.state === s).length;
                return <button key={s} onClick={() => setStage(s)} className={`min-h-8 rounded-full border px-3 text-sm ${stage === s ? 'font-semibold' : 'text-muted'}`} style={stage === s ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{s} {n}</button>;
              })}
            </div>
          </div>

          {open.length === 0 ? (
            <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
              <Check className="mx-auto text-ok" size={26} />
              <div className="mt-2 text-md font-bold">資格手当の申請はぜんぶ片づきました</div>
              <div className="mt-1 text-sm text-muted">合格おめでとうの一言は、担当から本人に届けてください。</div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-body">
                  <thead><tr className="th-row text-left">
                    <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">資格・合格日</th><th className="px-2 py-2.5 font-semibold">付いている書類</th><th className="px-2 py-2.5 text-right font-semibold">月の手当</th><th className="px-2 py-2.5 font-semibold">段階</th><th className="px-4 py-2.5 font-semibold">つぎにやること</th>
                  </tr></thead>
                  <tbody>
                    {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted">「{stage}」の申請はありません。</td></tr>}
                    {rows.map((a, i) => {
                      const m = MASTER[a.cert];
                      const noCert = !a.files.includes('合格証');
                      const t = STAGE_TONE[a.state];
                      return (
                        <tr key={a.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === a.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                          <td className="px-4 py-2.5">{a.personId ? <PersonName name={a.name} className="font-semibold hover:underline underline-offset-2" /> : <PersonName name={a.name} className="font-semibold underline-offset-2 hover:underline" />}<div className="text-xs text-faint">申請 {a.filedAt}{a.years >= 0 && `・現場経験 ${a.years}年`}</div></td>
                          <td className="px-2 py-2.5">{a.cert}<div className="num text-xs text-faint">{a.passedOn} 合格</div></td>
                          <td className="px-2 py-2.5">
                            <div className="flex flex-wrap gap-1">{a.files.map((f) => { const u = urlOf(a, f); return u ? <a key={f} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted underline"><Paperclip size={12} />{f}</a> : <span key={f} className="inline-flex items-center gap-1 text-sm text-muted"><Paperclip size={12} />{f}</span>; })}</div>
                            {noCert && <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-bad"><AlertTriangle size={12} />合格証が付いていません</div>}
                          </td>
                          <td className="num whitespace-nowrap px-2 py-2.5 text-right font-semibold">{yen(amt(a))}{(a as LiveShikakuApp).masterUnknown && <div className="text-xs font-normal text-warn">手当一覧に無い資格（要確認）</div>}
                            {m?.plus && a.state === '承認待ち' && (
                              <select aria-label={`${a.name} の現場経験の加算`} value={a.plus ? 'on' : 'off'} disabled={live || !canApprove} onChange={(e) => setApps((xs) => xs.map((x) => (x.id === a.id ? { ...x, plus: e.target.value === 'on' } : x)))} className="mt-1 block min-h-7 w-full rounded-md border border-field bg-surface px-1 text-xs font-normal disabled:opacity-50">
                                <option value="off">加算なし</option>
                                <option value="on">＋{yen(m.plus.amount)}（{m.plus.label}）</option>
                              </select>
                            )}
                          </td>
                          <td className="px-2 py-2.5"><span className="chip" style={{ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` }}>{a.state}</span></td>
                          <td className="px-4 py-2.5">
                            {live && (a as LiveShikakuApp).ike && <ShikakuLiveActions row={(a as LiveShikakuApp).ike!} onDone={ike.reload} />}
                            {!live && a.state === '確認待ち' && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button onClick={() => confirm(a)} disabled={live || !canEdit || noCert} title={noW ?? (!canEdit ? needText('edit') : noCert ? '合格証が無いので確かめられません' : undefined)} className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-sm font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><FileCheck2 size={14} />合格証を確かめた</button>
                                <select aria-label="差し戻しの理由" value={reason[a.id] ?? defReason(a)} disabled={live || !canEdit} title={noW} onChange={(e) => setReason((r) => ({ ...r, [a.id]: e.target.value }))} className="min-h-8 rounded-lg border border-field bg-surface px-1.5 text-sm disabled:opacity-50">
                                  {S_REJECT.map((r) => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <button onClick={() => reject(a)} disabled={live || !canEdit} title={noW ?? (!canEdit ? needText('edit') : undefined)} className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-sm text-muted disabled:opacity-40"><CornerUpLeft size={14} />差し戻す</button>
                              </div>
                            )}
                            {!live && a.state === '承認待ち' && <button onClick={() => approve(a)} disabled={live || !canApprove} title={noW ?? (!canApprove ? needText('approve') : undefined)} className="btn-primary btn-sm"><Check size={14} />承認する</button>}
                            {!live && a.state === '反映待ち' && <button onClick={() => reflect(a)} disabled={live || !canEdit} title={noW ?? (!canEdit ? needText('edit') : undefined)} className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-sm font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>{PAY_MONTH}の給与に反映</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-baseline gap-3 border-b border-line-soft px-4 py-3">
              <span className="text-sm text-muted">{live ? '承認ずみの資格手当（1か月）' : `${PAY_MONTH}の資格手当`}</span>
              <span className="text-xl font-bold">¥<CountUp key={total} to={total} /></span>
              <span className="text-sm text-muted">{monthly.length}人</span>
            </div>
            <div className="overflow-x-auto"><table className="w-full border-collapse text-body">
              <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">資格</th><th className="px-2 py-2.5 font-semibold">{live ? '申請した月' : 'いつから'}</th><th className="px-4 py-2.5 text-right font-semibold">月の手当</th>{live && <th className="px-4 py-2.5 font-semibold">段階・確定額</th>}</tr></thead>
              <tbody>
                {monthly.map((m, i) => (
                  <tr key={`${m.personId || m.name}-${m.cert}-${m.since}`} className="row mo-fade-in border-t border-line-soft" style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5">{m.personId ? <PersonName name={m.name} className="font-semibold hover:underline underline-offset-2" /> : <PersonName name={m.name} className="font-semibold underline-offset-2 hover:underline" />}</td>
                    <td className="px-2 py-2.5">{m.cert}</td>
                    <td className="num px-2 py-2.5 text-muted">{m.since}〜</td>
                    <td className="num px-4 py-2.5 text-right font-semibold">{yen(m.amount)}</td>
                    {live && <td className="px-4 py-2.5">{(m as LiveMonthly).ike && <ShikakuLiveActions row={(m as LiveMonthly).ike!} onDone={ike.reload} />}</td>}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </div>
      <p className="text-xs text-faint">資格手当は毎月の給与（割増賃金の基礎・社会保険の報酬）に入ります。扱いの最終判断は社労士・税理士に確認してください。</p>
    </main>
  );
}
