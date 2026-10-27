import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/sy/audit';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';

// タグを付ける・外す { tagId, on, people:[{ key, name }] }。1人でもまとめてでも同じ口。
//   部活と違い「その人のタグを丸ごと置き換え」にしない＝2人が同時に触っても相手の分を消さない
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { tagId?: string; on?: boolean; people?: { key?: string; name?: string }[] };
  const tagId = String(b.tagId || '');
  const people = (b.people || []).map((p) => ({ key: String(p.key || ''), name: String(p.name || '') }));
  if (!tagId || !people.length) return NextResponse.json({ error: 'タグと相手を指定してください' }, { status: 400 });
  if (people.some((p) => !/^(n|p):.+/.test(p.key))) return NextResponse.json({ error: 'key が不正です' }, { status: 400 });
  for (let i = 0; i < people.length; i += 500) {
    const part = people.slice(i, i + 500);
    const { error } = b.on === false
      ? await db().from('member_tags').delete().eq('tag_id', tagId).in('subject_key', part.map((p) => p.key))
      : await db().from('member_tags').upsert(part.map((p) => ({ subject_key: p.key, tag_id: tagId, name: p.name, added_by: u.email })), { onConflict: 'subject_key,tag_id', ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await audit(u, 'tag:set', people.length === 1 ? people[0].key : `${tagId}:${people.length}`, { tagId, on: b.on !== false, count: people.length });
  return NextResponse.json({ ok: true, count: people.length });
}
