import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';
import { matchLegacy } from '@/lib/sy/legacy';

// 過去トークの紐付けを人が直す
//   { chat, key, name }  … 名簿の人と紐付け（友だちとつながっていれば友だち側にも反映）
//   { chat, unmatch:true } … 表示名での仮つなぎを外す
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { chat?: string; key?: string; name?: string; unmatch?: boolean };
  const chat = String(b.chat || '');
  if (!chat) return NextResponse.json({ error: 'chat が必要です' }, { status: 400 });
  if (b.unmatch) {
    const { error } = await db().from('line_legacy_chats').update({ user_id: null, match_kind: 'rejected' }).eq('chat_id', chat);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  let key = String(b.key || '');
  // 候補者として新規登録して紐付け（名簿に居ない応募者など）
  if ((b as { action?: string }).action === 'candidate') {
    const name = String(b.name || '').trim();
    if (!name) return NextResponse.json({ error: '名前が必要です' }, { status: 400 });
    const { data: p, error: pe } = await db().from('people').insert({
      name, normalized_name: name.replace(/[\s　]+/g, ''), stage: '営業中', source: 'line_legacy',
    }).select('id').single();
    if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });
    key = 'p:' + p.id;
    await db().from('activities').insert({ subject_key: key, person_id: p.id, name, kind: 'stage', body: '公式LINEの過去トークから候補者登録（営業中）', actor_email: u.email, actor_name: u.name });
  }
  if (key && !/^(n|p):.+/.test(key)) return NextResponse.json({ error: 'key が不正です' }, { status: 400 });
  const { data: c, error } = await db().from('line_legacy_chats')
    .update({ subject_key: key, subject_name: key ? String(b.name || '') : '' }).eq('chat_id', chat).select('user_id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (c?.user_id) await db().from('line_users').update({ subject_key: key, subject_name: key ? String(b.name || '') : '' }).eq('user_id', c.user_id);
  await matchLegacy();
  return NextResponse.json({ ok: true, key, name: b.name || '' });
}
