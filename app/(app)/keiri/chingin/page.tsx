'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { CountUp, RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke, type LiveState } from '@/components/Live';
import { postLive } from '@/lib/live/post';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { hoursGap, toArari, wageParts, type ArariLive, type KintaiParts, type LiveArariRow } from '@/lib/live/chingin';
import { PersonName } from '@/components/Person';
import { savedPdfUrl, stampedPdfUrl } from '@/lib/live/seikyu-store';
import { ChinginPl } from './pl';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import type { MfKeihi } from '@/app/api/live/keihi-mf/route';
import type { KeihiAdminList } from '@/lib/live/keihi';

// 想定賃金・粗利（経理管理）。人ごとに 売上（請求・税抜）− 給与 − 交通費 − 法定福利（19%）＝ 粗利 と粗利率。
//   ・額面の正はミンミカの内定月給（現場の契約単価の欄は使わない）。内定が無い人は 仮21万
//   ・交通費は 経費の申請の実額 ＞ 定期代の見積もり ＞ 仮25,000円
//   ・「仮」の値が残っている人を、選ぶだけで本当の値に置きかえて片づける
//   ・粗利率の低い人を上に。取引先・営業で絞る
//   本物（ログイン中）：今の GET /api/seikyu?action=arari（請求書ベースの粗利）を読む。金額は今の API の答えのまま。
//     給与・交通費を手で直す（10-26）：欄に入れて離れたら保存（/api/live/arari → 今の POST arari-salary / arari-fare）。
//     空にすると元（額面／経費の申請か 仮 25,000円）に戻す。保存したら読み直し・取り消しは toast から（前の値に戻す）
//     マネフォの月（10-26 shoya「MF の9月分の交通費は想定粗利にある人は写して」）：MF の申請（承認済み・承認待ち）を人ごとに足し、
//     この表にいる人の交通費の欄へ同じ口（arari-fare＝手で直した値）でまとめて入れる。選んで確認の窓を出してから書く
const WELFARE_RATE = 0.19; // 法定福利の率（今の API が rates.welfare を返さないときだけ使う）
const yen = (n: number) => `${n < 0 ? '−' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`;
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const rateTone = (r: number) => (r < 0.15 ? 'bad' : r < 0.25 ? 'warn' : 'ok');
const uniq = (xs: string[]) => [...new Set(xs)];

// 売上は税込で見せる（10-26 shoya）。消費税10%・円未満切り捨て。粗利・粗利率は税抜のまま
const taxIn = (n: number) => n + Math.floor(n * 0.1);

