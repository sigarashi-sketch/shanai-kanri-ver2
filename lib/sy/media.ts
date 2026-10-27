import 'server-only';
import { randomUUID } from 'node:crypto';
import { ike } from './db';

// チャット・配信の添付（画像・PDF・動画）。置き場は いけどん本番の Storage（既存バケットを prefix zuanshi/ で間借り）。
//   画像 … linemsg バケット（画像のみ・10MB）。LINE の画像メッセージで送る（本体＋プレビューの2枚）
//   PDF  … linefile バケット（PDFのみ・20MB）。LINE はファイルを送れないので「PDFを開く」カード(Flex)で届ける（いけどんと同じ）
//   動画 … linevideo バケット（mp4のみ・50MB＝いけどん sql/0278）。LINE の動画メッセージで送る。プレビュー（1コマ目のJPEG）は linemsg に画像と同じ形で置く
//   ★保存先はサーバが決める（uuid）。送信時は下の形のパスしか受け付けない＝バケット内の別ファイルに署名URLを出させない
export const IMG_BUCKET = 'linemsg';
export const PDF_BUCKET = 'linefile';
export const VIDEO_BUCKET = 'linevideo';
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const SEND_URL_TTL = 60 * 60 * 24 * 365;   // LINEは受信者がトークを開いたときにも取りに来るので長く
const VIEW_URL_TTL = 60 * 60 * 24;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const IMG_RE = new RegExp(`^zuanshi/\\d{4}/${UUID}\\.jpg$`);
const PDF_RE = new RegExp(`^zuanshi/\\d{4}/${UUID}\\.pdf$`);
const VIDEO_RE = new RegExp(`^zuanshi/\\d{4}/${UUID}\\.mp4$`);

export interface ImageRef { path: string }
export interface PdfRef { path: string; name: string; size?: number }
export interface VideoRef { path: string; thumb: string; name: string; size?: number }
export interface AppMedia { kind: 'image' | 'pdf' | 'video'; path: string; name?: string }

export function parseImageRef(v: unknown): ImageRef | null {
  const path = String((v as ImageRef | null)?.path || '');
  return IMG_RE.test(path) ? { path } : null;
}
export function sanitizePdfName(v: unknown): string {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '_').trim();
  const base = s.replace(/\.pdf$/i, '').slice(0, 60) || '資料';
  return base + '.pdf';
}
export function parsePdfRef(v: unknown): PdfRef | null {
  const o = (v || {}) as PdfRef; const path = String(o.path || '');
  return PDF_RE.test(path) ? { path, name: sanitizePdfName(o.name), size: Number(o.size) || undefined } : null;
}
export function parseVideoRef(v: unknown): VideoRef | null {
  const o = (v || {}) as VideoRef; const path = String(o.path || ''); const thumb = String(o.thumb || '');
  if (!VIDEO_RE.test(path) || !IMG_RE.test(thumb)) return null;
  const name = String(o.name || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '_').trim().slice(0, 80) || '動画.mp4';
  return { path, thumb, name, size: Number(o.size) || undefined };
}
const previewPath = (path: string) => path.replace(/\.jpg$/, '_p.jpg');
const year = () => new Date(Date.now() + 9 * 3600e3).getUTCFullYear();

// 画面で縮めた JPEG（data URL）を2枚受けて保存する。名乗りは信じず先頭バイトで JPEG を確かめる
function decodeJpeg(dataUrl: unknown, max: number): Buffer | null {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 4 || buf.length > max || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return buf;
}
export async function saveImage(main: unknown, preview: unknown): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const a = decodeJpeg(main, 3.2 * 1024 * 1024), b = decodeJpeg(preview, 1024 * 1024);
  if (!a || !b) return { ok: false, error: '画像を読めませんでした（JPEGに変換できない・大きすぎる）' };
  const path = `zuanshi/${year()}/${randomUUID()}.jpg`;
  const st = ike().storage.from(IMG_BUCKET);
  const r1 = await st.upload(path, a, { contentType: 'image/jpeg' });
  const r2 = r1.error ? r1 : await st.upload(previewPath(path), b, { contentType: 'image/jpeg' });
  if (r1.error || r2.error) return { ok: false, error: '画像の保存に失敗しました: ' + (r1.error || r2.error)!.message };
  return { ok: true, path };
}

