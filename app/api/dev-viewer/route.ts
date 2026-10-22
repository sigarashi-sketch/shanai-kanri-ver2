import { NextResponse } from 'next/server';
import { DEV_VIEWERS, VIEWER_COOKIE, canUseApp } from '@/lib/access';

// 手元で動かすあいだだけの「いまの人」切り替え。ログインをつないだら消す。
export async function POST(req: Request) {
  const form = await req.formData();
  const as = String(form.get('as') || 'naikin');
  const v = DEV_VIEWERS[as] ?? DEV_VIEWERS.naikin;
  const res = NextResponse.redirect(new URL(canUseApp(v) ? '/' : '/shared', req.url), 303);
  res.cookies.set(VIEWER_COOKIE, as in DEV_VIEWERS ? as : 'naikin', { path: '/', sameSite: 'lax' });
  return res;
}
