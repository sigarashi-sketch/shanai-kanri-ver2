import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { loadMe } from '@/lib/members-store';
import { sameSite } from '@/lib/ike-write';
import { atLeast, effectivePages, effectivePerms } from '@/lib/access';
import { pageGranted } from '@/lib/kubun';
import { db, likePrefix } from '@/lib/sy/db';
import { KEY_PREFIX, cleanDoc, type MDoc } from '@/lib/mitsumori';

// 見積書の読み書き（経理管理 /keiri/mitsumori・10-27）。置き場は saiyou.settings の key='v2_mitsumori:<id>'（1枚1行・lib/sy/db＝service role）。
//   ・読む＝経理管理を「見る」以上か、この画面を「見るだけ」で付けられた人。書く（保存・消す）＝経理管理を「直す」以上
//   ・保存は 開いたときの updatedAt（base）と今の行が違えば 409（ほかの人が先に直した分を消さない）
//   ・消す＝deletedAt を入れるだけ（一覧に出さない・行は残す）
const HREF = '/keiri/mitsumori';
const ID = /^[a-z0-9]{12}$/;
type Row = { key: string; value: MDoc; updated_at: string };

async function who(need: 'view' | 'edit') {
  const got = await loadMe();
  if (!got.ok) return { error: NextResponse.json({ error: 'ログインしてください' }, { status: 401 }) };
  const lv = effectivePerms(got.me).keiri;
  const ok = need === 'view' ? atLeast(lv, 'view') || pageGranted(effectivePages(got.me), HREF) : atLeast(lv, 'edit');
  if (!ok) return { error: NextResponse.json({ error: need === 'view' ? '見積書を見る権限がありません' : '見積書を直せるのは、経理管理を「直す」以上で持つ人だけです' }, { status: 403 }) };
  return { me: got.me };
}

export async function GET() {
  const w = await who('view');
  if (w.error) return w.error;
  const { data, error } = await db().from('settings').select('key, value, updated_at').like('key', likePrefix(KEY_PREFIX)).order('updated_at', { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const docs = ((data || []) as Row[]).map((r) => ({ ...r.value, id: r.key.slice(KEY_PREFIX.length), updatedAt: r.value.updatedAt || r.updated_at })).filter((d) => !d.deletedAt);
  return NextResponse.json({ ok: true, docs }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  const w = await who('edit');
  if (w.error) return w.error;
  const email = w.me.email;
  const b = ((await req.json().catch(() => null)) || {}) as { action?: string; id?: string; base?: string; doc?: unknown };
  const now = new Date().toISOString();

  if (b.action === 'save') {
    const doc = cleanDoc(b.doc);
    if (!doc) return NextResponse.json({ error: '保存できない形です' }, { status: 400 });
    let id = typeof b.id === 'string' && ID.test(b.id) ? b.id : '';
    let prev: MDoc | null = null;
    if (id) {
      const { data, error } = await db().from('settings').select('value, updated_at').eq('key', KEY_PREFIX + id).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (data) {
        prev = data.value as MDoc;
        const cur = prev.updatedAt || (data.updated_at as string);
        if (prev.deletedAt) return NextResponse.json({ error: 'この見積書は消されています' }, { status: 409 });
        if (b.base !== cur) return NextResponse.json({ error: `${prev.updatedBy || 'ほかの人'} が先に直しました。開き直してから直してください` }, { status: 409 });
      }
    } else id = randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(12, '0').slice(0, 12);
    const value: MDoc = { ...doc, id, createdBy: prev?.createdBy || email, createdAt: prev?.createdAt || now, updatedBy: email, updatedAt: now };
    const { error } = await db().from('settings').upsert({ key: KEY_PREFIX + id, value, updated_by: email, updated_at: now }, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, doc: value });
  }

  if (b.action === 'delete') {
    if (typeof b.id !== 'string' || !ID.test(b.id)) return NextResponse.json({ error: '消す見積書が違います' }, { status: 400 });
    const { data, error } = await db().from('settings').select('value').eq('key', KEY_PREFIX + b.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'この見積書は見つかりません' }, { status: 404 });
    const value = { ...(data.value as MDoc), deletedAt: now, updatedBy: email, updatedAt: now };
    const { error: e2 } = await db().from('settings').update({ value, updated_by: email, updated_at: now }).eq('key', KEY_PREFIX + b.id);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: '書く種類が違います' }, { status: 400 });
}
