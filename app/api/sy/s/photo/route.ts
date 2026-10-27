import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/sy/audit';
import { apiUser } from '@/lib/sy/api';
import { deletePhoto, savePhoto } from '@/lib/sy/photos';

// 顔写真を 差し替える { key, name, dataUrl } ／ 消す { key, name, delete: true }。置き場は lib/photos.ts（いけどんと 共通）
export async function POST(req: NextRequest) {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => ({}))) as { key?: string; name?: string; dataUrl?: string; delete?: boolean };
  const key = String(b.key || ''); const name = String(b.name || '');
  if (!/^(n|p):.+/.test(key) || !name.trim()) return NextResponse.json({ error: 'key / 氏名が不正です' }, { status: 400 });
  if (b.delete) {
    const r = await deletePhoto(name);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
    await audit(u, 'photo:delete', key, {});
    return NextResponse.json({ ok: true, url: '' });
  }
  const r = await savePhoto(name, b.dataUrl, u.email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  await audit(u, 'photo:save', key, {});
  return NextResponse.json({ ok: true, url: r.url });
}
