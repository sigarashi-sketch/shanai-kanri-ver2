import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/sy/audit';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';

// 相手ボール（要対応）を「対応済み」にする / 戻す。
//   { user }                … 対応済み。now ではなく、その人の last_message_at を入れる（押した瞬間に届いた受信まで消さない）
//   { user, restore:true }  … 要対応に戻す（null）
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { user?: string; restore?: boolean };
  const uid = String(b.user || '');
  if (!uid) return NextResponse.json({ error: 'user が必要です' }, { status: 400 });
  const { data: lu } = await db().from('line_users').select('last_message_at').eq('user_id', uid).maybeSingle();
  if (!lu) return NextResponse.json({ error: '相手が見つかりません' }, { status: 404 });
  const at = b.restore ? null : String(lu.last_message_at || new Date().toISOString());
  const { error } = await db().from('line_users').update({ ball_cleared_at: at }).eq('user_id', uid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!b.restore) await audit(u, 'chat:ball', uid);
  return NextResponse.json({ ok: true, ball_cleared_at: at });
}
