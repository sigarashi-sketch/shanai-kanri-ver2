import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';

// 従業員名簿の絞り込みを 人ごとに覚える（2026-10-13 shoya「絞り込みの状態は保存されるように・ひとごとで」）。
//   置き場は saiyou.settings の key='roster_filter:<メール>'（1人1行・丸ごと置き換え）。
//   だれの分かは ログインから決める＝ほかの人の分を 読む・書く口は 作らない
const keyOf = (email: string) => 'roster_filter:' + email.trim().toLowerCase();

export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const { data } = await db().from('settings').select('value').eq('key', keyOf(u.email)).maybeSingle();
  return NextResponse.json({ prefs: data?.value || null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { prefs?: unknown };
  const s = JSON.stringify(b.prefs ?? null);
  if (!b.prefs || typeof b.prefs !== 'object' || s.length > 8000) return NextResponse.json({ error: '保存できない形です' }, { status: 400 });
  const { error } = await db().from('settings').upsert({ key: keyOf(u.email), value: JSON.parse(s), updated_by: u.email, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
