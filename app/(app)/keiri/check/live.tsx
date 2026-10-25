'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, FileUp } from 'lucide-react';
import type { Mikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { postLive } from '@/lib/live/post';
import {
  LEVEL_LABEL, MISS_LABEL, decodeCsv, errText, readKeihiFile, titleYm,
  type KcApp, type KcCheckRes, type KcMonthRes, type KcRow,
} from '@/lib/live/keihi-check';

// 交通費チェック（本物・10-25）。今の /keihi-check.html と同じ流れ：
//   MF経費の明細CSV／承認一覧CSV を選ぶ → 対象のステータスを選ぶ → 1人ずつ今のシステムで freee の打刻と照らす（同時に3人まで）
//   ・ファイルはこのタブの中で読むだけ（どこにも保存しない）。判定は今のシステムの答えのまま
//   ・人は未経験の人だけ（今のプロパーリストに入っている人）。それ以外の人は照らさない（件数だけ出す）
//   ・差し戻しは MF経費で行う（ここでは差し戻しの文面を出すだけ・コピーして使う）
type P = { name: string; rows: KcRow[]; apps: KcApp[]; res?: KcCheckRes; mres?: KcMonthRes; state: 'wait' | 'run' | 'done' | 'error'; error?: string };
type Tab = 'flag' | 'ok' | 'all';
const yen = (n: number) => `¥${(Number(n) || 0).toLocaleString('ja-JP')}`;
const CONCURRENCY = 3;

const sendBacks = (p: P) => [
  ...(p.res?.apps || []).filter((a) => a.sendBack).map((a) => ({ key: `r:${a.applicationNo || a.title}`, title: a.title || a.ym, comment: a.comment, miss: a.miss })),
  ...(p.mres?.verdicts || []).filter((v) => v.sendBack).map((v) => ({ key: `m:${v.key}`, title: p.apps.find((a) => a.key === v.key)?.title || v.ym, comment: v.comment || '', miss: [] as KcCheckRes['apps'][number]['miss'] })),
];
const flagged = (p: P) => p.state === 'error' || sendBacks(p).length > 0 || (p.res?.summary.ng || 0) > 0 || (p.res?.summary.warn || 0) > 0
  || (p.mres?.verdicts || []).some((v) => v.level === 'ng' || v.level === 'warn') || (!!p.res && p.res.match.status !== 'unique') || (!!p.mres && p.mres.match.status !== 'unique');

export function KeihiCheckLive({ mk }: { mk: Mikeiken }) {
  const { hit, toast } = useMotivation();
  const [rows, setRows] = useState<KcRow[]>([]);
  const [apps, setApps] = useState<KcApp[]>([]);
  const [msg, setMsg] = useState('');
  const [sts, setSts] = useState<Record<string, boolean>>({});
  const [people, setPeople] = useState<P[]>([]);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<Tab>('flag');
  const [month, setMonth] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (files: FileList | null) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const errs: string[] = [];
    const nr = [...rows], na = [...apps];
    const seen = new Set(nr.map((r) => r.key));
    for (const f of list) {
      if (f.size > 20 * 1024 * 1024) { errs.push(`${f.name}：ファイルが大きすぎます`); continue; }
      const r = readKeihiFile(f.name, decodeCsv(await f.arrayBuffer()));
      if (r.error) { errs.push(r.error); continue; }
      for (const x of r.rows || []) if (!seen.has(x.key)) { seen.add(x.key); nr.push(x); }
      // 同じ申請番号は後から読んだファイルで上書き（新しい書き出しが正）
      for (const a of r.apps || []) { const i = na.findIndex((y) => y.key === a.key); if (i >= 0) na[i] = a; else na.push(a); }
    }
    setRows(nr); setApps(na); setMsg(errs.join('／'));
    const st: Record<string, boolean> = {};
    for (const x of [...nr, ...na]) if (!(x.status in st)) st[x.status] = x.status !== '取消し';   // 取消しは既定で外す
    setSts((o) => ({ ...st, ...o }));
  };
  const statusCount = useMemo(() => { const c: Record<string, number> = {}; for (const x of [...rows, ...apps]) c[x.status] = (c[x.status] || 0) + 1; return c; }, [rows, apps]);

  const run = async () => {
    const by = new Map<string, P>();
    for (const r of rows) if (sts[r.status]) { const p = by.get(r.person) || { name: r.person, rows: [], apps: [], state: 'wait' as const }; p.rows.push(r); by.set(r.person, p); }
    for (const a of apps) if (sts[a.status]) { const p = by.get(a.person) || { name: a.person, rows: [], apps: [], state: 'wait' as const }; p.apps.push(a); by.set(a.person, p); }
    const all = [...by.values()];
    const kept = mk.keep(all, 'name');
    const skipped = all.length - kept.length;
    const list: P[] = kept.sort((a, b) => a.name.localeCompare(b.name, 'ja')).map((p) => ({ ...p, rows: [...p.rows].sort((a, b) => a.date.localeCompare(b.date) || a.rowNo - b.rowNo).map((r, i) => ({ ...r, seq: i + 1 })) }));
    if (!list.length) { setMsg(skipped ? `対象のステータスの人は、未経験の人ではありませんでした（${skipped}人は照らしていません）` : '対象のステータスの明細・申請がありません'); return; }
    setMsg(skipped ? `未経験以外の ${skipped}人は照らしていません` : '');
    setPeople(list); setRunning(true);
    const cur: P[] = [...list];
    const put = (i: number, patch: Partial<P>) => { cur[i] = { ...cur[i], ...patch }; setPeople([...cur]); };
    let next = 0;
    const worker = async () => {
      while (next < cur.length) {
        const i = next++; const p = cur[i];
        put(i, { state: 'run' });
        try {
          const patch: Partial<P> = { state: 'done' };
          if (p.rows.length) patch.res = await postLive<KcCheckRes>('/api/live/keihi-check', { kind: 'rows', name: p.name, rows: p.rows.map((r) => ({ rowNo: r.seq, date: r.date, category: r.category, content: r.content, memo: r.memo, amount: r.amount, title: r.title, status: r.status, applicationNo: r.applicationNo })) });
          if (p.apps.length) patch.mres = await postLive<KcMonthRes>('/api/live/keihi-check', { kind: 'apps', name: p.name, apps: p.apps.map((a) => ({ key: a.key, title: a.title, amount: a.amount })) });
          put(i, patch);
        } catch (e) { put(i, { state: 'error', error: errText((e as Error).message) }); }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false); hit(cur.length);
    toast({ text: `${cur.length}人を照らしました`, sub: '→ 何も保存していません（このタブの中だけ）' });
  };

  const months = [...new Set([...rows.map((r) => titleYm(r.title) || r.date.slice(0, 7)), ...apps.map((a) => titleYm(a.title) || a.appliedAt.slice(0, 7))].filter(Boolean))].sort().reverse();
  const inMonth = (p: P) => !month || p.rows.some((r) => (titleYm(r.title) || r.date.slice(0, 7)) === month) || p.apps.some((a) => (titleYm(a.title) || a.appliedAt.slice(0, 7)) === month);
  const shown = people.filter(inMonth).filter((p) => p.state === 'wait' || p.state === 'run' || (tab === 'all' ? true : tab === 'flag' ? flagged(p) : !flagged(p)));
  const doneN = people.filter((p) => p.state === 'done' || p.state === 'error').length;
  const flagN = people.filter((p) => (p.state === 'done' || p.state === 'error') && flagged(p)).length;
  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => toast({ text: '差し戻しの文面をコピーしました', sub: 'MF経費の差し戻しのコメントに貼ってください' })).catch(() => {}); };

  return (
    <div className="flex flex-col gap-3">
      <div className="mo-fade-up flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3" style={{ ['--i' as string]: 1 }}>
        <div className="text-[13px]">MF経費の<b>明細CSV</b>（1行＝1明細）を入れると、明細の日付ごとに freee の出勤の打刻と照らします。<b>承認一覧CSV</b>（1行＝1申請）は、申請の月の出勤日数と照らします。</div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="btn-primary inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-4 text-[13px] font-bold"><FileUp size={15} />CSV を選ぶ（いくつでも）</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => { load(e.target.files); e.target.value = ''; }} />
          {(rows.length > 0 || apps.length > 0) && <span className="text-[12.5px] text-muted">{[rows.length ? `明細 ${rows.length}行` : '', apps.length ? `承認一覧 ${apps.length}申請` : ''].filter(Boolean).join(' ＋ ')} を読み込みました</span>}
          {(rows.length > 0 || apps.length > 0) && <button onClick={() => { setRows([]); setApps([]); setPeople([]); setSts({}); setMsg(''); }} disabled={running} className="text-[12px] text-muted underline disabled:opacity-40">読み込んだものを捨てる</button>}
        </div>
        {Object.keys(statusCount).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-muted">照らすステータス：</span>
            {Object.keys(statusCount).sort().map((k) => (
              <label key={k} className="inline-flex items-center gap-1"><input type="checkbox" checked={!!sts[k]} onChange={(e) => setSts((s) => ({ ...s, [k]: e.target.checked }))} />{k}（{statusCount[k]}）</label>
            ))}
            <button onClick={run} disabled={running} className="btn-primary ml-auto min-h-9 rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-40">{running ? `照らしています… ${doneN}/${people.length}` : '照らし合わせる'}</button>
          </div>
        )}
        {msg && <div className="text-[12.5px] text-warn">{msg}</div>}
        <div className="text-[11.5px] text-faint">ファイルはこのタブの中で読むだけで、どこにも保存しません。freee は読み取りだけです。</div>
      </div>

      {people.length > 0 && <>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <RemainRing remain={flagN} total={Math.max(doneN, 1)} />
          <div className="text-[13px]"><b>要確認・注意 {flagN}人</b><span className="ml-2 text-muted">照らした {doneN}/{people.length}人</span></div>
          {months.length > 1 && <select aria-label="対象の月" value={month} onChange={(e) => setMonth(e.target.value)} className="ml-auto min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px]"><option value="">すべての月</option>{months.map((m) => <option key={m} value={m}>{m.slice(0, 4)}年{Number(m.slice(5))}月</option>)}</select>}
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap gap-1.5 border-b border-line-soft px-4 py-2.5">
            {([['flag', '要確認・注意'], ['ok', '問題なし'], ['all', 'すべて']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`min-h-8 rounded-full border px-3 text-[12.5px] ${tab === k ? 'font-semibold' : 'text-muted'}`} style={tab === k ? { borderColor: 'var(--a)', background: 'var(--al)', color: 'var(--ad)' } : { borderColor: 'var(--color-line)' }}>{l}</button>
            ))}
          </div>
          <ul>
            {shown.map((p) => {
              const s = p.res?.summary; const sb = sendBacks(p); const isOpen = open === p.name;
              const amount = p.rows.reduce((t, r) => t + r.amount, 0) + p.apps.reduce((t, a) => t + a.amount, 0);
              const vs = (p.res?.verdicts || []).filter((v) => v.level === 'ng' || v.level === 'warn');
              const rowOf = (n: number) => p.rows.find((r) => r.seq === n);
              const match = p.res?.match || p.mres?.match;
              return (
                <li key={p.name} className="border-t border-line-soft first:border-t-0">
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13px]">
                    <PersonName name={p.name} className="font-semibold underline-offset-2 hover:underline" />
                    {p.state === 'wait' || p.state === 'run' ? <span className="text-[12px] text-faint">{p.state === 'run' ? '照らしています…' : '待っています'}</span>
                      : p.state === 'error' ? <span className="text-[12px] text-bad">{p.error}</span>
                        : flagged(p) ? <span className="chip" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>{sb.length ? `差し戻し ${sb.length}件` : '要確認・注意'}</span>
                          : <span className="inline-flex items-center gap-1 text-[12px] text-ok"><Check size={13} />問題なし</span>}
                    {s && <span className="text-[12px] text-muted">明細 {s.total}・要確認 {s.ng}{s.ngAmount ? `（${yen(s.ngAmount)}）` : ''}・注意 {s.warn}・OK {s.ok}{s.na ? `・判定できない ${s.na}` : ''}</span>}
                    {match && match.status !== 'unique' && <span className="text-[12px] text-warn">{match.status === 'none' ? 'freee に同じ氏名の人がいない' : `freee に同じ氏名が ${match.candidates.length}人（今の交通費チェックの画面で選んでください）`}</span>}
                    {p.res?.merged && <span className="text-[11.5px] text-faint">複数の事業所の打刻を合わせて見ています</span>}
                    <span className="num ml-auto text-[12.5px]">{yen(amount)}</span>
                    {(vs.length > 0 || sb.length > 0 || (p.mres?.verdicts || []).length > 0) && <button onClick={() => setOpen(isOpen ? null : p.name)} aria-expanded={isOpen} className="inline-flex items-center gap-0.5 text-[12px] font-semibold" style={{ color: 'var(--ad)' }}>中身<ChevronDown size={14} className={isOpen ? '' : '-rotate-90'} /></button>}
                  </div>
                  {isOpen && (
                    <div className="mo-fade-in flex flex-col gap-2 border-t border-line-soft bg-soft px-4 py-2.5 text-[12.5px]">
                      {sb.map((x) => (
                        <div key={x.key} className="rounded-lg border border-line bg-surface px-3 py-2">
                          <div className="font-semibold text-bad">差し戻し：{x.title}</div>
                          {x.miss.length > 0 && <div className="num text-[12px] text-muted">{x.miss.slice(0, 12).map((m) => `${Number(m.date.slice(5, 7))}/${Number(m.date.slice(8))} ${MISS_LABEL[m.kind]}`).join('・')}{x.miss.length > 12 ? ` ほか${x.miss.length - 12}日` : ''}</div>}
                          {x.comment && <div className="mt-1 flex items-start gap-2"><div className="whitespace-pre-wrap text-[12px]">{x.comment}</div><button onClick={() => copy(x.comment)} className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold" style={{ color: 'var(--ad)' }}><Copy size={12} />コピー</button></div>}
                        </div>
                      ))}
                      {vs.map((v) => { const r = rowOf(v.rowNo); const t = LEVEL_LABEL[v.level]; return (
                        <div key={v.rowNo} className="flex flex-wrap items-center gap-2">
                          <span className="chip" style={{ background: `var(--tone-${t.tone}-bg)`, color: `var(--tone-${t.tone}-fg)` }}>{t.label}</span>
                          <span className="num">{r?.date || '—'}</span><span className="text-muted">{r?.category}</span><span className="num">{yen(r?.amount || 0)}</span>
                          <span>{v.reasons.join('・')}</span>{v.kintai && <span className="text-faint">freee：{v.kintai}</span>}
                        </div>); })}
                      {(p.mres?.verdicts || []).map((v) => { const t = LEVEL_LABEL[v.level]; const a = p.apps.find((x) => x.key === v.key); return (
                        <div key={v.key} className="flex flex-wrap items-center gap-2">
                          <span className="chip" style={{ background: `var(--tone-${t.tone}-bg)`, color: `var(--tone-${t.tone}-fg)` }}>{t.label}</span>
                          <span>{a?.title || v.ym}</span><span className="num">{yen(a?.amount || 0)}</span><span className="text-muted">{v.reasons.join('・')}</span>
                        </div>); })}
                    </div>
                  )}
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-4 py-8 text-center text-[12.5px] text-muted">ここに出す人はいません</li>}
          </ul>
        </div>
      </>}
    </div>
  );
}
