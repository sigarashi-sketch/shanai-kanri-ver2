import { NextResponse } from 'next/server';
import { loadMe } from '@/lib/members-store';
import { sameSite } from '@/lib/ike-write';
import { db } from '@/lib/sy/db';

// 画面で起きた不具合の記録（10-30 shoya「不具合多すぎ・モニタリングして直して」）。書くのは components/ErrorWatch.tsx だけ。
//   置き場は saiyou.v2_client_errors（いけどん sql/0380）。定期の見回りがここを読んで直す。
//   ・値（ID・パスワード・本文）は入れない。画面の場所・エラーの文・口の名前と状態コードだけ（画面側で切ってから送る）
//   ・ログインした人だけ。1つのサーバで1人1分30件まで（ループで落ち続ける画面が DB を埋めない）
const KINDS = new Set(['js', 'promise', 'render', 'api']);
const cut = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const hits = new Map<string, { t: number; n: number }>();

export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const got = await loadMe();
  if (!got.ok) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const email = got.me.email.toLowerCase();
  const now = Date.now(), h = hits.get(email);
  if (h && now - h.t < 60_000) { if (++h.n > 30) return NextResponse.json({ ok: true, skipped: true }); } else hits.set(email, { t: now, n: 1 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = cut(b.kind, 10);
  if (!KINDS.has(kind)) return NextResponse.json({ error: 'kind' }, { status: 400 });
  const page = cut(b.page, 200).split('?')[0], message = cut(b.message, 500);
  const row = { email, kind, page, message, detail: cut(b.detail, 1500), ua: cut(req.headers.get('user-agent'), 200), fp: cut(`${kind}|${page}|${message}`, 300) };
  const { error } = await db().from('v2_client_errors').insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
