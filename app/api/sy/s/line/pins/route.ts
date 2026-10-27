import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';
import { pinColor } from '@/lib/sy/pins';

// チャットのピン留め（0017・lib/pins.ts）。一覧は /api/s/line/users が友だちと一緒に返す
//   種類を作る { action:'create', name, color } ／ 種類を消す { action:'delete', id }（付いている全員から外れる）
//   付ける・外す { user, kindId, on }（1つずつ足し引き＝2人が同時に触っても相手の分を消さない）
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; name?: string; color?: string; user?: string; kindId?: string; on?: boolean };
  if (b.action === 'delete' && b.id) {
    const { error } = await db().from('pin_kinds').delete().eq('id', b.id);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (b.action === 'create') {
    const name = String(b.name || '').trim();
    if (!name) return NextResponse.json({ error: 'ピンの名前を入れてください' }, { status: 400 });
    if (name.length > 12) return NextResponse.json({ error: 'ピンの名前は12文字までです' }, { status: 400 });
    const { data, error } = await db().from('pin_kinds').insert({ name, color: pinColor(String(b.color || '')), created_by: u.email }).select('id, name, color').single();
    if (error) return NextResponse.json({ error: /duplicate/.test(error.message) ? '同じ名前のピンがあります' : error.message }, { status: 400 });
    return NextResponse.json({ kind: data });
  }
  const user = String(b.user || ''), kindId = String(b.kindId || '');
  if (!user || !kindId) return NextResponse.json({ error: '相手とピンを指定してください' }, { status: 400 });
  const { error } = b.on === false
    ? await db().from('line_user_pins').delete().eq('user_id', user).eq('kind_id', kindId)
    : await db().from('line_user_pins').upsert({ user_id: user, kind_id: kindId, added_by: u.email }, { onConflict: 'user_id,kind_id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
