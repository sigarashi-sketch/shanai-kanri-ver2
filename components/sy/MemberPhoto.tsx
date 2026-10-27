'use client';
import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import type { Member } from '@/components/sy/compat';
import { fx } from '@/components/sy/compat';
import { Avatar } from '@/components/sy/ui';

// 名簿の詳細の 大きい丸アイコン。押すと 写真を選んで 差し替え（いけどんのコミュニティと 共通の写真・lib/photos.ts）
//   画像は 画面で 真ん中を 正方形に 切り抜いて 400px の JPEG に 縮めてから 送る（本文を 数十KBに 収める）
function squareJpeg(file: File, size = 400): Promise<string> {
  return new Promise((ok, ng) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas'); c.width = c.height = Math.min(size, s);
      const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); ng(new Error('この画像は読めません（HEICはJPEGにしてから選んでください）')); };
    img.src = url;
  });
}

export default function MemberPhoto({ m, onPatch }: { m: Member; onPatch: (p: Partial<Member>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    const r = await fetch('/api/sy/s/photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: m.key, name: m.name, ...body }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { fx.toast(j.error || '保存に失敗しました', 'err'); return; }
    onPatch({ photo: j.url || undefined }); fx.toast(done);
  }
  async function pick(f: File | undefined) {
    if (!f) return;
    try { await send({ dataUrl: await squareJpeg(f) }, '写真を変えました'); }
    catch (e) { fx.toast((e as Error).message, 'err'); }
  }
  return (
    <div className="relative shrink-0">
      <button type="button" disabled={busy} onClick={() => input.current?.click()} title="写真を変える" className="group relative block rounded-full">
        <Avatar name={m.name} src={m.photo} size="lg" ring />
        <span className="absolute inset-[4px] grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {busy ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
        </span>
        <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full bg-white text-ig-text shadow ring-1 ring-ig-border">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
        </span>
      </button>
      {m.photo && !busy && (
        <button type="button" onClick={() => confirm(`${m.name} さんの写真を消します。よろしいですか？`) && send({ delete: true }, '写真を消しました')}
          className="mt-1.5 flex w-full items-center justify-center gap-0.5 text-[11px] text-ig-muted hover:text-ig-stop"><Trash2 size={11} />写真を消す</button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
