'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, FileDown, FileSpreadsheet, FileText, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import { Dialog } from '@/components/Dialog';
import { Z } from '@/lib/layers';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PersonName } from '@/components/Person';
import { errText, horyuPost } from '@/lib/horyu-post';
import { download, makeZip } from '@/lib/zip';
import type { DayRow, FareRow, GenbaData, KadoRoster, KadoRow } from '@/lib/types/keiri';
import { HoryuNote } from '../HoryuNote';

// 稼働表出力（保留）。今の社内システムの「稼働表出力」（kadohyo.html）と「現場稼動表」（genba-kadohyo.html）を2つのタブにしたもの。
//   ※「稼働表出力（営業事務・ログイン不要）」（kadohyo-jimu.html）は同じ中身の URL キー版。ver2 はログインして使うのでこの画面で同じことができる
//   稼働表出力：
//     ・名簿＝今の GET /api/kadohyo?action=roster（読むだけ）。対象者は既定で「freee勤怠提出」の人だけ（今と同じ）
//     ・勤怠＝freee 連携の人は今のシステムが freee から読む（出力のとき）。▲ CSV必要の人は 勤怠詳細CSV を取り込む（読むだけ・DB に入れない＝今と同じ）
//     ・交通費＝人ごとに入力して保存（今の POST /api/kadohyo?action=fares）。日付は freee の稼働日から選ぶ（/api/kadohyo?action=days）
//     ・出力＝1人×1形式ずつ今のシステムで Excel / PDF を作る（action=export）。2つ以上なら ZIP 1つにまとめて保存（今と同じ）
//   現場稼動表：GET /api/genba-kadohyo（kanri@ に届いた勤務表の控え・読むだけ）。ファイルは Gmail の該当メールを開くリンク
//   人は未経験の人だけ。名前を押すと人の小窓
const prevYm = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const ymLabel = (ym: string) => { const m = ym.match(/^(\d{4})-(\d{2})$/); return m ? `${m[1]}年${+m[2]}月` : ym; };
const yen = (n: number) => `¥${(n || 0).toLocaleString()}`;
const sel = 'min-h-9 rounded-[10px] border border-field bg-surface px-2 text-[13px] text-ink';
const ghost = 'inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 text-[12px] font-semibold disabled:opacity-40';
const tone = (t: string) => ({ background: `var(--tone-${t}-bg)`, color: `var(--tone-${t}-fg)` });

