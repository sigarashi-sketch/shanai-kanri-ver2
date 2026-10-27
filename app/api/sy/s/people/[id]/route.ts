import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/sy/audit';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';
import { RECRUIT_STAGE_KEYS } from '@/lib/sy/stages';

const EDITABLE = ['name', 'kana', 'stage', 'recruit_tantou', 'sales_tantou', 'company', 'station', 'address', 'shikaku', 'nyusha'] as const;

// 候補者の項目を直す（ステージ変更は履歴に残す）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, string> = {};
  for (const k of EDITABLE) if (k in b) patch[k] = String(b[k] ?? '');
  if ('stage' in patch && !RECRUIT_STAGE_KEYS.includes(patch.stage)) return NextResponse.json({ error: '不明なステージです' }, { status: 400 });
  if (!Object.keys(patch).length) return NextResponse.json({ error: '変更がありません' }, { status: 400 });
  const before = await db().from('people').select('stage, name').eq('id', id).single();
  const { error } = await db().from('people').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (patch.stage && before.data && before.data.stage !== patch.stage) {
    await db().from('activities').insert({ subject_key: 'p:' + id, person_id: id, name: before.data.name, kind: 'stage',
      body: `${before.data.stage} → ${patch.stage}`, actor_email: u.email, actor_name: u.name });
  }
  await audit(u, 'people:update', 'p:' + id, { fields: Object.keys(patch) });
  return NextResponse.json({ ok: true });
}
