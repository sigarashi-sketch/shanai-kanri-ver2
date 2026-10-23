import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';

// 今の社内システムの API を「読むだけ」で通す口（GET だけ）。/api/ike/kintai-today?x=1 → 今の /api/kintai-today?x=1
//   ・書き込み（POST など）は通さない。本物の操作は今の社内システムの画面からする（ver2 は本番に入れる前にもう一度確かめる・10-23）
//   ・例外はスキルシート作成の 作る/PDF/Excel だけ（/api/skillsheet・shoya OK 10-23）
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.every((p) => /^[a-z0-9-]+$/i.test(p))) return NextResponse.json({ error: '行き先が違います' }, { status: 400 });
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const qs = new URL(req.url).search;
  try {
    const r = await ikeFetch(`/api/${path.join('/')}${qs}`);
    const body = await r.text();
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return new NextResponse(body, { status: r.status, headers: { 'Content-Type': r.headers.get('content-type') || 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
