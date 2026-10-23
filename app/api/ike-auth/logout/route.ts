import { NextResponse } from 'next/server';
import { IKE_TOKEN_COOKIE } from '@/lib/skillsheet-source';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(IKE_TOKEN_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
