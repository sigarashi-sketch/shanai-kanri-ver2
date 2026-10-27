'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Copy, FilePlus2, Heading, Plus, Printer, Save, Search, Trash2, X } from 'lucide-react';
import { Button, PageTitle, SkeletonRows, Tabs } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { postLive } from '@/lib/live/post';
import { HONORS, blankDoc, lineAmount, nextNumber, todayYmd, totals, ymdJa, type MDoc, type MIssuer, type MLine } from '@/lib/mitsumori';

// 見積書作成（経理管理・10-27 shoya「経理管理に見積書つくるタブつくって・請求書作成と同じような実装でいい」）。
//   ・左＝入力欄（宛先・番号・日付・件名・条件・明細・発行元）、右＝A4 の見本。見本の形は請求書作成（今の seikyu-make.html）の雛形と同じ位置・大きさ
//   ・PDF はブラウザの印刷（PDF に保存）で作る（請求書作成と同じ）。ファイル名は「宛先御中_件名_見積書_番号」。ここからは送らない
//   ・発行元（社名・登録番号・住所）は今の請求書作成の発行元（ミンミカの会社＋追加した発行元・/ik/api/seikyu?action=issuers）から選ぶ。選んだあと手で直せる
//   ・保存は ver2（/api/live/mitsumori・saiyou.settings）。直す・保存・消すは 経理管理の「直す」以上
type Tab = 'make' | 'list';
type Entry = { id: string; label: string; issuer: MIssuer };
type IkIssuer = { name?: string; formal?: string; regNo?: string; email?: string; address?: string };
type IkCustom = { id?: string | number; label?: string; formal?: string; reg_no?: string; email?: string; address?: string; dept?: string };

const yen = (n: number | null | undefined) => (n == null ? '' : Math.round(n).toLocaleString('ja-JP'));
const BODY_ROWS = 12, ROWS1 = 17, ROWSN = 37, TAIL = 8;   // 請求書作成と同じ（1枚目は明細欄12行。多いときは 1枚目17行・続き37行・内訳と備考に8行ぶん）

function pagesOf(ls: MLine[]): MLine[][] {
  if (ls.length <= BODY_ROWS) return [ls];
  const pages: MLine[][] = [];
  let rest = ls.slice(), cap = ROWS1;
  while (rest.length) {
    const chunk = rest.slice(0, cap);
    if (chunk.length < rest.length) while (chunk.length > 1 && chunk[chunk.length - 1].head) chunk.pop();   // 見出しの行がページの最後に1人で残らないように
    pages.push(chunk); rest = rest.slice(chunk.length); cap = ROWSN;
  }
  const last = pages[pages.length - 1];
  if (last.length + TAIL > (pages.length === 1 ? ROWS1 : ROWSN)) pages.push([]);   // 内訳・備考が入らなければもう1枚
  return pages;
}

function LinesTable({ rows, blanks }: { rows: MLine[]; blanks: number }) {
  return (
    <table className="lines">
      <colgroup><col style={{ width: '103.7mm' }} /><col style={{ width: '21.6mm' }} /><col style={{ width: '24.1mm' }} /><col /></colgroup>
      <tbody>
        <tr><th>摘要</th><th>数量</th><th>単価</th><th>金額</th></tr>
        {rows.map((l, i) => l.head
          ? <tr key={i} className="hdrow"><td colSpan={4}>{l.d}</td></tr>
          : <tr key={i}><td>{l.d}</td><td className="r">{l.q == null ? '' : `${l.q} ${l.u}`}</td><td className="r">{yen(l.p)}</td><td className="r">{yen(lineAmount(l))}</td></tr>)}
        {Array.from({ length: blanks }, (_, i) => <tr key={`b${i}`}><td /><td /><td /><td /></tr>)}
      </tbody>
    </table>
  );
}

