'use client';
import { useCallback, useState } from 'react';
import { FileText, Film, Paperclip, X } from 'lucide-react';

// チャット・配信の添付（画像1枚＋動画1本＋PDF1つ）。選んだ時点で上げておき、送信時は保存先だけ渡す。
//   画像 … 画面で長辺1600pxのJPEGに縮める（＋プレビュー240px）。関数の本文上限(4.5MB)に当てないため
//   動画 … mp4 だけ（LINE の決まり）・50MB まで。PDF と同じく Storage へ直接。1コマ目を JPEG にしてプレビュー画像として上げる
//   PDF  … 大きいので Storage へ直接上げる（/api/s/line/media がURLを作る）。20MBまで
const post = (body: unknown) => fetch('/api/sy/s/line/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

function toJpeg(img: HTMLImageElement, max: number): string {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);   // 透過PNGが黒くならないよう白地を敷く
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((ok, ng) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); ng(new Error('この画像は読めません（HEICはJPEGにしてから添付してください）')); };
    img.src = url;
  });
}

// 動画の1コマ目（0.5秒あたり）を取る。読めない動画（HEVC の mov 等）は ここで止める
function videoFrame(file: File): Promise<HTMLVideoElement> {
  return new Promise((ok, ng) => {
    const url = URL.createObjectURL(file); const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    const fail = () => { URL.revokeObjectURL(url); ng(new Error('この動画は読めません（mp4 にしてから添付してください）')); };
    v.onerror = fail;
    v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
    v.onseeked = () => { URL.revokeObjectURL(url); ok(v); };
    v.src = url;
  });
}
function frameJpeg(v: HTMLVideoElement, max: number): string {
  const k = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(v.videoWidth * k)); c.height = Math.max(1, Math.round(v.videoHeight * k));
  c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
const MAX_VIDEO = 50 * 1024 * 1024;

export interface AttachPayload { image?: { path: string }; pdf?: { path: string; name: string; size: number }; video?: { path: string; thumb: string; name: string; size: number } }
export function useAttach() {
  const [image, setImage] = useState<{ path: string; thumb: string } | null>(null);
  const [pdf, setPdf] = useState<{ path: string; name: string; size: number } | null>(null);
  const [video, setVideo] = useState<{ path: string; thumb: string; thumbUrl: string; name: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const add = useCallback(async (file: File) => {
    setError(''); setBusy(true);
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const j = await post({ action: 'pdf-url', name: file.name, size: file.size });
        if (!j.ok) throw new Error(j.error);
        const up = await fetch(j.signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': 'application/pdf' } });
        if (!up.ok) throw new Error('PDFのアップロードに失敗しました');
        const c = await post({ action: 'pdf-confirm', path: j.path });
        if (!c.ok) throw new Error(c.error);
        setPdf({ path: j.path, name: j.name, size: c.size });
      } else if (file.type.startsWith('video/') || /\.(mp4|mov|m4v)$/i.test(file.name)) {
        if (!(file.type === 'video/mp4' || /\.(mp4|m4v)$/i.test(file.name))) throw new Error('動画は mp4 だけ送れます（iPhone の .mov は mp4 に書き出してから添付してください）');
        if (file.size > MAX_VIDEO) throw new Error('動画が大きすぎます（50MBまで）');
        const v = await videoFrame(file);
        const thumbUrl = frameJpeg(v, 240);
        const ti = await post({ action: 'image', main: frameJpeg(v, 640), preview: thumbUrl });
        if (!ti.ok) throw new Error(ti.error);
        const j = await post({ action: 'video-url', name: file.name, size: file.size });
        if (!j.ok) throw new Error(j.error);
        const up = await fetch(j.signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': 'video/mp4' } });
        if (!up.ok) throw new Error('動画のアップロードに失敗しました');
        const c = await post({ action: 'video-confirm', path: j.path });
        if (!c.ok) throw new Error(c.error);
        setVideo({ path: j.path, thumb: ti.path, thumbUrl, name: j.name, size: c.size });
      } else if (file.type.startsWith('image/')) {
        const img = await loadImage(file);
        const preview = toJpeg(img, 240);
        const j = await post({ action: 'image', main: toJpeg(img, 1600), preview });
        if (!j.ok) throw new Error(j.error);
        setImage({ path: j.path, thumb: preview });
      } else throw new Error('添付できるのは画像・動画（mp4）・PDFです');
    } catch (e) { setError((e as Error).message || '添付に失敗しました'); }
    setBusy(false);
  }, []);
  const clear = useCallback(() => { setImage(null); setPdf(null); setVideo(null); setError(''); }, []);
  const payload: AttachPayload = { ...(image ? { image: { path: image.path } } : {}), ...(pdf ? { pdf } : {}),
    ...(video ? { video: { path: video.path, thumb: video.thumb, name: video.name, size: video.size } } : {}) };
  return { image, pdf, video, busy, error, add, clear, setImage, setPdf, setVideo, payload, has: !!(image || pdf || video) };
}
export type AttachCtl = ReturnType<typeof useAttach>;

export function AttachButton({ at, className = '' }: { at: AttachCtl; className?: string }) {
  return (
    <label title="画像・動画・PDFを添付" className={`ig-press cursor-pointer text-ig-text ${at.busy ? 'pointer-events-none opacity-40' : ''} ${className}`}>
      <Paperclip size={22} strokeWidth={1.75} />
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) at.add(f); }} />
    </label>
  );
}

export function AttachPreview({ at }: { at: AttachCtl }) {
  if (!at.has && !at.busy && !at.error) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 pb-2 text-xs">
      {at.image && (
        <span className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={at.image.thumb} alt="添付する画像" className="h-16 rounded-lg border border-ig-border object-cover" />
          <button onClick={() => at.setImage(null)} title="外す" className="absolute -right-1.5 -top-1.5 rounded-full bg-ig-text p-0.5 text-white"><X size={12} /></button>
        </span>
      )}
      {at.video && (
        <span className="relative inline-flex items-center gap-1.5 rounded-lg border border-ig-border p-1 pr-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={at.video.thumbUrl} alt="添付する動画" className="h-14 rounded-md object-cover" />
          <Film size={16} className="shrink-0 text-ig-muted" /><span className="max-w-40 truncate">{at.video.name}</span>
          <span className="shrink-0 text-ig-muted">{(at.video.size / 1048576).toFixed(1)}MB</span>
          <button onClick={() => at.setVideo(null)} title="外す" className="shrink-0 text-ig-muted hover:text-ig-text"><X size={14} /></button>
        </span>
      )}
      {at.pdf && (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-ig-border px-2.5 py-1.5">
          <FileText size={16} className="shrink-0 text-ig-danger" /><span className="truncate">{at.pdf.name}</span>
          <span className="shrink-0 text-ig-muted">{at.pdf.size >= 1048576 ? `${(at.pdf.size / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(at.pdf.size / 1024))}KB`}</span>
          <button onClick={() => at.setPdf(null)} title="外す" className="shrink-0 text-ig-muted hover:text-ig-text"><X size={14} /></button>
        </span>
      )}
      {at.busy && <span className="text-ig-muted">アップロード中…</span>}
      {at.error && <span className="text-ig-danger">{at.error}</span>}
    </div>
  );
}
