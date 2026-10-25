'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, Pencil, RefreshCw, Search, Trash2, TriangleAlert, Users, X } from 'lucide-react';
import { PageTitle, SkeletonRows } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { Dialog } from '@/components/Dialog';
import { Z } from '@/lib/layers';
import { sampleInterviews } from '@/lib/mendan-sample';
import { postLive } from '@/lib/live/post-live';
import type { EngineerRows } from '@/lib/live/eigyo-common';
import {
  IV_CLOSED, IV_LOCATIONS, IV_PRE, IV_PROGRESS, IV_STATUSES, IV_WAIT, ivAuto, ivCol, ivFromLocalInput, ivKpi, ivMonth, ivStat,
  ivTimeHint, ivToLocalInput, ivUsable, jstMonthNow, type IvRec,
} from '@/lib/live/mendan';

// 面談管理（営業）＝今の /interviews.html を写したもの。
//   ・月を選ぶ → 数字（面談数・成約・決定率・全件比・ステータス未入力）／カンバン／着地ゾーン／一覧 がその月に変わる
//   ・カードを別の列・着地ゾーンにドラッグ＝ステータスを変える（取り消すあり）。「面談前」は自動の列なので戻せない
//   ・ステータスが空の面談は、日時で「面談前」「結果待ち（自動）」に見せるだけ（書き換えない・今と同じ）
//   ・追加・編集は Google カレンダーの予定も作る/直す。削除はカレンダーの予定も消える（確かめてから）
//   ・成約にすると営業リストの「参画決定」に反映（氏名が1人に決まるときだけ・今と同じ）。辞退は反映しない
//   本物（ログイン中）：読む＝今の /api/proxy?action=getInterviews、書く＝/api/live/mendan（行き先は決め打ち）
//   人は未経験の人だけ（今のプロパーリストに入っている人）

const PAGE = 20;
const DLG_Z = [Z.drawer - 2, Z.drawer - 1] as const;   // 名前の小窓（80）より下に出す
const ST_TONE: Record<string, { bg: string; fg: string }> = {
  [IV_PRE]: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' },
  結果待ち: { bg: 'var(--tone-caution-bg)', fg: 'var(--tone-caution-fg)' },
  '1回目通過': { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  '2回目通過': { bg: 'var(--tone-ok-bg)', fg: 'var(--tone-ok-fg)' },
  成約: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
  見送り: { bg: 'var(--tone-bad-bg)', fg: 'var(--tone-bad-fg)' },
  辞退: { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' },
};
const toneOf = (s: string) => ST_TONE[s] ?? { bg: 'var(--tone-mute-bg)', fg: 'var(--tone-mute-fg)' };
const monthLabel = (k: string) => (k === '__none__' ? '日時未定' : `${k.slice(0, 4)}年${Number(k.slice(5, 7))}月`);
const pctText = (a: number, b: number) => (b > 0 ? `${(Math.round((a / b) * 1000) / 10).toFixed(1)}%` : '―');
const whenText = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}:\d{2}))?/.exec(d || ''); return m ? `${Number(m[2])}/${Number(m[3])}${m[4] ? ` ${m[4]}` : ''}` : ''; };

type Form = { name: string; salesRep: string; date: string; location: string; status: string; trainer: string; caseInfo: string; memo: string };
const EMPTY: Form = { name: '', salesRep: '', date: '', location: '', status: '', trainer: '', caseInfo: '', memo: '' };
const formOf = (r: IvRec): Form => ({ name: r.name || '', salesRep: r.salesRep || '', date: ivToLocalInput(r.date), location: r.location || '', status: ivStat(r), trainer: r.trainer || '', caseInfo: r.caseInfo || '', memo: r.memo || '' });

type Reflected = { success?: boolean; skipped?: string; error?: string } | null;
const reflectText = (status: string, res: Reflected) => {
  if (status !== '成約') return status === '辞退' ? '営業リストの並行数を数え直します（辞退は営業リストに反映しません）' : '営業リストの並行数を数え直します';
  if (!res || res.success === false) return '営業リストへの反映は確かめられませんでした';
  if (res.skipped === 'already') return '営業リストは「参画決定」済みです';
  if (res.skipped) return '営業リストで本人を1人に決められず、反映していません';
  return '→ 営業リストの「参画決定」に反映しました';
};

