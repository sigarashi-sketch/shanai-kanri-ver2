import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/sy/audit';
import { apiUser } from '@/lib/sy/api';
import { setBousan } from '@/lib/sy/bousan';

// ぼうさん（接触禁止）の印を 付ける・外す { key, name, on }。決め方は lib/bousan.ts
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { key?: string; name?: string; on?: boolean };
  const key = String(b.key || ''); const on = b.on !== false;
  if (!/^(n|p):.+/.test(key)) return NextResponse.json({ error: 'key が不正です' }, { status: 400 });
  const r = await setBousan(key, String(b.name || ''), on, u.email);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
  await audit(u, 'bousan:set', key, { on });
  return NextResponse.json({ ok: true, on });
}
