import { NextResponse } from 'next/server';
import { IKE_TOKEN_COOKIE } from '@/lib/skillsheet-source';

// ログインで受け取ったトークンを、今の社内システムに「この人は入れるか」を聞いてから覚える。
//   会社のアドレスか・退社していないか、の判定は今の社内システム（/api/auth?action=me）に任せる＝決まりは今と同じ
const ORIGIN = process.env.IKEIKE_ORIGIN || 'https://ikeike-app.vercel.app';

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  const t = String(b.access_token || '');
  if (!t) return NextResponse.json({ ok: false, error: 'ログインの情報がありません' }, { status: 400 });
  const r = await fetch(`${ORIGIN}/api/auth?action=me`, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
  const me = (await r.json().catch(() => ({}))) as { authenticated?: boolean; allowed?: boolean; error?: string };
  if (!r.ok || !me.authenticated || me.allowed === false) return NextResponse.json({ ok: false, error: me.error || '会社のアカウントでないか、入れない人です' }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(IKE_TOKEN_COOKIE, t, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: Math.max(60, Math.min(3600, Number(b.expires_in) || 3600) - 60) });
  return res;
}
