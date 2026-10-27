import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';
import { TAGS } from '@/lib/sy/tags';

// 手で付けるタグのマスタ（0016）。count＝付いている人数
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const { data, error } = await db().from('tags').select('id, name, member_tags(count)').order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const tags = ((data || []) as unknown as { id: string; name: string; member_tags: { count: number }[] }[]).map((t) => ({ id: t.id, name: t.name, count: t.member_tags?.[0]?.count || 0 }));
  return NextResponse.json({ tags });
}
// 作る { name } ／ 消す { action:'delete', id }（付いている全員から外れる）
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; name?: string };
  if (b.action === 'delete' && b.id) {
    const { error } = await db().from('tags').delete().eq('id', b.id);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  const name = String(b.name || '').trim();
  if (!name) return NextResponse.json({ error: 'タグの名前を入れてください' }, { status: 400 });
  if (name.length > 20) return NextResponse.json({ error: 'タグの名前は20文字までです' }, { status: 400 });
  // 自動で付くタグと同じ名前は作らせない（配信の絞り込みで見分けが付かなくなる）
  if (TAGS.some((t) => t.label === name)) return NextResponse.json({ error: '自動で付くタグと同じ名前は使えません' }, { status: 400 });
  const { data, error } = await db().from('tags').insert({ name, created_by: u.email }).select('id, name').single();
  if (error) return NextResponse.json({ error: /duplicate/.test(error.message) ? '同じ名前のタグがあります' : error.message }, { status: 400 });
  return NextResponse.json({ tag: { ...data, count: 0 } });
}