export default function KadohyoPage() {
  const [tab, setTab] = useState<'out' | 'genba'>('out');
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-24 pt-[22px]">
      <PageTitle title="稼働表出力" sub="freee の勤怠から稼働表（Excel・PDF）を作ります。現場から届いた勤務表もここで見られます" />
      <HoryuNote from="稼働表出力・現場稼動表" />
      <div role="tablist" className="flex gap-1 border-b border-line">
        {([['out', '稼働表出力 / freee勤怠提出'], ['genba', '現場稼動表']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="px-3.5 py-2.5 text-[14px]"
            style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>{l}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis">{tab === 'out' ? <Output /> : <Genba />}</div>
    </main>
  );
}

// ============================ 稼働表出力 ============================
function Output() {
  const [ym, setYm] = useState(prevYm);
  const rs = useIke<KadoRoster>(`kadohyo?action=roster&ym=${ym}`);
  const live = rs.live;
  const mk = useMikeiken();
  const perms = usePerms();
  const can = perms.can('roumu', 'edit') || perms.can('eigyo', 'edit');
  const { hit, toast } = useMotivation();
  const all: KadoRow[] = useMemo(() => (live ? mk.keep(rs.data?.rows ?? [], 'name') : []), [live, rs.data, mk]);
  const [kind, setKind] = useState<'freee' | 'all'>('freee'), [shozoku, setShozoku] = useState(''), [joukyou, setJoukyou] = useState(''), [q, setQ] = useState('');
  const [selN, setSelN] = useState<Record<string, boolean>>({});
  const [pick, setPick] = useState<Record<string, { employeeId: string; companyId: string }>>({});
  const [csvDays, setCsvDays] = useState<Record<string, DayRow[]>>({});
  const [csvLog, setCsvLog] = useState<{ tone: string; label: string; text: string }[]>([]);
  const [fares, setFares] = useState<Record<string, FareRow[]>>({});
  const [xlsx, setXlsx] = useState(true), [pdf, setPdf] = useState(true), [withFare, setWithFare] = useState(true);
  const [prog, setProg] = useState<{ done: number; total: number; text: string; list: { ok: boolean; text: string }[] } | null>(null);
  const [fareFor, setFareFor] = useState<KadoRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setSelN({}); setCsvDays({}); setCsvLog([]); setFares({}); setPick({}); }, [ym]);

  const opts = (k: 'shozoku' | 'joukyou') => [...new Set(all.map((r) => r[k]).filter(Boolean))].sort();
  const counts = all.reduce((c, r) => ({ ...c, [r.kinmuKind || 'freee']: (c[r.kinmuKind || 'freee'] || 0) + 1 }), {} as Record<string, number>);
  const rows = all.filter((r) => (kind === 'all' || (r.kinmuKind || 'freee') === 'freee') && (!q || r.name.includes(q)) && (!shozoku || r.shozoku === shozoku) && (!joukyou || r.joukyou === joukyou));
  const ids = (r: KadoRow) => pick[r.normName] ?? (r.employeeId && r.companyId ? { employeeId: r.employeeId, companyId: r.companyId } : null);
  const ready = (r: KadoRow) => !!csvDays[r.normName] || !!ids(r);
  const chosen = all.filter((r) => selN[r.normName]);
  const need = chosen.filter((r) => !ready(r));
  const forms = (xlsx ? 1 : 0) + (pdf ? 1 : 0);
  const fareOf = (r: KadoRow) => { const l = fares[r.normName]; return l ? { rows: l.length, total: l.reduce((a, b) => a + (b.fare || 0), 0) } : r.fare ?? { rows: 0, total: 0 }; };

  const uploadCsv = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!live) return;
    setCsvLog([{ tone: 'mute', label: '解析中', text: '…' }]);
    const fd = new FormData();
    [...files].forEach((f, i) => fd.append(`file${i}`, f, f.name));
    const r = await fetch('/api/live/horyu/kadohyo-csv', { method: 'POST', body: fd }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { ok?: boolean; error?: string | { message?: string }; people?: { filename: string; name: string; normName: string; ym: string; workedDays: number; totalWork: string; days: DayRow[] }[]; errors?: { filename: string; error: string }[] };
    if (!r || !r.ok || !j.ok) { setCsvLog([{ tone: 'bad', label: '失敗', text: (typeof j?.error === 'string' ? j.error : j?.error?.message) || '読み取れませんでした' }]); return; }
    const log: typeof csvLog = [], add: Record<string, DayRow[]> = {}, on: Record<string, boolean> = {};
    for (const p of j.people ?? []) {
      if (p.ym !== ym) { log.push({ tone: 'bad', label: '警告', text: `${p.filename} → ${ymLabel(p.ym)}（対象月と違うため取り込みませんでした）` }); continue; }
      const row = all.find((x) => x.normName === p.normName);
      if (!row) { log.push({ tone: 'warn', label: '未突合', text: `${p.filename} → ${ymLabel(ym)}の名簿にいない人です` }); continue; }
      add[p.normName] = p.days; on[p.normName] = true;
      log.push({ tone: 'ok', label: '取込OK', text: `${p.filename} → ${row.name} / 稼働 ${p.workedDays} 日 / 合計 ${p.totalWork}` });
    }
    for (const e of j.errors ?? []) log.push({ tone: 'bad', label: '失敗', text: `${e.filename} → ${e.error}` });
    setCsvDays((c) => ({ ...c, ...add })); setSelN((s) => ({ ...s, ...on })); setCsvLog(log.length ? log : [{ tone: 'mute', label: '—', text: '取り込めるデータがありませんでした' }]);
  };

  const run = async () => {
    if (!live) return;
    const formats = [...(xlsx ? ['xlsx'] : []), ...(pdf ? ['pdf'] : [])] as ('xlsx' | 'pdf')[];
    const targets = chosen.filter(ready);
    const jobs = targets.flatMap((r) => formats.map((f) => ({ r, f })));
    if (!jobs.length) return;
    const files: { name: string; blob: Blob }[] = [], fails: string[] = [], list: { ok: boolean; text: string }[] = [];
    setProg({ done: 0, total: jobs.length, text: '生成中…', list: [] });
    for (const [i, { r, f }] of jobs.entries()) {   // 1件ずつ（今と同じ・今のシステムの関数を同時にたくさん起こさない）
      const name = `稼働表_${ym.replace('-', '')}_${r.name.replace(/\s/g, '')}.${f}`;
      {
        const id = ids(r), fl = fares[r.normName];
        const target = { name: r.name, employeeId: id?.employeeId ?? '', companyId: id?.companyId ?? '', ...(csvDays[r.normName] ? { days: csvDays[r.normName] } : {}), ...(fl?.length ? { fares: fl } : {}) };
        const res = await fetch('/api/live/horyu/kadohyo-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ym, format: f, includeFare: withFare, target }) }).catch(() => null);
        if (res?.ok && !(res.headers.get('content-type') || '').includes('application/json')) {
          const fn = res.headers.get('x-kadohyo-filename');
          const file = { name: fn ? decodeURIComponent(fn) : name, blob: await res.blob() };
          files.push(file); list.push({ ok: true, text: file.name });
        } else {
          const j = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
          const e = j?.error || '出力できませんでした';
          fails.push(`${r.name} (${f}): ${e}`); list.push({ ok: false, text: `${r.name} (${f}) — ${e}` });
        }
      }
      setProg({ done: i + 1, total: jobs.length, text: `生成中… ${i + 1}/${jobs.length}`, list: [...list] });
    }
    if (!files.length) { setProg((p) => p && { ...p, text: '出力できたファイルがありません' }); return; }
    if (files.length === 1 && !fails.length) { download(files[0].blob, files[0].name); setProg((p) => p && { ...p, text: `完了 — ${files[0].name}` }); hit(); return; }
    if (fails.length) files.push({ name: '_失敗一覧.txt', blob: new Blob([fails.join('\n') + '\n'], { type: 'text/plain' }) });
    const zn = `稼働表_${ym.replace('-', '')}.zip`;
    download(await makeZip(files), zn);
    hit();
    setProg((p) => p && { ...p, text: `完了 — ${zn}（${files.length - (fails.length ? 1 : 0)} ファイル${fails.length ? ` / 失敗 ${fails.length} 件` : ''}）` });
    toast({ text: `稼働表を ${files.length - (fails.length ? 1 : 0)} ファイル作りました` });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <LiveBanner state={rs.state} error={rs.error} onReload={rs.reload} note="今の稼働表出力の名簿です。交通費の保存・出力は今のシステムで行います" />
      <MikeikenNote mk={mk} live={live} />
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3.5">
        <label className="flex flex-col gap-1 text-[12px] text-muted">対象月<input type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} className={sel} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">対象者<select value={kind} onChange={(e) => setKind(e.target.value as 'freee' | 'all')} className={sel}><option value="freee">freee勤怠提出のみ</option><option value="all">全員（名簿すべて）</option></select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">所属<select value={shozoku} onChange={(e) => setShozoku(e.target.value)} className={sel}><option value="">すべて</option>{opts('shozoku').map((o) => <option key={o}>{o}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">状況<select value={joukyou} onChange={(e) => setJoukyou(e.target.value)} className={sel}><option value="">すべて</option>{opts('joukyou').map((o) => <option key={o}>{o}</option>)}</select></label>
        <label className="flex min-w-[170px] flex-1 flex-col gap-1 text-[12px] text-muted">氏名検索<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="氏名の一部" className={sel} /></label>
        <button className={ghost} onClick={rs.reload}><RefreshCw size={12} />名簿を再取得</button>
      </section>

      <section className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3 text-[12.5px]">
          <b className="text-[14px]">対象者を選ぶ</b>
          <button className={ghost} onClick={() => setSelN(Object.fromEntries(rows.map((r) => [r.normName, true])))}>全選択</button>
          <button className={ghost} onClick={() => setSelN({})}>解除</button>
          <button className={ghost} onClick={() => setSelN(Object.fromEntries(rows.filter((r) => r.source === 'freee').map((r) => [r.normName, true])))}>● 自動取得の人だけ</button>
          <span className="ml-auto text-muted">{kind === 'all' ? <>名簿すべて <b>{all.length}</b> 名（うち freee勤怠提出 {counts.freee ?? 0} 名）</> : <>freee勤怠提出 <b>{counts.freee ?? 0}</b> 名（現場勤怠必要 {counts.genba ?? 0} 名・提出不要 {counts.none ?? 0} 名は非表示）</>}</span>
          <span className="text-muted"><b className="text-ink">{chosen.length}</b> 名選択中</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-[12.5px]">
            <thead><tr className="border-b border-line-soft text-left text-[11.5px] text-faint">
              <th className="w-9 p-2" /><th className="p-2">氏名</th><th className="p-2">所属</th><th className="p-2">上位会社 / 勤怠表ルート</th><th className="p-2">状況</th><th className="p-2">勤怠ソース</th><th className="p-2">交通費</th>
            </tr></thead>
            <tbody>
              {rs.state === 'loading' && <tr><td colSpan={7} className="p-5 text-faint">読み込み中…</td></tr>}
              {live && rows.length === 0 && <tr><td colSpan={7} className="p-5 text-faint">{kind === 'freee' && all.length ? '該当者がいません（この月の名簿に freee勤怠提出の人がいません。「対象者」を全員にすると出ます）' : '該当者がいません（対象月の従業員名簿に行がありません）'}</td></tr>}
              {rows.map((r) => { const f = fareOf(r); return (
                <tr key={r.normName} className="border-b border-line-soft align-top" style={r.taisha ? { opacity: 0.6 } : undefined}>
                  <td className="p-2"><input type="checkbox" aria-label={`${r.name}を選ぶ`} checked={!!selN[r.normName]} onChange={(e) => setSelN((s) => ({ ...s, [r.normName]: e.target.checked }))} /></td>
                  <td className="whitespace-nowrap p-2"><PersonName name={r.name} />{r.taisha && <span className="chip ml-1" style={tone('mute')} title={r.taishaBi ? `退社日 ${r.taishaBi}` : '退社'}>退社</span>}</td>
                  <td className="p-2 text-muted">{r.shozoku}</td>
                  <td className="p-2">{r.joi || <span className="text-faint">—</span>}{r.kinmuKind === 'genba' && <span className="chip ml-1" style={tone('warn')}>{r.kinmuReason || '現場勤怠'}</span>}
                    <div className="text-[11px] text-faint">{r.kinmuRoute || '—'} ／ {r.kinmuDeadline || '—'}</div></td>
                  <td className="p-2 text-muted">{r.joukyou}</td>
                  <td className="p-2">
                    {r.source === 'freee' ? <span className="chip" style={tone('ok')}>● 自動取得</span> : r.source === 'freee_ambiguous' ? <span className="chip" style={tone('bad')}>⚠ 要選択</span> : <span className="chip" style={tone('warn')}>▲ CSV必要</span>}
                    {r.source === 'freee_ambiguous' && (
                      <select className="mt-1 block min-h-8 rounded-lg border border-field bg-surface px-1 text-[11.5px]" value={pick[r.normName] ? `${pick[r.normName].companyId}|${pick[r.normName].employeeId}` : ''}
                        onChange={(e) => { const [c, emp] = e.target.value.split('|'); setPick((p) => { const n = { ...p }; if (c && emp) n[r.normName] = { companyId: c, employeeId: emp }; else delete n[r.normName]; return n; }); }}>
                        <option value="">従業員を選択</option>{(r.candidates ?? []).map((c) => <option key={c.company_id + c.employee_id} value={`${c.company_id}|${c.employee_id}`}>{c.name} / {c.num}</option>)}</select>)}
                    {csvDays[r.normName] && <div className="text-[11px] text-faint">CSV取込済 {csvDays[r.normName].filter((d) => d.worked).length}日</div>}
                  </td>
                  <td className="whitespace-nowrap p-2">{f.rows ? <span className="chip" style={tone('ok')}>{yen(f.total)}</span> : <span className="text-faint">未入力</span>}
                    <button className="ml-1.5 text-[12px] font-semibold underline" style={{ color: 'var(--ad)' }} onClick={() => setFareFor(r)}>入力</button></td>
                </tr>); })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line-soft p-3 text-[11.5px] leading-relaxed text-faint">
          対象者は既定で freee勤怠提出 の人だけです（上の「対象者」で切替）。現場勤怠必要＝上位会社が KMS Partners / ティアフォー。<br />
          ● 自動取得 = freee 連携の事業所　▲ CSV必要 = 未連携の所属　⚠ 要選択 = freee に同名が複数
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-3.5">
        <div className="mb-2 flex items-center gap-2"><b className="text-[14px]">勤怠詳細CSVの取り込み</b>
          <span className="chip" style={tone(need.length ? 'warn' : 'ok')}>{need.length ? `▲ ${need.length}名ぶん必要` : '✓ 揃っています'}</span></div>
        <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); uploadCsv(e.dataTransfer.files); }}
          className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-field bg-soft p-5 text-[12.5px] text-muted">
          <Upload size={20} />ブラウザ版 freee で落とした <b>勤怠詳細CSV</b> をここにドラッグ＆ドロップ（押しても選べます）
          <span className="text-[11.5px] text-faint">複数ファイル可 / 文字コードは自動判定（Shift-JIS・UTF-8）</span>
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" multiple className="sr-only" onChange={(e) => { uploadCsv(e.target.files); e.target.value = ''; }} />
        {csvLog.length > 0 && <ul className="mt-2 flex flex-col gap-1 text-[12px]">{csvLog.map((l, i) => <li key={i}><span className="chip mr-1.5" style={tone(l.tone)}>{l.label}</span>{l.text}</li>)}</ul>}
        <p className="mt-2 text-[11.5px] text-faint">CSV の氏名と対象月は自動で読み取ります。対象月が違うファイルは取り込みません。取り込んだ勤怠はこの画面を閉じるまでの一時保持です（DB には入れません）。</p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-3.5">
        <b className="text-[14px]">出力</b>
        <div className="mt-2 flex flex-wrap gap-8 text-[13px]">
          <div className="flex flex-col gap-1"><span className="text-[12px] text-muted">ファイル形式</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={xlsx} onChange={(e) => setXlsx(e.target.checked)} /><FileSpreadsheet size={14} />Excel（.xlsx）</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} /><FileText size={14} />PDF</label></div>
          <div className="flex flex-col gap-1"><span className="text-[12px] text-muted">シート構成</span>
            <label className="flex items-center gap-1.5 text-faint"><input type="checkbox" checked disabled />稼働表（必須）</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={withFare} onChange={(e) => setWithFare(e.target.checked)} /><b>現場交通費を含める</b></label></div>
          <div className="flex max-w-[260px] flex-col gap-1"><span className="text-[12px] text-muted">まとめ方</span>
            <span className="text-[12.5px]">{(chosen.length - need.length) * forms > 1 ? <><b>ZIP</b> で1ファイルにまとめます</> : '単体ファイルで保存'}</span></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-primary inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-4 text-[13.5px] font-semibold disabled:opacity-40"
            disabled={!live || !can || !chosen.length || !forms || chosen.length === need.length || (!!prog && prog.done < prog.total)} title={can ? undefined : needText('edit')} onClick={run}>
            <FileDown size={15} />稼働表を出力（{(chosen.length - need.length) * forms} ファイル）</button>
          {need.length > 0 && <span className="text-[12px] text-warn">※ {need.map((r) => r.name).join('・')} は勤怠が未取得です（CSV を取り込むか、従業員を選択してください）</span>}
        </div>
        {prog && (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-soft"><i className="mo-bar block h-full" style={{ width: `${(prog.done / prog.total) * 100}%`, background: 'var(--a)' }} /></div>
            <div className="mt-1 text-[12px] text-muted">{prog.text}</div>
            <ul className="mt-1 flex flex-col gap-0.5 text-[12px]">{prog.list.map((l, i) => <li key={i}><span className="chip mr-1.5" style={tone(l.ok ? 'ok' : 'bad')}>{l.ok ? '生成' : '失敗'}</span>{l.text}</li>)}</ul>
          </div>
        )}
      </section>

      {fareFor && <FareDialog row={fareFor} ym={ym} live={live} can={can} ids={ids(fareFor)} csv={csvDays[fareFor.normName]} cached={fares[fareFor.normName]}
        onSaved={(rows) => setFares((f) => ({ ...f, [fareFor.normName]: rows }))} onClose={() => setFareFor(null)} />}
    </div>
  );
}

