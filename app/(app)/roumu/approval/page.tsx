'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, CircleAlert, CornerUpLeft, SkipForward } from 'lucide-react';
import { REJECT_REASONS, REQUESTS, type Check as Chk, type Req, type ReqKind } from '@/lib/kintai-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { NotInLegacy } from '@/components/Live';
import { PersonName } from '@/components/Person';

// 申請の承認（労務/営業管理）＝打刻修正・残業・有給・欠勤・遅刻早退を、上から順に1件ずつ片づける。
//   ・ホームの「上から順に片づける」の行き先。1件ずつのカード（A=承認・R=差し戻し・S=あとで）と一覧の2通り
//   ・判断に要る事実（freee の打刻・シフト・現場の勤務表）と、先に確かめた結果を横に出す
//   ・要注意（bad）がある申請は「確かめた」に✓しないと承認できない。差し戻しの理由は選ぶだけ
//   ・問題なし（ok だけ）の申請は一覧からまとめて承認できる
type Done = { result: '承認' | '差し戻し'; reason?: string };
const KINDS: ReqKind[] = ['打刻修正', '残業', '有給', '欠勤', '遅刻・早退'];
const TONE_OF = (c: Chk[]) => (c.some((x) => x.tone === 'bad') ? 'bad' : c.some((x) => x.tone === 'warn') ? 'warn' : 'ok');
const CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  bad: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)', label: '要注意' },
  warn: { bg: 'var(--tone-warn-bg)', fg: 'var(--tone-warn-fg)', label: '気になる点' },
  ok: { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)', label: '問題なし' },
};
// 要注意 → 気になる点 → 問題なし、同じなら古い申請から
const ORDER = ['bad', 'warn', 'ok'];
const sortReqs = (rs: Req[]) => [...rs].sort((a, b) => ORDER.indexOf(TONE_OF(a.checks)) - ORDER.indexOf(TONE_OF(b.checks)) || a.filedAt.localeCompare(b.filedAt));

function CheckLine({ c }: { c: Chk }) {
  const Icon = c.tone === 'ok' ? Check : c.tone === 'warn' ? CircleAlert : AlertTriangle;
  return <li className="flex items-start gap-1.5 text-[12.5px]"><Icon size={14} className={`mt-0.5 shrink-0 ${c.tone === 'ok' ? 'text-ok' : c.tone === 'warn' ? 'text-warn' : 'text-bad'}`} /><span className={c.tone === 'bad' ? 'font-semibold text-bad' : ''}>{c.text}</span></li>;
}

