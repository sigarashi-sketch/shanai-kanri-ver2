import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { getForm, listResponses, removeResponse, saveForm } from '@/lib/sy/enquete';

type Ctx = { params: Promise<{ id: string }> };
// フォーム1つ: 中身と回答を読む（GET）／中身を保存する（PUT・画面が自動で呼ぶ）／回答を1件消す（POST { action:'deleteResponse', responseId }）
export async function GET(_: NextRequest, { params }: Ctx) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const { id } = await params;
  const form = await getForm(id);
  if (!form) return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
  try { return NextResponse.json({ form, responses: await listResponses(id) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
export async function PUT(req: NextRequest, { params }: Ctx) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const { id } = await params;
  const r = await saveForm(id, await req.json().catch(() => ({})));
  return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ ok: true, updated_at: r.updated_at });
}
export async function POST(req: NextRequest, { params }: Ctx) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { action?: string; responseId?: string };
  if (b.action !== 'deleteResponse' || !b.responseId) return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  const e = await removeResponse(id, b.responseId);
  return e ? NextResponse.json({ error: e }, { status: 500 }) : NextResponse.json({ ok: true });
}
