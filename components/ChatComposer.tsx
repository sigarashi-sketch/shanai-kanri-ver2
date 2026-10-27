'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Paperclip, X } from 'lucide-react';
import { useMotivation } from './Motivation';
import { HoldButton } from './renraku/parts';
import type { ReplyTo } from './ChatLog';

// チャットの送る欄（連絡のチャットと要員ページのチャットで共通・10-27 shoya「画像とファイル送付・リプライ機能なくなってる」）。
//   今の chat.html と同じ決まり：
//   ・添付は 画像1枚＋PDF1つまで。選んだ瞬間に上げて置き場（path）だけ持つ。送ると 本文→画像→PDF の順に1回で届く（PDF は「PDFを開く」カード）
//     画像は長辺1600px の JPEG に縮めてから（プレビュー用に 420px も）。PDF は 20MB まで・Storage へ直接 PUT → 今のシステムが中身を確かめる
//   ・返信（引用）は吹き出しの ↩ で選ぶ → 入力欄の上に出る（✕ で外す）。送ると相手の LINE に引用つきで届く
//   ・送るのは長押し。添付だけでも送れる
const IMG_MAX_SIDE = 1600, IMG_PREVIEW_SIDE = 420, IMG_MAX_BYTES = 3 * 1024 * 1024, PDF_MAX_BYTES = 20 * 1024 * 1024;
type Img = { path: string; previewPath: string; url: string; name: string; info: string };
type Pdf = { path: string; name: string; size: number };

const sizeText = (n: number) => (n < 1024 ? `${n}B` : n < 1048576 ? `${Math.round(n / 1024)}KB` : `${Math.round(n / 104857.6) / 10}MB`);

function toJpeg(file: File, maxSide: number, quality: number): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) throw new Error('画像のサイズを取得できませんでした');
        const sc = Math.min(1, maxSide / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
        const cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        const ctx = cv.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        resolve({ dataUrl: cv.toDataURL('image/jpeg', quality), w: cw, h: ch });
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('この画像を読み込めませんでした（HEIC などは JPEG/PNG にしてから）')); };
    img.src = url;
  });
}

