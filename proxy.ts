import { NextResponse, type NextRequest } from 'next/server';
import { IKE_REFRESH_COOKIE, IKE_TOKEN_COOKIE, refreshCookie, refreshIkeSession, tokenCookie, tokenLeftSec } from '@/lib/ike-session';

// ログインのしるし（1時間）が切れそうなら、更新の鍵で延ばしてから画面・API に渡す（10-26 shoya「いちいちログアウトされる」）。
//   ・画面を開く・読み直す・開きっぱなしの画面が裏で読むたびにここを通る＝使っている間はログアウトされない
//   ・延ばしたしるしは、この要求の中（cookies()）でも返事のクッキーでも新しいものにする
//   ・延ばせない（14日使っていない・退社・会社アカウントでない）ときは鍵を消す＝「ログインしてください」になる
export async function proxy(req: NextRequest) {
  const refresh = req.cookies.get(IKE_REFRESH_COOKIE)?.value || '';
  const token = req.cookies.get(IKE_TOKEN_COOKIE)?.value || '';
  if (!refresh || (token && tokenLeftSec(token) > 120)) return NextResponse.next();

  const got = await refreshIkeSession(refresh);
  if (!got) {
    const res = NextResponse.next();
    res.cookies.set(IKE_REFRESH_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }
  req.cookies.set(IKE_TOKEN_COOKIE, got.access);
  req.cookies.set(IKE_REFRESH_COOKIE, got.refresh);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set(tokenCookie(got.access, got.expiresIn));
  res.cookies.set(refreshCookie(got.refresh));
  return res;
}

export const config = {
  // 絵・JS などの置き物と、ログインの出入り口そのもの（/auth/callback・/api/ike-auth）は通さない
  matcher: ['/((?!_next/static|_next/image|auth/callback|api/ike-auth|.*\\.[a-zA-Z0-9]+$).*)'],
};
