import { NextResponse } from 'next/server';
import { loadMe } from '@/lib/members-store';
import { sameSite } from '@/lib/ike-write';
import { db } from '@/lib/sy/db';

// 自分の表示の好み（10-27 shoya「チャットの色は個人各自で設定保持できるように」＝どの端末でも同じ）。
//   置き場は saiyou.settings の key='v2_prefs:<メール>'（1人1行・丸ごと置き換え・lib/sy/db＝service role）。
//   だれの分かは ログインから決める＝ほかの人の分を読む・書く口は作らない。中身は lib/chat-colors.ts が決める小さな JSON だけ
const keyOf = (email: string) => 'v2_prefs:' + email.trim().toLowerCase();

export async function GET() {
  const got = await loadMe();
  if (!got.ok) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const { data, error } = await db().from('settings').select('value').eq('key', keyOf(got.me.email)).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs: data?.value ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  const got = await loadMe();
  if (!got.ok) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { prefs?: unknown };
  const s = JSON.stringify(b.prefs ?? null);
  if (!b.prefs || typeof b.prefs !== 'object' || Array.isArray(b.prefs) || s.length > 2000) return NextResponse.json({ error: '保存できない形です' }, { status: 400 });
  const { error } = await db().from('settings').upsert({ key: keyOf(got.me.email), value: JSON.parse(s), updated_by: got.me.email, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
