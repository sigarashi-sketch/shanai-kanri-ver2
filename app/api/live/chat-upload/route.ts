import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';

// チャットに添付する画像・PDF を上げる口（10-27 shoya「チャットの画像とファイル送付なくなってる」）。今のチャット画面と同じ、配信ページと共用の口を中継する：
//   image       … POST /api/line-broadcast?action=upload-image   { dataUrl, previewDataUrl }（画面で長辺1600pxの JPEG に縮めてから）
//   pdf-url     … POST /api/line-broadcast?action=pdf-upload-url { filename, contentType, size } → 画面が signedUrl へ直接 PUT
//   pdf-confirm … POST /api/line-broadcast?action=pdf-confirm    { path }（中身が PDF かを今のシステムが確かめる）
//   ★それ以外の action（send・reconcile など）は通さない。送るのは /api/live/chat
const ACTIONS: Record<string, string> = { image: 'upload-image', 'pdf-url': 'pdf-upload-url', 'pdf-confirm': 'pdf-confirm' };

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ ok: false, error: 'ログインしてください' }, { status: 401 });
  const action = ACTIONS[new URL(req.url).searchParams.get('action') || ''];
  if (!action) return NextResponse.json({ ok: false, error: 'この操作は通していません' }, { status: 400 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ ok: false, error: '中身が読めません' }, { status: 400 });
  const payload = action === 'upload-image' ? { dataUrl: b.dataUrl, previewDataUrl: b.previewDataUrl }
    : action === 'pdf-upload-url' ? { filename: b.filename, contentType: b.contentType, size: b.size }
    : { path: b.path };
  try {
    const r = await ikeFetch(`/api/line-broadcast?action=${action}`, { method: 'POST', body: JSON.stringify(payload) }, 55000);
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 401) return NextResponse.json({ ok: false, error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json(j, { status: r.status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `今の社内システムに届きませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
