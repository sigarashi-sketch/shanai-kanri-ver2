import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/sy/audit';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';

// ある人の部活をまとめて置き換える { key, name, clubIds[] }
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { key?: string; name?: string; clubIds?: string[] };
  const key = String(b.key || '');
  if (!/^(n|p):.+/.test(key)) return NextResponse.json({ error: 'key が不正です' }, { status: 400 });
  const ids = (b.clubIds || []).map(String);
  const del = await db().from('member_clubs').delete().eq('subject_key', key);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 });
  if (ids.length) {
    const { error } = await db().from('member_clubs').insert(ids.map((club_id) => ({ subject_key: key, club_id, name: String(b.name || '') })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await audit(u, 'club:set', key);
  return NextResponse.json({ ok: true });
}
