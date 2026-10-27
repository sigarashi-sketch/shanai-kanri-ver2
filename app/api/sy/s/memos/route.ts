import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/sy/audit';
import { apiUser } from '@/lib/sy/api';
import { db } from '@/lib/sy/db';
import { MENDAN_LABELS } from '@/lib/sy/teiki-types';

// メモ（対応歴）。いけどんから移した分も含め、採用版だけで管理（いけどんには書き戻さない）。
const KINDS = ['memo', 'call', 'line', 'mendan'];
// 日付（面談をした日など）は created_at に持つ。きょう以外の日を選んだら その日の正午（日本時間）にする
const jstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);
const atOf = (date: unknown, cur?: string): string | null => {
  const d = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d + 'T12:00:00+09:00'))) return null;
  if (d === jstDay(cur || new Date().toISOString())) return null;   // 同じ日なら時刻はそのまま
  return d > jstDay(new Date().toISOString()) ? null : new Date(d + 'T12:00:00+09:00').toISOString();   // 先の日付は受けない
};

export async function GET(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const key = req.nextUrl.searchParams.get('key') || '';
  const { data } = await db().from('activities').select('*').eq('subject_key', key).order('created_at', { ascending: false }).limit(300);
  return NextResponse.json({ memos: data || [] });
}
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { key?: string; name?: string; kind?: string; body?: string; label?: string; date?: string };
  const key = String(b.key || ''); const body = String(b.body || '').trim();
  if (!/^(n|p):.+/.test(key)) return NextResponse.json({ error: 'key が不正です' }, { status: 400 });
  if (!body) return NextResponse.json({ error: '内容を入力してください' }, { status: 400 });
  const kind = KINDS.includes(String(b.kind)) ? String(b.kind) : 'memo';
  // 面談の区分（定期面談／リーダー面談）。面談のときだけ受ける
  const label = kind === 'mendan' && MENDAN_LABELS.includes(String(b.label)) ? String(b.label) : '';
  const { data, error } = await db().from('activities').insert({
    subject_key: key, name: String(b.name || ''), person_id: key.startsWith('p:') ? key.slice(2) : null,
    kind, label, body, actor_email: u.email, actor_name: u.name, ...(atOf(b.date) ? { created_at: atOf(b.date) } : {}),
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(u, 'memo:' + kind, key, label ? { label } : {});
  return NextResponse.json({ memo: data });
}

// 直す・消す（2026-10-09 shoya「メモを編集したり削除できるように」）。ステージ変更の記録（kind='stage'）は自動で付くものなので触らせない。
//   直す前・消す前の中身は 操作ログ（op_audit_log の detail）に残る＝消したものを戻したいときは そこから拾う
async function rowOf(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db().from('activities').select('*').eq('id', id).maybeSingle();
  return data as { id: string; subject_key: string; kind: string; label: string; body: string; created_at: string; source_id: string | null } | null;
}
export async function PATCH(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { id?: string; kind?: string; body?: string; label?: string; date?: string };
  const row = await rowOf(String(b.id || ''));
  if (!row) return NextResponse.json({ error: '記録が見つかりません（もう消されているかもしれません）' }, { status: 404 });
  if (!KINDS.includes(row.kind)) return NextResponse.json({ error: 'この記録は直せません' }, { status: 400 });
  const body = String(b.body ?? row.body).trim();
  if (!body) return NextResponse.json({ error: '内容を入力してください' }, { status: 400 });
  const kind = KINDS.includes(String(b.kind)) ? String(b.kind) : row.kind;
  const label = kind !== 'mendan' ? '' : MENDAN_LABELS.includes(String(b.label)) ? String(b.label) : row.kind === 'mendan' ? row.label : '';
  const at = atOf(b.date, row.created_at);
  const { data, error } = await db().from('activities').update({ kind, label, body, ...(at ? { created_at: at } : {}) }).eq('id', row.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(u, 'memo:edit', row.subject_key, { id: row.id, before: { kind: row.kind, label: row.label, body: row.body.slice(0, 4000), created_at: row.created_at } });
  return NextResponse.json({ memo: data });
}
export async function DELETE(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const row = await rowOf(req.nextUrl.searchParams.get('id') || '');
  if (!row) return NextResponse.json({ ok: true });
  if (!KINDS.includes(row.kind)) return NextResponse.json({ error: 'この記録は消せません' }, { status: 400 });
  // いけどんの対応歴から写した分を消すと、元の対応歴が 定期面談ページに もう一度出てくる（写し済みの目印が無くなる）ので消させない
  if (row.source_id) return NextResponse.json({ error: 'いけどんから移した記録は消せません（中身を直すことはできます）' }, { status: 400 });
  const { error } = await db().from('activities').delete().eq('id', row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(u, 'memo:delete', row.subject_key, { id: row.id, deleted: { ...row, body: row.body.slice(0, 4000) } });
  return NextResponse.json({ ok: true });
}