function Sheet({ d }: { d: MDoc }) {
  const t = totals(d.lines);
  const lines = d.lines.filter((l) => l.head ? l.d.trim() : l.d.trim() || l.q != null || l.p != null);
  const pages = pagesOf(lines), n = pages.length;
  const is = d.issuer;
  const to = `${d.to || '（宛先未定）'} ${d.honor}`;
  const tail = (
    <>
      <div className="brk"><div className="r1"><span>内訳</span><span>10%対象(税抜)</span><span>{yen(t.subtotal)}円</span></div><div className="r2"><span /><span>10%消費税</span><span>{yen(t.tax)}円</span></div></div>
      <div className="rmk"><div className="h">備考</div><div className="b">{d.remark}</div></div>
    </>
  );
  return (
    <div className="sheetset">
      <div className={`sheet${n > 1 ? ' multi' : ''}`}>
        <div className="ab ttl">御見積書</div>
        <div className="ab to">{to}</div>
        <div className="ab meta"><span>見積日</span><span>{ymdJa(d.date)}</span><span>見積番号</span><span>{d.number}</span><span>登録番号</span><span>{is.regNo}</span></div>
        <div className="ab iss">
          <div className="nm">{is.formal}</div>
          <div className="em">{is.email}</div>
          <div className="ad">{is.address.replace(/(号|番地)\s+/, '$1\n')}</div>
          <div>{is.dept}</div>
          {is.tel && <div>TEL {is.tel}</div>}
        </div>
        <div className="ab lead">下記の通りお見積り申し上げます。</div>
        <div className="ab subj"><span>件名</span><span>{d.subject}</span></div>
        <table className="ab amt">
          <colgroup><col style={{ width: '30mm' }} /><col style={{ width: '25.9mm' }} /><col /></colgroup>
          <tbody>
            <tr><th>小計</th><th>消費税</th><th>お見積金額</th></tr>
            <tr><td>{yen(t.subtotal)}円</td><td>{yen(t.tax)}円</td><td className="big">{yen(t.total)}円</td></tr>
          </tbody>
        </table>
        <table className="ab cond">
          <colgroup><col style={{ width: '30mm' }} /><col /></colgroup>
          <tbody>
            <tr><th>有効期限</th><td>{d.validUntil}</td></tr>
            <tr><th>納期・作業期間</th><td>{d.delivery}</td></tr>
            <tr><th>支払条件</th><td>{d.payTerms}</td></tr>
            <tr><th>作業場所</th><td>{d.place}</td></tr>
          </tbody>
        </table>
        <LinesTable rows={pages[0]} blanks={n === 1 ? Math.max(0, BODY_ROWS - lines.length) : 0} />
        {n === 1 && tail}
        <div className="pg">1 / {n}</div>
      </div>
      {pages.slice(1).map((rows, i) => (
        <div key={i} className="sheet cont">
          <div className="conth">{to}　御見積書{d.number ? `（${d.number}）` : ''}の続き</div>
          {rows.length > 0 && <LinesTable rows={rows} blanks={0} />}
          {i === n - 2 && tail}
          <div className="pg">{i + 2} / {n}</div>
        </div>
      ))}
    </div>
  );
}