export default function ChinginPage() {
  const [ym, setYm] = useState('');
  const lv = useIke<ArariLive>(`seikyu?action=arari${ym ? `&ym=${ym}` : ''}`);
  if (lv.live && lv.data) return <LiveChingin d={lv.data} ym={ym || lv.data.ym} setYm={setYm} state={lv.state} error={lv.error} reload={lv.reload} />;
  // 読み込み中・読めない・ログインなし：見本は出さない（10-26）
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="想定賃金・粗利" sub="売上（請求・税抜）− 給与 − 交通費 − 法定福利（19%）＝ 粗利。粗利率の低い人を上に">
        <Link href="/keiri/seikyu" className="btn-secondary">請求書へ</Link>
      </PageTitle>
      <LiveBanner state={lv.state} error={lv.error} onReload={lv.reload} />
      {lv.state === 'loading' && <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-muted">読み込み中…</div>}
      {lv.live && <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-muted">まだありません</div>}
    </main>
  );
}

// ---------------- 本物（今の「請求書ベースの粗利」の答えをそのまま出す・見るだけ） ----------------
const ymJa = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月分`;
function LiveChingin({ d, ym, setYm, state, error, reload }: { d: ArariLive; ym: string; setYm: (v: string) => void; state: LiveState; error: string; reload: () => void }) {
  // 未経験の人だけ（今のプロパーリストに入っている人）。売上・原価・粗利の合計も絞った人で出す（計算そのものは今の答えのまま）
  const mk = useMikeiken();
  const canEdit = usePerms().can('keiri', 'edit');
  // 交通費は 申請が来ている人をその額に（手で直した値がある人はそのまま・10-28）。粗利・粗利率はこの差だけ出し直す（法定福利は給与にだけ掛かる）
  const { kh, fares } = useAppliedFares(d.ym);
  const rows = mk.keep(toArari(d), 'name').map((r) => {
    const f = r.fareManual ? undefined : fares.get(nk(r.name));
    if (!f) return r;
    const fare = f.ike + f.mf;
    const gross = r.gross + r.fare - fare;
    return { ...r, fare, gross, rate: r.sales ? gross / r.sales : 0, fareLabel: `${fareNoteOf(f)}（承認前も）`, temp: r.temp && r.salaryLabel.startsWith('仮'), fareApplied: true };
  });
  const fareN = rows.filter((r) => 'fareApplied' in r).length;
  const [client, setClient] = useState('すべて');
  const [shozoku, setShozoku] = useState('すべて');
  const [gapOnly, setGapOnly] = useState(false);
  const gapped = rows.filter((r) => Math.abs(hoursGap(r) ?? 0) >= GAP_H);
  const shown = rows.filter((r) => (client === 'すべて' || r.company === client) && (shozoku === 'すべて' || r.shozoku === shozoku) && (!gapOnly || gapped.includes(r))).sort((a, b) => a.rate - b.rate);
  const sum = shown.reduce((s, r) => ({ billed: s.billed + r.sales, cost: s.cost + r.salary + r.fare + r.welfare, gross: s.gross + r.gross }), { billed: 0, cost: 0, gross: 0 });
  const temp = rows.filter((r) => r.temp);
  // 締め方（10-26 shoya）：freee 勤怠の仮締め（勤怠×単価、送った freee 請求書がある人はその額）／請求書締め（先方に出した押印ずみ PDF＝格納した請求書の額）
  const [shime, setShimeRaw] = useState<'invoice' | 'kari'>('invoice');
  useEffect(() => { try { if (localStorage.getItem('v2_chingin_shime') === 'kari') setShimeRaw('kari'); } catch { /* なくても動く */ } }, []);
  const setShime = (v: 'invoice' | 'kari') => { setShimeRaw(v); try { localStorage.setItem('v2_chingin_shime', v); } catch { /* なくても動く */ } };
  const tabs = (
    <div role="tablist" aria-label="締め方" className="flex gap-1 border-b border-line">
      {([['kari', 'freee勤怠 仮締め', '勤怠の時間×契約単価で見込む（送った freee 請求書がある人はその額）'], ['invoice', '請求書締め', '先方に出した押印ずみの請求書 PDF（格納したもの）の額で売上を締める']] as const).map(([k, l, tip]) => (
        <button key={k} type="button" role="tab" aria-selected={shime === k} title={tip} onClick={() => setShime(k)} className="whitespace-nowrap px-4 py-2.5 text-body"
          style={shime === k ? { borderBottom: '2px solid var(--a)', color: 'var(--ad)', fontWeight: 700 } : { borderBottom: '2px solid transparent', color: 'var(--color-muted)' }}>{l}</button>
      ))}
    </div>
  );
  if (shime === 'kari') return <KariShime tabs={tabs} />;
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="想定賃金・粗利" sub={`${ymJa(d.ym)}・請求書締め。格納した請求書の売上（税抜）− 給与 − 交通費 − 法定福利（${Math.round((d.rates?.welfare ?? WELFARE_RATE) * 100)}%）＝ 粗利。粗利率の低い人を上に`}>
        {d.months?.length > 0 && (
          <select aria-label="作業月" value={ym} onChange={(e) => setYm(e.target.value)} className="min-h-10 rounded-[10px] border border-field bg-surface px-2 text-body">
            {d.months.map((m) => <option key={m} value={m}>{ymJa(m)}</option>)}
          </select>
        )}
        <Link href="/keiri/seikyu" className="btn-secondary">請求書へ</Link>
      </PageTitle>
      {tabs}
      <LiveBanner state={state} error={error} onReload={reload} note="請求書締め：先方に出した押印ずみの請求書 PDF（格納したもの）の額で売上を出します。今の「請求書ベースの粗利」の計算そのままです。給与は freee の勤怠から出した想定賃金（額面＋残業代−控除）。打刻0日・freee に勤怠が無い人は0円（直すなら給与の欄で）。freee の勤怠は毎朝5時すぎに前月・当月を取り込んだ分を読みます（開くたびには取りに行きません）。給与・交通費は欄に入れて離れると保存（空にすると元に戻る・今の画面と同じ値）" />
      <MikeikenNote mk={mk} live={true} />
      {d.kintaiSyncedAt && <div className="text-xs text-faint">freee の勤怠：{new Date(d.kintaiSyncedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} に取り込んだ分（毎朝更新）</div>}
      {d.kintaiNote && <div className="rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)', borderColor: 'var(--tone-warn-bar)' }}>{d.kintaiNote}</div>}

      <div className="mo-fade-up grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" style={{ ['--i' as string]: 1 }}>
        {([['売上（請求・税込）', taxIn(sum.billed)], ['原価（給与＋交通費＋法定福利）', sum.cost], ['粗利', sum.gross]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-sm text-muted">{l}</div>
            <div className="text-xl font-bold">{v < 0 ? '−' : ''}¥<CountUp to={Math.abs(v)} /></div>
            {l === '売上（請求・税込）' && <div className="text-sm text-muted">税抜 {yen(sum.billed)}（粗利は税抜で計算）</div>}
            {l === '粗利' && <div className={`text-sm text-${rateTone(sum.billed ? sum.gross / sum.billed : 0)}`}>粗利率 {pct(sum.billed ? sum.gross / sum.billed : 0)}</div>}
          </div>
        ))}
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <RemainRing remain={temp.length} total={rows.length} />
          <div className="text-sm"><b>仮の値が残る {temp.length}人</b><div className="text-muted">給与・交通費の欄に本当の値を入れると片づきます</div></div>
        </div>
      </div>
      {(fareN > 0 || kh.state === 'error') && <div className="text-xs text-faint">交通費は 申請が来ている {fareN}人をその額に（承認前・差し戻しも含む・取下げは除く・手で直した人はそのまま）{kh.state === 'error' && <span className="text-warn">・いけどんの申請が読めませんでした</span>}</div>}
      <MfFareImport rows={rows} ym={d.ym} canEdit={canEdit} onDone={reload} />
      {d.unknown?.length > 0 && <div className="rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)', borderColor: 'var(--tone-warn-bar)' }}>誰の分か決まらない請求書が {d.unknown.length}件あります（粗利に入っていません）。今の請求書作成の「格納」で人を選んでください。</div>}

      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 text-sm">
          <label className="flex items-center gap-1.5 text-muted">取引先
            <select value={client} onChange={(e) => setClient(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-ink">{['すべて', ...uniq(rows.map((r) => r.company))].map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="flex items-center gap-1.5 text-muted">所属
            <select value={shozoku} onChange={(e) => setShozoku(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-ink">{['すべて', ...uniq(rows.map((r) => r.shozoku))].map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="flex items-center gap-1.5 text-muted" title={`現場勤怠（上位に請求する時間）と freee 勤怠（給与の元）が ${GAP_H}h 以上ちがう人だけ`}>
            <input type="checkbox" checked={gapOnly} onChange={(e) => setGapOnly(e.target.checked)} />freee と現場の差がある人だけ（{gapped.length}人）
          </label>
          <span className="ml-auto text-faint">{shown.length}人・粗利率の低い順</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1140px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 font-semibold">取引先・所属</th><th className="px-2 py-2.5 text-right font-semibold">勤怠（freee）</th><th className="px-2 py-2.5 text-right font-semibold" title="上位に請求する時間（勤務表勤怠表で手で入れた時間＞勤務表から読んだ時間）。粗利の計算には使いません">現場勤怠・差</th><th className="px-2 py-2.5 text-right font-semibold">売上（税込）</th><th className="px-2 py-2.5 font-semibold">請求書</th><th className="px-2 py-2.5 text-right font-semibold">給与</th><th className="px-2 py-2.5 text-right font-semibold">交通費</th><th className="px-2 py-2.5 text-right font-semibold">法定福利</th><th className="px-2 py-2.5 text-right font-semibold">粗利</th><th className="px-4 py-2.5 text-right font-semibold">粗利率</th>
            </tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-muted">この月の請求書がまだありません（または絞り込みに当たる人がいません）。</td></tr>}
              {shown.map((r, i) => {
                const t = rateTone(r.rate);
                return (
                  <tr key={r.key} className="row mo-fade-in border-t border-line-soft align-top" style={{ ['--i' as string]: i }}>
                    <td className="px-4 py-2.5"><PersonName name={r.name} className="font-semibold underline-offset-2 hover:underline" />{r.temp && <div><span className="chip" title="給与・交通費の欄に本当の値を入れると片づきます" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>仮の値あり</span></div>}{r.warn.map((w) => <div key={w} className="text-xs text-bad">{w}</div>)}</td>
                    <td className="px-2 py-2.5">{r.company}<div className="text-xs text-faint">{r.shozoku}</div></td>
                    <td className="num px-2 py-2.5 text-right"><KintaiCell k={r.kintai} /></td>
                    <td className="num px-2 py-2.5 text-right"><SiteCell r={r} /></td>
                    <td className="num px-2 py-2.5 text-right">{yen(taxIn(r.sales))}<div className="whitespace-nowrap text-xs text-faint">税抜 {yen(r.sales)}</div>{r.fromYms.length > 0 && <div className="whitespace-nowrap text-xs text-faint" title="後の月の請求書に「◯月稼働分」として載っていた分を、締めの月で入れています">{r.fromYms.map((m) => `${Number(m.slice(5))}月`).join('・')}の請求書から</div>}</td>
                    <td className="w-44 max-w-44 px-2 py-2.5 text-xs">{r.files.length === 0 ? <span className="text-faint">なし</span> : r.files.map((f) => (
                      <div key={f.id} className="mb-1 min-w-0">
                        <a href={f.saved ? savedPdfUrl(f.id) : stampedPdfUrl(f.id)} target="_blank" rel="noreferrer" title={f.label} className="block truncate underline underline-offset-2" style={{ color: 'var(--ad)' }}>{f.label.replace(/_.*$/, '')}</a>
                        {f.rows.length > 0 ? f.rows.map((x, j) => <div key={j} className="flex min-w-0 gap-1 text-faint" title={x.d}><span className="min-w-0 flex-1 truncate">{x.d}</span><span className="num shrink-0">{x.a.toLocaleString('ja-JP')}</span></div>)
                          : <div className="num text-faint">{yen(f.amount)}</div>}
                        {f.fromYm && <div className="text-faint">{Number(f.fromYm.slice(5))}月の請求書</div>}
                      </div>))}</td>
                    <td className="num px-2 py-2.5 text-right"><EditYen r={r} kind="salary" ym={d.ym} canEdit={canEdit} onSaved={reload} /><div className="text-xs text-faint">{r.salaryLabel}</div>{!r.salaryManual && r.kintai && <div className="ml-auto max-w-52 text-xs text-faint" title={r.salaryFromKintai ? 'freee の勤怠から出した給与の内訳' : 'freee の打刻から出した見込み（打刻が無い・少ないので給与には入れていません）'}>{r.salaryFromKintai ? '' : '勤怠の見込み：'}{wageParts(r.kintai)}</div>}</td>
                    <td className="num px-2 py-2.5 text-right"><EditYen r={r} kind="fare" ym={d.ym} canEdit={canEdit} onSaved={reload} /><div className="text-xs text-faint">{r.fareLabel}</div></td>
                    <td className="num px-2 py-2.5 text-right text-muted">{yen(r.welfare)}</td>
                    <td className="num px-2 py-2.5 text-right font-bold">{yen(r.gross)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="chip num" style={{ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` }}>{pct(r.rate)}</span>
                      <div className="ml-auto mt-1 h-1.5 w-20 overflow-hidden rounded-full" style={{ background: 'var(--color-track)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, r.rate * 200))}%`, background: `var(--tone-${t}-bar, var(--tone-${t}-fg))` }} /></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-faint">売上は格納した請求書（税抜）。10月分からは、いけどんで作った請求書（保存した最新の版）を押印前でも入れます。法定福利は給与の19%で見積もった概算です。給与・社会保険料・税の扱いの最終判断は社労士・税理士に確認してください。</p>
      <ChinginPl live />
    </main>
  );
}

