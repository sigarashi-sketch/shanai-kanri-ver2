import { NextResponse } from 'next/server';
import { IKE_ORIGIN, ikeToken } from '@/lib/ike';
import { sameSite } from '@/lib/ike-write';

// 稼働表出力（保留）の「勤怠詳細CSVの取り込み」＝今の POST /api/kadohyo?action=parse-csv（読んで返すだけ。DB には入れない）。
//   ファイル（multipart）なので ikeWrite（JSON だけ）ではなく、同じ確かめをして ファイルだけ 詰め直して渡す
const MAX = 8 * 1024 * 1024;
export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは取り込めません' }, { status: 403 });
  const t = await ikeToken();
  if (!t) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: 'ファイルが読めません' }, { status: 400 });
  const out = new FormData();
  let size = 0, n = 0;
  for (const [, v] of fd) {
    if (typeof v === 'string' || n >= 50) continue;
    if (!/\.csv$/i.test(v.name)) continue;
    size += v.size;
    if (size > MAX) return NextResponse.json({ error: 'CSVが大きすぎます（8MBまで）' }, { status: 400 });
    out.append(`file${n++}`, v, v.name);
  }
  if (!n) return NextResponse.json({ error: 'CSVファイルが見つかりません' }, { status: 400 });
  try {
    const r = await fetch(`${IKE_ORIGIN}/api/kadohyo?action=parse-csv`, {
      method: 'POST', body: out, cache: 'no-store', signal: AbortSignal.timeout(55000),
      headers: { Authorization: `Bearer ${t}`, Cookie: `sb_access=${t}` },
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json(j, { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムで読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
