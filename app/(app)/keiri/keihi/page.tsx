'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, CircleAlert, CreditCard, Star, Smartphone } from 'lucide-react';
import { CLAIMS, IC_ROWS, KEIHI_REJECT, ME, PUNCH_DAYS, PURPOSES, ROUTES, ROUTE_LABELS, type Claim, type IcRow, type Route } from '@/lib/keihi-sample';
import type { Check as Chk } from '@/lib/kintai-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';

// 交通費・経費（経理管理）。
//   ・経理の確認：申請ごとに 打刻・ICカードの履歴・定期の期間・現場の予約 を先に照らす → 問題なしはまとめて承認
//   ・本人の申請画面（見本）：ICカードの利用履歴から選ぶだけ。よく使う経路は★で登録して次から一発で選ぶ
//     出勤の打刻が無い日・交通でない利用（買い物）は選べない（今のシステムと同じ「不備があると申請できない」）
//   本人の画面は LINE から開くスマホの画面の想定。ここでは内勤が中身を確かめるための見本
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
  return <li className="flex items-start gap-1.5 text-[12.5px]"><Icon size={14} className={`mt-0.5 shrink-0 ${c.tone === 'ok' ? 'text-ok' : c.tone === 'warn' ? 'text-warn' : 'text-bad'}`} /><span className={c.tone === 'bad' ? 'font-semibold text-bad' : ''}>{c.text}</span></li>;
}

