import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { appRole, loadAccess } from '@/lib/sy/access';
import { loadRelease, saveRelease } from '@/lib/sy/kyouiku-release';
import { isAdminUp } from '@/lib/sy/access-types';

// bdsh のコースを いつ開くか（lib/kyouiku-release-types.ts）。GET=設定／PUT=保存（admin 以上）
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const [settings, access] = await Promise.all([loadRelease(), loadAccess()]);
  return NextResponse.json({ ok: true, settings, canEdit: isAdminUp(appRole(u, access)) });
}
export async function PUT(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  if (!isAdminUp(appRole(u, await loadAccess()))) return NextResponse.json({ ok: false, error: '設定を変えられるのは admin 以上です' }, { status: 403 });
  const r = await saveRelease(await req.json().catch(() => ({})), u.email);
  if (r.error || !r.settings) return NextResponse.json({ ok: false, error: r.error || '保存できませんでした' }, { status: 500 });
  return NextResponse.json({ ok: true, settings: r.settings });
}
