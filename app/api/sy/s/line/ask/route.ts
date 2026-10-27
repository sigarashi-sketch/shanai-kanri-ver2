import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { bousanUserIds } from '@/lib/sy/bousan';
import { claimAskText } from '@/lib/sy/claim';
import { db } from '@/lib/sy/db';
import { pushText } from '@/lib/sy/line';

// 名乗りのお願いを手動で送る（push＝通数を使う）。既存の友だち向け。
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { user?: string };
  const uid = String(b.user || '');
  if (!/^U[0-9a-f]{32}$/.test(uid)) return NextResponse.json({ error: 'user が不正です' }, { status: 400 });
  // ぼうさん（接触禁止）には 1:1 も送らない（画面でも入力欄を出さない。ここが最後の関所。印を確かめられないときも送らない）
  try { if ((await bousanUserIds([uid])).has(uid)) return NextResponse.json({ error: 'ぼうさん（接触禁止）の人には送れません。送るときは 名簿の詳細でチェックを外してください' }, { status: 403 }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const text = claimAskText(uid);
  const r = await pushText(uid, text);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  const at = new Date().toISOString();
  await db().from('line_users').update({ name_asked_at: at, last_message_at: at, last_text: '（名乗りのお願い）', last_direction: 'out' }).eq('user_id', uid);
  const { data } = await db().from('line_messages').insert({ user_id: uid, direction: 'out', type: 'text', text, sender_email: u.email, sender_name: u.name, created_at: at }).select('*').single();
  return NextResponse.json({ ok: true, message: data });
}
