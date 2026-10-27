import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { loadForms, readForm, saveForms } from '@/lib/sy/forms';
import { appRole, loadAccess } from '@/lib/sy/access';
import { isAdminUp } from '@/lib/sy/access-types';

export const maxDuration = 40;

// イベント出欠: ?id=<フォーム>[&gid=<タブ>] の回答シートを返す（読むだけ・DBには持たない）。
//   id なし＝フォームの一覧と、一覧を直せるか（いけどん ver2 の「人財管理 → イベント出欠」が読む・2026-10-27）
export async function GET(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ ok: true, forms: await loadForms(), canEdit: isAdminUp(appRole(u, await loadAccess())) });
  const g = req.nextUrl.searchParams.get('gid') || '';
  const f = (await loadForms()).find((x) => x.id === id);
  if (!f) return NextResponse.json({ ok: false, error: 'フォームが見つかりません' }, { status: 404 });
  try { return NextResponse.json(await readForm(f, /^\d+$/.test(g) ? Number(g) : null)); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 }); }
}
// フォームの一覧を保存する（admin 以上）
export async function PUT(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const r = await saveForms(await req.json().catch(() => ({})), u);
  return r.error ? NextResponse.json({ error: r.error }, { status: 403 }) : NextResponse.json({ ok: true, forms: r.forms });
}
