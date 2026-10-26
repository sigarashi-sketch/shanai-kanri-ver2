import { NextResponse } from 'next/server';
import { IKE_ORIGIN, ikeKanawestNow, ikeToken } from '@/lib/ike';
import { sameSite } from '@/lib/ike-write';

// 労務法務ナレッジ（/roumu/kb）の「PDF から本文を取り出す」（10-25）。今の POST /api/kb?action=extractPdf に渡すだけ。
//   ・今のシステムは本文のテキストを返すだけで、DB には書かない。ver2 も何も残さない
//   ・PDF だけ・4MB まで（今のシステムの上限と同じ）。ファイルはここで1回だけ受けて、そのまま渡す
const MAX = 4 * 1024 * 1024;

export async function POST(req: Request) {
  if (await ikeKanawestNow()) return NextResponse.json({ ok: false, success: false, error: 'かな西エリアでは開けません' }, { status: 403 }); // かな西エリアだけの人（lib/kanawest-scope.ts）
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは使えません' }, { status: 403 });
  const t = await ikeToken();
  if (!t) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX + 64 * 1024) return NextResponse.json({ error: 'ファイルが大きすぎます（4MB まで）' }, { status: 413 });
  const fd = await req.formData().catch(() => null);
  const f = fd?.get('file');
  if (!f || typeof f === 'string') return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 });
  if (f.size > MAX) return NextResponse.json({ error: 'ファイルが大きすぎます（4MB まで）' }, { status: 413 });
  if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) return NextResponse.json({ error: 'PDF を選んでください' }, { status: 400 });
  const out = new FormData();
  out.append('file', new Blob([await f.arrayBuffer()], { type: 'application/pdf' }), f.name.slice(0, 120) || 'file.pdf');
  try {
    const r = await fetch(`${IKE_ORIGIN}/api/kb?action=extractPdf`, {
      method: 'POST', body: out, cache: 'no-store', signal: AbortSignal.timeout(55000),
      headers: { Authorization: `Bearer ${t}`, Cookie: `sb_access=${t}` },
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json(j, { status: r.ok ? 200 : r.status });
  } catch (e) {
    return NextResponse.json({ error: `取り出せませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
