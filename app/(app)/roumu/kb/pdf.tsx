'use client';

import { useRef, useState } from 'react';
import { Copy, FileText } from 'lucide-react';
import { useMotivation } from '@/components/Motivation';

// PDF から本文を取り出す（本物・10-25）。今の POST /api/kb?action=extractPdf に /api/live/kb-pdf から渡すだけ。
//   ・本文のテキストを返すだけで、どこにも保存しない（記事にするのは今の社内システムの「労務法務ナレッジ」で貼り付けて）
//   ・PDF だけ・4MB まで。スキャンした PDF（画像）は文字が取れない
type Res = { ok?: boolean; text?: string; pages?: number; chars?: number; warn?: string; error?: string };

export function KbPdf() {
  const { toast } = useMotivation();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { setRes({ ok: false, error: 'ファイルが大きすぎます（4MB まで）。分けるか、PDF を開いて本文をコピーしてください' }); return; }
    if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) { setRes({ ok: false, error: 'PDF を選んでください' }); return; }
    setBusy(true); setRes(null);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/live/kb-pdf', { method: 'POST', body: fd });
      const j = (await r.json().catch(() => ({}))) as Res;
      setRes(r.ok ? j : { ok: false, error: j.error || `取り出せませんでした（${r.status}）` });
    } catch (e) { setRes({ ok: false, error: (e as Error).message }); } finally { setBusy(false); }
  };
  const copy = () => res?.text && navigator.clipboard?.writeText(res.text).then(() => toast({ text: '本文をコピーしました', sub: '今の社内システムの「貼り付けて一括下書き」に貼ってください' })).catch(() => {});
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <b>PDF から本文を取り出す</b><span className="text-[12px] text-muted">記事の下書きの材料に（保存はしません）</span>
        <button onClick={() => ref.current?.click()} disabled={busy} className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-3 text-[12.5px] font-semibold disabled:opacity-40"><FileText size={14} />{busy ? '取り出しています…' : 'PDF を選ぶ'}</button>
        <input ref={ref} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {res && res.ok === false && <div className="text-[12.5px]" style={{ color: 'var(--tone-bad-fg)' }}>{res.error}</div>}
      {res?.ok && <>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">{res.pages}ページ・{res.chars?.toLocaleString('ja-JP')}字{res.warn && <span className="text-warn">{res.warn}</span>}
          <button onClick={copy} className="ml-auto inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--ad)' }}><Copy size={12} />コピー</button></div>
        <textarea readOnly value={res.text || ''} rows={8} aria-label="取り出した本文" className="w-full rounded-lg border border-field bg-soft px-3 py-2 text-[12.5px]" />
      </>}
    </div>
  );
}
