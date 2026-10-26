import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';

// ログインした人のロールと、今の社内システムのページ権限（/api/auth?action=me の pageAccess）だけを返す（10-26・保留のメニューの出し分け）。
//   ・メール・名前など、ほかの中身は返さない。読めなければ 401/502（画面はメニューを全部出したまま＝画面ごとに今のシステムが 403 を返す）
export async function GET() {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  try {
    const r = await ikeFetch('/api/auth?action=me', undefined, 10000);
    const j = (await r.json().catch(() => ({}))) as { authenticated?: boolean; role?: string; pageAccess?: Record<string, unknown> };
    if (r.status === 401 || j.authenticated === false) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (!r.ok) return NextResponse.json({ error: `読めませんでした（${r.status}）` }, { status: 502 });
    const pageAccess: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(j.pageAccess || {})) if (/^[\w@-]{1,60}$/.test(k)) pageAccess[k] = v === true;
    return NextResponse.json({ ok: true, role: String(j.role || ''), pageAccess }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