// 動画も PDF と同じく 画面から Storage へ直接上げる
export async function videoUploadUrl(name: unknown, size: unknown): Promise<{ ok: true; path: string; name: string; signedUrl: string } | { ok: false; error: string }> {
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'ファイルが空です' };
  if (n > MAX_VIDEO_BYTES) return { ok: false, error: '動画が大きすぎます（50MBまで）' };
  const path = `zuanshi/${year()}/${randomUUID()}.mp4`;
  const { data, error } = await ike().storage.from(VIDEO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: 'アップロードの準備に失敗しました: ' + (error?.message || '') };
  return { ok: true, path, name: String(name || '動画.mp4').slice(0, 80), signedUrl: data.signedUrl };
}
// 上がった mp4 を確かめる（在るか・大きさ・4〜8バイト目が ftyp か）
export async function confirmVideo(path: string): Promise<{ ok: true; size: number } | { ok: false; error: string }> {
  if (!VIDEO_RE.test(path)) return { ok: false, error: '動画の保存先が不正です' };
  return confirmUpload(VIDEO_BUCKET, path, (h) => h.length >= 8 && h.subarray(4, 8).toString('latin1') === 'ftyp', '動画', 'mp4 として読めないファイルです');
}

// PDF は 4.5MB（関数の本文上限）を超えやすいので、画面から Storage へ直接上げる。ここでは上げ先のURLだけ作る
export async function pdfUploadUrl(name: unknown, size: unknown): Promise<{ ok: true; path: string; name: string; signedUrl: string } | { ok: false; error: string }> {
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'ファイルが空です' };
  if (n > MAX_PDF_BYTES) return { ok: false, error: 'PDFが大きすぎます（20MBまで）' };
  const path = `zuanshi/${year()}/${randomUUID()}.pdf`;
  const { data, error } = await ike().storage.from(PDF_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: 'アップロードの準備に失敗しました: ' + (error?.message || '') };
  return { ok: true, path, name: sanitizePdfName(name), signedUrl: data.signedUrl };
}
// 上がった実体を確かめる（在るか・大きさ・先頭が %PDF- か）。画面の自己申告は信じない
export async function confirmPdf(path: string): Promise<{ ok: true; size: number } | { ok: false; error: string }> {
  if (!PDF_RE.test(path)) return { ok: false, error: 'PDFの保存先が不正です' };
  return confirmUpload(PDF_BUCKET, path, (h) => h.subarray(0, 5).toString('latin1') === '%PDF-', 'PDF', 'PDFとして読めないファイルです');
}
async function confirmUpload(bucket: string, path: string, magic: (head: Buffer) => boolean, label: string, bad: string): Promise<{ ok: true; size: number } | { ok: false; error: string }> {
  const st = ike().storage.from(bucket);
  const dir = path.slice(0, path.lastIndexOf('/')), fname = path.slice(path.lastIndexOf('/') + 1);
  const { data: listed, error } = await st.list(dir, { search: fname, limit: 1 });
  if (error) return { ok: false, error: `${label}の確認に失敗しました: ` + error.message };
  const hit = (listed || []).find((x) => x.name === fname);
  const size = Number(((hit?.metadata || {}) as { size?: number }).size || 0);
  if (!hit || !size) return { ok: false, error: `${label}のアップロードが完了していません` };
  const { data: signed } = await st.createSignedUrl(path, 600);
  const head = signed?.signedUrl ? await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-11' } }).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b)).catch(() => null) : null;
  if (!head || !magic(head)) {
    await st.remove([path]).catch(() => undefined);
    return { ok: false, error: bad };
  }
  return { ok: true, size };
}

