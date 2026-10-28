'use client';

import { useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, Pencil, Printer, Search, Trash2, Upload, X } from 'lucide-react';
import { Button, SkeletonRows } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { postLive } from '@/lib/live/post';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { KK_ACCEPT, KK_MAX_BYTES, KK_TYPES, extOf, type KkFile } from '@/lib/mitsumori-kakunou';
import { totals, type MDoc } from '@/lib/mitsumori';

// 見積書の格納（10-28 shoya「請求書 勤怠表の格納の中に 見積書格納するタブもつくって」）。今のシステムに無いので ver2 で作った（lib/mitsumori-kakunou.ts）。
//   ・上＝格納する（ファイル＋取引先・見積番号・月・メモ）。見積番号は 見積書作成で保存した番号から選ぶと 取引先も入る
//   ・下＝格納した見積書の一覧（探す・月で絞る・開く・ダウンロード・直す・消す）。格納する・直す・消すは 経理管理の「直す」以上
//   ・見積書作成で保存した見積書も そのまま一覧に並ぶ（10-28 shoya「見積書作成で保存したらそのまま格納タブにも入るように」）。
//     実体は見積書作成の保存（/api/live/mitsumori）を読むだけ＝写しは作らない。PDF は見積書作成を開いて印刷（?id=…&print=1）、直す・消すは見積書作成で
const API = '/api/live/mitsumori-kakunou';
type Meta = { partner: string; number: string; ym: string; memo: string };
const blank = (): Meta => ({ partner: '', number: '', ym: '', memo: '' });
const sizeText = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const ymJa = (ym: string) => (ym ? `${ym.slice(0, 4)}年${Number(ym.slice(5))}月` : '');
const jst = (iso: string) => { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

function MetaFields({ v, set, docs }: { v: Meta; set: (m: Meta) => void; docs: MDoc[] }) {
  const pickNumber = (number: string) => {
    const d = docs.find((x) => x.number === number);
    set({ ...v, number, partner: v.partner || d?.to || '', ym: v.ym || (d?.date || '').slice(0, 7) });
  };
  const field = 'min-h-9 rounded-lg border border-field bg-surface px-2 text-body outline-none';
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_150px_1.6fr]">
      <label className="flex flex-col gap-1 text-sm text-muted">取引先<input value={v.partner} onChange={(e) => set({ ...v, partner: e.target.value })} placeholder="株式会社〇〇" className={field} /></label>
      <label className="flex flex-col gap-1 text-sm text-muted">見積番号<input value={v.number} onChange={(e) => pickNumber(e.target.value)} list="kk-numbers" placeholder="作成した番号から選べます" className={field} /></label>
      <label className="flex flex-col gap-1 text-sm text-muted">月<input type="month" value={v.ym} onChange={(e) => set({ ...v, ym: e.target.value })} className={field} /></label>
      <label className="flex flex-col gap-1 text-sm text-muted">メモ<input value={v.memo} onChange={(e) => set({ ...v, memo: e.target.value })} placeholder="押印済み・先方返送 など" className={field} /></label>
      <datalist id="kk-numbers">{docs.map((d) => <option key={d.id} value={d.number}>{d.to} {d.subject}</option>)}</datalist>
    </div>
  );
}

