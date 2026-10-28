import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'node:crypto';
import { loadMe } from '@/lib/members-store';
import { sameSite } from '@/lib/ike-write';
import { atLeast, effectivePages, effectivePerms } from '@/lib/access';
import { pageGranted } from '@/lib/kubun';
import { db, ike, likePrefix } from '@/lib/sy/db';
import { KK_BUCKET, KK_MAX_BYTES, KK_PREFIX, KK_TYPES, extOf, type KkFile } from '@/lib/mitsumori-kakunou';

// 見積書の格納（lib/mitsumori-kakunou.ts の説明を参照）。
//   ・読む＝経理管理を「見る」以上か、格納の画面を「見るだけ」で付けられた人。上げる・直す・消す＝経理管理を「直す」以上
//   ・上げ方はチャットの PDF と同じ＝upload-url で上げ先を作る → 画面が Storage へ直接 PUT → confirm で実体（大きさ・先頭のバイト）を確かめて台帳に1行
//   ・開く＝GET ?open=<id> が 5分の署名つき URL へ送る（パスは画面に出さない）
const HREF = '/keiri/kakunou';
const ID = /^[a-z0-9]{12}$/;
const PATH_RE = /^v2-mitsumori\/\d{4}\/[0-9a-f-]{36}\.([a-z]+)$/;
const YM = /^(\d{4}-\d{2})?$/;
type Row = { key: string; value: KkFile; updated_at: string };

async function who(need: 'view' | 'edit') {
  const got = await loadMe();
  if (!got.ok) return { error: NextResponse.json({ error: 'ログインしてください' }, { status: 401 }) };
  const lv = effectivePerms(got.me).keiri;
  const ok = need === 'view' ? atLeast(lv, 'view') || pageGranted(effectivePages(got.me), HREF) : atLeast(lv, 'edit');
  if (!ok) return { error: NextResponse.json({ error: need === 'view' ? '見積書の格納を見る権限がありません' : '見積書を格納できるのは、経理管理を「直す」以上で持つ人だけです' }, { status: 403 }) };
  return { me: got.me };
}
const text = (v: unknown, max: number) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const fileName = (v: unknown) => text(v, 120).replace(/[\\/]/g, '_') || '見積書';
function fields(b: Record<string, unknown>) {
  const ym = text(b.ym, 7);
  return { ym: YM.test(ym) ? ym : '', partner: text(b.partner, 80), number: text(b.number, 40), memo: text(b.memo, 300) };
}

// 名乗りの拡張子と先頭のバイトが合うか
function magicOk(ext: string, h: Buffer) {
  if (ext === 'pdf') return h.subarray(0, 5).toString('latin1') === '%PDF-';
  if (ext === 'xlsx' || ext === 'docx') return h[0] === 0x50 && h[1] === 0x4b;
  if (ext === 'xls' || ext === 'doc') return h.subarray(0, 4).toString('hex') === 'd0cf11e0';
  if (ext === 'png') return h.subarray(0, 4).toString('hex') === '89504e47';
  if (ext === 'jpg' || ext === 'jpeg') return h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
  return false;
}

