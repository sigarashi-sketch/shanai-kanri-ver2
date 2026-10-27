import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';
import { getFollowerIds, getProfile } from '@/lib/sy/line';

export const maxDuration = 60;

// すでにいる友だちを取り込む（LINEの友だち一覧APIは認証済み/プレミアムアカウントだけ）
export async function POST() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const ids: string[] = []; let next: string | undefined;
  do {
    const r = await getFollowerIds(next);
    if (r.status !== 200) {
      return NextResponse.json({
        error: r.status === 403
          ? 'このアカウントでは友だち一覧をLINEから取れません（認証済みアカウントだけの機能）。メッセージが届いた人から順に一覧に出ます。'
          : `取り込みに失敗しました：${r.error}`,
      }, { status: 400 });
    }
    ids.push(...r.ids); next = r.next;
  } while (next && ids.length < 20000);

  const { data: have } = await db().from('line_users').select('user_id');
  const known = new Set((have || []).map((x) => x.user_id as string));
  const fresh = ids.filter((id) => !known.has(id));
  const started = Date.now(); let added = 0;
  for (let i = 0; i < fresh.length && Date.now() - started < 45000; i += 10) {
    const chunk = fresh.slice(i, i + 10);
    const profs = await Promise.all(chunk.map((id) => getProfile(id)));
    const rows = chunk.map((id, k) => ({ user_id: id, display_name: profs[k]?.displayName || '', picture_url: profs[k]?.pictureUrl || '', followed: true }));
    const { error } = await db().from('line_users').upsert(rows, { onConflict: 'user_id' });
    if (!error) added += rows.length;
  }
  return NextResponse.json({ ok: true, total: ids.length, added, remaining: fresh.length - added });
}