// マネフォの交通費をまとめて写す（10-26）。MF の CSV は1行＝1申請で、交通費とそれ以外の内訳が無い＝申請の合計をそのまま入れる
// 10-26 shoya「承認してない申請も一旦交通費に」→ 取消し以外は全部（下書き・差戻しも）
const MF_USE = new Set(['承認済み', '第一承認待ち', '差戻し', '下書き']);
const nk = (s: string) => s.replace(/[\s　]/g, '');
function MfFareImport({ rows, ym, canEdit, onDone }: { rows: LiveArariRow[]; ym: string; canEdit: boolean; onDone: () => void }) {
  const { hit, toast } = useMotivation();
  const mf = useLiveRoute<MfKeihi>(`/api/live/keihi-mf?ym=${ym}`);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const mfRows = mf.live && mf.data?.ym === ym ? mf.data.rows : [];
  const by = new Map<string, { yen: number; n: number; st: string[] }>();
  for (const x of mfRows) {
    if (!MF_USE.has(x.status)) continue;
    const t = by.get(nk(x.name)) || { yen: 0, n: 0, st: [] };
    t.yen += x.amount; t.n++; if (!t.st.includes(x.status)) t.st.push(x.status);
    by.set(nk(x.name), t);
  }
  const hits = rows.map((r) => ({ r, m: by.get(nk(r.name)) })).filter((x): x is { r: LiveArariRow; m: { yen: number; n: number; st: string[] } } => !!x.m);
  const done = hits.filter(({ r, m }) => r.fareManual && r.fare === m.yen);
  const todo = hits.filter((h) => !done.includes(h));
  const on = (h: (typeof hits)[number]) => pick[h.r.key] ?? !h.r.fareManual;   // 手で直した値がある人は既定で外す
  const sel = todo.filter(on);
  if (!mfRows.length) return null;
  const run = async () => {
    const prev = sel.map(({ r }) => ({ key: r.key, value: r.fareManual ? r.fare : null }));
    let ok = 0; const ng: string[] = [];
    for (const { r, m } of sel) {
      try { await postLive('/api/live/arari', { kind: 'fare', ym, key: r.key, value: m.yen }); ok++; } catch (e) { ng.push(`${r.name}（${(e as Error).message}）`); }
    }
    hit();
    toast({
      text: `マネフォの交通費を ${ok}人に入れました${ng.length ? `・入らなかった ${ng.length}人` : ''}`,
      sub: ng.length ? ng.join('、') : '→ 粗利を計算し直しました（今の請求書ベースの粗利にも同じ値が入ります）',
      undo: () => { Promise.all(prev.map((p) => postLive('/api/live/arari', { kind: 'fare', ym, ...p }))).then(onDone).catch((e) => toast({ text: '取り消せませんでした', sub: (e as Error).message })); },
    });
    setOpen(false); onDone();
  };
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
        <span><b>マネフォの{ymJa(ym)}の交通費</b><span className="ml-2 text-muted">この表にいる {hits.length}人（写し済み {done.length}人・まだ {todo.length}人）</span></span>
        <button type="button" className="btn-secondary btn-sm ml-auto" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? '閉じる' : '中身を見て写す'}</button>
      </div>
      {open && (
        <div className="border-t border-line-soft px-4 py-3">
          <p className="mb-2 text-xs text-muted">マネフォの申請（取消し以外＝承認済み・承認待ち・差戻し・下書き）を人ごとに足した額を、交通費の欄に入れます（手で直した値として残ります）。MF の CSV には交通費とそれ以外の内訳が無いので、申請の合計をそのまま入れます。手で直した値がある人は外してあります。</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-body">
              <thead><tr className="th-row text-left"><th className="w-8 px-2 py-2" /><th className="px-2 py-2 font-semibold">社員</th><th className="px-2 py-2 text-right font-semibold">今の交通費</th><th className="px-2 py-2 text-right font-semibold">マネフォ</th><th className="px-2 py-2 font-semibold">マネフォの申請</th></tr></thead>
              <tbody>
                {hits.map((h) => {
                  const isDone = done.includes(h);
                  return (
                    <tr key={h.r.key} className={`border-t border-line-soft ${isDone ? 'opacity-50' : ''}`}>
                      <td className="px-2 py-1.5"><input type="checkbox" aria-label={`${h.r.name} を写す`} disabled={isDone || !canEdit} checked={!isDone && on(h)} onChange={(e) => setPick({ ...pick, [h.r.key]: e.target.checked })} /></td>
                      <td className="px-2 py-1.5 font-semibold">{h.r.name}</td>
                      <td className="num px-2 py-1.5 text-right">{yen(h.r.fare)}<div className="text-xs text-faint">{h.r.fareLabel}</div></td>
                      <td className="num px-2 py-1.5 text-right font-semibold">{yen(h.m.yen)}</td>
                      <td className="px-2 py-1.5 text-sm text-muted">{isDone ? '写し済み' : `${h.m.n}件・${h.m.st.join('・')}`}</td>
                    </tr>
                  );
                })}
                {hits.length === 0 && <tr><td colSpan={5} className="px-2 py-6 text-center text-sm text-muted">この表にいる人で、マネフォに申請がある人はいません</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted">{sel.length}人を選んでいます</span>
            <button type="button" className="btn-primary btn-sm ml-auto" disabled={!canEdit || !sel.length} title={!canEdit ? needText('edit') : undefined}
              onClick={() => setConfirm({
                title: `マネフォの交通費を ${sel.length}人に入れる`, okLabel: '交通費に入れる',
                lines: [`${ymJa(ym)}の交通費の欄に、マネフォの申請の合計を入れます（${yen(sel.reduce((t, x) => t + x.m.yen, 0))}）`, '今の請求書ベースの粗利にも同じ値が入ります（手で直した値として残る・欄を空にすると元に戻る）', '入れたあと、知らせの「取り消す」でまとめて前の値に戻せます'],
                run,
              })}>選んだ人に入れる</button>
          </div>
        </div>
      )}
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

// 申請が来た交通費（10-26 仮締め・10-28 請求書締めにも shoya「想定粗利に交通費ぶちこんで 申請きたもの」）：
//   いけどん＝取下げ以外の申請（申請中・差し戻し・承認・支払済）の通勤費／マネフォ＝取消し以外の合計 を人ごとに足す。承認を待たない
function useAppliedFares(ym: string) {
  const kh = useIke<KeihiAdminList>(`keihi?action=adminList&status=all&ym=${ym}`);
  const mf = useLiveRoute<MfKeihi>(`/api/live/keihi-mf?ym=${ym}`);
  const fares = new Map<string, { ike: number; mf: number }>();
  for (const c of kh.live && kh.data?.claims ? kh.data.claims : []) {
    if (c.ym !== ym || c.status === '取下げ' || !(Number(c.commute_yen) > 0)) continue;
    const k = nk(c.linked_name || ''); if (!k) continue;
    const t = fares.get(k) || { ike: 0, mf: 0 }; t.ike += Number(c.commute_yen); fares.set(k, t);
  }
  for (const x of mf.live && mf.data?.ym === ym ? mf.data.rows : []) {
    if (!MF_USE.has(x.status)) continue;
    const t = fares.get(nk(x.name)) || { ike: 0, mf: 0 }; t.mf += x.amount; fares.set(nk(x.name), t);
  }
  return { kh, fares };
}
const fareNoteOf = (f: { ike: number; mf: number }) => [f.ike ? 'いけどんの申請' : '', f.mf ? 'マネフォ' : ''].filter(Boolean).join('＋');

// 給与・交通費の欄（10-26）：入れて離れたら（Enter でも）保存。空にすると元に戻す。取り消しは前の値（手で直していなければ元）に戻す
function EditYen({ r, kind, ym, canEdit, onSaved }: { r: LiveArariRow; kind: 'salary' | 'fare'; ym: string; canEdit: boolean; onSaved: () => void }) {
  const { hit, toast } = useMotivation();
  const cur = kind === 'salary' ? r.salary : r.fare;
  const manual = kind === 'salary' ? r.salaryManual : r.fareManual;
  const label = kind === 'salary' ? '給与' : '交通費';
  const fmt = (n: number) => n.toLocaleString('ja-JP');
  const [v, setV] = useState(fmt(cur));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(fmt(cur)); }, [cur]);
  const put = (value: number | null) => postLive('/api/live/arari', { kind, ym, key: r.key, value });
  const save = async () => {
    const t = v.replace(/[,，円¥\s]/g, '');
    if (t === '' ? !manual : t === String(cur)) { setV(fmt(cur)); return; }   // 変わっていない（空は手で直した値があるときだけ「元に戻す」）
    if (t !== '' && !/^\d+$/.test(t)) { toast({ text: `${label}は数字で入れてください` }); setV(fmt(cur)); return; }
    const value = t === '' ? null : Number(t);
    const prev = manual ? cur : null;
    setBusy(true);
    try {
      await put(value);
      hit();
      toast({
        text: value == null ? `${r.name} の${label}を元に戻しました` : `${r.name} の${label}を ${yen(value)} にしました`,
        sub: '→ 粗利を計算し直しました（今の請求書ベースの粗利にも同じ値が入ります）',
        undo: () => { put(prev).then(onSaved).catch((e) => toast({ text: '取り消せませんでした', sub: (e as Error).message })); },
      });
      onSaved();
    } catch (e) { toast({ text: '保存できませんでした', sub: (e as Error).message }); setV(fmt(cur)); }
    finally { setBusy(false); }
  };
  return (
    <input aria-label={`${r.name} の${label}`} inputMode="numeric" value={v} disabled={!canEdit || busy} title={canEdit ? `${label}を直すと保存します（空にすると元に戻ります）` : needText('edit')}
      onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="num w-28 rounded-md border bg-surface px-1.5 py-0.5 text-right disabled:border-transparent disabled:bg-transparent"
      style={{ borderColor: manual ? 'var(--a)' : 'var(--color-field)' }} />
  );
}

