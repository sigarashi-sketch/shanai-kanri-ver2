import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { createForm, getForm, listForms, removeForm } from '@/lib/sy/enquete';

// 自前のアンケートフォームの一覧（/enquete）。作る { action:'create' }／写す { action:'duplicate', id }／消す { action:'delete', id }
export async function GET() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  try { return NextResponse.json({ forms: await listForms() }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string };
  try {
    if (b.action === 'create') return NextResponse.json({ form: await createForm(u.email) });
    const f = b.id ? await getForm(b.id) : null;
    if (!f) return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
    if (b.action === 'duplicate') return NextResponse.json({ form: await createForm(u.email, f) });
    if (b.action === 'delete') { const e = await removeForm(f.id); return e ? NextResponse.json({ error: e }, { status: 500 }) : NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
