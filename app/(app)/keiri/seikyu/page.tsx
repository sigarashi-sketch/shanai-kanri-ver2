'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, CornerUpLeft, FileText, Send, UserSearch } from 'lucide-react';
import { calc, CLIENTS, FMT_LABEL, SHEET_REJECT, STAGES, type Client, type SPerson } from '@/lib/seikyu-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LIVE_WRITE_BLOCKED, LiveBanner, useIke, type LiveState } from '@/components/Live';
import { SEIKYU_STAGE, SEIKYU_STAGES, toSeikyu, type SeikyuListLive, type SeikyuLive } from '@/lib/live/seikyu';

// 請求書（経理管理）。今月の請求書づくりを 取引先ごと・人ごとに、1社ずつ片づける。
//   勤務表が届いた → 時間を読んだ → 精算幅で金額 → 請求書の下書き → 送付
//   ・精算幅を外れたら控除／超過を自動で出す（単価は 月額÷下限・月額÷上限）
//   ・勤務表に不備がある人は理由を選んで差し戻す。格納の請求書PDFで名前が読めないものは「人を選ぶ」
//   ・その会社の全員が下書きまで来て、止まりが無ければ「送付」→ 次の会社へ
//   本物（ログイン中）：今の GET /api/seikyu?action=list&cache=1 を読むだけ（前回の計算結果）。段階・理由・金額・答え合わせは今の API の答えのまま
//     （請求の仕様は崩さない＝ver2 で計算し直さない）。確定・送付などは押せない（今の請求書の画面から）
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;
const clone = () => CLIENTS.map((c) => ({ ...c, people: c.people.map((p) => ({ ...p })), files: c.files.map((f) => ({ ...f })) }));
const sentAll = (c: Client) => c.people.every((p) => p.stage >= 5);
const blockers = (c: Client) => c.people.filter((p) => p.issue).length + c.files.filter((f) => !f.who).length;

function Steps({ stage }: { stage: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={stage ? `${STAGES[stage - 1]}まで` : '勤務表まだ'}>
      {STAGES.map((s, i) => (
        <span key={s} title={s} className="h-1.5 w-6 rounded-full" style={{ background: i < stage ? 'var(--a)' : 'var(--color-track)' }} />
      ))}
      <span className="ml-1.5 text-[11.5px] text-muted">{stage ? STAGES[stage - 1] : '勤務表まだ'}</span>
    </div>
  );
}