// ---------------- freee 勤怠の仮締め（今の GET /api/chingin?action=month-summary&rows=1 をそのまま・見るだけ） ----------------
type KariRow = KintaiParts & { key: string; name: string; eligible: boolean; shozoku?: string; sales: number; salesEst?: number; wage: number; shaho: number; fare: number; grossNet: number; issues?: string[] };
type KariSum = { ok?: boolean; summary?: { ym: string; label: string; provisional: boolean; through: string }; rows?: KariRow[]; error?: { kind?: string; message?: string } | string };
const kariYm = (back: number) => { const j = new Date(Date.now() + 9 * 3600e3); const d = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() - back, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
function KariShime({ tabs }: { tabs: React.ReactNode }) {
  const mk = useMikeiken();
  const [ym, setYm] = useState(kariYm(0));
  const r = useIke<KariSum>(`chingin?action=month-summary&ym=${ym}&rows=1`);
  const [shozoku, setShozoku] = useState('すべて');
  // 交通費（10-26 shoya「承認してない申請も一旦交通費に」）：今の仮締めは全員一律（設定の月額）なので、
  //   その月の申請（いけどん：取下げ以外の通勤費・マネフォ：取消し以外の合計）がある人だけ、その額に置きかえて粗利を出し直す
  const { kh, fares } = useAppliedFares(ym);
  const all: (KariRow & { fareNote?: string })[] = (r.data?.ok && r.data.rows ? mk.keep(r.data.rows, 'name').filter((x) => x.eligible) : []).map((x) => {
    const f = fares.get(nk(x.name));
    if (!f) return x;
    const fare = f.ike + f.mf;
    return { ...x, fare, grossNet: x.grossNet + x.fare - fare, fareNote: fareNoteOf(f) };
  });
  const fareN = all.filter((x) => x.fareNote).length;
  const rate = (x: KariRow) => (x.sales ? x.grossNet / x.sales : 0);
  const shown = all.filter((x) => shozoku === 'すべて' || (x.shozoku || '') === shozoku).sort((a, b) => rate(a) - rate(b));
  const sum = shown.reduce((t, x) => ({ billed: t.billed + x.sales, cost: t.cost + x.wage + x.fare + x.shaho, gross: t.gross + x.grossNet }), { billed: 0, cost: 0, gross: 0 });
  const billedN = shown.filter((x) => x.salesEst !== undefined && x.salesEst !== null).length;
  const sm = r.data?.summary;
  const err = r.data && !r.data.ok ? (typeof r.data.error === 'string' ? r.data.error : r.data.error?.kind === 'roster' ? 'この月の名簿がありません' : r.data.error?.message || '読めませんでした') : '';
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="想定賃金・粗利" sub={`${ymJa(ym)}・freee勤怠 仮締め。勤怠の時間×契約単価の見込み（送った freee 請求書がある人はその額）− 給与 − 交通費 − 社保 ＝ 粗利`}>
        <select aria-label="作業月" value={ym} onChange={(e) => setYm(e.target.value)} className="min-h-10 rounded-[10px] border border-field bg-surface px-2 text-body">
          {[0, 1, 2, 3, 4, 5].map((b) => kariYm(b)).map((m) => <option key={m} value={m}>{ymJa(m)}</option>)}
        </select>
        <Link href="/keiri/seikyu" className="btn-secondary">請求書へ</Link>
      </PageTitle>
      {tabs}
      <LiveBanner state={r.state} error={r.error || err} onReload={r.reload} note={`freee勤怠 仮締め：今の想定賃金の「月ごと」の計算そのままです${sm?.provisional ? `（月の途中・${sm.through || ''}までの勤怠）` : ''}。確定は「請求書締め」で`} />
      <MikeikenNote mk={mk} live={true} />
      <div className="mo-fade-up grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        {([['売上（見込み）', sum.billed], ['原価（給与＋交通費＋社保）', sum.cost], ['粗利', sum.gross]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-sm text-muted">{l}</div>
            <div className="text-xl font-bold">{v < 0 ? '−' : ''}¥<CountUp to={Math.abs(v)} /></div>
            {l === '粗利' && <div className={`text-sm text-${rateTone(sum.billed ? sum.gross / sum.billed : 0)}`}>粗利率 {pct(sum.billed ? sum.gross / sum.billed : 0)}</div>}
          </div>
        ))}
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          <b>freee 請求書で確定 {billedN}人</b><div className="text-muted">残り {shown.length - billedN}人は勤怠の見込み</div>
          <div className="mt-1 text-muted">交通費は申請のある {fareN}人をその額に（承認前・差戻し・下書きも含む）{kh.state === 'error' && <span className="text-warn">・いけどんの申請が読めませんでした</span>}</div>
        </div>
      </div>
      <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 text-sm">
          <label className="flex items-center gap-1.5 text-muted">所属
            <select value={shozoku} onChange={(e) => setShozoku(e.target.value)} className="min-h-8 rounded-lg border border-field bg-surface px-2 text-ink">{['すべて', ...uniq(all.map((x) => x.shozoku || '').filter(Boolean))].map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <span className="ml-auto text-faint">{shown.length}人・粗利率の低い順</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-body">
            <thead><tr className="th-row text-left">
              <th className="px-4 py-2.5 font-semibold">社員</th><th className="px-2 py-2.5 text-right font-semibold">勤怠（freee）</th><th className="px-2 py-2.5 text-right font-semibold">売上</th><th className="px-2 py-2.5 text-right font-semibold">給与</th><th className="px-2 py-2.5 text-right font-semibold">交通費</th><th className="px-2 py-2.5 text-right font-semibold">社保</th><th className="px-2 py-2.5 text-right font-semibold">粗利</th><th className="px-4 py-2.5 text-right font-semibold">粗利率</th>
            </tr></thead>
            <tbody>
              {r.state === 'loading' && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">読み込み中…</td></tr>}
              {r.state !== 'loading' && shown.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">{err || 'この月の勤怠がまだありません'}</td></tr>}
              {shown.map((x) => {
                const t = rateTone(rate(x)); const billed = x.salesEst !== undefined && x.salesEst !== null;
                return (
                  <tr key={x.key} className="row border-t border-line-soft align-top">
                    <td className="px-4 py-2.5"><PersonName name={x.name} className="font-semibold underline-offset-2 hover:underline" /><div className="text-xs text-faint">{x.shozoku || ''}</div>{(x.issues || []).slice(0, 2).map((w) => <div key={w} className="text-xs text-bad">{w}</div>)}</td>
                    <td className="num px-2 py-2.5 text-right"><KintaiCell k={x} /></td>
                    <td className="num px-2 py-2.5 text-right">{yen(x.sales)}<div className="text-xs text-faint">{billed ? `freee 請求書（見込み ${yen(x.salesEst!)}）` : '勤怠×単価'}</div></td>
                    <td className="num px-2 py-2.5 text-right">{yen(x.wage)}<div className="whitespace-nowrap text-xs text-faint">{wageParts(x)}</div></td>
                    <td className="num px-2 py-2.5 text-right">{yen(x.fare)}<div className="text-xs text-faint">{x.fareNote || '一律（設定の月額）'}</div></td>
                    <td className="num px-2 py-2.5 text-right text-muted">{yen(x.shaho)}</td>
                    <td className="num px-2 py-2.5 text-right font-bold">{yen(x.grossNet)}</td>
                    <td className="px-4 py-2.5 text-right"><span className="chip num" style={{ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` }}>{pct(rate(x))}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-faint">仮締めは勤怠からの見込みです。売上の確定は「請求書締め」（先方に出した押印ずみの請求書）で見てください。給与・社会保険料・税の扱いの最終判断は社労士・税理士に確認してください。</p>
      <ChinginPl live />
    </main>
  );
}

// 勤怠の欄：総労働（有給のみなし込み）と残業・欠勤（今の想定賃金の計算の値をそのまま）
// 現場勤怠（上位に請求する時間）と freee 勤怠（給与の元）の差（10-27 shoya「freee 勤怠と現場勤怠の差を示して」）。差＝現場 − freee
const GAP_H = 1;   // これ以上ちがうと色を付けて「差がある人」に数える
function SiteCell({ r }: { r: LiveArariRow }) {
  if (!r.site) return <span className="text-faint" title="勤務表の時間が読めていない・手で入れていない">—</span>;
  const g = hoursGap(r);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return (
    <>
      {r1(r.site.hours)}h
      <div className="whitespace-nowrap text-xs text-faint">{r.site.src === 'manual' ? '手で入れた時間' : '勤務表から'}</div>
      {g != null && <div className={`whitespace-nowrap text-xs ${Math.abs(g) >= GAP_H ? 'font-semibold text-warn' : 'text-faint'}`} title="現場勤怠 − freee 勤怠">差 {g > 0 ? '+' : g < 0 ? '−' : '±'}{r1(Math.abs(g))}h</div>}
    </>
  );
}

function KintaiCell({ k }: { k: KintaiParts | null | undefined }) {
  if (!k || k.hours == null) return <span className="text-faint">—</span>;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return (
    <>
      {r1(k.hours)}h
      <div className={`whitespace-nowrap text-xs ${(k.otHours || 0) >= 45 ? 'text-bad' : (k.otHours || 0) > 0 ? 'text-warn' : 'text-faint'}`}>残業 {r1(k.otHours || 0)}h</div>
      {((k.utHours || 0) > 0 || (k.absentDays || 0) > 0) && <div className="whitespace-nowrap text-xs text-faint">{(k.utHours || 0) > 0 ? `不足 ${r1(k.utHours || 0)}h` : ''}{k.absentDays ? ` 欠勤${k.absentDays}日` : ''}</div>}
    </>
  );
}