async function post(action: string, body: unknown) {
  const r = await fetch(`/api/live/chat-upload?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 413) throw new Error('大きすぎて送れませんでした（4.5MB まで）');
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!j.ok) throw new Error(String(j.error || `うまくいきませんでした（${r.status}）`));
  return j;
}

export function ChatComposer({ kind, target, live, canTalk, placeholder, disabledTitle, quick, reply, onClearReply, sentToast, onSent, className }: {
  kind: 'person' | 'group'; target: string; live: boolean; canTalk: boolean; placeholder: string; disabledTitle?: string;
  quick?: readonly string[]; reply: ReplyTo | null; onClearReply: () => void;
  sentToast: { text: string; sub: string }; onSent: () => void; className?: string;
}) {
  const { hit, toast } = useMotivation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [img, setImg] = useState<Img | null>(null);
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [up, setUp] = useState('');
  const [menu, setMenu] = useState(false);
  const imgIn = useRef<HTMLInputElement>(null);
  const pdfIn = useRef<HTMLInputElement>(null);
  const cur = useRef(target);
  cur.current = target;

  // 添付は開いていた相手のもの（相手が変わったら外す）
  useEffect(() => { setImg(null); setPdf(null); setUp(''); setMenu(false); }, [target]);

  const fail = (what: string, e: unknown) => { setUp(''); toast({ text: `${what}を添付できませんでした`, sub: (e as Error).message || String(e) }); };

  const pickImage = async (file: File) => {
    const owner = target;
    setUp('画像を縮めています…');
    try {
      const [main, prev] = await Promise.all([toJpeg(file, IMG_MAX_SIDE, 0.85), toJpeg(file, IMG_PREVIEW_SIDE, 0.8)]);
      const bytes = Math.floor((main.dataUrl.length - main.dataUrl.indexOf(',') - 1) * 3 / 4);
      if (bytes > IMG_MAX_BYTES) throw new Error(`縮めても大きすぎます（${sizeText(bytes)}）`);
      setUp('画像を上げています…');
      const j = await post('image', { dataUrl: main.dataUrl, previewDataUrl: prev.dataUrl });
      if (cur.current !== owner) { setUp(''); return; }   // 上げている間に別の相手を開いたら捨てる（違う人へ送らない）
      setImg({ path: String(j.path), previewPath: String(j.previewPath || ''), url: String(j.previewUrl || j.url || prev.dataUrl), name: file.name || '画像', info: `${main.w}×${main.h} / ${sizeText(bytes)}` });
      setUp('');
    } catch (e) { fail('画像', e); }
  };

  const pickPdf = async (file: File) => {
    const isPdf = file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name || ''));
    if (!isPdf) { toast({ text: 'PDF ファイルを選んでください', sub: '' }); return; }
    if (file.size > PDF_MAX_BYTES) { toast({ text: 'PDF が大きすぎます', sub: `${sizeText(file.size)}（20MB まで）` }); return; }
    const owner = target;
    setUp(`PDF を上げています…（${sizeText(file.size)}）`);
    try {
      const u = await post('pdf-url', { filename: file.name, contentType: 'application/pdf', size: file.size });
      const put = await fetch(String(u.signedUrl), { method: 'PUT', body: file, headers: { 'Content-Type': 'application/pdf' } });
      if (!put.ok) throw new Error(`上げられませんでした（${put.status}）`);
      const c = await post('pdf-confirm', { path: u.path });
      if (cur.current !== owner) { setUp(''); return; }
      setPdf({ path: String(c.path || u.path), name: String(u.name || file.name), size: Number(c.size) || file.size });
      setUp('');
    } catch (e) { fail('PDF', e); }
  };

  const hasAttach = !!(img || pdf);
  const send = async () => {
    if (!live || !canTalk || up || (!text.trim() && !hasAttach)) return;
    setBusy(true);
    try {
      const body = {
        kind, ...(kind === 'person' ? { userId: target } : { groupId: target }), text,
        ...(reply ? { replyTo: reply.id } : {}),
        ...(img ? { image: { path: img.path, previewPath: img.previewPath } } : {}),
        ...(pdf ? { pdf } : {}),
      };
      const r = await fetch('/api/live/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; warning?: string };
      if (j.ok) { hit(); toast({ text: sentToast.text, sub: j.warning || sentToast.sub }); setText(''); setImg(null); setPdf(null); onClearReply(); onSent(); }
      else toast({ text: '送れませんでした', sub: j.error || '' });
    } catch (e) { toast({ text: '送れませんでした', sub: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const chip = 'flex max-w-full items-center gap-2 rounded-[10px] border border-line bg-soft px-2 py-1 text-sm';
  return (
    <div className={className}>
      {reply && (
        <div className="flex items-center gap-2 px-4 pt-2">
          <div className="min-w-0 flex-1 border-l-[3px] pl-2 text-sm" style={{ borderColor: 'var(--a)' }}>
            <span className="block text-xs font-semibold text-muted">↩ {reply.who} に返信</span>
            <span className="line-clamp-2 block break-all text-ink">{reply.text}</span>
          </div>
          <button type="button" onClick={onClearReply} title="返信（引用）を外す" aria-label="返信を外す" className="p-1 text-muted hover:text-ink"><X size={16} /></button>
        </div>
      )}
      {(img || pdf || up) && (
        <div className="flex flex-wrap gap-2 px-4 pt-2">
          {img && (
            <div className={chip}>
              <img src={img.url} alt="" className="size-11 rounded-md object-cover" />
              <span className="max-w-[200px] truncate">{img.name}</span><span className="text-xs text-faint">{img.info}</span>
              <button type="button" onClick={() => setImg(null)} title="添付を外す" aria-label="画像を外す" className="text-muted hover:text-ink"><X size={15} /></button>
            </div>
          )}
          {pdf && (
            <div className={chip}>
              <span className="text-xs font-bold" style={{ color: 'var(--tone-bad-fg)' }}>PDF</span>
              <span className="max-w-[200px] truncate" title="このファイル名が相手の LINE に出ます">{pdf.name}</span><span className="text-xs text-faint">{sizeText(pdf.size)}</span>
              <button type="button" onClick={() => setPdf(null)} title="添付を外す" aria-label="PDF を外す" className="text-muted hover:text-ink"><X size={15} /></button>
            </div>
          )}
          {up && <div className={`${chip} text-muted`}><Loader2 size={14} className="animate-spin" />{up}</div>}
        </div>
      )}
      {quick && canTalk && <div className="flex flex-wrap gap-1.5 px-4 pt-2">{quick.map((x) => <button key={x} type="button" onClick={() => setText((t) => (t ? t + x : x))} className="rounded-full border border-line px-2.5 py-1 text-sm">{x}</button>)}</div>}
      <div className="flex items-end gap-2 px-4 py-3">
        <div className="relative shrink-0">
          <button type="button" onClick={() => setMenu((m) => !m)} disabled={!canTalk || !!up || busy} title="画像・PDF を添付" aria-label="添付"
            className="flex size-10 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
            <Paperclip size={17} />
          </button>
          {menu && (
            <div className="absolute bottom-12 left-0 z-30 min-w-[180px] rounded-[10px] border border-line bg-surface p-1 shadow-lg">
              <button type="button" disabled={!!img} onClick={() => { setMenu(false); imgIn.current?.click(); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-body hover:bg-soft disabled:opacity-40"><ImageIcon size={15} />画像（JPEG / PNG）</button>
              <button type="button" disabled={!!pdf} onClick={() => { setMenu(false); pdfIn.current?.click(); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-body hover:bg-soft disabled:opacity-40"><FileText size={15} />PDF（20MB まで）</button>
            </div>
          )}
          <input ref={imgIn} type="file" accept="image/jpeg,image/png,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pickImage(f); }} />
          <input ref={pdfIn} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pickPdf(f); }} />
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={5000} disabled={!canTalk} aria-label="送る文" placeholder={placeholder}
          className="min-h-[44px] min-w-0 flex-1 resize-y rounded-[10px] border border-field bg-surface px-3 py-2 text-body outline-none disabled:bg-soft" />
        <HoldButton label={busy ? '送っています…' : '長押しで送る'} disabled={!canTalk || busy || !!up || (!text.trim() && !hasAttach)} title={!canTalk ? disabledTitle : undefined} onDone={send} />
      </div>
    </div>
  );
}