// ---- 交通費の入力（今の交通費ダイアログ。日付は稼働日から選ぶ・前月からコピー・保存） ----
type Line = { date: string; note: string; carrier: string; from: string; to: string; fare: string };
const blank = (): Line => ({ date: '', note: '', carrier: '電車', from: '', to: '', fare: '' });
const toLine = (r: FareRow): Line => ({ date: r.date || '', note: r.note || '', carrier: r.carrier || '電車', from: r.from || '', to: r.to || '', fare: r.fare ? String(r.fare) : '' });
const toRow = (l: Line): FareRow => ({ date: l.date, note: l.note || undefined, carrier: l.carrier, from: l.from, to: l.to, fare: Number(l.fare) || 0 });
const dLabel = (d: string) => { const x = new Date(`${d}T00:00:00`); return isNaN(x.getTime()) ? d : `${x.getMonth() + 1}/${x.getDate()}（${'日月火水木金土'[x.getDay()]}）`; };

function FareDialog({ row, ym, live, can, ids, csv, cached, onSaved, onClose }: {
  row: KadoRow; ym: string; live: boolean; can: boolean; ids: { employeeId: string; companyId: string } | null; csv?: DayRow[]; cached?: FareRow[];
  onSaved: (rows: FareRow[]) => void; onClose: () => void;
}) {
  const [lines, setLines] = useState<Line[] | null>(null), [days, setDays] = useState<DayRow[]>([]), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const { hit } = useMotivation();
  const empId = ids?.employeeId ?? '', compId = ids?.companyId ?? '';
  const first = useRef(cached);
  useEffect(() => {
    let on = true;
    const cached = first.current;
    (async () => {
      let ds: DayRow[] = csv ?? [];
      let saved: FareRow[] = cached ?? [];
      if (live) {
        const [d, f] = await Promise.all([
          !csv && empId && compId ? horyuPost<{ days?: DayRow[] }>('kadohyo-days', { ym, employee_id: empId, company_id: compId }) : null,
          cached ? null : horyuPost<{ rows?: FareRow[] }>('kadohyo-fares', { op: 'get', ym, name: row.name }),
        ]);
        if (d) ds = d.ok ? d.data.days ?? [] : [];
        if (f) { if (!f.ok) setMsg(`保存済みの交通費が読めませんでした：${errText(f)}`); saved = f.ok ? f.data.rows ?? [] : []; }
      }
      if (!on) return;
      setDays(ds.filter((x) => x.worked));
      setLines(saved.length ? saved.map(toLine) : [blank()]);
    })();
    return () => { on = false; };
  }, [row.name, row.fare?.rows, ym, live, empId, compId, csv]);

  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls!.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = (lines ?? []).reduce((a, l) => a + (Number(l.fare) || 0), 0);
  const copyPrev = async () => {
    const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 2, 1), prev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setMsg('前月を読み込み中…');
    const rows = live ? await horyuPost<{ rows?: FareRow[] }>('kadohyo-fares', { op: 'get', ym: prev, name: row.name }).then((r) => (r.ok ? r.data.rows ?? [] : [])) : [];
    if (!rows.length) { setMsg(`${ymLabel(prev)}の交通費はありません`); return; }
    setLines(rows.map((r, i) => ({ ...toLine(r), date: days[i]?.date ?? '' })));   // 日付は当月の稼働日へ順に（前月の日付は持ってこない）
    setMsg(`${ymLabel(prev)}から ${rows.length} 行コピーしました（日付は要確認）`);
  };
  const save = async (close: boolean) => {
    const rows = (lines ?? []).map(toRow).filter((r) => (r.date || r.note) && r.fare);
    if (!live) return;
    setBusy(true); setMsg('保存しています…');
    const r = await horyuPost('kadohyo-fares', { ym, name: row.name, rows });
    setBusy(false);
    if (!r.ok) { setMsg(`保存に失敗：${errText(r)}`); return; }
    hit(); onSaved(rows); setMsg('✓ 保存しました');
    if (close) onClose();
  };

  return (
    <Dialog label="現場交通費" onClose={onClose} z={[Z.drawer - 1, Z.drawer]} className="fixed left-1/2 top-1/2 w-[min(760px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 shadow-xl">
      <div className="flex max-h-[85vh] flex-col gap-3 overflow-y-auto rounded-xl bg-surface p-5">
        <div className="flex items-center gap-2"><h2 className="text-[16px] font-bold">現場交通費 — <PersonName name={row.name} />（{ymLabel(ym)}）</h2><button className="ml-auto" onClick={onClose} aria-label="閉じる"><X size={16} /></button></div>
        {!lines ? <div className="py-6 text-[12.5px] text-faint">読み込み中…</div> : (<>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead><tr className="text-left text-[11.5px] text-faint"><th className="p-1">出勤日</th><th className="p-1">交通機関</th><th className="p-1">区間（自）</th><th className="p-1">区間（至）</th><th className="p-1 text-right">金額</th><th className="w-8" /></tr></thead>
              <tbody>{lines.map((l, i) => (
                <tr key={i}>
                  <td className="p-1">{!l.date && l.note ? <input value={l.note} onChange={(e) => set(i, 'note', e.target.value)} title="日付ではない行（定期代など）。原文のまま帳票の出勤日欄に出ます" className={sel + ' w-full'} />
                    : <select value={l.date} onChange={(e) => set(i, 'date', e.target.value)} className={sel + ' w-full'}><option value="">選択</option>
                      {days.map((d) => <option key={d.date} value={d.date}>{dLabel(d.date)}</option>)}
                      {l.date && !days.some((d) => d.date === l.date) && <option value={l.date}>{dLabel(l.date)}（稼働日外）</option>}</select>}</td>
                  <td className="p-1"><select value={l.carrier} onChange={(e) => set(i, 'carrier', e.target.value)} className={sel}>{['電車', 'バス', 'タクシー', 'その他'].map((c) => <option key={c}>{c}</option>)}</select></td>
                  <td className="p-1"><input value={l.from} onChange={(e) => set(i, 'from', e.target.value)} placeholder="五反野(往復)" className={sel + ' w-full'} /></td>
                  <td className="p-1"><input value={l.to} onChange={(e) => set(i, 'to', e.target.value)} placeholder="東京" className={sel + ' w-full'} /></td>
                  <td className="p-1"><input type="number" min={0} step={10} value={l.fare} onChange={(e) => set(i, 'fare', e.target.value)} className={sel + ' w-24 text-right'} /></td>
                  <td className="p-1"><button aria-label="この行を消す" onClick={() => setLines((ls) => { const n = ls!.filter((_, j) => j !== i); return n.length ? n : [blank()]; })}><Trash2 size={14} className="text-faint" /></button></td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={ghost} onClick={() => setLines((ls) => [...ls!, blank()])}><Plus size={12} />行を足す</button>
            <button className={ghost} onClick={copyPrev}><Copy size={12} />前月からコピー</button>
            <span className="ml-auto text-[13px]">合計 <b className="num">{yen(total)}</b></span>
          </div>
          {days.length === 0 && <p className="text-[11.5px] text-faint">稼働日が読めなかったので日付の候補がありません（▲ CSV必要の人は先に CSV を取り込んでください）。</p>}
          <div className="flex items-center gap-2 border-t border-line-soft pt-3">
            <span className="text-[12px] text-muted">{msg}</span>
            <button className={`${ghost} ml-auto`} onClick={onClose}>閉じる</button>
            <button className="btn-primary min-h-9 rounded-[10px] px-4 text-[13px] font-semibold disabled:opacity-40" disabled={!can || busy} title={can ? undefined : needText('edit')} onClick={() => save(true)}>保存して閉じる</button>
          </div>
        </>)}
      </div>
    </Dialog>
  );
}

// ============================ 現場稼動表 ============================
function Genba() {
  const [ym, setYm] = useState('');
  const g = useIke<GenbaData>(`genba-kadohyo${ym ? `?ym=${ym}` : ''}`);
  const live = g.live;
  const mk = useMikeiken();
  const d = live ? g.data : null;
  const items = useMemo(() => (live ? mk.keep(d?.items ?? [], 'name') : []), [live, d, mk]);
  const missing = useMemo(() => (live ? mk.keep(d?.missing ?? [], 'name') : []), [live, d, mk]);
  const [q, setQ] = useState(''), [tantou, setTantou] = useState('');
  const tantous = [...new Set([...items, ...missing].map((x) => x.tantou).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
  const shown = items.filter((p) => (!tantou || p.tantou === tantou) && (!q || [p.name, p.shozoku, p.tantou, ...p.files.map((f) => f.filename)].join(' ').toLowerCase().includes(q.toLowerCase())));
  const miss = missing.filter((m) => !tantou || m.tantou === tantou);
  const nFiles = shown.reduce((s, p) => s + p.files.length, 0);
  const md = (s: string | null) => { if (!s) return ''; const x = new Date(s); return isNaN(x.getTime()) ? '' : `${x.getMonth() + 1}/${x.getDate()}`; };
  const safe = (u: string) => (/^https:\/\//.test(u) ? u : undefined);
  return (
    <div className="flex flex-col gap-3.5">
      <LiveBanner state={g.state} error={g.error} onReload={g.reload} note="kanri@ に届いた勤務表の控えです（ファイルは Gmail の該当メールを開きます）" />
      <MikeikenNote mk={mk} live={live} />
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3.5">
        <label className="flex flex-col gap-1 text-[12px] text-muted">対象月<select value={ym || d?.ym || ''} onChange={(e) => setYm(e.target.value)} className={sel}>{(d?.months ?? []).map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">担当<select value={tantou} onChange={(e) => setTantou(e.target.value)} className={sel}><option value="">すべて</option>{tantous.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="flex min-w-[170px] flex-1 flex-col gap-1 text-[12px] text-muted">検索<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="氏名・所属・ファイル名" className={sel} /></label>
        <span className="text-[12.5px] text-muted"><b className="text-ink">{shown.length}</b> 名 / ファイル <b className="text-ink">{nFiles}</b> 件</span>
      </section>
      <section className="rounded-xl border border-line bg-surface">
        <div className="border-b border-line-soft p-3 text-[14px] font-bold">{ymLabel(d?.ym ?? '')}の勤務表が届いている人（{shown.length}名）</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead><tr className="border-b border-line-soft text-left text-[11.5px] text-faint"><th className="p-2">氏名</th><th className="p-2">担当</th><th className="p-2">所属</th><th className="p-2">勤務表</th></tr></thead>
            <tbody>
              {g.state === 'loading' && <tr><td colSpan={4} className="p-5 text-faint">読み込み中…</td></tr>}
              {live && !shown.length && <tr><td colSpan={4} className="p-5 text-faint">{d?.ym ? '該当する人はいません' : 'まだ取り込まれた勤務表がありません'}</td></tr>}
              {shown.map((p) => (
                <tr key={p.normalizedName} className="border-b border-line-soft align-top">
                  <td className="whitespace-nowrap p-2"><PersonName name={p.name} />{p.jitai ? <span className="chip ml-1" style={tone('bad')}>辞退</span> : p.kadouChu ? <span className="chip ml-1" style={tone('ok')}>稼働中</span> : null}</td>
                  <td className="p-2 text-muted">{p.tantou || '–'}</td><td className="p-2 text-muted">{p.shozoku || '–'}</td>
                  <td className="p-2"><div className="flex flex-wrap gap-1.5">{p.files.map((f, i) => (
                    <a key={i} href={safe(f.url)} target="_blank" rel="noopener noreferrer" title={`${f.direction === 'out' ? '【送付済】' : ''}${f.subject}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[12px]" style={f.direction === 'out' ? { opacity: 0.7 } : undefined}>
                      {/pdf/i.test(f.mimeType || f.filename) ? <FileText size={12} /> : <FileSpreadsheet size={12} />}<span className="max-w-[220px] truncate">{f.filename}</span><span className="text-faint">{md(f.receivedAt)}</span></a>))}</div></td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </section>
      {miss.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-3.5">
          <div className="mb-2 text-[14px] font-bold">稼働中なのに勤務表が見当たらない人（{miss.length}名）</div>
          <div className="flex flex-wrap gap-1.5">{miss.map((m) => <span key={m.name} className="inline-flex items-center gap-1 rounded-lg bg-soft px-2 py-1 text-[12.5px]" title={m.shozoku}><PersonName name={m.name} />{m.tantou && <small className="text-faint">{m.tantou}</small>}</span>)}</div>
        </section>
      )}
    </div>
  );
}