async function sign(bucket: string, path: string, ttl: number): Promise<string> {
  const { data } = await ike().storage.from(bucket).createSignedUrl(path, ttl);
  return String(data?.signedUrl || '');
}

// LINE に送るメッセージ（本文 → 画像 → 動画 → PDF の順）と、トーク履歴に残す行の材料を作る
export interface OutPart { message: Record<string, unknown>; type: 'text' | 'image' | 'video' | 'file'; text: string; media?: AppMedia }
export async function buildOutParts(text: string, image: ImageRef | null, pdf: PdfRef | null, video: VideoRef | null = null): Promise<{ ok: true; parts: OutPart[] } | { ok: false; error: string }> {
  const parts: OutPart[] = [];
  if (text) parts.push({ message: { type: 'text', text: text.slice(0, 5000) }, type: 'text', text });
  if (image) {
    const [o, p] = await Promise.all([sign(IMG_BUCKET, image.path, SEND_URL_TTL), sign(IMG_BUCKET, previewPath(image.path), SEND_URL_TTL)]);
    if (!o || !p) return { ok: false, error: '画像のURLを作れませんでした（もう一度添付してください）' };
    parts.push({ message: { type: 'image', originalContentUrl: o, previewImageUrl: p }, type: 'image', text: '［画像］', media: { kind: 'image', path: image.path } });
  }
  if (video) {
    const c = await confirmVideo(video.path);
    if (!c.ok) return { ok: false, error: c.error };
    const [o, p] = await Promise.all([sign(VIDEO_BUCKET, video.path, SEND_URL_TTL), sign(IMG_BUCKET, video.thumb, SEND_URL_TTL)]);
    if (!o || !p || o.length > 2000 || p.length > 2000) return { ok: false, error: '動画のURLを作れませんでした（もう一度添付してください）' };
    parts.push({ message: { type: 'video', originalContentUrl: o, previewImageUrl: p }, type: 'video', text: `［動画］${video.name}`, media: { kind: 'video', path: video.path, name: video.name } });
  }
  if (pdf) {
    const c = await confirmPdf(pdf.path);
    if (!c.ok) return { ok: false, error: c.error };
    const url = await sign(PDF_BUCKET, pdf.path, SEND_URL_TTL);
    if (!/^https:\/\//.test(url) || url.length > 1000) return { ok: false, error: 'PDFのURLを作れませんでした' };
    const mb = c.size >= 1024 * 1024 ? `${(c.size / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(c.size / 1024))}KB`;
    parts.push({
      type: 'file', text: `［PDF］${pdf.name}`, media: { kind: 'pdf', path: pdf.path, name: pdf.name },
      message: {
        type: 'flex', altText: `[PDF] ${pdf.name}`,
        contents: {
          type: 'bubble', size: 'kilo',
          body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', contents: [
            { type: 'text', text: 'PDF', size: 'xs', weight: 'bold', color: '#D93025' },
            { type: 'text', text: pdf.name, size: 'sm', weight: 'bold', color: '#222222', wrap: true, maxLines: 3 },
            { type: 'text', text: mb, size: 'xs', color: '#8C8C8C' },
          ] },
          footer: { type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
            { type: 'button', style: 'primary', height: 'sm', color: '#06C755', action: { type: 'uri', label: 'PDFを開く', uri: url } },
          ] },
        },
      },
    });
  }
  return { ok: true, parts };
}

// トーク履歴の行に、画面で開くための短いURL（24時間）を付ける
export async function mediaUrls(list: AppMedia[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const [bucket, kind] of [[IMG_BUCKET, 'image'], [PDF_BUCKET, 'pdf'], [VIDEO_BUCKET, 'video']] as const) {
    const paths = [...new Set(list.filter((m) => m.kind === kind).map((m) => m.path))];
    if (!paths.length) continue;
    const { data } = await ike().storage.from(bucket).createSignedUrls(paths, VIEW_URL_TTL);
    (data || []).forEach((d) => { if (d.path && d.signedUrl) out.set(d.path, d.signedUrl); });
  }
  return out;
}