export default function SeikyuPage() {
  const canEdit = usePerms().can('keiri', 'edit');
  const { hit, toast } = useMotivation();
  const [clients, setClients] = useState<Client[]>(clone);
  const [curId, setCurIdRaw] = useState(CLIENTS[0].id);
  // 送付のあと「次の会社へ」自動で移る予約。左の一覧を押したら取り消す（押した会社が上書きされないように）
  const autoNext = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setCurId = (id: string) => {
    if (autoNext.current) { clearTimeout(autoNext.current); autoNext.current = null; }
    setCurIdRaw(id);
    window.history.replaceState(null, '', `?client=${id}`);
  };
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);

  const [ym, setYm] = useState('');
  const live0 = useIke<SeikyuListLive>(`seikyu?action=list&cache=1${ym ? `&ym=${ym}` : ''}`);
  const L = live0.live ? toSeikyu(live0.data) : null;
  useEffect(() => { const c = new URLSearchParams(window.location.search).get('client'); if (c && CLIENTS.some((x) => x.id === c)) setCurIdRaw(c); return () => { if (autoNext.current) clearTimeout(autoNext.current); }; }, []);

  const cur = clients.find((c) => c.id === curId)!;
  const remainClients = clients.filter((c) => !sentAll(c));
  const remainPeople = clients.reduce((n, c) => n + c.people.filter((p) => p.stage < 5).length, 0);
  const lock = canEdit ? undefined : needText('edit');

  // 今の会社に fn を当てる。取り消しは「この操作で変わった人・ファイル」だけを元に戻す
  //   （続けて別の人を進めた後や、送付して次の会社へ移った後でも、ほかの操作は消えない）
  const edit = (fn: (c: Client) => void) => {
    const id = curId;
    const orig = clients.find((c) => c.id === id)!;
    const copy = (c: Client): Client => ({ ...c, people: c.people.map((p) => ({ ...p })), files: c.files.map((f) => ({ ...f })) });
    const probe = copy(orig); fn(probe);
    const bp = Object.fromEntries(orig.people.filter((p, i) => JSON.stringify(p) !== JSON.stringify(probe.people[i])).map((p) => [p.id, { ...p }]));
    const bf = Object.fromEntries(orig.files.filter((f, i) => JSON.stringify(f) !== JSON.stringify(probe.files[i])).map((f) => [f.id, { ...f }]));
    setClients((cs) => cs.map((c) => { if (c.id !== id) return c; const n = copy(c); fn(n); return n; }));
    return () => {
      setClients((cs) => cs.map((c) => c.id !== id ? c : { ...c, people: c.people.map((p) => bp[p.id] ? { ...bp[p.id] } : p), files: c.files.map((f) => bf[f.id] ? { ...bf[f.id] } : f) }));
      setCurId(id);
    };
  };
  const pulse = (id: string) => { setFlash(id); setTimeout(() => setFlash(null), 1300); };

  const next = (p: SPerson) => {
    const to = p.stage + 1;
    const undo = edit((c) => { c.people.find((x) => x.id === p.id)!.stage = to; });
    pulse(p.id); hit();
    const sub = to === 1 ? '→ 見本では勤務表が届いた扱い（本人にはあおいで催促しました）'
      : to === 2 ? `→ 勤務表から ${p.hours}h を読みました` : to === 3 ? `→ ${yen(calc(p).amount)}（${calc(p).note}）を請求額にしました` : '→ 請求書の下書きを作りました' + (cur.fmt === 'own' ? '' : '（先方の様式に転記）');
    toast({ text: `${p.name}：${STAGES[to - 1]}`, sub, undo });
  };
  const reject = (p: SPerson) => {
    const r = reasons[p.id] || p.issue || SHEET_REJECT[0];
    const undo = edit((c) => { const x = c.people.find((y) => y.id === p.id)!; x.issue = undefined; x.stage = 1; });
    pulse(p.id); hit();
    toast({ text: `${p.name} の勤務表を差し戻しました`, sub: `→ 本人に「${r}」で出し直しを頼みました（あおい）・見本では出し直しが届いた扱い`, undo });
  };
  const okAnyway = (p: SPerson) => {
    const undo = edit((c) => { c.people.find((y) => y.id === p.id)!.issue = undefined; });
    pulse(p.id); hit();
    toast({ text: `${p.name}：確かめて問題なしにしました`, sub: '→ このまま金額を出せます', undo });
  };
  const pickWho = (fid: string, who: string) => {
    const name = cur.people.find((p) => p.personId === who)?.name;
    const undo = edit((c) => { c.files.find((f) => f.id === fid)!.who = who; });
    hit(); toast({ text: `格納のファイルを ${name} の分にしました`, sub: '→ 格納の「誰の分」に入れました（次から自動で上書きしません）', undo });
  };
  const bulkTargets = cur.people.filter((p) => !p.issue && p.stage >= 1 && p.stage < 4);
  const bulk = () => {
    const ps = bulkTargets;
    if (!ps.length) return;
    const undo = edit((c) => { c.people.forEach((p) => { if (!p.issue && p.stage >= 1 && p.stage < 4) p.stage = 4; }); });
    hit(ps.length); toast({ text: `${ps.length}人を下書きまで進めました`, sub: '→ 時間を読んで精算幅で金額を出し、請求書の下書きに入れました', undo });
  };
  const ready = cur.people.every((p) => p.stage === 4) && blockers(cur) === 0;
  const send = () => {
    if (!ready || !canEdit) return;
    const total = cur.people.reduce((n, p) => n + calc(p).amount, 0);
    const undo = edit((c) => { c.people.forEach((p) => { p.stage = 5; }); });
    hit(); toast({ text: `${cur.name} に請求書を送付しました（${yen(total)}・税抜）`, sub: '→ 送付の記録と、格納（請求書PDFの置き場）に入れました・粗利の一覧に反映', undo });
    const nxt = clients.find((c) => c.id !== cur.id && !sentAll(c));
    if (nxt) autoNext.current = setTimeout(() => { autoNext.current = null; setCurId(nxt.id); }, 600);
  };

  if (L) return <LiveSeikyu L={L} ym={ym || L.ym} setYm={setYm} state={live0.state} error={live0.error} reload={live0.reload} />;

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="請求書" sub="10月分。取引先ごとに、勤務表 → 時間 → 金額 → 下書き → 送付 を1社ずつ片づけます・見本データ">
        <Link href="/keiri/chingin" className="inline-flex min-h-10 items-center rounded-[10px] border border-field bg-surface px-3.5 text-[13px] font-semibold">想定賃金・粗利へ</Link>
      </PageTitle>
      <LiveBanner state={live0.state} error={live0.error} onReload={live0.reload} />

      <div className="mo-fade-up flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <RemainRing remain={remainClients.length} total={clients.length} />
        <div className="text-[13px]"><b>残り {remainClients.length}社・{remainPeople}人</b><span className="ml-2 text-muted">止まっている行 {clients.reduce((n, c) => n + blockers(c), 0)}件（差し戻し・人を選ぶ）</span>
          {!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}
        </div>
      </div>

      {remainClients.length === 0 ? (
        <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <Check className="mx-auto text-ok" size={26} />
          <div className="mt-2 text-[15px] font-bold">10月分の請求書はぜんぶ送付しました</div>
          <div className="mt-1 text-[12.5px] text-muted">{clients.length}社・{clients.reduce((n, c) => n + c.people.length, 0)}人。入金の確認は来月の締めで並びます。</div>
        </div>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-[220px_1fr]">
          <ul className="mo-fade-up flex flex-col gap-1 self-start rounded-xl border border-line bg-surface p-2" style={{ ['--i' as string]: 2 }}>
            {clients.map((c) => {
              const done = c.people.filter((p) => p.stage >= 5).length, b = blockers(c);
              return (
                <li key={c.id}><button onClick={() => setCurId(c.id)} aria-current={c.id === curId ? 'true' : undefined} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px]" style={c.id === curId ? { background: 'var(--al)', color: 'var(--ad)' } : undefined}>
                  {sentAll(c) ? <Check size={14} className="text-ok" /> : <span className="num w-[14px] text-center text-[11px] text-faint">{c.people.length}</span>}
                  <span className={`flex-1 ${c.id === curId ? 'font-bold' : ''}`}>{c.name}</span>
                  {b > 0 && !sentAll(c) && <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>止まり {b}</span>}
                  {!sentAll(c) && <span className="num text-[11px] text-faint">{done}/{c.people.length}</span>}
                </button></li>
              );
            })}
          </ul>

          <article key={cur.id} className="mo-spring-in min-w-0 rounded-xl border border-line bg-surface" style={{ boxShadow: 'var(--card-shadow)' }}>
            <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-5 py-3">
              <span className="text-[18px] font-bold">{cur.name}</span>
              <span className="text-[12px] text-muted">{cur.close}・送付 {cur.send}</span>
              <span className="chip" style={{ background: `var(--tone-${FMT_LABEL[cur.fmt].tone}-bg)`, color: `var(--tone-${FMT_LABEL[cur.fmt].tone}-fg)` }}>{FMT_LABEL[cur.fmt].label}</span>
              {sentAll(cur) && <span className="chip ml-auto" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>送付済み</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[13px]">
                <thead><tr className="th-row text-left"><th className="px-5 py-2 font-semibold">社員</th><th className="px-2 py-2 font-semibold">進み</th><th className="px-2 py-2 font-semibold">精算幅・時間</th><th className="px-2 py-2 text-right font-semibold">請求額（税抜）</th><th className="px-5 py-2" /></tr></thead>
                <tbody>
                  {cur.people.map((p) => {
                    const c = calc(p);
                    return (
                      <tr key={p.id} className={`border-t border-line-soft align-top ${flash === p.id ? 'mo-flash' : 'row'}`}>
                        <td className="px-5 py-2.5"><Link href={`/jinji/staff/${p.personId}`} className="font-semibold hover:underline">{p.name}</Link><div className="num text-[11.5px] text-faint">月額 {yen(p.price)}</div></td>
                        <td className="px-2 py-2.5"><Steps stage={p.stage} />{p.issue && <div className="mt-1 text-[12px] font-semibold text-bad">{p.issue}</div>}</td>
                        <td className="num px-2 py-2.5 text-[12.5px]">{p.fixed ? '固定' : `${p.lower}〜${p.upper}h`}<div className="text-muted">{p.stage >= 2 ? `${p.hours}h` : '—'}</div></td>
                        <td className="num px-2 py-2.5 text-right">{p.stage >= 3 ? <><b>{yen(c.amount)}</b><div className={`text-[11.5px] ${c.diff < 0 ? 'text-bad' : c.diff > 0 ? 'text-ok' : 'text-faint'}`}>{c.note}</div></> : <span className="text-faint">—</span>}</td>
                        <td className="px-5 py-2.5 text-right">
                          {p.issue ? (
                            <div className="flex flex-col items-end gap-1.5">
                              <select aria-label="差し戻す理由" value={reasons[p.id] || p.issue} onChange={(e) => setReasons((r) => ({ ...r, [p.id]: e.target.value }))} className="min-h-8 max-w-[220px] rounded-lg border border-field bg-surface px-2 text-[12px]">
                                {SHEET_REJECT.map((r) => <option key={r}>{r}</option>)}
                              </select>
                              <div className="flex gap-1.5 whitespace-nowrap">
                                <button onClick={() => reject(p)} disabled={!canEdit} title={lock} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-bold text-white disabled:opacity-40" style={{ background: 'var(--color-bad)' }}><CornerUpLeft size={13} />差し戻す</button>
                                <button onClick={() => okAnyway(p)} disabled={!canEdit} title={lock} className="min-h-8 rounded-lg border border-field px-2.5 text-[12px] disabled:opacity-40">確かめた・進める</button>
                              </div>
                            </div>
                          ) : p.stage < 4 ? (
                            <button onClick={() => next(p)} disabled={!canEdit} title={lock} className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}>{p.stage === 0 ? '本人に催促' : STAGES[p.stage]}<ChevronRight size={13} /></button>
                          ) : <span className="text-[12px] text-faint">{p.stage === 4 ? '送付を待つ' : '済み'}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-line-soft px-5 py-3">
              <div className="text-[12px] font-semibold text-muted">格納（請求書PDF・勤務表の置き場）</div>
              {cur.files.length === 0 ? <div className="mt-1 text-[12.5px] text-faint">まだ何も入っていません。送付すると下書きのPDFがここに入ります。</div> : (
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {cur.files.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                      <FileText size={14} className="text-faint" /><span className="num">{f.name}</span>
                      {f.who ? <span className="chip" style={{ background: 'var(--tone-ok-bg)', color: 'var(--tone-ok-fg)' }}>{cur.people.find((p) => p.personId === f.who)?.name} の分</span> : (
                        <>
                          <span className="chip inline-flex items-center gap-1" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}><UserSearch size={11} />人を選ぶ（中身に名前が読めません）</span>
                          <select aria-label="誰の分か選ぶ" defaultValue="" disabled={!canEdit} title={lock} onChange={(e) => e.target.value && pickWho(f.id, e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-[12px]">
                            <option value="" disabled>誰の分？</option>
                            {cur.people.map((p) => <option key={p.id} value={p.personId}>{p.name}</option>)}
                          </select>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!sentAll(cur) && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3">
                <button onClick={send} disabled={!ready || !canEdit} title={lock ?? (!ready ? '全員が下書きまで来て、差し戻し・人を選ぶ が残っていないと送れません' : undefined)} className="btn-primary inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-4 text-[13.5px] font-bold disabled:opacity-40"><Send size={15} />{cur.name} に送付する</button>
                <button onClick={bulk} disabled={!canEdit || bulkTargets.length === 0} title={lock ?? (bulkTargets.length === 0 ? '進められる人がいません（勤務表まだ・差し戻し中・下書き済み）' : undefined)} className="min-h-10 whitespace-nowrap rounded-[10px] border border-field bg-surface px-3.5 text-[13px] font-semibold disabled:opacity-40">止まっていない {bulkTargets.length}人を下書きまで進める</button>
                <span className="ml-auto text-[12px] text-faint">合計 {yen(cur.people.filter((p) => p.stage >= 3).reduce((n, p) => n + calc(p).amount, 0))}（金額を出した分）</span>
              </div>
            )}
          </article>
        </div>
      )}
      <p className="text-[11.5px] text-faint">控除・超過の単価は 月額÷下限・月額÷上限（10円未満切り捨て）で見本を出しています。契約ごとの精算の決め方・消費税の扱いの最終判断は税理士・法務に確認してください。</p>
    </main>
  );
}

// ---------------- 本物（今の社内システムの請求書の答えをそのまま出す・見るだけ） ----------------
const ymJa = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月分`;
const sgn = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`;
function StagePill({ s }: { s: keyof typeof SEIKYU_STAGE }) {
  const t = SEIKYU_STAGE[s];
  return <span className="chip" title={t.hint} style={{ background: `var(--tone-${t.tone}-bg)`, color: `var(--tone-${t.tone}-fg)` }}>{t.label}</span>;
}

function LiveSeikyu({ L, ym, setYm, state, error, reload }: { L: SeikyuLive; ym: string; setYm: (v: string) => void; state: LiveState; error: string; reload: () => void }) {
  const [curId, setCurId] = useState('');
  const cur = L.clients.find((c) => c.id === curId) || L.clients[0];
  const remain = L.clients.filter((c) => c.sent < c.people.length);
  const built = L.builtAt ? new Date(L.builtAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="請求書" sub={`${ymJa(L.ym)}。取引先（上位会社）ごとに、今の社内システムの請求書の段階をそのまま出しています`}>
        {L.months.length > 0 && (
          <select aria-label="作業月" value={ym} onChange={(e) => { setYm(e.target.value); setCurId(''); }} className="min-h-10 rounded-[10px] border border-field bg-surface px-2 text-[13px]">
            {L.months.map((m) => <option key={m} value={m}>{ymJa(m)}</option>)}
          </select>
        )}
        <Link href="/keiri/chingin" className="inline-flex min-h-10 items-center rounded-[10px] border border-field bg-surface px-3.5 text-[13px] font-semibold">想定賃金・粗利へ</Link>
      </PageTitle>
      <LiveBanner state={state} error={error} onReload={reload} note={`今の請求書の画面で最後に計算した結果です${built ? `（${built}）` : ''}。確定・送付・勤務表の読み込み・格納は今の画面から（ここでは押せません）`} />

      {L.noCache || L.clients.length === 0 ? (
        <div className="rounded-xl border border-line bg-soft px-4 py-6 text-center text-[13px] text-muted">
          {ymJa(L.ym)}の計算結果がまだありません。今の社内システムの「請求書」の画面でこの月を一度開くと、ここにも出ます（ここからは計算し直しません）。
        </div>
      ) : (
        <>
          <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
            <RemainRing remain={remain.length} total={L.clients.length} />
            <div className="text-[13px]"><b>送付ずみでない会社 {remain.length}社</b><span className="ml-2 text-muted">今月請求する人 {L.people}人・止まっている {L.stop}人・下書きの合計 {yen(L.draftTotal)}（税込）</span></div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {SEIKYU_STAGES.map((s) => <span key={s} className="inline-flex items-center gap-1 text-[11.5px] text-muted"><StagePill s={s} /><b className="num text-ink">{L.counts[s]}</b></span>)}
            </div>
          </div>

          <div className="grid gap-3.5 md:grid-cols-[240px_1fr]">
            <ul className="mo-fade-up flex max-h-[70vh] flex-col gap-1 self-start overflow-y-auto rounded-xl border border-line bg-surface p-2" style={{ ['--i' as string]: 2 }}>
              {L.clients.map((c) => (
                <li key={c.id}><button onClick={() => setCurId(c.id)} aria-current={c.id === cur.id ? 'true' : undefined} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px]" style={c.id === cur.id ? { background: 'var(--al)', color: 'var(--ad)' } : undefined}>
                  {c.sent === c.people.length ? <Check size={14} className="text-ok" /> : <span className="num w-[14px] text-center text-[11px] text-faint">{c.people.length}</span>}
                  <span className={`min-w-0 flex-1 truncate ${c.id === cur.id ? 'font-bold' : ''}`}>{c.name}</span>
                  {c.stop > 0 && <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>止まり {c.stop}</span>}
                </button></li>
              ))}
            </ul>

            <article key={cur.id} className="mo-spring-in min-w-0 rounded-xl border border-line bg-surface" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-5 py-3">
                <span className="text-[18px] font-bold">{cur.name}</span>
                {cur.site && <span className="text-[12px] text-muted">{cur.site}</span>}
                <span className="ml-auto text-[12px] text-faint">{cur.people.length}人・送付ずみ {cur.sent}人</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-[13px]">
                  <thead><tr className="th-row text-left"><th className="px-5 py-2 font-semibold">社員</th><th className="px-2 py-2 font-semibold">段階・止まっている理由</th><th className="px-2 py-2 font-semibold">時間</th><th className="px-2 py-2 text-right font-semibold">下書き（税抜／税込）</th><th className="px-2 py-2 font-semibold">答え合わせ</th><th className="px-5 py-2" /></tr></thead>
                  <tbody>
                    {cur.people.map((p, i) => (
                      <tr key={p.key} className="row mo-fade-in border-t border-line-soft align-top" style={{ ['--i' as string]: i }}>
                        <td className="px-5 py-2.5"><span className="font-semibold">{p.name}</span>{p.genba && <div className="text-[11.5px] text-faint">{p.genba}</div>}</td>
                        <td className="px-2 py-2.5"><StagePill s={p.stage} />{p.reason && <div className={`mt-1 text-[12px] ${p.stage === 'needs' ? 'font-semibold text-bad' : 'text-muted'}`}>{p.reason}{p.more > 0 && <span className="text-faint">（ほか {p.more}件）</span>}</div>}{p.confirmedBy && <div className="mt-0.5 text-[11px] text-faint">確定：{p.confirmedBy}</div>}</td>
                        <td className="num px-2 py-2.5 text-[12.5px]">{p.hours}<div className="text-[11px] text-faint">{p.hoursFrom}</div></td>
                        <td className="num px-2 py-2.5 text-right">{p.total ? <><b>{yen(p.subtotal)}</b><div className="text-[11.5px] text-faint">{yen(p.total)}</div></> : <span className="text-faint">—</span>}</td>
                        <td className="px-2 py-2.5 text-[12px]">
                          {([['ミンミカ', p.mnm], ['freee', p.freee]] as const).map(([w, c]) => c && <div key={w}><span className="text-faint">{w} </span><span style={{ color: `var(--tone-${c.tone}-fg)` }}>{c.label}{c.kind !== 'match' && c.diff ? ` ${sgn(c.diff)}` : ''}</span></div>)}
                          {!p.mnm && !p.freee && <span className="text-faint">まだ請求書なし</span>}
                        </td>
                        <td className="px-5 py-2.5 text-right"><button disabled title={LIVE_WRITE_BLOCKED} className="min-h-8 whitespace-nowrap rounded-lg border border-field px-2.5 text-[12px] disabled:opacity-40">確定にする</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </>
      )}
      <p className="text-[11.5px] text-faint">段階・金額・答え合わせは今の社内システムの計算そのままで、ここでは計算し直していません。契約ごとの精算の決め方・消費税の扱いの最終判断は税理士・法務に確認してください。</p>
    </main>
  );
}