export default function MendanPage() {
  const canEdit = usePerms().can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const iv = useIke<IvRec[]>('proxy?action=getInterviews', { pollMs: 60_000 });
  const live = iv.live;
  const mk = useMikeiken();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  // 本物は読んだ答え、見本はこの画面の中だけで動く行。書いた直後は手元を先に変える（読み直しで本物に揃う）
  const [sampleRows, setSampleRows] = useState<IvRec[] | null>(null);
  const [patch, setPatch] = useState<Record<string, Partial<IvRec> | null>>({});   // null＝消した
  useEffect(() => { if (iv.state === 'sample' && now && !sampleRows) setSampleRows(ivUsable(sampleInterviews(now))); }, [iv.state, now, sampleRows]);
  useEffect(() => { setPatch({}); }, [iv.data]);
  const base = useMemo(() => (live && Array.isArray(iv.data) ? ivUsable(mk.keep(iv.data, 'name')) : sampleRows ?? []), [live, iv.data, mk, sampleRows]);
  const rows = useMemo(() => base.filter((r) => patch[r.id] !== null).map((r) => (patch[r.id] ? { ...r, ...patch[r.id] } : r)), [base, patch]);
  const setRow = (id: string, p: Partial<IvRec> | null) => {
    if (!live) { setSampleRows((xs) => (xs ?? []).flatMap((r) => (r.id !== id ? [r] : p === null ? [] : [{ ...r, ...p }]))); return; }
    setPatch((s) => ({ ...s, [id]: p === null ? null : { ...(s[id] || {}), ...p } }));
  };

  // ---- 絞り込み（月はKPI・カンバン・一覧の全部／検索とステータスは一覧とカンバンだけ・今と同じ） ----
  const months = useMemo(() => {
    const c = new Map<string, number>();
    rows.forEach((r) => { const k = ivMonth(r); c.set(k, (c.get(k) || 0) + 1); });
    const keys = [...c.keys()].filter((k) => k !== '__none__').sort().reverse();
    return [...keys, ...(c.has('__none__') ? ['__none__'] : [])].map((k) => ({ k, n: c.get(k) || 0 }));
  }, [rows]);
  const [month, setMonth] = useState('');
  useEffect(() => {
    if (month && months.some((m) => m.k === month)) return;
    const cur = jstMonthNow();
    if (months.length) setMonth(months.some((m) => m.k === cur) ? cur : months[0].k);
  }, [months, month]);
  const [q, setQ] = useState('');
  const [sf, setSf] = useState('');
  const [page, setPage] = useState(1);
  const t = now ?? 0;
  const monthRows = useMemo(() => rows.filter((r) => ivMonth(r) === month), [rows, month]);
  const filtered = useMemo(() => monthRows.filter((r) => {
    const okQ = !q || `${r.name}${r.caseInfo}${r.memo}`.toLowerCase().includes(q.toLowerCase());
    const okS = !sf ? true : sf === '__pre' ? ivCol(r, t) === IV_PRE : sf === IV_WAIT ? ivCol(r, t) === IV_WAIT : r.status === sf;
    return okQ && okS;
  }), [monthRows, q, sf, t]);
  useEffect(() => { setPage(1); }, [q, sf, month]);
  const kpi = ivKpi(monthRows, t);

  // カンバンの列：面談前（自動）＋進行中＋知らないステータス（あれば）。着地ゾーンは終わり
  const extraCols = useMemo(() => [...new Set(filtered.map((r) => ivStat(r)).filter((s) => s && !(IV_STATUSES as readonly string[]).includes(s)))], [filtered]);
  const cols = [IV_PRE, ...IV_PROGRESS, ...extraCols];

  // ---- 書く ----
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const flashOn = (id: string) => { setFlash(id); setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400); };
  const syncParallel = useCallback(async (manual: boolean) => {
    if (!live) { if (manual) toast({ text: '並行数を営業リストに反映しました', sub: '見本なので、どこにも書いていません' }); return; }
    const r = await postLive<{ updated?: number }>('/api/live/mendan', { op: 'parallel' });
    if (!manual) return;
    if (!r.ok) { setErr(`並行数を反映できませんでした：${r.error}`); return; }
    hit(); toast({ text: '営業リストの「並行」を今月の進行中の件数に揃えました', sub: `直した人 ${r.j.updated ?? 0}人（変わった人だけ書きます）` });
  }, [live, hit, toast]);

  // 取り消すはあとから呼ばれるので、その時点の行を見る（描いたときの行ではなく）
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const changeStatus = async (id: string, status: string, opts?: { noUndo?: boolean }) => {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row || !canEdit || ivStat(row) === status) return;
    const prev = ivStat(row);
    setErr('');
    setRow(id, { status });
    flashOn(id);
    const sub = [row.name ? `${row.name}さん` : '', whenText(row.date) && `面談 ${whenText(row.date)}`, row.salesRep && `担当 ${row.salesRep}`].filter(Boolean).join('・');
    const undo = opts?.noUndo ? undefined : () => { void changeStatus(id, prev, { noUndo: true }); };
    if (!live) {
      hit(); toast({ text: `面談を「${status || '未設定'}」に`, sub: `${sub}（見本なので保存していません）`, undo });
      return;
    }
    const r = await postLive<{ reflected?: Reflected }>('/api/live/mendan', { op: 'status', id, status, name: row.name });
    if (!r.ok) { setRow(id, { status: prev }); setErr(`ステータスを変えられませんでした：${r.error}`); return; }
    hit();
    toast({ text: `面談を「${status || '未設定'}」に`, sub: `${reflectText(status, r.j.reflected ?? null)}${sub ? `・${sub}` : ''}${status === '成約' && undo ? '（取り消しても参画決定は戻りません）' : ''}`, undo });
    void syncParallel(false);
    iv.reload();
  };

  // ---- ドラッグ ----
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const drop = (col: string) => {
    const id = drag; setDrag(null); setOver(null);
    if (!id) return;
    if (col === IV_PRE) { setNotice('「面談前」へは戻せません（日時で自動に分けている列です）'); setTimeout(() => setNotice(''), 3000); return; }
    void changeStatus(id, col);
  };
  const dragProps = (col: string) => ({
    onDragOver: (e: React.DragEvent) => { if (drag) { e.preventDefault(); setOver(col); } },
    onDragLeave: () => setOver((o) => (o === col ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); drop(col); },
  });

  // ---- 窓 ----
  const [detail, setDetail] = useState<IvRec | null>(null);
  const [edit, setEdit] = useState<IvRec | null>(null);
  const [adding, setAdding] = useState(false);
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const salesReps = useMemo(() => [...new Set(rows.map((r) => r.salesRep).filter(Boolean))].sort(), [rows]);
  const trainers = useMemo(() => [...new Set(rows.map((r) => r.trainer).filter(Boolean))].sort(), [rows]);

  const ready = now != null && (iv.state === 'sample' ? !!sampleRows : iv.state === 'live');
  return (
    <main className="flex flex-col gap-3.5 px-4 pb-12 pt-[22px] sm:px-6">
      <PageTitle title="面談管理" sub={`面談の予定と結果。カードをドラッグするとステータスが変わります${live ? '' : '・見本データ'}`}>
        <button onClick={() => void syncParallel(true)} disabled={!canEdit} title={!canEdit ? needText('edit') : '今月の進行中の面談の件数を、営業リストの「並行」に入れ直します'}
          className="btn-secondary"><Users size={14} />並行数を営業リストへ</button>
        <button onClick={() => setAdding(true)} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined}
          className="btn-primary"><CalendarPlus size={15} />面談を追加</button>
      </PageTitle>
      <LiveBanner state={iv.state} error={iv.error} onReload={iv.reload} note={`今の面談（Google カレンダー・2026/7/9 以降）${rows.length}件。ここで変えると今のシステムとカレンダーに保存されます`} />
      <MikeikenNote mk={mk} live={live} />
      {err && <div role="alert" className="mo-shake flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)', borderColor: 'var(--tone-bad-bar)' }}><TriangleAlert size={14} className="mt-0.5" /><span className="flex-1">{err}</span><button onClick={() => setErr('')} aria-label="閉じる"><X size={14} /></button></div>}

      {!ready ? <div className="rounded-xl border border-line bg-surface px-5 py-10 text-center text-body text-muted">{iv.state === 'error' ? '読めませんでした' : <SkeletonRows rows={5} />}</div> : (<>
        {/* 月と数字 */}
        <div className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
          <RemainRing remain={kpi.needInput} total={Math.max(kpi.needInput, monthRows.filter((r) => ivCol(r, t) !== IV_PRE).length)} />
          <label className="flex items-center gap-2 text-body">対象月
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2.5 text-body">
              {months.map((m) => <option key={m.k} value={m.k}>{monthLabel(m.k)}（{m.n}件）</option>)}
            </select>
          </label>
          <div className="text-body"><b>結果が未入力 {kpi.needInput}件</b><span className="ml-2 text-sm text-faint">月を変えると 数字・カンバン・一覧 が全部その月になります</span></div>
        </div>
        <div className="mo-fade-up grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5" style={{ ['--i' as string]: 2 }}>
          <Kpi label="面談数" value={`${kpi.total}件`} sub="この月の面談（2026/7/9 以降）" />
          <Kpi label="成約" value={`${kpi.won}件`} accent />
          <Kpi label="決定率" value={pctText(kpi.won, kpi.decided)} sub={`成約${kpi.won} ÷ 結果確定${kpi.decided}件（未入力・通過・結果待ちを除く）`} accent />
          <Kpi label="全件比" value={pctText(kpi.won, kpi.total)} sub={`成約${kpi.won} ÷ 面談数${kpi.total}件`} />
          <Kpi label="ステータス未入力" value={`${kpi.needInput}件`} sub="面談日時を過ぎたのに結果が未入力" warn={kpi.needInput > 0} onClick={() => setSf(IV_WAIT)} />
        </div>

        {/* カンバン */}
        <section className="mo-fade-up flex flex-col gap-2" style={{ ['--i' as string]: 3 }}>
          <div className="flex flex-wrap items-baseline gap-2"><h2 className="text-md font-bold">カンバン</h2><span className="text-sm text-faint">カードを別の列にドラッグするとステータスが変わります。押すと詳しく</span>
            {notice && <span className="mo-shake text-sm font-semibold text-bad">{notice}</span>}</div>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {cols.map((col) => {
              const list = filtered.filter((r) => ivCol(r, t) === col);
              return (
                <div key={col} {...dragProps(col)} className="flex w-[240px] shrink-0 flex-col rounded-xl border bg-soft"
                  style={{ borderColor: over === col ? 'var(--a)' : 'var(--color-line)', boxShadow: over === col ? '0 0 0 2px var(--as)' : undefined }}>
                  <div className="flex items-center gap-1.5 px-3 py-2 text-body font-bold">
                    <span className="chip" style={{ background: toneOf(col).bg, color: toneOf(col).fg }}>{col}</span>
                    {col === IV_PRE && <span className="text-xs font-normal text-faint">自動</span>}
                    <span className="num ml-auto text-muted">{list.length}</span>
                  </div>
                  <div className="flex max-h-[420px] min-h-[90px] flex-col gap-1.5 overflow-y-auto px-2 pb-2">
                    {list.map((r) => <Card key={r.id} r={r} now={t} canEdit={canEdit} flash={flash === r.id} dragging={drag === r.id}
                      onDragStart={() => setDrag(r.id)} onDragEnd={() => { setDrag(null); setOver(null); }} onOpen={() => setDetail(r)} />)}
                    {list.length === 0 && <div className="px-2 py-4 text-center text-sm text-faint">ありません</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2"><h3 className="text-body font-bold">着地ゾーン</h3><span className="text-sm text-faint">ここにドロップすると確定。押すと一覧をそのステータスに絞ります（件数はこの月の合計）</span></div>
          <div className="grid grid-cols-3 gap-2.5">
            {IV_CLOSED.map((col) => {
              const n = monthRows.filter((r) => r.status === col).length;
              return (
                <button key={col} type="button" {...dragProps(col)} onClick={() => { setSf(col); document.getElementById('iv-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                  className="flex min-h-[64px] items-center justify-between rounded-xl border-2 border-dashed px-4 text-left"
                  style={{ borderColor: over === col ? 'var(--a)' : 'var(--color-line)', background: over === col ? 'var(--as)' : toneOf(col).bg, color: toneOf(col).fg }}>
                  <span className="text-body font-bold">{col}</span><span className="num text-xl font-bold">{n}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 一覧 */}
        <section id="iv-table" className="mo-fade-up flex flex-col gap-2" style={{ ['--i' as string]: 4 }}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-9 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-2.5 text-body">
              <Search size={14} className="text-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・案件で探す" className="w-48 min-w-0 bg-transparent outline-none" />
            </label>
            <select value={sf} onChange={(e) => setSf(e.target.value)} className="min-h-9 rounded-[10px] border border-field bg-surface px-2.5 text-body" aria-label="ステータスで絞る">
              <option value="">すべてのステータス</option>
              <option value="__pre">面談前（自動）</option>
              <option value={IV_WAIT}>結果待ち（自動を含む）</option>
              {IV_STATUSES.filter((s) => s !== IV_WAIT).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {(q || sf) && <button onClick={() => { setQ(''); setSf(''); }} className="text-sm font-semibold underline">絞り込みを消す</button>}
            <span className="ml-auto text-sm text-faint">{filtered.length}件・日時の早い順</span>
            {live && <button onClick={iv.reload} className="inline-flex items-center gap-1 text-sm text-muted"><RefreshCw size={12} />読み直す</button>}
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[980px] border-collapse text-body">
              <thead><tr className="th-row text-left">
                {['要員名', '面談日', 'ステータス', '営業担当', '面談回数', '案件', '面談練習担当', 'カテゴリ', 'メモ', ''].map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.id} className={`mo-fade-in border-t border-line-soft align-top ${flash === r.id ? (r.status === '成約' ? 'mo-celebrate' : 'mo-flash') : 'row'}`} style={{ ['--i' as string]: Math.min(i, 12) }}>
                    <td className="whitespace-nowrap px-3 py-2"><PersonName name={r.name} /></td>
                    <td className="num whitespace-nowrap px-3 py-2">{r.date || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <StatusSelect r={r} now={t} disabled={!canEdit} onChange={(s) => void changeStatus(r.id, s)} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{r.salesRep || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{r.rounds || '—'}</td>
                    <td className="max-w-[260px] px-3 py-2"><div className="line-clamp-2 whitespace-pre-line">{r.caseInfo || '—'}</div></td>
                    <td className="whitespace-nowrap px-3 py-2">{r.trainer || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{r.category || '—'}</td>
                    <td className="max-w-[200px] px-3 py-2 text-muted"><div className="line-clamp-2 whitespace-pre-line">{r.memo || '—'}</div></td>
                    <td className="px-3 py-2"><button onClick={() => setEdit(r)} disabled={!canEdit} title={!canEdit ? needText('edit') : '編集'} className="btn-secondary btn-sm"><Pencil size={12} />編集</button></td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-muted">この条件の面談はありません</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-1">
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setPage(p)} className="num min-h-8 min-w-8 rounded-lg border border-field px-2 text-sm" style={p === page ? { background: 'var(--a)', color: 'var(--btn-fg, #fff)', borderColor: 'var(--a)' } : undefined}>{p}</button>
              ))}
            </div>
          )}
        </section>
      </>)}

      {detail && <DetailDialog r={rows.find((x) => x.id === detail.id) ?? detail} now={t} canEdit={canEdit} onClose={() => setDetail(null)} onEdit={() => { const d = detail; setDetail(null); setEdit(d); }} onStatus={(s) => void changeStatus(detail.id, s)} />}
      {adding && <AddDialog live={live} salesReps={salesReps} trainers={trainers} onClose={() => setAdding(false)} onSaved={(f, id, reflected) => {
        setAdding(false);
        if (!live) setSampleRows((xs) => ivUsable([...(xs ?? []), { id: id || `s${Date.now()}`, ...f, date: ivFromLocalInput(f.date), rounds: '', category: '' }]));
        else iv.reload();
        hit();
        toast({ text: `${f.name}さんの面談を登録しました`, sub: `${live ? 'カレンダーに予定を作りました・' : '見本なので保存していません・'}${f.status === '成約' ? reflectText('成約', reflected) : '営業リストの並行数に反映されます'}` });
        if (live) void syncParallel(false);
      }} />}
      {edit && <EditDialog r={edit} live={live} salesReps={salesReps} trainers={trainers} onClose={() => { setEdit(null); }}
        onSaved={(f, prevStatus, reflected) => {
          setRow(edit.id, { ...f, date: f.date ? ivFromLocalInput(f.date) : edit.date });
          if (f.status !== prevStatus) { hit(); toast({ text: `面談を「${f.status || '未設定'}」に`, sub: reflectText(f.status, reflected) }); if (live) void syncParallel(false); }
        }}
        onDeleted={() => { const r = edit; setEdit(null); setRow(r.id, null); hit(); toast({ text: `${r.name}さんの面談を削除しました`, sub: live ? 'Google カレンダーの予定も消しました' : '見本なので保存していません' }); if (live) iv.reload(); }} />}
    </main>
  );
}

function Kpi({ label, value, sub, accent, warn, onClick }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div';
  return (
    <C onClick={onClick} className={`rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left ${onClick ? 'hover:border-field' : ''}`}>
      <div className="text-sm font-semibold text-muted">{label}</div>
      <div className="num mt-0.5 text-xl font-bold" style={{ color: warn ? 'var(--color-bad)' : accent ? 'var(--ad)' : undefined }}>{value}</div>
      {sub && <div className="mt-0.5 text-xs leading-snug text-faint">{sub}</div>}
    </C>
  );
}

function Card({ r, now, canEdit, flash, dragging, onDragStart, onDragEnd, onOpen }: { r: IvRec; now: number; canEdit: boolean; flash: boolean; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onOpen: () => void }) {
  const auto = ivAuto(r, now);
  const hint = ivTimeHint(r, now);
  return (
    <article draggable={canEdit} onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }} onDragEnd={onDragEnd}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }} tabIndex={0} role="button" aria-label={`${r.name} の面談`}
      className={`rounded-lg border bg-surface px-2.5 py-2 text-sm ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${dragging ? 'opacity-50' : ''} ${flash ? (r.status === '成約' ? 'mo-celebrate' : 'mo-flash') : ''}`}
      style={{ borderColor: auto ? 'var(--color-warn)' : 'var(--color-line)' }}>
      <div className="flex items-center gap-1.5">
        <PersonName name={r.name} className="truncate text-body font-bold underline-offset-2 hover:underline" />
        {auto && <span className="chip shrink-0" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }} title="ステータスは未入力。面談日時を過ぎたので自動でこの列に置いています">自動</span>}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
        <span className="num truncate">{r.date || '日時未定'}{r.salesRep ? ` / ${r.salesRep}` : ''}</span>
        {hint && <span className="ml-auto shrink-0 font-semibold" style={{ color: hint.tone === 'bad' ? 'var(--color-bad)' : hint.tone === 'warn' ? 'var(--color-warn)' : 'var(--color-faint)' }}>{hint.t}</span>}
      </div>
    </article>
  );
}

function StatusSelect({ r, now, disabled, onChange }: { r: IvRec; now: number; disabled: boolean; onChange: (s: string) => void }) {
  const st = ivStat(r);
  const opts: string[] = [...IV_STATUSES];
  if (st && !opts.includes(st)) opts.unshift(st);
  const tone = toneOf(st || ivCol(r, now));
  return (
    <span className="inline-flex items-center gap-1">
      <select value={st} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label="ステータス"
        className="min-h-8 rounded-lg border-0 px-2 text-sm font-semibold disabled:opacity-60" style={{ background: tone.bg, color: tone.fg }}>
        {!st && <option value="" disabled>{ivCol(r, now)}</option>}
        {opts.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {ivAuto(r, now) && <span className="text-xs font-semibold" style={{ color: 'var(--color-warn)' }}>自動</span>}
    </span>
  );
}

function DlgShell({ label, onClose, children, foot }: { label: string; onClose: () => void; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <Dialog label={label} onClose={onClose} z={DLG_Z} backdropClassName="bg-black/30"
      className="mo-scale-in fixed left-1/2 top-[6vh] flex max-h-[88vh] w-[min(620px,94vw)] -translate-x-1/2 flex-col panel">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <h2 className="text-md font-bold">{label}</h2>
        <button data-dialog-close onClick={onClose} aria-label="閉じる" className="ml-auto rounded-lg p-1.5 text-muted hover:bg-soft"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {foot && <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">{foot}</div>}
    </Dialog>
  );
}

function DetailDialog({ r, now, canEdit, onClose, onEdit, onStatus }: { r: IvRec; now: number; canEdit: boolean; onClose: () => void; onEdit: () => void; onStatus: (s: string) => void }) {
  const st = ivStat(r);
  return (
    <DlgShell label={`${r.name || '面談'} の面談`} onClose={onClose}
      foot={<button onClick={onEdit} disabled={!canEdit} title={!canEdit ? needText('edit') : undefined} className="btn-primary ml-auto"><Pencil size={14} />編集</button>}>
      <div className="mb-3"><PersonName name={r.name} className="text-body font-bold underline-offset-2 hover:underline" /></div>
      <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-body">
        <dt className="text-muted">面談日</dt><dd className="num">{r.date || '—'}</dd>
        <dt className="text-muted">ステータス</dt><dd>{st || `${ivCol(r, now)}（自動）`}</dd>
        <dt className="text-muted">営業担当</dt><dd>{r.salesRep || '—'}</dd>
        <dt className="text-muted">対面/オンライン</dt><dd>{r.location || '—'}</dd>
        <dt className="text-muted">面談回数</dt><dd>{r.rounds || '—'}</dd>
        <dt className="text-muted">練習担当</dt><dd>{r.trainer || '—'}</dd>
        <dt className="text-muted">カテゴリ</dt><dd>{r.category || '—'}</dd>
      </dl>
      <div className="mt-3 text-sm font-semibold text-muted">案件</div>
      <div className="mt-1 whitespace-pre-wrap break-words rounded-[10px] bg-soft px-3 py-2 text-body">{r.caseInfo || '（案件の情報なし）'}</div>
      {r.memo && r.memo !== r.caseInfo && <><div className="mt-3 text-sm font-semibold text-muted">メモ</div><div className="mt-1 whitespace-pre-wrap break-words text-body">{r.memo}</div></>}
      <div className="mt-4 text-sm font-semibold text-muted">ステータスを変える</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {IV_STATUSES.map((s) => (
          <button key={s} disabled={!canEdit || s === st} onClick={() => onStatus(s)} className="chip min-h-8 px-3 text-sm disabled:cursor-default"
            style={s === st ? { background: 'var(--a)', color: 'var(--btn-fg, #fff)' } : { background: toneOf(s).bg, color: toneOf(s).fg, opacity: canEdit ? 1 : 0.5 }}>{s}</button>
        ))}
      </div>
    </DlgShell>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label className={`flex flex-col gap-1 text-sm font-semibold text-muted ${full ? 'sm:col-span-2' : ''}`}>{label}{children}</label>;
}
const INPUT = 'min-h-10 w-full rounded-[10px] border border-field bg-surface px-3 text-body font-normal';

function FormFields({ f, set, salesReps, trainers, names, nameHint }: { f: Form; set: (p: Partial<Form>) => void; salesReps: string[]; trainers: string[]; names?: string[]; nameHint?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="要員名 *">
        <input value={f.name} onChange={(e) => set({ name: e.target.value })} list="iv-names" className={INPUT} autoComplete="off" />
        {names && <datalist id="iv-names">{names.map((n) => <option key={n} value={n} />)}</datalist>}
        {nameHint && <span className="text-xs font-normal" style={{ color: 'var(--color-warn)' }}>{nameHint}</span>}
      </Field>
      <Field label="営業担当">
        <input value={f.salesRep} onChange={(e) => set({ salesRep: e.target.value })} list="iv-reps" className={INPUT} autoComplete="off" />
        <datalist id="iv-reps">{salesReps.map((n) => <option key={n} value={n} />)}</datalist>
      </Field>
      <Field label="面談日時"><input type="datetime-local" value={f.date} onChange={(e) => set({ date: e.target.value })} className={INPUT} /></Field>
      <Field label="対面 / オンライン">
        <select value={f.location} onChange={(e) => set({ location: e.target.value })} className={INPUT}>
          <option value="">未定</option>{IV_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </Field>
      <Field label="ステータス">
        <select value={f.status} onChange={(e) => set({ status: e.target.value })} className={INPUT}>
          <option value="">未設定</option>{IV_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="面談練習担当">
        <input value={f.trainer} onChange={(e) => set({ trainer: e.target.value })} list="iv-trainers" className={INPUT} autoComplete="off" />
        <datalist id="iv-trainers">{trainers.map((n) => <option key={n} value={n} />)}</datalist>
      </Field>
      <Field label="案件" full><input value={f.caseInfo} onChange={(e) => set({ caseInfo: e.target.value })} className={INPUT} /></Field>
      <Field label="メモ" full><textarea value={f.memo} onChange={(e) => set({ memo: e.target.value })} rows={3} className={`${INPUT} py-2`} /></Field>
    </div>
  );
}

function AddDialog({ live, salesReps, trainers, onClose, onSaved }: { live: boolean; salesReps: string[]; trainers: string[]; onClose: () => void; onSaved: (f: Form, id: string, reflected: Reflected) => void }) {
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const er = useIke<EngineerRows>(live ? 'roster?action=getEngineerRows' : null);
  const names = useMemo(() => [...new Set((er.data?.rows ?? []).map((r) => r.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')), [er.data]);
  const norm = (s: string) => s.replace(/[\s　]+/g, '');
  const nameHint = live && f.name.trim() && names.length && !names.some((n) => norm(n) === norm(f.name)) ? 'プロパーリストにいない名前です（成約にしても営業リストには反映されません）' : '';
  const save = async () => {
    if (!f.name.trim()) { setErr('要員名を入れてください'); return; }
    if (!f.date) { setErr('面談日時を入れてください（カレンダーに予定を作るため）'); return; }
    if (!live) { onSaved(f, '', null); return; }
    setBusy(true); setErr('');
    const r = await postLive<{ id?: string; reflected?: Reflected }>('/api/live/mendan', { op: 'add', ...f });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onSaved(f, String(r.j.id || ''), r.j.reflected ?? null);
  };
  return (
    <DlgShell label="面談を追加" onClose={onClose}
      foot={<>
        {err && <span className="mo-shake text-sm font-semibold text-bad">{err}</span>}
        <span className="text-xs text-faint">{live ? '追加すると Google カレンダーに予定が入ります' : '見本なので保存しません'}</span>
        <button onClick={onClose} className="btn-secondary ml-auto">やめる</button>
        <button onClick={save} disabled={busy} className="btn-primary">{busy ? '追加しています…' : '追加する'}</button>
      </>}>
      <FormFields f={f} set={(p) => setF((x) => ({ ...x, ...p }))} salesReps={salesReps} trainers={trainers} names={names} nameHint={nameHint} />
    </DlgShell>
  );
}

// 編集は「直したら自動で保存」（今と同じ・10-22 shoya「入力したら保存して」）。文字は打ち終えて1秒、選ぶ欄はすぐ。閉じるときも保存
function EditDialog({ r, live, salesReps, trainers, onClose, onSaved, onDeleted }: {
  r: IvRec; live: boolean; salesReps: string[]; trainers: string[]; onClose: () => void;
  onSaved: (f: Form, prevStatus: string, reflected: Reflected) => void; onDeleted: () => void;
}) {
  const [f, setF] = useState<Form>(() => formOf(r));
  const saved = useRef<Form>(formOf(r));
  const [state, setState] = useState<{ t: string; bad?: boolean }>({ t: '直すと自動で保存されます' });
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const fRef = useRef(f);
  useEffect(() => { fRef.current = f; }, [f]);

  const save = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const cur = fRef.current;
    if (JSON.stringify(cur) === JSON.stringify(saved.current)) return;
    if (busy.current) { timer.current = setTimeout(() => void save(), 500); return; }
    if (!cur.name.trim()) { setState({ t: '要員名が空なので保存していません', bad: true }); return; }
    const prevStatus = saved.current.status;
    if (!live) { saved.current = cur; setState({ t: '保存しました（見本なのでこの画面の中だけ）' }); onSaved(cur, prevStatus, null); return; }
    busy.current = true; setState({ t: '保存しています…' });
    const res = await postLive<{ reflected?: Reflected }>('/api/live/mendan', { op: 'update', id: r.id, ...cur, statusChanged: cur.status !== prevStatus });
    busy.current = false;
    if (!res.ok) { setState({ t: `保存できませんでした：${res.error}（もう一度直すと保存し直します）`, bad: true }); return; }
    saved.current = cur; setState({ t: '保存しました' });
    onSaved(cur, prevStatus, res.j.reflected ?? null);
  }, [live, r.id, onSaved]);

  const set = (p: Partial<Form>, immediate: boolean) => {
    setF((x) => ({ ...x, ...p }));
    if (timer.current) clearTimeout(timer.current);
    setState({ t: '入力中…' });
    timer.current = setTimeout(() => void save(), immediate ? 0 : 1000);
  };
  const close = () => { void save(); onClose(); };
  const del = async () => {
    if (!live) { onDeleted(); return; }
    setState({ t: '削除しています…' });
    const res = await postLive('/api/live/mendan', { op: 'delete', id: r.id, confirmed: true });
    if (!res.ok) { setConfirmDel(false); setState({ t: `削除できませんでした：${res.error}`, bad: true }); return; }
    onDeleted();
  };
  return (
    <DlgShell label="面談を編集" onClose={close}
      foot={<>
        <button onClick={() => setConfirmDel(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border px-3 text-body font-semibold" style={{ color: 'var(--color-bad)', borderColor: 'var(--color-bad-line, var(--color-line))' }}><Trash2 size={14} />削除</button>
        <span className="ml-auto text-sm" style={{ color: state.bad ? 'var(--color-bad)' : 'var(--color-muted)' }}>{state.t}</span>
        <button onClick={close} className="btn-secondary">閉じる</button>
      </>}>
      <FormFields f={f} set={(p) => set(p, !('name' in p || 'salesRep' in p || 'trainer' in p || 'caseInfo' in p || 'memo' in p))} salesReps={salesReps} trainers={trainers} />
      {confirmDel && (
        <div role="alertdialog" className="mo-scale-in mt-4 rounded-xl border px-4 py-3" style={{ borderColor: 'var(--color-bad-line, var(--color-bad))', background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>
          <div className="text-body font-bold">この面談を削除しますか？</div>
          <div className="mt-0.5 text-sm">{live ? 'Google カレンダーの予定も削除されます。元には戻せません。' : '見本なのでこの画面の中だけで消えます。'}</div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => void del()} className="btn-danger solid">削除する</button>
            <button onClick={() => setConfirmDel(false)} className="btn-secondary">やめる</button>
          </div>
        </div>
      )}
    </DlgShell>
  );
}
