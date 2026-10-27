import { NextResponse } from 'next/server';
import { IKE_ORIGIN, ikeKanawestNow, ikeToken } from '@/lib/ike';

// チャットの画像・ファイルの実体（10-27 shoya「画像の表示なくなってる」）。今の GET /api/line-content?id=<LINEのメッセージID>[&dl=1] をそのまま中継する。
//   ・今の口は LINE から取ってきて Storage に置き、署名つき URL へ 302 で飛ばす（本文は通らない）。ここもその 302 を返すだけ
//   ・ログインした人のトークンで呼ぶ（見てよいかは今のシステムが決める）
export async function GET(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  if (await ikeKanawestNow()) return NextResponse.json({ error: 'かな西エリアでは開けません' }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get('id') || '';
  if (!/^[0-9A-Za-z_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'メッセージが違います' }, { status: 400 });
  const q = `id=${encodeURIComponent(id)}${sp.get('dl') === '1' ? '&dl=1' : ''}`;
  const t = await ikeToken();
  try {
    const r = await fetch(`${IKE_ORIGIN}/api/line-content?${q}`, {
      cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(55000),
      headers: { Authorization: `Bearer ${t}`, Cookie: `sb_access=${t}` },
    });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) {
      // 入社案内の資料など、今のシステムの中の場所（/docs/…）で返ってくることがある
      return NextResponse.redirect(new URL(loc, IKE_ORIGIN).toString(), 302);
    }
    const out = new Headers({ 'cache-control': 'no-store' });
    const ct = r.headers.get('content-type'); if (ct) out.set('content-type', ct);
    return new NextResponse(r.body, { status: r.status, headers: out });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
