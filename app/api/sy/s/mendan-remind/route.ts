import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { appRole, loadAccess } from '@/lib/sy/access';
import { loadRemind, remindRows, saveRemind } from '@/lib/sy/mendan-remind';
import type { RemindRow } from '@/lib/sy/mendan-remind-types';
import { isAdminUp } from '@/lib/sy/access-types';

export const maxDuration = 30;

// 面談のリマインド（lib/mendan-remind.ts）。GET=設定と これからの予約／PUT=設定の保存（admin 以上）
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const [settings, access] = await Promise.all([loadRemind(), loadAccess()]);
  let rows: RemindRow[] = []; let warning = '';
  try { rows = await remindRows(settings); } catch (e) { warning = (e as Error).message; }   // カレンダーが読めなくても 設定は出す
  return NextResponse.json({ ok: true, settings, rows, warning, canEdit: isAdminUp(appRole(u, access)) });
}
export async function PUT(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  if (!isAdminUp(appRole(u, await loadAccess()))) return NextResponse.json({ ok: false, error: '設定を変えられるのは admin 以上です' }, { status: 403 });
  const r = await saveRemind(await req.json().catch(() => ({})), u.email);
  if (r.error || !r.settings) return NextResponse.json({ ok: false, error: r.error || '保存できませんでした' }, { status: 500 });
  const rows = await remindRows(r.settings).catch(() => [] as RemindRow[]);
  return NextResponse.json({ ok: true, settings: r.settings, rows });
}
