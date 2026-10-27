import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';

// 部活マスタ（採用版だけで管理）
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const { data } = await db().from('clubs').select('*').order('sort_order').order('created_at');
  return NextResponse.json({ clubs: data || [] });
}
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; name?: string; emoji?: string };
  if (b.action === 'delete' && b.id) {
    const { error } = await db().from('clubs').delete().eq('id', b.id);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  const name = String(b.name || '').trim();
  if (!name) return NextResponse.json({ error: '部活名を入れてください' }, { status: 400 });
  const { data, error } = await db().from('clubs').insert({ name, emoji: String(b.emoji || '') }).select('*').single();
  if (error) return NextResponse.json({ error: /duplicate/.test(error.message) ? '同じ名前の部活があります' : error.message }, { status: 400 });
  return NextResponse.json({ club: data });
}