export default function KeihiPage() {
  const [tab, setTab] = useState<'check' | 'apply'>('check');
  const [claims, setClaims] = useState<Claim[]>(CLAIMS);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'apply') setTab('apply'); }, []);
  const go = (t: 'check' | 'apply') => { setTab(t); window.history.replaceState(null, '', t === 'apply' ? '?tab=apply' : window.location.pathname); };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="交通費・経費" sub="通勤（日ごと）・定期・バス・出張面談。申請は本人が LINE から、ICカードの利用履歴を選ぶだけ・見本データ" />
      <div role="tablist" className="mo-fade-up flex gap-1 border-b border-line" style={{ ['--i' as string]: 1 }}>
        {([['check', '経理の確認'], ['apply', '本人の申請画面（見本）']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className="px-3.5 py-2.5 text-[14px]"
            style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>{l}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis">
        {tab === 'check' ? <CheckTab claims={claims} /> : <ApplyTab onSubmit={(c) => { setClaims((cs) => [c, ...cs.filter((x) => x.id !== 'c2')]); go('check'); }} />}
      </div>
    </main>
  );
}

// ---------------- 経理の確認 ----------------
type Done = { result: '承認' | '差し戻し'; reason?: string };
function CheckTab({ claims }: { claims: Claim[] }) {
  const canApprove = usePerms().can('keiri', 'approve');
  const { hit, toast } = useMotivation();
  const [done, setDone] = useState<Record<string, Done>>({});
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const [rej, setRej] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<string>('すべて');
  const [flash, setFlash] = useState<string | null>(null);

  const pending = claims.filter((c) => !done[c.id]).sort((a, b) => ORDER.indexOf(toneOf(a.checks)) - ORDER.indexOf(toneOf(b.checks)) || a.filedAt.localeCompare(b.filedAt));
  const rows = pending.filter((c) => kind === 'すべて' || c.kind === kind);
  const okRows = rows.filter((c) => toneOf(c.checks) === 'ok');
  const kinds = ['すべて', ...Array.from(new Set(claims.map((c) => c.kind)))];

  const settle = (cs: Claim[], d: Done) => {
    const before = done;
    setDone((x) => ({ ...x, ...Object.fromEntries(cs.map((c) => [c.id, d])) }));
    if (cs.length === 1) { setFlash(cs[0].id); setTimeout(() => setFlash(null), 1300); }
    hit(cs.length);
    const sum = cs.reduce((s, c) => s + c.amount, 0);
    toast({
      text: cs.length > 1 ? `${cs.length}件（${yen(sum)}）をまとめて承認しました` : `${cs[0].person} の${cs[0].kind}を${d.result}しました`,
      sub: d.result === '差し戻し' ? `→ 本人に「${d.reason}」で戻しました（あおい）` : '→ 今月の給与の振込みと、想定賃金・粗利の交通費に反映しました',
      undo: () => setDone(before),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <RemainRing remain={pending.length} total={claims.length} />
        <div className="text-[13px]"><b>承認待ち {pending.length}件</b><span className="ml-2 num text-muted">{yen(pending.reduce((s, c) => s + c.amount, 0))}</span>
          <div className="text-[12px] text-muted">freee の打刻・ICカードの履歴・定期の期間・現場の予約を先に照らしています。{!canApprove && <span className="text-bad"> {needText('approve')}</span>}</div>
        </div>
        <Link href="/keiri/check" className="ml-auto text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>月ごとの交通費チェックへ</Link>
      </div>

      {pending.length === 0 ? (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-[15px] font-bold">交通費・経費の申請はぜんぶ片づきました</div>
          <div className="mt-1 text-[12.5px] text-muted">定期は月末の見回りで、その月の打刻をもう一度確かめます。</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft px-4 py-2.5">
            {kinds.map((k) => {
              const n = k === 'すべて' ? pending.length : pending.filter((c) => c.kind === k).length;
              return <button key={k} onClick={() => setKind(k)} className={`min-h-8 rounded-full border px-3 text-[12.5px] ${kind === k ? 'font-semibold' : 'text-muted'}`} style={kind === k ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{k} {n}</button>;
            })}
            <button onClick={() => okRows.length && settle(okRows, { result: '承認' })} disabled={!canApprove || okRows.length === 0} className="btn-primary ml-auto min-h-8 rounded-lg px-3 text-[12.5px] font-bold disabled:opacity-40">問題なし {okRows.length}件をまとめて承認</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-[13px]">
              <thead><tr className="th-row text-left">
                <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">種類・中身</th><th className="px-2 py-2.5 text-right font-semibold">金額</th><th className="px-2 py-2.5 font-semibold">先に確かめたこと</th><th className="px-4 py-2.5 font-semibold">承認</th>
              </tr></thead>
              <tbody>
                {rows.map((c, i) => {
                  const t = toneOf(c.checks);
                  const need = t === 'bad' && !ok[c.id];
                  return (
                    <tr key={c.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === c.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                      <td className="px-4 py-2.5"><Link href={`/jinji/staff/${c.personId}`} className="font-semibold hover:underline">{c.person}</Link><div className="text-[11.5px] text-faint">{c.site}</div></td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5"><span className="chip" style={{ background: CHIP[t].bg, color: CHIP[t].fg }}>{c.kind}</span><span className="text-[11.5px] text-faint">{c.month}・{c.source}</span></div>
                        <div className="mt-1 text-[12px] text-muted">{c.detail}</div>
                      </td>
                      <td className="num px-2 py-2.5 text-right font-semibold">{yen(c.amount)}</td>
                      <td className="px-2 py-2.5"><ul className="flex flex-col gap-1">{c.checks.map((x) => <CheckLine key={x.text} c={x} />)}</ul>
                        {t === 'bad' && <label className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted"><input type="checkbox" checked={!!ok[c.id]} onChange={(e) => setOk((o) => ({ ...o, [c.id]: e.target.checked }))} />確かめたうえで承認する</label>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1.5">
                          <button onClick={() => settle([c], { result: '承認' })} disabled={!canApprove || need} title={need ? '要確認の点を確かめてから' : undefined} className="btn-primary min-h-8 rounded-lg px-3 text-[12.5px] font-bold disabled:opacity-40">承認</button>
                          <select aria-label={`${c.person} を差し戻す理由`} value={rej[c.id] ?? ''} disabled={!canApprove} onChange={(e) => { const v = e.target.value; setRej((r) => ({ ...r, [c.id]: v })); if (v) settle([c], { result: '差し戻し', reason: v }); }} className="min-h-8 max-w-[190px] rounded-lg border border-field bg-surface px-2 text-[12px] text-muted disabled:opacity-50">
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
      <p className="text-[11.5px] text-faint">定期は月の途中でも承認できます。月が終わったら、その月の打刻を毎朝の見回りでもう一度確かめ、漏れがあれば差し戻して本人に知らせます（今のシステムと同じ）。</p>
    </div>
  );
}

// ---------------- 本人の申請画面（見本） ----------------
function ApplyTab({ onSubmit }: { onSubmit: (c: Claim) => void }) {
  const { hit, toast } = useMotivation();
  const [routes, setRoutes] = useState<Route[]>(ROUTES);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [purpose, setPurpose] = useState<Record<string, string>>({});
  const [starring, setStarring] = useState<string | null>(null);

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
      <div className="w-full max-w-[390px] overflow-hidden rounded-[28px] border-[6px] border-ink/80 bg-surface shadow-[0_18px_40px_rgba(20,20,40,.18)]">
        <div className="px-4 pb-3 pt-4" style={{ background: 'var(--al)' }}>
          <div className="text-[11.5px] text-muted">{ME.name} さん・{ME.site}</div>
          <div className="text-[17px] font-bold">交通費の申請（{ME.month}）</div>
          <div className="mt-2 flex gap-2">
            <button className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-surface text-[12.5px] font-semibold"><Smartphone size={15} />ICカードをかざす</button>
            <button className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-surface text-[12.5px] font-semibold"><CreditCard size={15} />モバイルSuicaから</button>
          </div>
          <div className="mt-1.5 text-[11px] text-faint">10/23 9:12 に読み込み・{IC_ROWS.length}件</div>
        </div>

        <div className="border-b border-line-soft px-4 py-3">
          <div className="flex items-center justify-between"><span className="text-[12px] font-semibold text-muted">よく使う経路</span><button onClick={pickRoutes} className="text-[12px] font-bold" style={{ color: 'var(--ad)' }}>これで全部選ぶ</button></div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {routes.map((r) => <span key={r.id} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px]" style={{ borderColor: 'var(--al)' }}><Star size={11} className="text-warn" fill="currentColor" />{r.label}<span className="text-faint">{r.from}→{r.to}</span></span>)}
          </div>
        </div>

        <div className="max-h-[460px] overflow-y-auto">
          {days.map((d) => {
            const rs = IC_ROWS.filter((r) => r.day === d);
            const punched = PUNCH_DAYS.includes(d);
            return (
              <div key={d}>
                <div className="sticky top-0 flex items-center gap-2 bg-soft px-4 py-1.5 text-[11.5px] font-semibold text-muted">{d}（{rs[0].dow}）{!punched && <span className="text-bad">出勤の打刻なし</span>}</div>
                {rs.map((r) => {
                  const no = why(r); const rt = routeOf(r); const on = !!sel[r.id];
                  return (
                    <div key={r.id} className={`border-t border-line-soft px-4 py-2 ${no ? 'opacity-50' : ''}`}>
                      <label className="flex items-center gap-2.5">
                        <input type="checkbox" disabled={!!no} checked={on} onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))} aria-label={`${d} ${r.from}→${r.to}`} />
                        <span className="num w-10 text-[11.5px] text-faint">{r.time}</span>
                        <span className="min-w-0 flex-1 text-[13px]">{r.kind === '買い物' ? r.from : `${r.from} → ${r.to}`}<span className="ml-1 text-[11px] text-faint">{r.kind}</span>
                          {rt && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-warn"><Star size={10} fill="currentColor" />{rt.label}</span>}
                        </span>
                        <span className="num text-[13px] font-semibold">{yen(r.fare)}</span>
                      </label>
                      {no && <div className="ml-7 text-[11px] text-bad">{no}</div>}
                      {on && !rt && (
                        <div className="mo-fade-in ml-7 mt-1.5 flex flex-wrap items-center gap-1.5">
                          <select aria-label="何のための移動か" value={purpose[r.id] ?? ''} onChange={(e) => setPurpose((p) => ({ ...p, [r.id]: e.target.value }))} className="min-h-8 rounded-lg border px-2 text-[12px]" style={{ borderColor: purposeOf(r) ? 'var(--color-field)' : 'var(--color-bad)' }}>
                            <option value="">何のための移動？</option>
                            {PURPOSES.map((x) => <option key={x}>{x}</option>)}
                          </select>
                          {starring === r.id ? (
                            <select autoFocus aria-label="よく使う経路の名前" defaultValue="" onChange={(e) => e.target.value && star(r, e.target.value)} className="min-h-8 rounded-lg border border-field px-2 text-[12px]">
                              <option value="">名前を選ぶ…</option>
                              {ROUTE_LABELS.filter((l) => !routes.some((x) => x.label === l)).map((l) => <option key={l}>{l}</option>)}
                            </select>
                          ) : <button onClick={() => setStarring(r.id)} className="inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: 'var(--ad)' }}><Star size={12} />よく使う経路にする</button>}
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
          <div className="flex items-baseline justify-between"><span className="text-[12.5px] text-muted">{picked.length}件を選択</span><span className="num text-[20px] font-bold">{yen(total)}</span></div>
          {missing.length > 0 && <div className="mt-1 text-[11.5px] text-bad">「何のための移動？」を {missing.length}件 選んでください</div>}
          <button onClick={submit} disabled={picked.length === 0 || missing.length > 0} className="btn-primary mt-2 min-h-11 w-full rounded-[12px] text-[14px] font-bold disabled:opacity-40">申請する</button>
        </div>
      </div>

      <div className="flex min-w-[260px] flex-1 flex-col gap-2 text-[12.5px] text-muted">
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
        <p className="text-[11.5px] text-faint">ICカードの読み取りは Android のかざす読み取りと、モバイルSuica の履歴の取り込みを想定しています（iPhone でカードをかざして読めるかは、本物を作るときに確かめます）。</p>
      </div>
    </div>
  );
}