export default function ApprovalPage() {
  const canApprove = usePerms().can('roumu', 'approve');
  const { hit, toast } = useMotivation();
  const [view, setView] = useState<'focus' | 'list'>('focus');
  const [done, setDone] = useState<Record<string, Done>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [kind, setKind] = useState<ReqKind | 'すべて'>('すべて');
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [front, setFront] = useState<string | null>(null); // 一覧から「1件ずつ見る」で開いた申請を先頭に

  useEffect(() => { if (new URLSearchParams(window.location.search).get('view') === 'list') setView('list'); }, []);

  const pending = sortReqs(REQUESTS.filter((r) => !done[r.id]));
  // あとで に回したものは列の最後へ
  const rest = [...pending.filter((r) => !skipped.includes(r.id)), ...pending.filter((r) => skipped.includes(r.id))];
  const queue = [...rest.filter((r) => r.id === front), ...rest.filter((r) => r.id !== front)];
  const cur = queue[0];
  const total = REQUESTS.length;
  const curTone = cur ? TONE_OF(cur.checks) : 'ok';
  const canGo = canApprove && cur && (curTone !== 'bad' || confirmed[cur.id]);

  const settle = (rs: Req[], d: Done) => {
    const ids = rs.map((r) => r.id);
    setDone((x) => ({ ...x, ...Object.fromEntries(ids.map((id) => [id, d])) }));
    setRejecting(false); setSel({});
    if (rs.length === 1) { setFlash(rs[0].id); setTimeout(() => setFlash(null), 1300); }
    hit(rs.length);
    const r = rs[0];
    toast({
      text: rs.length > 1 ? `${rs.length}件をまとめて承認しました` : `${r.person} の${r.kind}を${d.result}しました`,
      sub: d.result === '差し戻し' ? `→ 本人に「${d.reason}」で戻しました（あおい）` : rs.length > 1 ? '→ freee の勤怠と、勤怠の締めに反映しました' : sub(r),
      // 取り消しはこの操作で片づけた分だけ戻す（続けて処理した別の申請は戻さない）
      undo: () => setDone((x) => { const n = { ...x }; ids.forEach((id) => delete n[id]); return n; }),
    });
  };
  const sub = (r: Req) => r.kind === '残業' ? '→ freee の勤怠と、残業・36協定の見込みに反映しました' : r.kind === '有給' ? '→ freee の休暇と、有給の年5日の進み具合に反映しました' : r.kind === '欠勤' ? '→ 欠勤管理と、離職リスクの材料に反映しました' : '→ freee の勤怠と、勤怠の締めに反映しました';

  const approve = () => { if (cur && canGo) settle([cur], { result: '承認' }); };
  const reject = () => { if (cur && canApprove) settle([cur], { result: '差し戻し', reason }); };
  const skip = () => { if (cur && queue.length > 1) { setSkipped((s) => [...s.filter((x) => x !== cur.id), cur.id]); if (front === cur.id) setFront(null); setRejecting(false); } };
  const openOne = (r: Req) => { setFront(r.id); setView('focus'); setRejecting(false); };

  // キーボード：A=承認・R=差し戻し・S=あとで（入力中・選択中は効かない）
  useEffect(() => {
    if (view !== 'focus') return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ['SELECT', 'TEXTAREA'].includes(t.tagName) || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox');
      if (e.metaKey || e.ctrlKey || e.altKey || typing) return;
      const k = e.key.toLowerCase();
      if (k === 'a') approve();
      else if (k === 'r' && canApprove) { if (rejecting) reject(); else setRejecting(true); }
      else if (k === 's') skip();
      else if (k === 'escape') setRejecting(false);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const listRows = pending.filter((r) => kind === 'すべて' || r.kind === kind);
  const okRows = listRows.filter((r) => TONE_OF(r.checks) === 'ok');
  const picked = listRows.filter((r) => sel[r.id]);
  const history = REQUESTS.filter((r) => done[r.id]);

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="申請の承認" sub="打刻修正・残業・有給・欠勤・遅刻早退。要注意のものから順に並べています・見本データ">
        <div className="flex rounded-[10px] border border-field bg-surface p-0.5 text-[12.5px] font-semibold">
          {([['focus', '上から順に'], ['list', '一覧']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`min-h-8 rounded-lg px-3 ${view === k ? 'text-white' : 'text-muted'}`} style={view === k ? { background: 'var(--a)' } : undefined}>{l}</button>
          ))}
        </div>
      </PageTitle>
      {/* 打刻修正・残業・有給などの申請と承認は今は freee の中でしていて、今の社内システムには申請を受ける表も画面も無い */}
      <NotInLegacy what="打刻修正・残業・有給・欠勤・遅刻早退の申請と承認（今は freee の中でしています）" />

      <div className="mo-fade-up flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={pending.length} total={total} />
        <div className="text-[13px]"><b>残り {pending.length}件</b><span className="ml-2 text-muted">要注意 {pending.filter((r) => TONE_OF(r.checks) === 'bad').length}・気になる点 {pending.filter((r) => TONE_OF(r.checks) === 'warn').length}・問題なし {pending.filter((r) => TONE_OF(r.checks) === 'ok').length}</span>
          {!canApprove && <div className="text-[12px] text-bad">{needText('approve')}</div>}
        </div>
        <Link href="/roumu/today" className="ml-auto text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>当日の出勤状況へ</Link>
      </div>

      {pending.length === 0 && (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-[15px] font-bold">申請はぜんぶ片づきました</div>
          <div className="mt-1 text-[12.5px] text-muted">今日は {history.length}件 を処理しました。新しい申請が来たら、ここにまた並びます。</div>
        </div>
      )}

      {view === 'focus' && cur && (
        <article key={cur.id} className="mo-spring-in rounded-xl border border-line bg-surface" style={{ boxShadow: 'var(--card-shadow)' }}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-5 py-3">
            <span className="chip" style={{ background: 'var(--al)', color: 'var(--ad)' }}>{cur.kind}</span>
            <span className="chip" style={{ background: CHIP[curTone].bg, color: CHIP[curTone].fg }}>{CHIP[curTone].label}</span>
            {skipped.includes(cur.id) && <span className="text-[11.5px] text-faint">あとでに回した申請</span>}
            <span className="ml-auto text-[12px] text-faint">{queue.indexOf(cur) + 1} / {queue.length} 件目・申請 {cur.filedAt}</span>
          </div>
          <div className="grid gap-5 px-5 py-4 md:grid-cols-[1fr_1fr]">
            <div>
              <PersonName name={cur.person} className="text-[18px] font-bold hover:underline underline-offset-2" />
              <div className="text-[12.5px] text-muted">{cur.site}</div>
              <div className="mt-3 rounded-[10px] bg-soft px-3.5 py-3">
                <div className="num text-[15px] font-bold">{cur.day}　{cur.detail}</div>
                <div className="mt-1 text-[12.5px] text-muted">理由：{cur.reason}</div>
              </div>
              <dl className="mt-3 grid grid-cols-[112px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
                {cur.facts.map(([k, v]) => <Fragment key={k}><dt className="text-faint">{k}</dt><dd className="num">{v}</dd></Fragment>)}
              </dl>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-muted">先に確かめたこと</div>
              <ul className="mt-2 flex flex-col gap-1.5">{cur.checks.map((c) => <CheckLine key={c.text} c={c} />)}</ul>
              {curTone === 'bad' && (
                <label className="mo-shake mt-3 flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12.5px]" style={{ borderColor: 'var(--color-bad-line)', background: 'var(--tone-bad-bg)' }}>
                  <input type="checkbox" checked={!!confirmed[cur.id]} onChange={(e) => setConfirmed((c) => ({ ...c, [cur.id]: e.target.checked }))} />
                  要注意の点を確かめたうえで承認する
                </label>
              )}
              {cur.kind === '残業' && curTone === 'bad' && <Link href="/roumu/overtime" className="mt-2 inline-block text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>残業・36協定で見込みを見る</Link>}
            </div>
          </div>

          {rejecting && (
            <div className="mo-fade-in flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3">
              <span className="text-[12.5px] text-muted">差し戻す理由</span>
              <select aria-label="差し戻す理由" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px]">
                {REJECT_REASONS.map((x) => <option key={x}>{x}</option>)}
              </select>
              <button onClick={reject} disabled={!canApprove} title={!canApprove ? needText('approve') : undefined} className="min-h-9 rounded-[10px] px-3 text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: 'var(--color-bad)' }}>この理由で差し戻す</button>
              <button onClick={() => setRejecting(false)} className="text-[12.5px] text-muted">やめる</button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3">
            <button onClick={approve} disabled={!canGo} title={!canApprove ? needText('approve') : curTone === 'bad' && !confirmed[cur.id] ? '要注意の点を確かめてから' : undefined} className="btn-primary inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-4 text-[13.5px] font-bold disabled:opacity-40"><Check size={16} />承認<kbd className="ml-1 rounded bg-white/20 px-1 text-[11px]">A</kbd></button>
            <button onClick={() => setRejecting(true)} disabled={!canApprove} title={!canApprove ? needText('approve') : undefined} className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-3.5 text-[13px] font-semibold disabled:opacity-40"><CornerUpLeft size={15} />差し戻し<kbd className="ml-1 rounded bg-soft px-1 text-[11px] text-muted">R</kbd></button>
            <button onClick={skip} disabled={queue.length <= 1} title={queue.length <= 1 ? 'ほかに残っている申請がありません' : undefined} className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-3 text-[13px] text-muted"><SkipForward size={15} />あとで<kbd className="ml-1 rounded bg-soft px-1 text-[11px]">S</kbd></button>
            {queue[1] && <span className="ml-auto text-[12px] text-faint">次：{queue[1].person} の{queue[1].kind}</span>}
          </div>
        </article>
      )}

      {view === 'list' && pending.length > 0 && (
        <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft px-4 py-2.5">
            {(['すべて', ...KINDS] as const).map((k) => {
              const n = k === 'すべて' ? pending.length : pending.filter((r) => r.kind === k).length;
              return <button key={k} onClick={() => setKind(k)} className={`min-h-8 rounded-full border px-3 text-[12.5px] ${kind === k ? 'font-semibold' : 'text-muted'}`} style={kind === k ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{k} {n}</button>;
            })}
            <div className="ml-auto flex items-center gap-2">
              {picked.length > 0 && <button onClick={() => settle(picked, { result: '承認' })} disabled={!canApprove || picked.some((r) => TONE_OF(r.checks) === 'bad')} title={!canApprove ? needText('approve') : picked.some((r) => TONE_OF(r.checks) === 'bad') ? '要注意の申請は1件ずつ確かめてください' : undefined} className="btn-primary min-h-8 rounded-lg px-3 text-[12.5px] font-bold disabled:opacity-40">選んだ {picked.length}件を承認</button>}
              <button onClick={() => okRows.length && settle(okRows, { result: '承認' })} disabled={!canApprove || okRows.length === 0} title={!canApprove ? needText('approve') : undefined} className="min-h-8 rounded-lg border px-3 text-[12.5px] font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>問題なし {okRows.length}件をまとめて承認</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <thead><tr className="th-row text-left">
                <th className="w-10 px-4 py-2.5" /><th className="px-2 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">種類</th><th className="px-2 py-2.5 font-semibold">日・中身</th><th className="px-2 py-2.5 font-semibold">先に確かめたこと</th><th className="px-2 py-2.5 font-semibold">申請</th><th className="px-4 py-2.5" />
              </tr></thead>
              <tbody>
                {listRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-muted">「{kind}」の申請は残っていません。</td></tr>}
                {listRows.map((r, i) => {
                  const t = TONE_OF(r.checks);
                  return (
                    <tr key={r.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === r.id ? 'mo-flash' : 'row'}`} style={{ ['--i' as string]: i }}>
                      <td className="px-4 py-2.5"><input type="checkbox" aria-label={`${r.person} を選ぶ`} checked={!!sel[r.id]} onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))} /></td>
                      <td className="px-2 py-2.5"><PersonName name={r.person} className="font-semibold hover:underline underline-offset-2" /><div className="text-[11.5px] text-faint">{r.site}</div></td>
                      <td className="px-2 py-2.5"><span className="chip" style={{ background: CHIP[t].bg, color: CHIP[t].fg }}>{r.kind}</span></td>
                      <td className="num px-2 py-2.5">{r.day}<div className="text-[12px] text-muted">{r.detail}・{r.reason}</div></td>
                      <td className="px-2 py-2.5"><ul className="flex flex-col gap-1">{r.checks.filter((c) => c.tone !== 'ok').concat(t === 'ok' ? r.checks.slice(0, 1) : []).map((c) => <CheckLine key={c.text} c={c} />)}</ul></td>
                      <td className="num whitespace-nowrap px-2 py-2.5 text-[12px] text-faint">{r.filedAt}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => openOne(r)} className="min-h-8 whitespace-nowrap rounded-lg border border-field bg-surface px-2.5 text-[12px] font-semibold">1件ずつ見る</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <div className="text-[12px] font-semibold text-muted">今日 処理した申請</div>
          <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
            {history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className={done[r.id].result === '承認' ? 'text-ok' : 'text-bad'}>{done[r.id].result}</span>
                <span>{r.person} の{r.kind}（{r.day} {r.detail}）</span>
                {done[r.id].reason && <span className="text-faint">理由：{done[r.id].reason}</span>}
                <button onClick={() => setDone((d) => { const n = { ...d }; delete n[r.id]; return n; })} disabled={!canApprove} title={!canApprove ? needText('approve') : '未処理に戻します'} className="ml-auto text-[12px] text-muted disabled:opacity-40">戻す</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11.5px] text-faint">承認すると freee の勤怠に書き込む想定です（本物につなぐまでは見本の中だけで動きます）。</p>
    </main>
  );
}
