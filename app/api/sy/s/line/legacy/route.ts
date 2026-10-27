import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';

// まだ友だち(userId)とつながっていない過去トーク1件の中身
export async function GET(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const chat = req.nextUrl.searchParams.get('chat') || '';
  const { data } = await db().from('line_legacy_messages').select('*').eq('chat_id', chat).order('created_at').limit(2000);
  return NextResponse.json({ messages: (data || []).map((m) => ({ ...m, legacy: true, line_message_id: null, broadcast_id: null })) });
}