// 見本の雛形（請求書作成の .sheet と同じ mm。「入金期日・振込先」の欄を「有効期限・納期・支払条件・作業場所」に替えた）
const SHEET_CSS = `
.msheet .sheet { width: 210mm; min-height: 297mm; box-sizing: border-box; margin: 0 auto; position: relative; background: #fff; color: #111;
  font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif; font-weight: 400; font-size: 9pt; line-height: 1.3;
  box-shadow: 0 20px 50px -24px rgba(15,23,42,.35); border-radius: 2px; padding: 158.1mm 14.8mm 3mm 15.3mm; }
.msheet .ab { position: absolute; }
.msheet .ttl { top: 14.6mm; left: 0; right: 0; text-align: center; font-size: 16.5pt; letter-spacing: .1em; }
.msheet .to { left: 15.3mm; top: 34.6mm; width: 105mm; font-size: 13pt; border-bottom: 1px solid #222; padding-bottom: 1mm; }
.msheet .meta { left: 127.1mm; top: 34.4mm; width: 68.1mm; display: grid; grid-template-columns: auto 1fr; grid-auto-rows: 5.6mm; align-items: center; font-size: 8.8pt; }
.msheet .meta span:nth-child(even) { text-align: right; }
.msheet .iss { left: 127.1mm; top: 57mm; width: 68.1mm; font-size: 8.8pt; line-height: 5.1mm; }
.msheet .iss .nm { font-size: 11pt; line-height: 6mm; }
.msheet .iss .em { font-size: 8.3pt; margin-top: .6mm; }
.msheet .iss .ad { margin-top: 3.3mm; white-space: pre-line; }
.msheet .lead { left: 15.3mm; top: 82.6mm; font-size: 8pt; }
.msheet .subj { left: 15.3mm; top: 89.2mm; display: grid; grid-template-columns: 20.3mm 83mm; font-size: 11pt; line-height: 5.1mm; }
.msheet table { border-collapse: collapse; table-layout: fixed; }
.msheet .amt { left: 15.3mm; top: 106.3mm; width: 103.7mm; }
.msheet .amt th, .msheet .amt td, .msheet .cond th, .msheet .cond td, .msheet .lines th, .msheet .lines td { border: 1px solid #222; }
.msheet .amt th { height: 6.6mm; font-weight: 400; font-size: 8.8pt; text-align: center; padding: 0; }
.msheet .amt td { height: 8.6mm; text-align: right; padding: 0 1.6mm; font-size: 8.8pt; font-variant-numeric: tabular-nums; white-space: nowrap; }
.msheet .amt td.big { font-size: 15.5pt; font-weight: 500; letter-spacing: -.01em; }
.msheet .cond { left: 15.3mm; top: 124.3mm; width: 103.7mm; }
.msheet .cond th { height: 6.3mm; font-weight: 400; font-size: 8.8pt; text-align: center; padding: 0; }
.msheet .cond td { height: 6.3mm; font-size: 8.8pt; padding: 0 1.6mm; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.msheet .lines { width: 179.9mm; }
.msheet .lines th { height: 6.35mm; font-weight: 400; font-size: 8.8pt; text-align: center; padding: 0; }
.msheet .lines td { height: 6.08mm; padding: 0 1.6mm; font-size: 8.8pt; font-variant-numeric: tabular-nums; vertical-align: middle; }
.msheet .lines td.r { text-align: right; white-space: nowrap; }
.msheet .lines tr.hdrow td { text-align: center; font-weight: 700; font-size: 10.5pt; letter-spacing: .06em; background: #eef2f6; }
.msheet .brk { margin: 4.7mm 0 0 103.7mm; width: 76.2mm; height: 11.2mm; border: 1px solid #222; box-sizing: border-box; padding: 1.2mm 1.6mm 0 1.6mm; }
.msheet .brk .r1 { display: grid; grid-template-columns: 8.5mm 1fr auto; font-size: 9.2pt; line-height: 4.6mm; }
.msheet .brk .r2 { display: grid; grid-template-columns: 8.5mm 1fr auto; font-size: 5.6pt; line-height: 3.6mm; }
.msheet .rmk { margin-top: 3.5mm; min-height: 21.9mm; border: 1px solid #222; box-sizing: border-box; padding: .7mm 5.6mm 2mm; position: relative; width: 179.9mm; }
.msheet .rmk .h { font-size: 8.8pt; }
.msheet .rmk .b { margin-top: 2.4mm; white-space: pre-line; font-size: 8.8pt; }
.msheet .sheet + .sheet { margin-top: 10mm; }
.msheet .sheet.cont { padding: 16mm 14.8mm 3mm 15.3mm; height: 297mm; min-height: 0; }
.msheet .sheet.multi { height: 297mm; }
.msheet .conth { font-size: 9pt; color: #333; margin-bottom: 4mm; }
.msheet .pg { position: absolute; top: 285.6mm; left: 0; right: 0; text-align: center; font-size: 9pt; letter-spacing: .1em; }
#mitsu-print { display: none; }
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #fff !important; }
  body > *:not(#mitsu-print) { display: none !important; }
  #mitsu-print { display: block !important; }
  #mitsu-print .sheet { box-shadow: none; border-radius: 0; margin: 0 !important; height: 296mm; min-height: 0; overflow: hidden; page-break-after: always; break-after: page; }
  #mitsu-print .sheet:last-child { page-break-after: auto; break-after: auto; }
}
`;

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`flex min-w-0 flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}><span className="text-xs font-semibold text-muted">{label}</span>{children}</label>;
}
const INPUT = 'min-h-9 w-full min-w-0 rounded-lg border border-field bg-surface px-2 text-body outline-none focus:border-ink disabled:opacity-60';

export default function MitsumoriPage() {
  const { can } = usePerms();
  const canEdit = can('keiri', 'edit');
  const [tab, setTab] = useState<Tab>('make');
  const [list, setList] = useState<{ st: 'loading' | 'ok' | 'error'; docs: MDoc[]; error?: string }>({ st: 'loading', docs: [] });
  const [doc, setDoc] = useState<MDoc>(() => blankDoc());
  const [base, setBase] = useState('');          // 開いた版の updatedAt（新しいものは空）
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [q, setQ] = useState('');
  const [printEl, setPrintEl] = useState<HTMLElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/live/mitsumori', { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as { docs?: MDoc[]; error?: string };
      if (!r.ok) throw new Error(j.error || `読めませんでした（${r.status}）`);
      setList({ st: 'ok', docs: j.docs || [] });
      return j.docs || [];
    } catch (e) {
      setList({ st: 'error', docs: [], error: (e as Error).message });
      return [];
    }
  }, []);

  // 発行元の候補（請求書作成と同じ：ミンミカの会社＋追加した発行元）。読めなければ手で入れる
  useEffect(() => {
    fetch('/ik/api/seikyu?action=issuers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { issuers?: IkIssuer[]; custom?: IkCustom[] }) => setEntries([
        ...(j.issuers || []).map((i) => ({ id: `m:${i.name}`, label: i.formal || i.name || '', issuer: { formal: i.formal || i.name || '', regNo: i.regNo || '', email: i.email || '', address: i.address || '', dept: '管理部', tel: '' } })),
        ...(j.custom || []).map((c) => ({ id: `c:${c.id}`, label: c.label || c.formal || '', issuer: { formal: c.formal || '', regNo: c.reg_no || '', email: c.email || '', address: c.address || '', dept: c.dept ?? '管理部', tel: '' } })),
      ]))
      .catch(() => setEntries([]));
  }, []);

  useEffect(() => {
    void load().then((docs) => setDoc((d) => (d.id || dirty ? d : { ...d, number: nextNumber(docs, d.date) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // 新しい見積書で発行元が空なら、候補のいちばん上を入れておく
  useEffect(() => {
    if (!entries?.length) return;
    setDoc((d) => (d.issuerId || d.issuer.formal ? d : { ...d, issuerId: entries[0].id, issuer: { ...entries[0].issuer } }));
  }, [entries]);

  useEffect(() => { setPrintEl(document.body); }, []);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = (patch: Partial<MDoc>) => { setDoc((d) => ({ ...d, ...patch })); setDirty(true); setMsg(null); };
  const setIssuer = (patch: Partial<MIssuer>) => set({ issuer: { ...doc.issuer, ...patch } });
  const setLine = (i: number, patch: Partial<MLine>) => set({ lines: doc.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const moveLine = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= doc.lines.length) return;
    const ls = doc.lines.slice(); [ls[i], ls[j]] = [ls[j], ls[i]]; set({ lines: ls });
  };
  const numIn = (v: string) => (v.trim() === '' ? null : Number(v.replace(/,/g, '')));
  const t = useMemo(() => totals(doc.lines), [doc.lines]);

  const leaveOk = () => !dirty || window.confirm('保存していない変更があります。捨ててよいですか？');
  const fresh = () => {
    if (!leaveOk()) return;
    const b = blankDoc(list.docs);
    setDoc(entries?.length ? { ...b, issuerId: entries[0].id, issuer: { ...entries[0].issuer } } : b);
    setBase(''); setDirty(false); setMsg(null); setTab('make');
  };
  const open = (d: MDoc) => {
    if (!leaveOk()) return;
    setDoc(structuredClone(d)); setBase(d.updatedAt || ''); setDirty(false); setMsg(null); setTab('make');
  };
  const duplicate = (d: MDoc) => {
    if (!leaveOk()) return;
    const date = todayYmd();
    setDoc({ ...structuredClone(d), id: '', number: nextNumber(list.docs, date), date, createdBy: undefined, createdAt: undefined, updatedBy: undefined, updatedAt: undefined });
    setBase(''); setDirty(true); setMsg({ tone: 'ok', text: `${d.number} を写しました。直して保存すると新しい見積書になります` }); setTab('make');
  };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await postLive<{ doc: MDoc }>('/api/live/mitsumori', { action: 'save', id: doc.id || undefined, base, doc });
      setDoc(r.doc); setBase(r.doc.updatedAt || ''); setDirty(false);
      setMsg({ tone: 'ok', text: `${r.doc.number || '見積書'} を保存しました` });
      void load();
    } catch (e) {
      setMsg({ tone: 'bad', text: (e as Error).message });
    } finally { setBusy(false); }
  };
  const remove = async (d: MDoc) => {
    if (!window.confirm(`${d.number}（${d.to || '宛先未定'}）を消しますか？`)) return;
    try {
      await postLive('/api/live/mitsumori', { action: 'delete', id: d.id });
      if (doc.id === d.id) { setDoc(blankDoc(list.docs)); setBase(''); setDirty(false); }
      setMsg({ tone: 'ok', text: `${d.number} を消しました` });
      void load();
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); }
  };
  const print = () => {
    const t0 = document.title;
    document.title = [`${doc.to || '宛先未定'}${doc.honor}`, doc.subject, '見積書', doc.number].filter(Boolean).join('_').replace(/[\\/:*?"<>|]/g, '');
    setTimeout(() => { window.print(); document.title = t0; }, 60);
  };

  const shown = list.docs.filter((d) => !q.trim() || `${d.number}${d.to}${d.subject}`.replace(/\s/g, '').includes(q.replace(/\s/g, '')));
  const lock = !canEdit;

  return (
    <main className="flex flex-col gap-4">
      <style>{SHEET_CSS}</style>
      <PageTitle title="見積書作成" sub="宛先・条件・明細を入れると右の見本に流し込みます。PDF はブラウザの印刷（PDF に保存）で作ります（請求書作成と同じ）">
        <Button onClick={fresh}><FilePlus2 size={15} className="mr-1 inline" />新しく作る</Button>
      </PageTitle>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: 'make', label: '作成' }, { key: 'list', label: '保存した見積書', count: list.docs.length }]} />
      {msg && <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.tone === 'ok' ? 'text-ok' : 'text-bad'}`} style={{ background: `var(--tone-${msg.tone === 'ok' ? 'ok' : 'bad'}-bg)` }}>{msg.text}<button onClick={() => setMsg(null)} aria-label="閉じる" className="ml-auto"><X size={14} /></button></div>}

      {tab === 'list' && (
        <section className="mo-fade-up flex flex-col gap-3">
          <label className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-lg border border-field bg-surface px-2">
            <Search size={14} className="text-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="番号・宛先・件名で探す" className="w-56 bg-transparent text-body outline-none" />
          </label>
          {list.st === 'loading' ? <SkeletonRows rows={5} cols={6} /> : list.st === 'error' ? <div className="text-sm text-bad">読めませんでした（{list.error}）</div> : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-body">
                  <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">見積番号</th><th className="px-2 py-2.5 font-semibold">宛先</th><th className="px-2 py-2.5 font-semibold">件名</th><th className="px-2 py-2.5 text-right font-semibold">お見積金額</th><th className="px-2 py-2.5 font-semibold">見積日</th><th className="px-2 py-2.5 font-semibold">最後に直した人</th><th className="px-4 py-2.5" /></tr></thead>
                  <tbody>
                    {shown.map((d) => (
                      <tr key={d.id} onClick={() => open(d)} className={`row cursor-pointer border-t border-line-soft ${doc.id === d.id ? 'bg-sunken' : ''}`} title="押すと開く">
                        <td className="num px-4 py-2">{d.number}</td>
                        <td className="px-2 py-2">{d.to || <span className="text-faint">（宛先未定）</span>}</td>
                        <td className="px-2 py-2 text-muted">{d.subject}</td>
                        <td className="num px-2 py-2 text-right">{yen(totals(d.lines).total)}円</td>
                        <td className="num px-2 py-2">{d.date}</td>
                        <td className="px-2 py-2 text-sm text-muted">{d.updatedBy?.split('@')[0]}<span className="ml-1 text-xs text-faint">{(d.updatedAt || '').slice(0, 10)}</span></td>
                        <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <span className="inline-flex gap-1">
                            <Button size="sm" onClick={() => duplicate(d)} title="写して新しく作る"><Copy size={13} className="mr-1 inline" />写す</Button>
                            <Button size="sm" variant="danger" onClick={() => remove(d)} disabled={lock} title={lock ? needText('edit') : '消す'}><Trash2 size={13} /></Button>
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!shown.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-faint">{list.docs.length ? '当てはまる見積書がありません' : 'まだ保存した見積書はありません。「作成」で作って保存すると、ここに並びます'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'make' && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(380px,460px)_minmax(0,1fr)]">
          <section className="mo-fade-up flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-md">{doc.id ? doc.number : '新しい見積書'}</b>
              {dirty ? <span className="chip" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>未保存</span>
                : doc.id ? <span className="text-xs text-faint">{doc.updatedBy?.split('@')[0]} が {(doc.updatedAt || '').slice(0, 16).replace('T', ' ')} に保存</span> : null}
              <span className="ml-auto inline-flex gap-2">
                <Button onClick={print}><Printer size={15} className="mr-1 inline" />PDF・印刷</Button>
                <Button variant="primary" onClick={save} disabled={lock || busy || (!dirty && !!doc.id)} title={lock ? needText('edit') : undefined}><Save size={15} className="mr-1 inline" />{busy ? '保存中…' : '保存'}</Button>
              </span>
            </div>
            {lock && <div className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">見るだけの権限です。入れて PDF にはできますが、保存は経理管理の「直す」以上の人だけです</div>}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="宛先" wide>
                <span className="flex gap-2">
                  <input className={INPUT} value={doc.to} onChange={(e) => set({ to: e.target.value })} placeholder="株式会社〇〇" />
                  <select className="min-h-9 w-24 flex-none rounded-lg border border-field bg-surface px-2 text-body outline-none focus:border-ink" value={doc.honor} onChange={(e) => set({ honor: e.target.value as MDoc['honor'] })}>{HONORS.map((h) => <option key={h}>{h}</option>)}</select>
                </span>
              </Field>
              <Field label="件名" wide><input className={INPUT} value={doc.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="〇〇業務支援の件" /></Field>
              <Field label="見積番号"><input className={INPUT} value={doc.number} onChange={(e) => set({ number: e.target.value })} /></Field>
              <Field label="見積日"><input type="date" className={INPUT} value={doc.date} onChange={(e) => set({ date: e.target.value })} /></Field>
              <Field label="有効期限"><input className={INPUT} value={doc.validUntil} onChange={(e) => set({ validUntil: e.target.value })} placeholder="発行日より30日" /></Field>
              <Field label="納期・作業期間"><input className={INPUT} value={doc.delivery} onChange={(e) => set({ delivery: e.target.value })} placeholder="2026年11月1日〜2027年1月31日" /></Field>
              <Field label="支払条件"><input className={INPUT} value={doc.payTerms} onChange={(e) => set({ payTerms: e.target.value })} /></Field>
              <Field label="作業場所"><input className={INPUT} value={doc.place} onChange={(e) => set({ place: e.target.value })} placeholder="貴社指定場所" /></Field>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2"><b className="flex-none text-sm">明細</b><span className="text-xs text-faint">金額＝数量×単価（円未満切り捨て）。見出しの行は見本で真ん中寄せ・太字になります</span></div>
              {doc.lines.map((l, i) => (
                <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-line-soft p-2">
                  <div className="flex items-center gap-1.5">
                    {l.head && <Heading size={14} className="flex-none text-faint" aria-label="見出し" />}
                    <input className={INPUT} value={l.d} onChange={(e) => setLine(i, { d: e.target.value })} placeholder={l.head ? '見出し（例：要員名：山田太郎）' : '摘要（例：作業費 SE 1名）'} />
                    <button onClick={() => moveLine(i, -1)} disabled={i === 0} aria-label="上へ" className="rounded-md p-1 text-faint hover:bg-sunken disabled:opacity-30"><ArrowUp size={14} /></button>
                    <button onClick={() => moveLine(i, 1)} disabled={i === doc.lines.length - 1} aria-label="下へ" className="rounded-md p-1 text-faint hover:bg-sunken disabled:opacity-30"><ArrowDown size={14} /></button>
                    <button onClick={() => set({ lines: doc.lines.filter((_, k) => k !== i) })} aria-label="この行を消す" className="rounded-md p-1 text-faint hover:bg-sunken"><X size={14} /></button>
                  </div>
                  {!l.head && (
                    <div className="grid grid-cols-[1fr_5rem_1.4fr_auto] items-center gap-1.5">
                      <input type="number" step="any" className={`${INPUT} num text-right`} value={l.q ?? ''} onChange={(e) => setLine(i, { q: numIn(e.target.value) })} placeholder="数量" aria-label="数量" />
                      <input className={INPUT} value={l.u} onChange={(e) => setLine(i, { u: e.target.value })} placeholder="単位" aria-label="単位" />
                      <input type="number" step="any" className={`${INPUT} num text-right`} value={l.p ?? ''} onChange={(e) => setLine(i, { p: numIn(e.target.value) })} placeholder="単価" aria-label="単価" />
                      <span className="num min-w-[6.5rem] text-right text-sm">{lineAmount(l) == null ? '—' : `${yen(lineAmount(l))}円`}</span>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => set({ lines: [...doc.lines, { d: '', q: 1, u: '人月', p: null }] })}><Plus size={13} className="mr-1 inline" />行を足す</Button>
                <Button size="sm" onClick={() => set({ lines: [...doc.lines, { head: true, d: '', q: null, u: '', p: null }] })}><Heading size={13} className="mr-1 inline" />見出しの行を足す</Button>
              </div>
              <div className="ml-auto grid grid-cols-[auto_auto] gap-x-4 text-sm">
                <span className="text-muted">小計（税抜）</span><span className="num text-right">{yen(t.subtotal)}円</span>
                <span className="text-muted">消費税（10%）</span><span className="num text-right">{yen(t.tax)}円</span>
                <b>お見積金額</b><b className="num text-right">{yen(t.total)}円</b>
              </div>
            </div>

            <Field label="備考"><textarea rows={3} className={`${INPUT} py-1.5`} value={doc.remark} onChange={(e) => set({ remark: e.target.value })} /></Field>

            <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
              <b className="text-sm">発行元</b>
              <select className={INPUT} value={doc.issuerId} onChange={(e) => { const en = entries?.find((x) => x.id === e.target.value); set(en ? { issuerId: en.id, issuer: { ...en.issuer, tel: doc.issuer.tel } } : { issuerId: '' }); }}>
                <option value="">手で入れる</option>
                {(entries || []).map((en) => <option key={en.id} value={en.id}>{en.label}</option>)}
              </select>
              <span className="text-xs text-faint">{entries === null ? '発行元の候補を読んでいます…' : entries.length ? '候補は請求書作成の発行元（ミンミカの会社と「発行元を管理」で足したもの）。選んだあと下で直せます' : '請求書作成の発行元を読めませんでした。下に手で入れてください'}</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="社名" wide><input className={INPUT} value={doc.issuer.formal} onChange={(e) => setIssuer({ formal: e.target.value })} /></Field>
                <Field label="登録番号"><input className={INPUT} value={doc.issuer.regNo} onChange={(e) => setIssuer({ regNo: e.target.value })} placeholder="T1234567890123" /></Field>
                <Field label="部署"><input className={INPUT} value={doc.issuer.dept} onChange={(e) => setIssuer({ dept: e.target.value })} /></Field>
                <Field label="住所" wide><input className={INPUT} value={doc.issuer.address} onChange={(e) => setIssuer({ address: e.target.value })} /></Field>
                <Field label="メール"><input className={INPUT} value={doc.issuer.email} onChange={(e) => setIssuer({ email: e.target.value })} /></Field>
                <Field label="電話"><input className={INPUT} value={doc.issuer.tel} onChange={(e) => setIssuer({ tel: e.target.value })} /></Field>
              </div>
            </div>
          </section>

          <section className="mo-fade-up msheet overflow-x-auto rounded-xl border border-line bg-sunken p-4" style={{ ['--i' as string]: 1 }}>
            <Sheet d={doc} />
          </section>
        </div>
      )}

      {printEl && createPortal(<div id="mitsu-print" className="msheet"><Sheet d={doc} /></div>, printEl)}
    </main>
  );
}
