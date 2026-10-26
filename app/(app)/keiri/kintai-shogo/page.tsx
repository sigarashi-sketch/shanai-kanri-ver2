'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Search, X } from 'lucide-react';
import { FilterChips, PageTitle, SkeletonRows } from '@/components/ui';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { postLive } from '@/lib/live/post';
import { SHIME_LABEL, SHIME_WHY, defaultShimeYm, hhmm, hhmmSigned, shimeRowsOf, ymLabel, type IkeShimeBoard, type IkeShimeDetail, type IkeShimeStatus, type ShimeLiveRow } from '@/lib/live/shime';

// 勤怠の照合（経理管理・10-26 shoya「上位から送られてきた勤怠と freee 照合したい・要員ごとに比較するページ」）。
//   ・月を選ぶ → 要員ごとに「上位の勤務表の合計／freee の合計／差／ずれた日」を並べる（未経験の人だけ）
//   ・行を押すと一覧の上に全幅で日ごとの見比べ（勤務表・freee・差・メモ）。× か Esc で閉じる
//   ・データは今の勤怠の締めと同じ（GET roster?op=shime&action=board・1人ぶんは POST /api/live/shime {action:'detail'}）。
//     勤務表＝ミンミカから取り込んで読んだ時間（seikyu_sheet_hours）、freee＝当日の出勤状況が入れている打刻の写し。1日30分未満のずれは合っている扱い
//   ・この画面は読むだけ。締める・開け直すは労務の「勤怠の締め」（/roumu/shime）
type Filter = 'diff' | 'cant' | 'ok' | 'all';
const CANT: IkeShimeStatus[] = ['unread', 'missing', 'no_freee', 'freee_only', 'no_contract', 'no_record', 'current'];
const isDiff = (r: ShimeLiveRow) => r.cell.status === 'diff' || (r.cell.status === 'closed' && (r.cell.diffDays || 0) > 0);
const isOk = (r: ShimeLiveRow) => r.cell.status === 'match' || (r.cell.status === 'closed' && !(r.cell.diffDays || 0));
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

function StatusChip({ s }: { s: IkeShimeStatus }) {
  const st = SHIME_LABEL[s];
  return <span className="chip" style={{ background: `var(--tone-${st.tone}-bg)`, color: `var(--tone-${st.tone}-fg)` }}>{st.label}</span>;
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="flex min-w-[150px] flex-1 flex-col rounded-lg border border-line-soft bg-surface px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <b className={`num text-lg ${tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : ''}`}>{value}</b>
      {sub && <span className="text-xs text-faint">{sub}</span>}
    </div>
  );
}

// 1日ぶんの2本の棒（上＝勤務表・下＝freee）。10時間を端にする
function Bars({ sheet, freee }: { sheet: number | null; freee: number }) {
  const w = (m: number) => `${Math.min(100, (m / 600) * 100)}%`;
  return (
    <div className="flex w-36 flex-col gap-0.5" aria-hidden>
      <div className="h-1.5 rounded-full bg-sunken"><div className="h-1.5 rounded-full" style={{ width: w(sheet || 0), background: 'var(--ad)' }} /></div>
      <div className="h-1.5 rounded-full bg-sunken"><div className="h-1.5 rounded-full" style={{ width: w(freee), background: 'var(--color-faint)' }} /></div>
    </div>
  );
}

