import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';
import { mediaUrls, type AppMedia } from '@/lib/sy/media';

// 1人分のトーク履歴。開いたら既読にする。
export async function GET(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const uid = req.nextUrl.searchParams.get('user') || '';
  if (!uid) return NextResponse.json({ error: 'user が必要です' }, { status: 400 });
  const { data } = await db().from('line_messages').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(300);
  // つながった過去トーク（管理画面）を前に足す。Webhookで受けたものと同じメッセージは重ねない。
  const { data: lc } = await db().from('line_legacy_chats').select('chat_id').eq('user_id', uid);
  let legacy: Record<string, unknown>[] = [];
  if (lc?.length) {
    const seen = new Set((data || []).map((m) => m.line_message_id).filter(Boolean));
    const { data: lm } = await db().from('line_legacy_messages').select('*').in('chat_id', lc.map((c) => c.chat_id)).order('created_at').limit(2000);
    legacy = (lm || []).filter((m) => !seen.has(m.id)).map((m) => ({ ...m, line_message_id: null, legacy: true, broadcast_id: null }));
  }
  if (req.nextUrl.searchParams.get('read') !== '0') await db().from('line_users').update({ unread: 0 }).eq('user_id', uid);
  // こちらから送った画像・PDF（payload.appMedia）に、開くためのURLを付ける
  const own = (data || []).map((m) => (m.payload as { appMedia?: AppMedia } | null)?.appMedia).filter(Boolean) as AppMedia[];
  const urls = own.length ? await mediaUrls(own).catch(() => new Map<string, string>()) : new Map<string, string>();
  const live = (data || []).reverse().map((m) => {
    const am = (m.payload as { appMedia?: AppMedia } | null)?.appMedia;
    return am && urls.get(am.path) ? { ...m, media: { kind: am.kind, url: urls.get(am.path), name: am.name || '' } } : m;
  });
  return NextResponse.json({ messages: [...legacy, ...live] });
}
