import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { confirmPdf, confirmVideo, pdfUploadUrl, saveImage, videoUploadUrl } from '@/lib/sy/media';

export const maxDuration = 30;

// チャット・配信の添付の受け口
//   { action:'image', main, preview } … 画面で縮めた JPEG（data URL）を保存 → { path }
//   { action:'pdf-url', name, size }  … PDF を Storage へ直接上げるためのURL → { path, name, signedUrl }
//   { action:'pdf-confirm', path }    … 上がった PDF を確かめる → { size }
//   { action:'video-url' / 'video-confirm' } … 動画（mp4）も PDF と同じ流れ。プレビューの1コマは action:'image' で別に上げる
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = b.action === 'image' ? await saveImage(b.main, b.preview)
    : b.action === 'pdf-url' ? await pdfUploadUrl(b.name, b.size)
    : b.action === 'pdf-confirm' ? await confirmPdf(String(b.path || ''))
    : b.action === 'video-url' ? await videoUploadUrl(b.name, b.size)
    : b.action === 'video-confirm' ? await confirmVideo(String(b.path || ''))
    : { ok: false as const, error: 'action が不正です' };
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
