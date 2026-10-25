import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { V2_SETTING_KEYS, type V2SettingKey, type V2Settings } from '@/lib/org';

// ver2 の設定（組織表・ロール・権限）を全員で共有する置き場（10-25）。中身は今の社内システムの v2-settings に1つの JSON で置く。
//   GET  … 今の設定と、いまの人が保存できるか（super_admin だけ）を返す。だれでも読める
//   POST {key, value} … key（org / members）の分だけ差し替えて保存。super_admin だけ（ここでも auth?action=me で確かめる・だめなら 403）
//     今の中身を読んでから key の分だけ入れ替える＝ほかの key（ほかの画面の設定）は消さない
//   今のシステムにまだ口が無い（404）ときは missing=true（画面はこの端末の控えで動く）
const MAX_BYTES = 400_000;

type Me = { authenticated?: boolean; email?: string; role?: string };

async function readJson<T>(path: string, init?: RequestInit): Promise<{ status: number; j: T | null }> {
  try {
    const r = await ikeFetch(path, init, 15000);
    return { status: r.status, j: (await r.json().catch(() => null)) as T | null };
  } catch { return { status: 502, j: null }; }
}
const asObj = (v: unknown): V2Settings => (v && typeof v === 'object' && !Array.isArray(v) ? (v as V2Settings) : {});

export async function GET() {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const [s, me] = await Promise.all([
    readJson<{ ok?: boolean; value?: unknown; error?: string }>('/api/assistant?action=v2-settings'),
    readJson<Me>('/api/auth?action=me'),
  ]);
  if (s.status === 401 || me.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
  const role = String(me.j?.role || '');
  const canSave = role === 'super_admin';
  if (s.status === 404) return NextResponse.json({ ok: true, value: null, role, canSave: false, missing: true });
  if (s.status !== 200 || !s.j?.ok) return NextResponse.json({ error: `設定を読めませんでした（${s.status}${s.j?.error ? `・${s.j.error}` : ''}）`, role, canSave }, { status: 502 });
  return NextResponse.json({ ok: true, value: s.j.value ?? null, role, canSave });
}

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { key?: string; value?: unknown } | null;
  const key = body?.key as V2SettingKey | undefined;
  if (!key || !V2_SETTING_KEYS.includes(key) || body?.value === undefined) return NextResponse.json({ error: '保存する中身が違います' }, { status: 400 });
  const me = await readJson<Me>('/api/auth?action=me');
  if (me.status === 401 || !me.j?.authenticated) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
  if (me.j.role !== 'super_admin') return NextResponse.json({ error: '全員の分を保存できるのは全体管理者（super_admin）だけです' }, { status: 403 });

  const cur = await readJson<{ ok?: boolean; value?: unknown }>('/api/assistant?action=v2-settings');
  if (cur.status === 404) return NextResponse.json({ error: '今の社内システムに設定の置き場がまだありません（この端末にだけ保存しました）' }, { status: 404 });
  if (cur.status !== 200 || !cur.j?.ok) return NextResponse.json({ error: `今の設定を読めませんでした（${cur.status}）` }, { status: 502 });
  const next: V2Settings = { ...asObj(cur.j.value), [key]: body.value, updatedAt: new Date().toISOString(), updatedBy: String(me.j.email || '') };
  const text = JSON.stringify({ value: next });
  if (text.length > MAX_BYTES) return NextResponse.json({ error: '大きすぎて保存できません' }, { status: 413 });

  const w = await readJson<{ ok?: boolean; error?: string }>('/api/assistant?action=v2-settings-save', { method: 'POST', body: text });
  if (w.status === 403) return NextResponse.json({ error: '全員の分を保存できるのは全体管理者（super_admin）だけです' }, { status: 403 });
  if (w.status !== 200 || !w.j?.ok) return NextResponse.json({ error: `保存できませんでした（${w.status}${w.j?.error ? `・${w.j.error}` : ''}）` }, { status: 502 });
  return NextResponse.json({ ok: true, updatedAt: next.updatedAt });
}