export function MitsumoriStore() {
  const { can } = usePerms();
  const lock = !can('keiri', 'edit');
  const list = useLiveRoute<{ files: KkFile[] }>(API);
  const made = useLiveRoute<{ docs: MDoc[] }>('/api/live/mitsumori');
  const docs = useMemo(() => made.data?.docs || [], [made.data]);
  const files = useMemo(() => list.data?.files || [], [list.data]);

  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta>(blank);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [ym, setYm] = useState('');
  const [edit, setEdit] = useState<{ id: string; m: Meta } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const choose = (f: File | null | undefined) => {
    if (!f) return;
    if (!KK_TYPES[extOf(f.name)]) { setMsg({ tone: 'bad', text: '格納できるのは PDF・Excel・Word・画像（png・jpg）だけです' }); return; }
    if (f.size > KK_MAX_BYTES) { setMsg({ tone: 'bad', text: 'ファイルが大きすぎます（10MBまで）' }); return; }
    setMsg(null); setFile(f);
  };

  const upload = async () => {
    if (!file || lock || busy) return;
    setBusy(`上げています…（${sizeText(file.size)}）`); setMsg(null);
    try {
      const u = await postLive<{ path: string; signedUrl: string; contentType: string }>(API, { action: 'upload-url', name: file.name, size: file.size });
      const put = await fetch(u.signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': u.contentType } });
      if (!put.ok) throw new Error(`上げられませんでした（${put.status}）`);
      await postLive(API, { action: 'confirm', path: u.path, name: file.name, ...meta });
      setMsg({ tone: 'ok', text: `「${file.name}」を格納しました` });
      setFile(null); setMeta(blank()); if (input.current) input.current.value = '';
      list.reload();
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); }
    setBusy('');
  };

  const saveEdit = async () => {
    if (!edit || lock) return;
    try { await postLive(API, { action: 'update', id: edit.id, ...edit.m }); setEdit(null); list.reload(); }
    catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); }
  };
  const remove = async (f: KkFile) => {
    if (lock || !window.confirm(`「${f.name}」を一覧から消しますか？`)) return;
    try { await postLive(API, { action: 'delete', id: f.id }); list.reload(); }
    catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); }
  };

  // 格納したファイルと 見積書作成で保存した見積書を 1つの一覧に（新しい順）
  type Item = { kind: 'file'; f: KkFile; ym: string; at: string; hay: string } | { kind: 'made'; d: MDoc; ym: string; at: string; hay: string };
  const items = useMemo<Item[]>(() => [
    ...files.map((f): Item => ({ kind: 'file', f, ym: f.ym, at: f.uploadedAt, hay: `${f.name}${f.partner}${f.number}${f.memo}` })),
    ...docs.map((d): Item => ({ kind: 'made', d, ym: (d.date || '').slice(0, 7), at: d.updatedAt || d.createdAt || '', hay: `見積書作成${d.to}${d.number}${d.subject}` })),
  ].sort((a, b) => b.at.localeCompare(a.at)), [files, docs]);
  const months = useMemo(() => [...new Set(items.map((x) => x.ym).filter(Boolean))].sort().reverse(), [items]);
  const norm = (s: string) => s.replace(/\s/g, '').toLowerCase();
  const shown = items.filter((x) => (!ym || x.ym === ym) && (!q.trim() || norm(x.hay).includes(norm(q))));

  return (
    <main className="flex flex-col gap-4 px-6 pb-12 pt-[18px]">
      <section className="mo-fade-up flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-md font-semibold">見積書を格納する</h2>
          <span className="text-sm text-muted">PDF・Excel・Word・画像（10MBまで）。見積書作成で作った PDF や、先方から返ってきた押印済みの見積書を置いておけます</span>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); if (!lock) setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!lock) choose(e.dataTransfer.files?.[0]); }}
          className={`flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-4 ${drag ? 'border-[var(--a)] bg-soft' : 'border-line'}`}
        >
          <input ref={input} type="file" accept={KK_ACCEPT} className="hidden" onChange={(e) => choose(e.target.files?.[0])} disabled={lock} />
          <Button onClick={() => input.current?.click()} disabled={lock} title={lock ? needText('edit') : undefined}><Upload size={15} className="mr-1 inline" />ファイルを選ぶ</Button>
          {file
            ? <span className="inline-flex items-center gap-2 text-body">{file.name}<span className="text-sm text-faint">{sizeText(file.size)}</span><button onClick={() => { setFile(null); if (input.current) input.current.value = ''; }} aria-label="選び直す" className="text-faint hover:text-ink"><X size={14} /></button></span>
            : <span className="text-sm text-faint">ここにドラッグしても選べます</span>}
        </div>
        <MetaFields v={meta} set={setMeta} docs={docs} />
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={upload} disabled={lock || !file || !!busy} title={lock ? needText('edit') : undefined}>{busy || '格納する'}</Button>
          {msg && <span className={`inline-flex items-center gap-2 text-sm ${msg.tone === 'ok' ? 'text-ok' : 'text-bad'}`}>{msg.text}<button onClick={() => setMsg(null)} aria-label="閉じる"><X size={13} /></button></span>}
        </div>
      </section>

      <section className="mo-fade-up flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-field bg-surface px-2">
            <Search size={14} className="text-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="取引先・番号・ファイル名・メモで探す" className="w-64 bg-transparent text-body outline-none" />
          </label>
          <select value={ym} onChange={(e) => setYm(e.target.value)} className="min-h-9 rounded-lg border border-field bg-surface px-2 text-body">
            <option value="">すべての月</option>
            {months.map((m) => <option key={m} value={m}>{ymJa(m)}</option>)}
          </select>
          <span className="ml-auto text-sm text-muted">{shown.length}件</span>
        </div>
        {list.state === 'loading' && !list.data ? <SkeletonRows rows={5} cols={6} /> : list.state === 'error' && !list.data ? <div className="text-sm text-bad">読めませんでした（{list.error}）</div> : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-body">
                <thead><tr className="th-row text-left"><th className="px-4 py-2.5 font-semibold">ファイル</th><th className="px-2 py-2.5 font-semibold">取引先</th><th className="px-2 py-2.5 font-semibold">見積番号</th><th className="px-2 py-2.5 font-semibold">月</th><th className="px-2 py-2.5 font-semibold">メモ</th><th className="px-2 py-2.5 font-semibold">格納した人</th><th className="px-4 py-2.5" /></tr></thead>
                <tbody>
                  {shown.map((x) => x.kind === 'made' ? (
                    <tr key={'m' + x.d.id} className="row border-t border-line-soft">
                      <td className="px-4 py-2"><a href={`/keiri/mitsumori?id=${x.d.id}`} className="inline-flex items-center gap-1.5 font-semibold hover:underline" title="見積書作成で開く"><FileText size={13} className="text-faint" />{x.d.subject || '見積書'}</a><span className="ml-2 rounded-full bg-sunken px-1.5 py-0.5 text-xs text-muted">見積書作成</span><span className="num ml-2 text-xs text-faint">{totals(x.d.lines).total.toLocaleString('ja-JP')}円</span></td>
                      <td className="px-2 py-2">{x.d.to || <span className="text-faint">—</span>}</td>
                      <td className="num px-2 py-2">{x.d.number}</td>
                      <td className="num px-2 py-2">{ymJa(x.ym)}</td>
                      <td className="px-2 py-2 text-sm text-muted">見積日 {x.d.date}</td>
                      <td className="px-2 py-2 text-sm text-muted">{(x.d.updatedBy || x.d.createdBy || '').split('@')[0]}<span className="ml-1 text-xs text-faint">{x.at ? jst(x.at) : ''}</span></td>
                      <td className="px-4 py-2 text-right">
                        <span className="inline-flex gap-1">
                          <a href={`/keiri/mitsumori?id=${x.d.id}&print=1`} className="btn-secondary btn-sm" title="PDF・印刷（見積書作成で開いて印刷）"><Printer size={13} /></a>
                          <a href={`/keiri/mitsumori?id=${x.d.id}`} className="btn-secondary btn-sm" title="直す・消すは見積書作成で"><Pencil size={13} /></a>
                        </span>
                      </td>
                    </tr>
                  ) : ((f) => edit?.id === f.id ? (
                    <tr key={f.id} className="border-t border-line-soft bg-sunken">
                      <td className="px-4 py-2 align-top text-sm">{f.name}</td>
                      <td colSpan={5} className="px-2 py-2"><MetaFields v={edit.m} set={(m) => setEdit({ id: f.id, m })} docs={docs} /></td>
                      <td className="px-4 py-2 text-right align-top"><span className="inline-flex gap-1"><Button size="sm" variant="primary" onClick={saveEdit}>保存</Button><Button size="sm" onClick={() => setEdit(null)}>やめる</Button></span></td>
                    </tr>
                  ) : (
                    <tr key={f.id} className="row border-t border-line-soft">
                      <td className="px-4 py-2"><a href={`${API}?open=${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold hover:underline" title="開く">{f.name}<ExternalLink size={12} className="text-faint" /></a><span className="ml-2 text-xs text-faint">{sizeText(f.size)}</span></td>
                      <td className="px-2 py-2">{f.partner || <span className="text-faint">—</span>}</td>
                      <td className="num px-2 py-2">{f.number}</td>
                      <td className="num px-2 py-2">{ymJa(f.ym)}</td>
                      <td className="px-2 py-2 text-sm text-muted">{f.memo}</td>
                      <td className="px-2 py-2 text-sm text-muted">{f.uploadedBy.split('@')[0]}<span className="ml-1 text-xs text-faint">{jst(f.uploadedAt)}</span></td>
                      <td className="px-4 py-2 text-right">
                        <span className="inline-flex gap-1">
                          <a href={`${API}?open=${f.id}&dl=1`} className="btn-secondary btn-sm" title="ダウンロード"><Download size={13} /></a>
                          <Button size="sm" onClick={() => setEdit({ id: f.id, m: { partner: f.partner, number: f.number, ym: f.ym, memo: f.memo } })} disabled={lock} title={lock ? needText('edit') : '直す'}><Pencil size={13} /></Button>
                          <Button size="sm" variant="danger" onClick={() => remove(f)} disabled={lock} title={lock ? needText('edit') : '消す'}><Trash2 size={13} /></Button>
                        </span>
                      </td>
                    </tr>
                  ))(x.f))}
                  {!shown.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-faint">{items.length ? '当てはまる見積書がありません' : 'まだ格納した見積書はありません。上の「ファイルを選ぶ」から格納するか、見積書作成で保存すると、ここに並びます'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
