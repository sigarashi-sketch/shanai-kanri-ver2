'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, CircleAlert, CreditCard, Star, Smartphone } from 'lucide-react';
import { KEIHI_REJECT, type Check as Chk, type Claim, type ClaimLine } from '@/lib/types/keiri';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { KeihiMonthlyTab, KeihiRingiTab } from './tabs';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { toClaims, type KeihiAdminList } from '@/lib/live/keihi';
import { PersonName } from '@/components/Person';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { FLAG_NAME, flagsForClaim, type FlagKind, type KeihiFlag, type KeihiFlagsResp } from '@/lib/live/keihi-flags';

// 交通費・経費（経理管理）。
//   ・経理の確認：申請ごとに 打刻・ICカードの履歴・定期の期間・現場の予約 を先に照らす → 問題なしはまとめて承認
//   本物（ログイン中・10-26）：本人の申請は今の公式LINE「経費申請」（/m/seisan・LINE で本人確認）が本物。内勤のログインでは本人として申請できないので、
//     ここは本物の画面の入口と決まりを出す。★よく使う経路は今のシステムに足した（0372）。
//     ICカードの利用履歴から選ぶのは作れない（LINE の中のウェブ画面からは交通系 IC の履歴を読めない・モバイルSuica の履歴を外から取る口も無い）
//   本物（ログイン中）：今の GET /api/keihi?action=adminList&status=申請中 を読む。承認・差し戻しは /api/live/keihi → 今の POST decide（本人の LINE に届く・確認の窓つき）
//   勤怠の印（10-25 shoya「打刻漏れ シフト表未提出 欠勤報告などあれば示して欲しい」）：申請の人 × 申請の月に
//     打刻漏れ・シフト表の未提出/下書き・欠勤の報告・勤務表とのずれ があれば印で出す。押すと日付が開く
//     本物は /api/live/keihi-flags（読むだけの GET をまとめる・freee は呼ばない）
//   見本データは出さない（10-26）：読み込み中は「読み込み中…」、読めなければ上の LiveBanner のエラー
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;
const toneOf = (c: Chk[]) => (c.some((x) => x.tone === 'bad') ? 'bad' : c.some((x) => x.tone === 'warn') ? 'warn' : 'ok');
const CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  bad: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)', label: '要確認' },
  warn: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)', label: '気になる点' },
  ok: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)', label: '問題なし' },
};
const ORDER = ['bad', 'warn', 'ok'];

function CheckLine({ c }: { c: Chk }) {
  const Icon = c.tone === 'ok' ? Check : c.tone === 'warn' ? CircleAlert : AlertTriangle;
  return <li className="flex items-start gap-1.5 text-sm"><Icon size={14} className={`mt-0.5 shrink-0 ${c.tone === 'ok' ? 'text-ok' : c.tone === 'warn' ? 'text-warn' : 'text-bad'}`} /><span className={c.tone === 'bad' ? 'font-semibold text-bad' : ''}>{c.text}</span></li>;
}

