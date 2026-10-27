import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/sy/audit';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';
import { RECRUIT_STAGE_KEYS } from '@/lib/sy/stages';

// 候補者（いけどんの名簿にまだ居ない人）を追加
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { name?: string; kana?: string; stage?: string; recruit_tantou?: string };
  const name = String(b.name || '').trim();
  if (!name) return NextResponse.json({ error: '氏名は必須です' }, { status: 400 });
  const stage = RECRUIT_STAGE_KEYS.includes(String(b.stage)) ? String(b.stage) : '営業中';
  const { data, error } = await db().from('people').insert({
    name, kana: String(b.kana || ''), normalized_name: name.replace(/[\s　]+/g, ''), stage,
    recruit_tantou: String(b.recruit_tantou || ''), source: 'manual',
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db().from('activities').insert({ subject_key: 'p:' + data.id, person_id: data.id, name, kind: 'stage', body: `登録（${stage}）`, actor_email: u.email, actor_name: u.name });
  await audit(u, 'people:add', 'p:' + data.id);
  return NextResponse.json({ key: 'p:' + data.id });
}
