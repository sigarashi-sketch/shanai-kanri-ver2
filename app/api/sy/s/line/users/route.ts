import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';
import { getBotInfo, lineConfigured } from '@/lib/sy/line';
import { autoLinkFromIkeike } from '@/lib/sy/line-autolink';
import { normName } from '@/lib/sy/name';
import { staffNameSet } from '@/lib/sy/staff';

// 公式LINEの友だち一覧（チャットの左側・配信の宛先）
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const q = () => db().from('line_users').select('*').order('last_message_at', { ascending: false, nullsFirst: false }).limit(5000);
  let { data, error } = await q();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 未紐付けの友だちがいれば、いけどんの紐付けで自動的に埋める
  const unlinked = (data || []).filter((u) => !u.subject_key).map((u) => u.user_id as string);
  if (await autoLinkFromIkeike(unlinked)) ({ data, error } = await q());
  // 採用版につなぐ前の過去トーク（管理画面から取り込み）
  const { data: legacy } = await db().from('line_legacy_chats')
    .select('chat_id, name, friend, last_talked_at, last_text, message_count, user_id, match_kind, subject_key, subject_name, name_guesses')
    .order('last_talked_at', { ascending: false, nullsFirst: false }).limit(5000);
  // ピン留め（0017）。pins＝その相手に付いているピンの種類の id
  const [{ data: kinds }, { data: pinRows }] = await Promise.all([
    db().from('pin_kinds').select('id, name, color').order('created_at'),
    db().from('line_user_pins').select('user_id, kind_id').limit(20000),
  ]);
  const pinsOf = new Map<string, string[]>();
  (pinRows || []).forEach((r) => pinsOf.set(r.user_id, [...(pinsOf.get(r.user_id) || []), r.kind_id]));
  const bot = lineConfigured() ? await getBotInfo() : null;
  // 内勤（それゆけにログインできる人）と同じ名前の友だち＝staff。チャットの一覧で紫に出す
  const staff = await staffNameSet().catch(() => new Set<string>());
  const isStaff = (x: { subject_name?: string; claimed_name?: string; display_name?: string }) => [x.subject_name, x.claimed_name, x.display_name].some((n) => n && staff.has(normName(n)));
  return NextResponse.json({
    users: (data || []).map((x) => ({ ...x, pins: pinsOf.get(x.user_id) || [], staff: isStaff(x) })), pinKinds: kinds || [], legacy: legacy || [], configured: lineConfigured() && !!bot,
    bot: bot ? { name: bot.displayName, basicId: bot.basicId, addUrl: bot.basicId ? `https://line.me/R/ti/p/${bot.basicId}` : '' } : null,
  });
}