export default function KeihiPage() {
  const [tab, setTab] = useState<Tab>('check');
  // 処理した状態はページで持つ（タブを行き来しても消えない）
  const [done, setDone] = useState<Record<string, Done>>({});
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab'); if (t === 'apply' || t === 'monthly' || t === 'ringi') setTab(t); }, []);
  const { data, state, error, reload, live } = useIke<KeihiAdminList>(`keihi?action=adminList&status=${encodeURIComponent('申請中')}`);
  // 本物は未経験の人だけ（今のプロパーリストに入っている人）。氏名がまだ決まらない申請は確かめられないので出さない
  const mk = useMikeiken();
  const kept = useMemo(() => (live && data ? mk.keep(data.claims || [], 'linked_name') : []), [live, data, mk]);
  const list = live ? toClaims(data ? { ...data, claims: kept } : null) : [];
  // 勤怠の印：申請に出てくる月だけ読む（名前は送らない）
  const yms = useMemo(() => [...new Set(kept.map((c) => c.ym))].sort().reverse().slice(0, 3).join(','), [kept]);
  const fl = useLiveRoute<KeihiFlagsResp>(live && yms ? `/api/live/keihi-flags?ym=${yms}` : null);
  const flags: FlagInfo = useMemo(() => {
    if (!live) return { by: {}, ready: true, unread: [] };
    if (!fl.live || !fl.data) return { by: {}, ready: !yms, unread: [], error: fl.state === 'error' ? fl.error : '' };
    const by = Object.fromEntries(kept.map((c) => [c.id, flagsForClaim(fl.data, c)]));
    const unread = (Object.keys(fl.data.read || {}) as FlagKind[]).filter((k) => !fl.data!.read[k]);
    return { by, ready: true, unread };
  }, [live, fl.live, fl.data, fl.state, fl.error, kept, yms]);
  const go = (t: Tab) => { setTab(t); window.history.replaceState(null, '', t === 'check' ? window.location.pathname : `?tab=${t}`); };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="交通費・経費" sub={`通勤（日ごと）・定期・バス・出張面談。申請は本人が LINE から`} />
      <LiveBanner state={state} error={error} onReload={reload} note="今の社内システムの「申請中」をそのまま出しています。承認・差し戻しは本物に書き、本人の LINE に結果が届きます（押すと確認の窓が出ます）" />
      <MikeikenNote mk={mk} live={live} />
      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 1 }}>
        {([['check', '経理の確認'], ['monthly', '月次（給与に載せる額）'], ['ringi', '稟議'], ['apply', '本人の申請画面']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className="tab">{l}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis">
        {tab === 'monthly' ? <KeihiMonthlyTab live={live} mk={mk} /> : tab === 'ringi' ? <KeihiRingiTab live={live} mk={mk} /> : tab === 'check' ? (live ? <CheckTab claims={list} done={done} setDone={setDone} live={live} flags={flags} reload={reload} /> : state === 'loading' ? <div className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-sm text-muted">読み込み中…</div> : null) : <LiveApply />}
      </div>
    </main>
  );
}

// ---------------- 経理の確認 ----------------
type Done = { result: '承認' | '差し戻し'; reason?: string };
type Tab = 'check' | 'monthly' | 'ringi' | 'apply';
type FlagInfo = { by: Record<string, KeihiFlag[]>; ready: boolean; unread: FlagKind[]; error?: string };
const FLAG_TONE: Record<KeihiFlag['tone'], { bg: string; fg: string }> = {
  bad: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
  warn: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)' },
  caution: { bg: 'var(--tone-caution-bg)', fg: 'var(--tone-caution-fg)' },
  info: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
};

// 勤怠の印：押すとその印の日付が開く（もう一度押すと閉じる）
function FlagChips({ flags, ready }: { flags: KeihiFlag[]; ready: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!ready) return <div className="mb-1.5 text-xs text-faint">勤怠を照らしています…</div>;
  if (!flags.length) return <div className="mb-1.5 inline-flex items-center gap-1 text-xs text-faint"><Check size={12} className="text-ok" />勤怠の印なし（打刻・シフト・欠勤とも静か）</div>;
  const f = open != null ? flags[open] : null;
  return (
    <div className="mb-2">
      <div className="flex flex-wrap gap-1">
        {flags.map((x, i) => (
          <button key={`${x.kind}-${i}`} type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} title={`${FLAG_NAME[x.kind]}：押すと日付が開きます`}
            className="chip inline-flex items-center gap-1 font-semibold" style={{ background: FLAG_TONE[x.tone].bg, color: FLAG_TONE[x.tone].fg, boxShadow: open === i ? `inset 0 0 0 1.5px ${FLAG_TONE[x.tone].fg}` : undefined }}>
            {x.tone === 'bad' ? <AlertTriangle size={11} /> : <CircleAlert size={11} />}{x.label}
          </button>
        ))}
      </div>
      {f && (
        <div className="mo-fade-in mt-1.5 rounded-lg border border-line-soft bg-soft px-2.5 py-1.5 text-xs">
          <div className="font-semibold" style={{ color: FLAG_TONE[f.tone].fg }}>{FLAG_NAME[f.kind]}</div>
          <ul className="mt-0.5 flex flex-col gap-0.5">{f.lines.map((l) => <li key={l} className="num">{l}</li>)}</ul>
          {f.note && <div className="mt-1 text-xs text-faint">{f.note}</div>}
          {f.kind === 'zure' && f.note?.includes('締め') && <Link href="/roumu/shime" className="mt-0.5 inline-block text-xs font-semibold" style={{ color: 'var(--ad)' }}>勤怠の締めで日ごとを見る</Link>}
        </div>
      )}
    </div>
  );
}

function CheckTab({ claims, done, setDone, live, flags, reload }: { claims: Claim[]; done: Record<string, Done>; setDone: React.Dispatch<React.SetStateAction<Record<string, Done>>>; live: boolean; flags: FlagInfo; reload: () => void }) {
  const permApprove = usePerms().can('keiri', 'approve');
  // 本物（10-25）：承認・差し戻しは今の POST /api/keihi?action=decide に書く。押す前に確認の窓（本人の LINE に届く）
  const canApprove = permApprove;
  const lockText = needText('approve');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const { hit, toast } = useMotivation();
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const [kind, setKind] = useState<string>('すべて');
  const [openId, setOpenId] = useState<string | null>(null);

  const pending = claims.filter((c) => !done[c.id]).sort((a, b) => ORDER.indexOf(toneOf(a.checks)) - ORDER.indexOf(toneOf(b.checks)) || a.filedAt.localeCompare(b.filedAt));
  const rows = pending.filter((c) => kind === 'すべて' || c.kind === kind);
  const okRows = rows.filter((c) => toneOf(c.checks) === 'ok');
  const kinds = ['すべて', ...Array.from(new Set(claims.map((c) => c.kind)))];
  const flagged = pending.filter((c) => (flags.by[c.id] || []).length).length;

  const settle = (cs: Claim[], d: Done) => { if (live) liveSettle(cs, d); };
  const liveSettle = (cs: Claim[], d: Done) => {
    const sum = cs.reduce((s, c) => s + c.amount, 0);
    setConfirm({
      title: d.result === '承認' ? (cs.length > 1 ? `${cs.length}件（${yen(sum)}）をまとめて承認する` : `${cs[0].person} の${cs[0].month}分（${yen(sum)}）を承認する`) : `${cs[0].person} の${cs[0].month}分を差し戻す`,
      okLabel: d.result === '承認' ? `${cs.length}件を承認する` : '差し戻す', danger: d.result === '差し戻し',
      lines: d.result === '差し戻し' ? [`理由：${d.reason}`, '本人は直して出し直せます'] : ['承認すると給与の振込みの対象（月次）に載ります', ...(cs.some((c) => c.kind === '定期') ? ['定期つきは、月が終わっていれば今のシステムが打刻を確かめ、漏れがあれば承認せず差し戻します'] : [])],
      sends: `${cs.length > 1 ? `${cs.length}人` : '本人'}の LINE に結果が届きます`,
      run: async () => {
        let n = 0; const errs: string[] = [];
        for (const c of cs) {
          try { await postLive('/api/live/keihi', { action: 'decide', id: c.id, decision: d.result === '承認' ? 'approve' : 'return', comment: d.reason || '' }); n++; }
          catch (e) { errs.push(`${c.person}：${(e as Error).message}`); }
        }
        if (n) { hit(n); toast({ text: d.result === '承認' ? `${n}件を承認しました` : `${cs[0].person} の申請を差し戻しました`, sub: '→ 本人の LINE に届けました' }); reload(); }
        if (errs.length) { reload(); throw new Error(`${n ? `${n}件は済みました。` : ''}できなかったもの：${errs.join('／')}`); }
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <RemainRing remain={pending.length} total={claims.length} />
        <div className="text-body"><b>承認待ち {pending.length}件</b><span className="ml-2 num text-muted">{yen(pending.reduce((s, c) => s + c.amount, 0))}</span>
          <div className="text-sm text-muted">勤怠の打刻・ICカードの履歴・定期の期間・現場の予約を先に照らしています。{!permApprove && <span className="text-bad"> {needText('approve')}</span>}</div>
          {flags.ready && flagged > 0 && <div className="text-sm" style={{ color: 'var(--tone-warn-fg)' }}>打刻漏れ・シフト・欠勤などの勤怠の印がついた申請 {flagged}件（印を押すと日付が出ます）</div>}
          {flags.unread.length > 0 && <div className="text-xs text-faint">{flags.unread.map((k) => FLAG_NAME[k]).join('・')} は読めなかったので確かめられていません（印が無い＝問題なし、ではありません）</div>}
          {flags.error && <div className="text-xs text-faint">勤怠の印を読めませんでした（{flags.error}）</div>}
        </div>
        <Link href="/keiri/check" className="ml-auto text-sm font-semibold" style={{ color: 'var(--ad)' }}>月ごとの交通費チェックへ</Link>
      </div>

      {pending.length === 0 ? (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-md font-bold">交通費・経費の申請はぜんぶ片づきました</div>
          <div className="mt-1 text-sm text-muted">定期は月末の見回りで、その月の打刻をもう一度確かめます。</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft px-4 py-2.5">
            {kinds.map((k) => {
              const n = k === 'すべて' ? pending.length : pending.filter((c) => c.kind === k).length;
              return <button key={k} onClick={() => setKind(k)} className={`min-h-8 rounded-full border px-3 text-sm ${kind === k ? 'font-semibold' : 'text-muted'}`} style={kind === k ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{k} {n}</button>;
            })}
            <button onClick={() => okRows.length && settle(okRows, { result: '承認' })} disabled={!canApprove || okRows.length === 0} title={!canApprove ? lockText : undefined} className="btn-primary ml-auto btn-sm">問題なし {okRows.length}件をまとめて承認</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-body">
              <thead><tr className="th-row text-left">
                <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">種類・中身</th><th className="px-2 py-2.5 text-right font-semibold">金額</th><th className="px-2 py-2.5 font-semibold">先に確かめたこと</th><th className="px-4 py-2.5 font-semibold">承認</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">「{kind}」の承認待ちはありません。ほかの種類を選んでください。</td></tr>}
                {rows.map((c, i) => {
                  const t = toneOf(c.checks);
                  const need = t === 'bad' && !ok[c.id];
                  return (
                    <Fragment key={c.id}>
                    <tr className={`mo-fade-in border-t border-line-soft align-top row`} style={{ ['--i' as string]: i }}>
                      <td className="px-4 py-2.5">{c.personId ? <PersonName name={c.person} className="font-semibold hover:underline underline-offset-2" /> : <PersonName name={c.person} className="font-semibold underline-offset-2 hover:underline" />}<div className="text-xs text-faint">{c.site}</div></td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5"><span className="chip" style={{ background: CHIP[t].bg, color: CHIP[t].fg }}>{c.kind}</span><span className="text-xs text-faint">{c.month}・{c.source}</span></div>
                        <div className="mt-1 text-sm text-muted">{c.detail}</div>
                        {!!c.lines?.length && <button type="button" onClick={() => setOpenId(openId === c.id ? null : c.id)} aria-expanded={openId === c.id} className="mt-1 text-sm font-semibold" style={{ color: 'var(--ad)' }}>{openId === c.id ? '中身を閉じる' : `中身を見る（${c.lines.length}件）`}</button>}
                      </td>
                      <td className="num px-2 py-2.5 text-right font-semibold">{yen(c.amount)}</td>
                      <td className="px-2 py-2.5"><FlagChips flags={flags.by[c.id] || []} ready={flags.ready} /><ul className="flex flex-col gap-1">{c.checks.map((x) => <CheckLine key={x.text} c={x} />)}</ul>
                        {t === 'bad' && <label className="mt-1.5 flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" checked={!!ok[c.id]} onChange={(e) => setOk((o) => ({ ...o, [c.id]: e.target.checked }))} />確かめたうえで承認する</label>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1.5">
                          <button onClick={() => settle([c], { result: '承認' })} disabled={!canApprove || need} title={!canApprove ? lockText : need ? '要確認の点を確かめてから' : undefined} className="btn-primary btn-sm">承認</button>
                          <select aria-label={`${c.person} を差し戻す理由`} value="" disabled={!canApprove} title={!canApprove ? lockText : undefined} onChange={(e) => { const v = e.target.value; if (v) settle([c], { result: '差し戻し', reason: v }); }} className="min-h-8 max-w-[190px] rounded-lg border border-field bg-surface px-2 text-sm text-muted disabled:opacity-50">
                            <option value="">差し戻す理由…</option>
                            {KEIHI_REJECT.map((x) => <option key={x}>{x}</option>)}
                          </select>
                        </div>
                      </td>
                    </tr>
                    {openId === c.id && c.lines && (
                      <tr className="border-t border-line-soft"><td colSpan={5} className="bg-soft px-4 py-2.5"><ClaimLines lines={c.lines} /></td></tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
      <p className="text-xs text-faint">定期は月の途中でも承認できます。月が終わったら、その月の打刻を毎朝の見回りでもう一度確かめ、漏れがあれば差し戻して本人に知らせます（今のシステムと同じ）。</p>
    </div>
  );
}

// 申請の明細（10-26 shoya「これ中身見れないの」）。今の adminList が返す明細をそのまま並べる
function ClaimLines({ lines }: { lines: ClaimLine[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead><tr className="text-left text-xs text-muted"><th className="py-1 pr-2 font-semibold">日付</th><th className="px-2 py-1 font-semibold">種類</th><th className="px-2 py-1 font-semibold">区間・支払先</th><th className="px-2 py-1 text-right font-semibold">金額</th><th className="px-2 py-1 font-semibold">運賃</th><th className="px-2 py-1 font-semibold">目的など</th><th className="py-1 pl-2 font-semibold">領収書</th></tr></thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id} className="border-t border-line-soft">
            <td className="num whitespace-nowrap py-1 pr-2">{l.date || '—'}</td>
            <td className="whitespace-nowrap px-2 py-1">{l.kind}</td>
            <td className="px-2 py-1">{l.what}</td>
            <td className="num whitespace-nowrap px-2 py-1 text-right">{yen(l.amount)}</td>
            <td className={`whitespace-nowrap px-2 py-1 ${l.src === '手入力' ? 'font-semibold text-warn' : 'text-muted'}`}>{l.src || '—'}</td>
            <td className="px-2 py-1 text-muted">{l.note || '—'}</td>
            <td className="whitespace-nowrap py-1 pl-2">{l.receiptUrl ? <a href={l.receiptUrl} target="_blank" rel="noopener noreferrer" className="font-semibold" style={{ color: 'var(--ad)' }}>開く</a> : <span className="text-faint">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------- 本人の申請画面（本物＝今の公式LINE「経費申請」の入口と決まり） ----------------
const SEISAN_LIFF = 'https://liff.line.me/2010698759-3Bw2R3c7?b=seisan';
function LiveApply() {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex w-full max-w-[460px] flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-4">
        <div className="flex items-center gap-2 text-md font-bold"><Smartphone size={18} />本人の申請は 公式LINE の「経費申請」から</div>
        <p className="text-sm text-muted">本人が LINE のメニューから開き、LINE で本人を確かめてから申請します。内勤のログインでは本人として申請できないので、ここからは開くだけです（自分の交通費を申請するときに使えます）。</p>
        <a href={SEISAN_LIFF} target="_blank" rel="noopener noreferrer" className="btn-primary min-h-11 w-full justify-center">経費申請を開く（LINE）</a>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
          <li>電車は駅を2つ（経由駅も）入れると、駅すぱあとで運賃と経路が出る（運賃を手で打たない）</li>
          <li><Star size={11} className="mr-0.5 inline text-warn" fill="currentColor" />よく使う区間は「☆ この区間をよく使う経路にする」で残し、次から★を押すだけで区間が入る（1人10件・名前は区間そのもの）。過去に申請した区間も「前回」に並ぶ</li>
          <li>日付はカレンダーで何日でもまとめて選べる。通勤の日に freee の出勤の打刻が無いと申請できない（打刻の漏れがある日を出す）</li>
          <li>バスは路線名と1日あたりの金額を本人が入れる。定期は期間と領収書が必須で、月が終わったら打刻を確かめる</li>
          <li>承認・差し戻しの結果は本人の LINE に届く（承認・差し戻しは「経理の確認」から）</li>
        </ul>
      </div>
      <div className="flex min-w-[260px] flex-1 flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <b className="inline-flex items-center gap-1.5 text-ink"><CreditCard size={15} />ICカードの利用履歴から選ぶ</b>
        <p>今の LINE の画面（ウェブ）からは、交通系 IC カードの利用履歴を読めないので作れていません。スマホのブラウザがかざして読めるのは別の形式のカードだけで、モバイルSuica の履歴を外から取り込む口もありません。</p>
        <p>そのかわり、駅を入れるだけで運賃が出る・★よく使う経路・前回の区間で、運賃を手で打たずに済むようにしています。</p>
      </div>
    </div>
  );
}
