'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, CircleAlert, CreditCard, Star, Smartphone } from 'lucide-react';
import { CLAIMS, IC_ROWS, KEIHI_REJECT, ME, PUNCH_DAYS, PURPOSES, ROUTES, ROUTE_LABELS, type Claim, type IcRow, type Route } from '@/lib/keihi-sample';
import type { Check as Chk } from '@/lib/kintai-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LIVE_WRITE_BLOCKED, LiveBanner, NotInLegacy, useIke } from '@/components/Live';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { postLive } from '@/lib/live/post';
import { KeihiMonthlyTab, KeihiRingiTab } from './tabs';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { toClaims, type KeihiAdminList } from '@/lib/live/keihi';
import { PersonName } from '@/components/Person';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { FLAG_NAME, KEIHI_FLAGS_SAMPLE, flagsForClaim, type FlagKind, type KeihiFlag, type KeihiFlagsResp } from '@/lib/live/keihi-flags';

// 交通費・経費（経理管理）。
//   ・経理の確認：申請ごとに 打刻・ICカードの履歴・定期の期間・現場の予約 を先に照らす → 問題なしはまとめて承認
//   ・本人の申請画面（見本）：ICカードの利用履歴から選ぶだけ。よく使う経路は★で登録して次から一発で選ぶ
//     出勤の打刻が無い日・交通でない利用（買い物）は選べない（今のシステムと同じ「不備があると申請できない」）
//   本人の画面は LINE から開くスマホの画面の想定。ここでは内勤が中身を確かめるための見本
//   本物（ログイン中）：今の GET /api/keihi?action=adminList&status=申請中 を読むだけ。承認・差し戻しは押せない（今の keihi-admin.html から）
//   勤怠の印（10-25 shoya「打刻漏れ シフト表未提出 欠勤報告などあれば示して欲しい」）：申請の人 × 申請の月に
//     打刻漏れ・シフト表の未提出/下書き・欠勤の報告・勤務表とのずれ があれば印で出す。押すと日付が開く
//     本物は /api/live/keihi-flags（読むだけの GET をまとめる・freee は呼ばない）。見本は架空の印
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
  const [claims, setClaims] = useState<Claim[]>(CLAIMS);
  // 処理した状態はページで持つ（タブを行き来しても消えない）
  const [done, setDone] = useState<Record<string, Done>>({});
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab'); if (t === 'apply' || t === 'monthly' || t === 'ringi') setTab(t); }, []);
  const { data, state, error, reload, live } = useIke<KeihiAdminList>(`keihi?action=adminList&status=${encodeURIComponent('申請中')}`);
  // 本物は未経験の人だけ（今のプロパーリストに入っている人）。氏名がまだ決まらない申請は確かめられないので出さない
  const mk = useMikeiken();
  const kept = useMemo(() => (live && data ? mk.keep(data.claims || [], 'linked_name') : []), [live, data, mk]);
  const list = live ? toClaims(data ? { ...data, claims: kept } : null) : claims;
  // 勤怠の印：申請に出てくる月だけ読む（名前は送らない）
  const yms = useMemo(() => [...new Set(kept.map((c) => c.ym))].sort().reverse().slice(0, 3).join(','), [kept]);
  const fl = useLiveRoute<KeihiFlagsResp>(live && yms ? `/api/live/keihi-flags?ym=${yms}` : null);
  const flags: FlagInfo = useMemo(() => {
    if (!live) return { by: KEIHI_FLAGS_SAMPLE, ready: true, unread: [] };
    if (!fl.live || !fl.data) return { by: {}, ready: !yms, unread: [], error: fl.state === 'error' ? fl.error : '' };
    const by = Object.fromEntries(kept.map((c) => [c.id, flagsForClaim(fl.data, c)]));
    const unread = (Object.keys(fl.data.read || {}) as FlagKind[]).filter((k) => !fl.data!.read[k]);
    return { by, ready: true, unread };
  }, [live, fl.live, fl.data, fl.state, fl.error, kept, yms]);
  const go = (t: Tab) => { setTab(t); window.history.replaceState(null, '', t === 'check' ? window.location.pathname : `?tab=${t}`); };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="交通費・経費" sub={`通勤（日ごと）・定期・バス・出張面談。申請は本人が LINE から、ICカードの利用履歴を選ぶだけ${live ? '' : '・見本データ'}`} />
      <LiveBanner state={state} error={error} onReload={reload} note="今の社内システムの「申請中」をそのまま出しています。承認・差し戻しは本物に書き、本人の LINE に結果が届きます（押すと確認の窓が出ます）" />
      <MikeikenNote mk={mk} live={live} />
      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 1 }}>
        {([['check', '経理の確認'], ['monthly', '月次（給与に載せる額）'], ['ringi', '稟議'], ['apply', '本人の申請画面（見本）']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className="tab">{l}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis">
        {tab === 'monthly' ? <KeihiMonthlyTab live={live} mk={mk} /> : tab === 'ringi' ? <KeihiRingiTab live={live} mk={mk} /> : tab === 'check' ? <CheckTab claims={list} done={done} setDone={setDone} live={live} flags={flags} reload={reload} /> : <ApplyTab live={live} onSubmit={(c) => { setClaims((cs) => [c, ...cs.filter((x) => x.id !== 'c2')]); go('check'); }} />}
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
  const [flash, setFlash] = useState<string | null>(null);

  const pending = claims.filter((c) => !done[c.id]).sort((a, b) => ORDER.indexOf(toneOf(a.checks)) - ORDER.indexOf(toneOf(b.checks)) || a.filedAt.localeCompare(b.filedAt));
  const rows = pending.filter((c) => kind === 'すべて' || c.kind === kind);
  const okRows = rows.filter((c) => toneOf(c.checks) === 'ok');
  const kinds = ['すべて', ...Array.from(new Set(claims.map((c) => c.kind)))];
  const flagged = pending.filter((c) => (flags.by[c.id] || []).length).length;

  const settle = (cs: Claim[], d: Done) => (live ? liveSettle(cs, d) : localSettle(cs, d));
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
  const localSettle = (cs: Claim[], d: Done) => {
    const ids = cs.map((c) => c.id);
    setDone((x) => ({ ...x, ...Object.fromEntries(cs.map((c) => [c.id, d])) }));
    if (cs.length === 1) { setFlash(cs[0].id); setTimeout(() => setFlash(null), 1300); }
    hit(cs.length);
    const sum = cs.reduce((s, c) => s + c.amount, 0);
    toast({
      text: cs.length > 1 ? `${cs.length}件（${yen(sum)}）をまとめて承認しました` : `${cs[0].person} の${cs[0].kind}を${d.result}しました`,
      sub: d.result === '差し戻し' ? `→ 本人に「${d.reason}」で戻しました（あおい）` : '→ 今月の給与の振込みと、想定賃金・粗利の交通費に反映しました',
      // この回に処理した分だけ戻す（続けて処理した後でも、ほかの分は消えない）
      undo: () => setDone((x) => { const n = { ...x }; ids.forEach((id) => delete n[id]); return n; }),
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
                    <tr key={c.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === c.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                      <td className="px-4 py-2.5">{c.personId ? <PersonName name={c.person} className="font-semibold hover:underline underline-offset-2" /> : <PersonName name={c.person} className="font-semibold underline-offset-2 hover:underline" />}<div className="text-xs text-faint">{c.site}</div></td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5"><span className="chip" style={{ background: CHIP[t].bg, color: CHIP[t].fg }}>{c.kind}</span><span className="text-xs text-faint">{c.month}・{c.source}</span></div>
                        <div className="mt-1 text-sm text-muted">{c.detail}</div>
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

// ---------------- 本人の申請画面（見本） ----------------
function ApplyTab({ onSubmit, live }: { onSubmit: (c: Claim) => void; live: boolean }) {
  const { hit, toast } = useMotivation();
  const [routes, setRoutes] = useState<Route[]>(ROUTES);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [purpose, setPurpose] = useState<Record<string, string>>({});
  const [starring, setStarring] = useState<string | null>(null);
  const [readAt, setReadAt] = useState('10/23 9:12');
  const readIc = (how: string) => { const d = new Date(); setReadAt(`${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`); toast({ text: `${how}から利用履歴を読み込みました（見本）`, sub: `→ 新しい利用は ${IC_ROWS.length}件のまま。本物では前回より後の分だけ足します` }); };

  const routeOf = (r: IcRow) => routes.find((x) => x.from === r.from && x.to === r.to && x.kind === r.kind);
  const why = (r: IcRow) => r.kind === '買い物' ? '交通ではない利用です' : !PUNCH_DAYS.includes(r.day) ? 'この日は出勤の打刻がありません' : '';
  const days = Array.from(new Set(IC_ROWS.map((r) => r.day)));
  const picked = IC_ROWS.filter((r) => sel[r.id]);
  const purposeOf = (r: IcRow) => purpose[r.id] ?? routeOf(r)?.purpose ?? '';
  const missing = picked.filter((r) => !purposeOf(r));
  const total = picked.reduce((s, r) => s + r.fare, 0);

  const pickRoutes = () => {
    const xs = IC_ROWS.filter((r) => !why(r) && routeOf(r));
    setSel((s) => ({ ...s, ...Object.fromEntries(xs.map((r) => [r.id, true])) }));
    toast({ text: `よく使う経路の ${xs.length}件を選びました`, sub: '→ 打刻の無い日は自動で外しています' });
  };
  const star = (r: IcRow, label: string) => {
    const nr: Route = { id: `r${Date.now()}`, label, from: r.from, to: r.to, fare: r.fare, kind: r.kind, purpose: purposeOf(r) || PURPOSES[0] };
    setRoutes((rs) => [...rs, nr]); setStarring(null);
    toast({ text: `「${label}」をよく使う経路に入れました`, sub: `${r.from}→${r.to}（${yen(r.fare)}）は次から一発で選べます`, undo: () => setRoutes((rs) => rs.filter((x) => x.id !== nr.id)) });
  };
  const submit = () => {
    hit();
    onSubmit({
      id: `c-new-${Date.now()}`, personId: ME.personId, person: ME.name, site: ME.site, kind: picked.every((r) => routeOf(r)?.purpose === '現場への通勤') ? '通勤（日ごと）' : '出張・面談',
      month: ME.month, amount: total, detail: `${new Set(picked.map((r) => r.day)).size}日・${picked.length}件（ICカードの履歴から）`, source: 'ICカードから', filedAt: '10/23 いま',
      checks: [{ tone: 'ok', text: 'ICカードの利用履歴どおり' }, { tone: 'ok', text: '申請した日は全部 出勤の打刻あり' }],
    });
    toast({ text: `${ME.name} さんの交通費 ${yen(total)} を申請しました（見本）`, sub: '→ 経理の確認に載りました' });
  };

  return (
    <div className="flex flex-wrap items-start gap-6">
      {live && <div className="w-full"><NotInLegacy what="ICカードの利用履歴から選ぶ申請画面" /></div>}
      <div className="w-full max-w-[390px] overflow-hidden rounded-[28px] border-[6px] border-ink/80 bg-surface shadow-[0_18px_40px_rgba(20,20,40,.18)]">
        <div className="px-4 pb-3 pt-4" style={{ background: 'var(--al)' }}>
          <div className="text-xs text-muted">{ME.name} さん・{ME.site}</div>
          <div className="text-lg font-bold">交通費の申請（{ME.month}）</div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => readIc('ICカード')} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-surface text-sm font-semibold"><Smartphone size={15} />ICカードをかざす</button>
            <button onClick={() => readIc('モバイルSuica')} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-surface text-sm font-semibold"><CreditCard size={15} />モバイルSuicaから</button>
          </div>
          <div className="mt-1.5 text-xs text-faint">{readAt} に読み込み・{IC_ROWS.length}件</div>
        </div>

        <div className="border-b border-line-soft px-4 py-3">
          <div className="flex items-center justify-between"><span className="text-sm font-semibold text-muted">よく使う経路</span><button onClick={pickRoutes} className="text-sm font-bold" style={{ color: 'var(--ad)' }}>これで全部選ぶ</button></div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {routes.map((r) => <span key={r.id} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm" style={{ borderColor: 'var(--al)' }}><Star size={11} className="text-warn" fill="currentColor" />{r.label}<span className="text-faint">{r.from}→{r.to}</span></span>)}
          </div>
        </div>

        <div className="max-h-[460px] overflow-y-auto">
          {days.map((d) => {
            const rs = IC_ROWS.filter((r) => r.day === d);
            const punched = PUNCH_DAYS.includes(d);
            return (
              <div key={d}>
                <div className="sticky top-0 flex items-center gap-2 bg-soft px-4 py-1.5 text-xs font-semibold text-muted">{d}（{rs[0].dow}）{!punched && <span className="text-bad">出勤の打刻なし</span>}</div>
                {rs.map((r) => {
                  const no = why(r); const rt = routeOf(r); const on = !!sel[r.id];
                  return (
                    <div key={r.id} className={`border-t border-line-soft px-4 py-2 ${no ? 'opacity-50' : ''}`}>
                      <label className="flex items-center gap-2.5">
                        <input type="checkbox" disabled={!!no} checked={on} onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))} aria-label={`${d} ${r.from}→${r.to}`} />
                        <span className="num w-10 text-xs text-faint">{r.time}</span>
                        <span className="min-w-0 flex-1 text-body">{r.kind === '買い物' ? r.from : `${r.from} → ${r.to}`}<span className="ml-1 text-xs text-faint">{r.kind}</span>
                          {rt && <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-warn"><Star size={10} fill="currentColor" />{rt.label}</span>}
                        </span>
                        <span className="num text-body font-semibold">{yen(r.fare)}</span>
                      </label>
                      {no && <div className="ml-7 text-xs text-bad">{no}</div>}
                      {on && !rt && (
                        <div className="mo-fade-in ml-7 mt-1.5 flex flex-wrap items-center gap-1.5">
                          <select aria-label="何のための移動か" value={purpose[r.id] ?? ''} onChange={(e) => setPurpose((p) => ({ ...p, [r.id]: e.target.value }))} className="min-h-8 rounded-lg border px-2 text-sm" style={{ borderColor: purposeOf(r) ? 'var(--color-field)' : 'var(--color-bad)' }}>
                            <option value="">何のための移動？</option>
                            {PURPOSES.map((x) => <option key={x}>{x}</option>)}
                          </select>
                          {starring === r.id ? (
                            <select autoFocus aria-label="よく使う経路の名前" defaultValue="" onChange={(e) => e.target.value && star(r, e.target.value)} className="min-h-8 rounded-lg border border-field px-2 text-sm">
                              <option value="">名前を選ぶ…</option>
                              {ROUTE_LABELS.filter((l) => !routes.some((x) => x.label === l)).map((l) => <option key={l}>{l}</option>)}
                            </select>
                          ) : <button onClick={() => setStarring(r.id)} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--ad)' }}><Star size={12} />よく使う経路にする</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="border-t border-line px-4 py-3">
          <div className="flex items-baseline justify-between"><span className="text-sm text-muted">{picked.length}件を選択</span><span className="num text-xl font-bold">{yen(total)}</span></div>
          {missing.length > 0 && <div className="mt-1 text-xs text-bad">「何のための移動？」を {missing.length}件 選んでください</div>}
          <button onClick={submit} disabled={live || picked.length === 0 || missing.length > 0} title={live ? LIVE_WRITE_BLOCKED : undefined} className="btn-primary mt-2 min-h-11 w-full">申請する</button>
        </div>
      </div>

      <div className="flex min-w-[260px] flex-1 flex-col gap-2 text-sm text-muted">
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <b className="text-ink">本人の画面の決まり</b>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4">
            <li>ICカードをスマホにかざすか、モバイルSuica の履歴を取り込むと、乗った区間と運賃が並ぶ（運賃を手で打たない）</li>
            <li>出勤の打刻が無い日と、買い物などの利用は選べない</li>
            <li>★よく使う経路に入れた区間は「これで全部選ぶ」で、打刻のある日の分だけまとめて選べる</li>
            <li>よく使う経路でない区間は「何のための移動？」を選ぶ（自由入力にしない）</li>
            <li>バスで IC を使わなかった日・定期は、今のシステムと同じく手入力（定期は期間と領収書が必須）</li>
          </ul>
        </div>
        <p className="text-xs text-faint">ICカードの読み取りは Android のかざす読み取りと、モバイルSuica の履歴の取り込みを想定しています（iPhone でカードをかざして読めるかは、本物を作るときに確かめます）。</p>
      </div>
    </div>
  );
}
