import { NextResponse } from 'next/server';
import { VIEWER_COOKIE, canUseApp } from '@/lib/access';
import { loadMembers } from '@/lib/members-store';

// 手元で動かすあいだだけの「いまの人」切り替え。ログインをつないだら消す。
export async function POST(req: Request) {
  const form = await req.formData();
  const ms = await loadMembers();
  const m = ms.find((x) => x.id === String(form.get('as'))) ?? ms[0];
  const res = NextResponse.redirect(new URL(canUseApp(m) ? '/' : '/shared', req.url), 303);
  res.cookies.set(VIEWER_COOKIE, m.id, { path: '/', sameSite: 'lax' });
  return res;
}
