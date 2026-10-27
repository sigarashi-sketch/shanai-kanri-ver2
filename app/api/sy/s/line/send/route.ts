import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/sy/audit';
import { apiUser } from '@/lib/sy/api';
import { bousanUserIds } from '@/lib/sy/bousan';
import { db } from '@/lib/sy/db';
import { pushMessages } from '@/lib/sy/line';
import { buildOutParts, parseImageRef, parsePdfRef, parseVideoRef } from '@/lib/sy/media';

export const maxDuration = 30;

// チャットから1人へ送る（push）。本文・画像1枚・動画1本・PDF1つ（添付だけでも送れる）。本文→画像→動画→PDF の順に1回で送る
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { user?: string; text?: string; image?: unknown; pdf?: unknown; video?: unknown };
  const text = String(b.text || '').trim(); const uid = String(b.user || '');
  const image = b.image ? parseImageRef(b.image) : null; const pdf = b.pdf ? parsePdfRef(b.pdf) : null; const video = b.video ? parseVideoRef(b.video) : null;
  if ((b.image && !image) || (b.pdf && !pdf) || (b.video && !video)) return NextResponse.json({ error: '添付の指定が不正です' }, { status: 400 });
  if (!uid || (!text && !image && !pdf && !video)) return NextResponse.json({ error: '宛先と、本文か添付が必要です' }, { status: 400 });
  // ぼうさん（接触禁止）には 1:1 も送らない（画面でも入力欄を出さない。ここが最後の関所。印を確かめられないときも送らない）
  try { if ((await bousanUserIds([uid])).has(uid)) return NextResponse.json({ error: 'ぼうさん（接触禁止）の人には送れません。送るときは 名簿の詳細でチェックを外してください' }, { status: 403 }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const built = await buildOutParts(text, image, pdf, video);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const r = await pushMessages(uid, built.parts.map((p) => p.message));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  // 吹き出しごとに1行。並びが崩れないよう時刻を1ミリ秒ずつずらす
  const t0 = Date.now();
  const rows = built.parts.map((p, i) => ({
    user_id: uid, direction: 'out', type: p.type, text: p.text, payload: p.media ? { appMedia: p.media } : {},
    sender_email: u.email, sender_name: u.name, created_at: new Date(t0 + i).toISOString(),
  }));
  const { data } = await db().from('line_messages').insert(rows).select('*');
  const last = rows[rows.length - 1];
  await db().from('line_users').update({ last_message_at: last.created_at, last_text: last.text.slice(0, 200), last_direction: 'out', unread: 0, updated_at: last.created_at }).eq('user_id', uid);
  await audit(u, 'chat:send', uid);
  return NextResponse.json({ ok: true, lastText: last.text, at: last.created_at, count: (data || []).length });
}