function DetailPanel({ d, onClose }: { d: IkeShimeDetail; onClose: () => void }) {
  const [onlyBad, setOnlyBad] = useState(true);
  const cmp = d.compare;
  const bad = cmp ? cmp.days.filter((x) => !x.ok) : [];
  const list = cmp ? (onlyBad && cmp.dailyKnown ? bad : cmp.days) : (d.freeeDays || []).map((x) => ({ date: x.date, sheet: null, freee: x.mins, leave: x.leave, diff: 0, ok: true, note: x.leave && !x.mins ? '休暇' : '' }));
  const why = d.cell.status === 'unread' && d.unread ? `時間がまだ残っていません：${d.unread.why}` : SHIME_WHY[d.cell.status];
  return (
    <section className="mo-fade-up flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <PersonName name={d.name} className="text-md font-bold underline-offset-2 hover:underline" />
        <span className="text-sm text-muted">{d.ym.slice(0, 4)}年{ymLabel(d.ym)}{d.mnm?.company ? `・${d.mnm.company}` : d.cell.company ? `・${d.cell.company}` : ''}</span>
        <StatusChip s={d.cell.status} />
        <button onClick={onClose} aria-label="閉じる" title="閉じる（Esc）" className="ml-auto rounded-md p-1 text-faint hover:bg-sunken"><X size={16} /></button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Tile label="上位の勤務表" value={cmp ? `${hhmm(cmp.sheetMins)}` : '—'} sub={cmp ? (cmp.dailyKnown ? '日ごとの時間あり' : '合計だけ') : SHIME_LABEL[d.cell.status].label} />
        <Tile label="freee の打刻" value={hhmm(cmp ? cmp.freeeMins : d.freeeMonthMins)} sub={cmp ? '勤務表と同じ期間の実働' : `${(d.freeeDays || []).filter((x) => x.mins > 0).length}日 出勤`} />
        <Tile label="差（勤務表 − freee）" value={cmp ? hhmmSigned(cmp.diffMins) : '—'} sub={cmp ? (cmp.diffDays ? `ずれた日 ${cmp.diffDays}${cmp.dailyKnown ? '日' : ''}` : '一致') : '比べられません'} tone={cmp ? (cmp.diffDays ? 'bad' : 'ok') : undefined} />
      </div>
      {why && <div className="rounded-lg bg-sunken px-3 py-2 text-sm text-muted">{why}{d.unread?.files.length ? <ul className="mt-1">{d.unread.files.map((f, i) => <li key={i}>・{f.file}{f.note ? `（${f.note}）` : ''}</li>)}</ul> : null}</div>}
      {list.length > 0 && <>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <b>日ごと{cmp ? `（${md(cmp.from)}〜${md(cmp.to)}）` : '（freee だけ）'}</b>
          {cmp?.dailyKnown && <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} />ずれた日だけ（{bad.length}日）</label>}
          {cmp && <span className="ml-auto inline-flex items-center gap-3 text-xs text-faint"><span className="inline-flex items-center gap-1"><i className="inline-block h-1.5 w-4 rounded-full" style={{ background: 'var(--ad)' }} />勤務表</span><span className="inline-flex items-center gap-1"><i className="inline-block h-1.5 w-4 rounded-full" style={{ background: 'var(--color-faint)' }} />freee</span></span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-body">
            <thead><tr className="th-row text-left"><th className="px-3 py-2 font-semibold">日</th><th className="px-2 py-2 font-semibold">上位の勤務表</th><th className="px-2 py-2 font-semibold">freee</th><th className="px-2 py-2 font-semibold">差</th><th className="px-2 py-2 font-semibold">くらべ</th><th className="px-3 py-2 font-semibold">メモ</th></tr></thead>
            <tbody>
              {list.map((x) => {
                const w = dow(x.date);
                return (
                  <tr key={x.date} className="border-t border-line-soft" style={!x.ok ? { background: 'var(--tone-warn-bg)' } : undefined}>
                    <td className="num px-3 py-1.5">{md(x.date)}<span className={`ml-1 text-xs ${w === 0 ? 'text-bad' : w === 6 ? 'text-info' : 'text-faint'}`}>{DOW[w]}</span></td>
                    <td className="num px-2 py-1.5">{x.sheet ? hhmm(x.sheet) : '—'}</td>
                    <td className="num px-2 py-1.5">{x.freee ? hhmm(x.freee) : x.leave ? '休暇' : '—'}</td>
                    <td className={`num px-2 py-1.5 ${!x.ok ? 'font-semibold text-warn' : 'text-muted'}`}>{cmp?.dailyKnown ? hhmmSigned(x.diff) : '—'}</td>
                    <td className="px-2 py-1.5">{cmp ? <Bars sheet={x.sheet} freee={x.freee} /> : null}</td>
                    <td className="px-3 py-1.5 text-sm text-muted">{x.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      {cmp?.dailyKnown && onlyBad && bad.length === 0 && <div className="flex items-center gap-1.5 text-sm text-ok"><Check size={14} />ずれた日はありません</div>}
      <div className="text-xs text-faint">
        {d.sheet && <>勤務表：{d.sheet.file || '（ファイル名なし）'}（{(d.sheet.updatedAt || '').slice(0, 10)} 読み込み）・</>}
        freee：{d.freeeSyncedAt ? `${d.freeeSyncedAt.slice(0, 10)} 時点の打刻` : '打刻の写しがありません'}
        {d.closed && <>・{(d.closed.closed_at || '').slice(0, 10)} に {d.closed.closed_by} が締めました{d.closed.reason ? `（理由：${d.closed.reason}）` : ''}</>}
      </div>
    </section>
  );
}

export default function KintaiShogoPage() {
  const ike = useIke<IkeShimeBoard>('roster?op=shime&action=board');
  const live = ike.live && !!ike.data?.ok;
  const mk = useMikeiken();
  const board = live ? ike.data : null;
  const [ym, setYm] = useState('');
  useEffect(() => { if (board && !ym) setYm(defaultShimeYm(board)); }, [board, ym]);
  const rows = useMemo(() => (board ? shimeRowsOf(live ? { ...board, rows: mk.keep(board.rows || [], 'name') } : board, ym) : []), [board, live, mk, ym]);
  const [filter, setFilter] = useState<Filter>('diff');
  const [q, setQ] = useState('');
  const shown = rows.filter((r) => (filter === 'all' || (filter === 'diff' ? isDiff(r) : filter === 'ok' ? isOk(r) : CANT.includes(r.cell.status)))
    && (!q.trim() || `${r.name}${r.company}`.replace(/\s/g, '').includes(q.replace(/\s/g, ''))))
    .sort((a, b) => (filter === 'diff' ? Math.abs(b.cell.diffMins || 0) - Math.abs(a.cell.diffMins || 0) : 0));
  const sum = (f: (r: ShimeLiveRow) => number | null) => rows.reduce((a, r) => a + (f(r) || 0), 0);
  const compared = rows.filter((r) => r.cell.sheetMins != null);

  // 1人ぶん（一覧の上に全幅で出す）
  const [sel, setSel] = useState<{ key: string; name: string } | null>(null);
  const [det, setDet] = useState<{ st: 'loading' | 'ok' | 'error'; d?: IkeShimeDetail; error?: string } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const open = (r: ShimeLiveRow) => {
    setSel({ key: r.key, name: r.name });
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!live) return;
    setDet({ st: 'loading' });
    postLive<IkeShimeDetail>('/api/live/shime', { action: 'detail', ym, key: r.key })
      .then((d) => setDet((x) => (x ? { st: 'ok', d } : x)))
      .catch((e) => setDet({ st: 'error', error: (e as Error).message }));
  };
  const close = () => { setSel(null); setDet(null); };
  useEffect(() => { close(); }, [ym]);
  useEffect(() => {
    if (!sel) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sel]);

  const months = board ? [...board.months].sort().reverse() : [];
  return (
    <main className="flex flex-col gap-4">
      <div ref={topRef} />
      <PageTitle title="勤怠の照合" sub="上位（現場）から届いた勤務表と freee の打刻を、要員ごと・日ごとに見比べます">
        <Link href="/roumu/shime" className="btn-secondary">締めるのは「勤怠の締め」</Link>
      </PageTitle>
      <LiveBanner state={ike.state} error={ike.error} onReload={ike.reload} />
      <MikeikenNote mk={mk} live={live} />

      {board && <>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">月</span>
          <select aria-label="月" value={ym} onChange={(e) => setYm(e.target.value)} className="min-h-9 rounded-lg border border-field bg-surface px-2 text-body">
            {months.map((m) => <option key={m} value={m}>{m.slice(0, 4)}年{ymLabel(m)}{m >= board.currentYm ? '（月の途中）' : ''}</option>)}
          </select>
          <span className="text-xs text-faint">暦の月で出しています（freee の「月度」は1か月先の呼び名です）</span>
        </div>

        {sel && (
          det?.st === 'ok' && det.d ? <DetailPanel d={det.d} onClose={close} />
            : <section className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <b>{sel.name}</b>{det?.st === 'error' ? <span className="text-bad">読めませんでした（{det.error}）</span> : <span className="text-faint">日ごとを読んでいます…</span>}
              <button onClick={close} aria-label="閉じる" className="ml-auto rounded-md p-1 text-faint hover:bg-sunken"><X size={16} /></button>
            </section>
        )}

        <div className="mo-fade-up flex flex-wrap gap-2" style={{ ['--i' as string]: 1 }}>
          <Tile label="比べられた人" value={`${compared.length}人`} sub={`この月の対象 ${rows.length}人`} />
          <Tile label="上位の勤務表の合計" value={hhmm(sum((r) => r.cell.sheetMins))} sub="比べられた人の分" />
          <Tile label="freee の合計" value={hhmm(compared.reduce((a, r) => a + r.cell.freeeMins, 0))} sub="同じ人・同じ期間" />
          <Tile label="ずれている人" value={`${rows.filter(isDiff).length}人`} sub="1日30分以上ずれた日がある" tone={rows.some(isDiff) ? 'bad' : 'ok'} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <FilterChips<Filter> value={filter} onChange={setFilter} items={[
            { key: 'diff', label: 'ずれている', count: rows.filter(isDiff).length },
            { key: 'cant', label: '比べられない', count: rows.filter((r) => CANT.includes(r.cell.status)).length },
            { key: 'ok', label: '合っている', count: rows.filter(isOk).length },
            { key: 'all', label: '全員', count: rows.length },
          ]} />
          <label className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-field bg-surface px-2">
            <Search size={14} className="text-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・現場で探す" className="w-44 bg-transparent text-body outline-none" />
          </label>
        </div>

        <div className="mo-fade-up overflow-hidden rounded-xl border border-line bg-surface" style={{ ['--i' as string]: 2 }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-body">
              <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">要員</th><th className="px-2 py-2.5 font-semibold">上位の勤務表</th><th className="px-2 py-2.5 font-semibold">freee</th><th className="px-2 py-2.5 font-semibold">差</th><th className="px-2 py-2.5 font-semibold">ずれた日</th><th className="px-4 py-2.5 font-semibold">状態</th></tr></thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.key} onClick={() => open(r)} className={`mo-fade-in row cursor-pointer border-t border-line-soft ${sel?.key === r.key ? 'bg-sunken' : ''}`} style={{ ['--i' as string]: Math.min(i, 30) }} title="押すと日ごとの見比べ">
                    <td className="px-4 py-2.5"><span className="font-semibold">{r.name}</span>{r.company && <div className="text-xs text-faint">{r.company}</div>}</td>
                    <td className="num px-2 py-2.5">{hhmm(r.cell.sheetMins)}</td>
                    <td className="num px-2 py-2.5">{hhmm(r.cell.freeeMins)}</td>
                    <td className={`num px-2 py-2.5 ${r.cell.diffDays ? 'font-semibold text-warn' : 'text-muted'}`}>{hhmmSigned(r.cell.diffMins)}</td>
                    <td className="px-2 py-2.5 text-sm">{r.cell.sheetMins == null ? <span className="text-faint">—</span> : r.cell.diffDays ? <span className="font-semibold text-warn">{r.cell.diffDays}日</span> : <span className="text-ok">なし</span>}</td>
                    <td className="px-4 py-2.5"><StatusChip s={r.cell.status} /></td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">{filter === 'diff' && !q ? <span className="inline-flex items-center gap-1.5 text-ok"><Check size={14} />{ymLabel(ym)}にずれている人はいません</span> : '当てはまる人はいません'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </>}
      {!board && ike.state === 'loading' && <div className="rounded-xl border border-line bg-surface"><SkeletonRows /></div>}
      <p className="text-xs text-faint">上位の勤務表はミンミカから取り込んで読んだ時間、freee は打刻の写しです。日ごとに比べ、1日30分未満のずれは合っている扱いにしています。この画面は読むだけです。締める・開け直すは労務の「勤怠の締め」でします。</p>
    </main>
  );
}
