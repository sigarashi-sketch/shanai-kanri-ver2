import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/sy/audit';
import { bousanUserIds } from '@/lib/sy/bousan';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';
import { broadcastAllMessages, multicastMessages } from '@/lib/sy/line';
import { buildOutParts, parseImageRef, parsePdfRef, parseVideoRef } from '@/lib/sy/media';

export const maxDuration = 60;

// 配信の履歴
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const { data } = await db().from('line_broadcasts').select('*').order('created_at', { ascending: false }).limit(50);
  return NextResponse.json({ broadcasts: data || [] });
}

// 配信する。宛先(userIds)は画面で絞り込んだ結果。ここでは「友だちのままの人」だけに絞り直す。
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { text?: string; userIds?: string[]; filter?: Record<string, unknown>; all?: boolean; image?: unknown; pdf?: unknown; video?: unknown };
  const text = String(b.text || '').trim();
  // 添付（画像1枚・動画1本・PDF1つ）。配信は本文必須のまま＝履歴に何を送ったかが残る。本文→画像→動画→PDF の順
  const image = b.image ? parseImageRef(b.image) : null; const pdf = b.pdf ? parsePdfRef(b.pdf) : null; const video = b.video ? parseVideoRef(b.video) : null;
  if ((b.image && !image) || (b.pdf && !pdf) || (b.video && !video)) return NextResponse.json({ error: '添付の指定が不正です' }, { status: 400 });
  if (!text) return NextResponse.json({ error: '本文を入れてください' }, { status: 400 });
  const built = await buildOutParts(text, image, pdf, video);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const messages = built.parts.map((p) => p.message);
  const filter = { ...(b.filter || {}), ...(image || pdf || video ? { media: { image, pdf, video } } : {}) };
  // 「友だち全員」は LINE の一斉送信で送る（採用版がまだ知らない友だちにも届く）
  if (b.all) {
    const r = await broadcastAllMessages(messages);
    await db().from('line_broadcasts').insert({
      text, filter: Object.keys(filter).length ? filter : { label: '友だち全員（LINE一斉送信）' }, target_count: -1, sent_count: r.ok ? -1 : 0, failed_count: 0,
      error: r.error, created_by: u.email, created_by_name: u.name,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    await audit(u, 'broadcast:send', '', { all: true });
    return NextResponse.json({ ok: true, all: true });
  }
  const ids = [...new Set((b.userIds || []).map(String))];
  if (!ids.length) return NextResponse.json({ error: '宛先が0人です' }, { status: 400 });
  const { data: ok } = await db().from('line_users').select('user_id').in('user_id', ids).eq('followed', true);
  // ぼうさん（接触禁止）は 宛先から外す（画面でも外しているが、ここが最後の関所）。印を確かめられないときは 送らない
  let stop: Set<string>;
  try { stop = await bousanUserIds((ok || []).map((r) => r.user_id as string)); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const to = (ok || []).map((r) => r.user_id as string).filter((id) => !stop.has(id));
  if (!to.length) return NextResponse.json({ error: '送れる宛先が0人です（ブロック・ぼうさん を除いた結果）' }, { status: 400 });
  const { data: bc, error } = await db().from('line_broadcasts').insert({
    text, filter, target_count: to.length, created_by: u.email, created_by_name: u.name,
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = await multicastMessages(to, messages);
  await db().from('line_broadcasts').update({ sent_count: r.sent, failed_count: r.failed, error: r.error }).eq('id', bc.id);
  if (r.sent) {
    const t0 = Date.now(); const at = new Date(t0 + built.parts.length - 1).toISOString();
    // 送れた分をトーク履歴にも残す（失敗したかたまりは区別できないので、全員失敗のときだけ残さない）。吹き出しごとに1行
    const rows = to.flatMap((uid) => built.parts.map((p, i) => ({
      user_id: uid, direction: 'out', type: p.type, text: p.text, payload: p.media ? { appMedia: p.media } : {},
      sender_email: u.email, sender_name: u.name, broadcast_id: bc.id, created_at: new Date(t0 + i).toISOString(),
    })));
    for (let i = 0; i < rows.length; i += 500) await db().from('line_messages').insert(rows.slice(i, i + 500));
    const lastText = built.parts[built.parts.length - 1].text;
    await db().from('line_users').update({ last_message_at: at, last_text: lastText.slice(0, 200), last_direction: 'out', updated_at: at }).in('user_id', to);
  }
  if (!r.sent) return NextResponse.json({ error: r.error || '送信に失敗しました' }, { status: 502 });
  await audit(u, 'broadcast:send', '', { sent: r.sent });
  return NextResponse.json({ ok: true, sent: r.sent, failed: r.failed, error: r.error });
}