export async function GET(req: Request) {
  const w = await who('view');
  if (w.error) return w.error;
  const open = new URL(req.url).searchParams.get('open') || '';
  if (open) {
    if (!ID.test(open)) return NextResponse.json({ error: '開くファイルが違います' }, { status: 400 });
    const { data } = await db().from('settings').select('value').eq('key', KK_PREFIX + open).maybeSingle();
    const f = data?.value as KkFile | undefined;
    if (!f || f.deletedAt || !PATH_RE.test(f.path)) return NextResponse.json({ error: 'このファイルは見つかりません' }, { status: 404 });
    const { data: s } = await ike().storage.from(KK_BUCKET).createSignedUrl(f.path, 300, { download: new URL(req.url).searchParams.get('dl') === '1' ? f.name : undefined });
    if (!s?.signedUrl) return NextResponse.json({ error: 'ファイルを開けませんでした' }, { status: 502 });
    return NextResponse.redirect(s.signedUrl);
  }
  const { data, error } = await db().from('settings').select('key, value, updated_at').like('key', likePrefix(KK_PREFIX)).order('updated_at', { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const files = ((data || []) as Row[]).map((r) => ({ ...r.value, id: r.key.slice(KK_PREFIX.length), path: '' })).filter((f) => !f.deletedAt)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return NextResponse.json({ ok: true, files }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは格納できません' }, { status: 403 });
  const w = await who('edit');
  if (w.error) return w.error;
  const email = w.me.email;
  const b = ((await req.json().catch(() => null)) || {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const st = ike().storage.from(KK_BUCKET);

  if (b.action === 'upload-url') {
    const ext = extOf(fileName(b.name)), size = Number(b.size);
    if (!KK_TYPES[ext]) return NextResponse.json({ error: '格納できるのは PDF・Excel・Word・画像（png・jpg）だけです' }, { status: 400 });
    if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: 'ファイルが空です' }, { status: 400 });
    if (size > KK_MAX_BYTES) return NextResponse.json({ error: 'ファイルが大きすぎます（10MBまで）' }, { status: 400 });
    const path = `v2-mitsumori/${new Date(Date.now() + 9 * 3600e3).getUTCFullYear()}/${randomUUID()}.${ext}`;
    const { data, error } = await st.createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: 'アップロードの準備に失敗しました: ' + (error?.message || '') }, { status: 500 });
    return NextResponse.json({ ok: true, path, signedUrl: data.signedUrl, contentType: KK_TYPES[ext] });
  }

  if (b.action === 'confirm') {
    const path = String(b.path || ''), m = PATH_RE.exec(path), name = fileName(b.name);
    if (!m || !KK_TYPES[m[1]] || extOf(name) !== m[1]) return NextResponse.json({ error: '保存先が不正です' }, { status: 400 });
    const dir = path.slice(0, path.lastIndexOf('/')), fname = path.slice(path.lastIndexOf('/') + 1);
    const { data: listed, error } = await st.list(dir, { search: fname, limit: 1 });
    if (error) return NextResponse.json({ error: 'ファイルの確認に失敗しました: ' + error.message }, { status: 500 });
    const size = Number(((listed || []).find((x) => x.name === fname)?.metadata as { size?: number } | undefined)?.size || 0);
    if (!size) return NextResponse.json({ error: 'アップロードが完了していません' }, { status: 400 });
    const { data: signed } = await st.createSignedUrl(path, 600);
    const head = signed?.signedUrl ? await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-11' } }).then((r) => r.arrayBuffer()).then((x) => Buffer.from(x)).catch(() => null) : null;
    if (!head || !magicOk(m[1], head)) {
      await st.remove([path]).catch(() => undefined);
      return NextResponse.json({ error: `${m[1].toUpperCase()} として読めないファイルです` }, { status: 400 });
    }
    const id = randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(12, '0').slice(0, 12);
    const value: KkFile = { id, name, path, size, ...fields(b), uploadedBy: email, uploadedAt: now };
    const { error: e2 } = await db().from('settings').upsert({ key: KK_PREFIX + id, value, updated_by: email, updated_at: now }, { onConflict: 'key' });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ ok: true, file: { ...value, path: '' } });
  }

  if (b.action === 'update' || b.action === 'delete') {
    if (typeof b.id !== 'string' || !ID.test(b.id)) return NextResponse.json({ error: 'ファイルが違います' }, { status: 400 });
    const { data, error } = await db().from('settings').select('value').eq('key', KK_PREFIX + b.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const prev = data?.value as KkFile | undefined;
    if (!prev || prev.deletedAt) return NextResponse.json({ error: 'このファイルは見つかりません' }, { status: 404 });
    const value: KkFile = b.action === 'delete'
      ? { ...prev, deletedAt: now, updatedBy: email, updatedAt: now }
      : { ...prev, ...fields(b), updatedBy: email, updatedAt: now };
    const { error: e2 } = await db().from('settings').update({ value, updated_by: email, updated_at: now }).eq('key', KK_PREFIX + b.id);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ ok: true, file: { ...value, path: '' } });
  }

  return NextResponse.json({ error: '書く種類が違います' }, { status: 400 });
}
