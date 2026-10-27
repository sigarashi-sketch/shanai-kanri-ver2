import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { checkAdmin, loadCheck } from '@/lib/sy/kyouiku-check-judge';
import { listStaff } from '@/lib/sy/staff';
import { normName } from '@/lib/sy/name';

export const maxDuration = 30;

// 名簿の詳細の「スキルチェック」欄（2026-10-09 shoya「スコアを それゆけに反映・従業員にも紐づけて」）。?name=<氏名> の1人ぶん。
//   要員の記録は n:<正規化氏名>（受講URLの氏名＝名簿のキー）。内勤が「自分で試す」で受けた記録（u:<メール>）は、ログインの表示名が 同じ氏名なら その人のものとして出す
export async function GET(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const norm = normName(req.nextUrl.searchParams.get('name') || '');
  if (!norm) return NextResponse.json({ check: null });
  const rows = await loadCheck();
  let mine = rows.filter((r) => r.subject_key === `n:${norm}`); let via: 'member' | 'staff' = 'member';
  if (!mine.length && rows.some((r) => r.subject_key.startsWith('u:'))) {
    const mails = new Set((await listStaff()).filter((s) => s.name && normName(s.name) === norm).map((s) => `u:${s.email}`));
    mine = rows.filter((r) => mails.has(r.subject_key)); via = 'staff';
  }
  return NextResponse.json({ check: mine.length ? checkAdmin(mine) : null, via }, { headers: { 'Cache-Control': 'no-store' } });
}
