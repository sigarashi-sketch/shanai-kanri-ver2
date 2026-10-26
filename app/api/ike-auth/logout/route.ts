import { NextResponse } from 'next/server';
import { IKE_REFRESH_COOKIE, IKE_TOKEN_COOKIE } from '@/lib/ike-session';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(IKE_TOKEN_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(IKE_REFRESH_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
