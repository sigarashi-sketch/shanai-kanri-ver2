import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { ikeWrite, sameSite } from '@/lib/ike-write';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken } from '@/lib/live/mikeiken';

// 社員ページの「LINEグループ」の手動紐付け（今の従業員名簿の詳細のプルダウンと同じ・10-26）。
//   GET ?name=   … 候補（今の /api/roster?op=linegroup&action=candidates・読むだけ）。未経験の人だけ
//   POST {name, groupId} … 1件保存（今の action=save・groupId 空＝紐付けを外して自動の突き合わせに戻す）
//   ★同姓同名・他の人に紐付いたグループは今のシステムが断る（ambiguous / group_taken）。LINE 側のグループ名は変わらない
//   ★送るものは無い（紐付けを変えるだけ）
const ERR: Record<string, string> = {
  ambiguous: '同姓同名がいるため紐付けできません（別人を書き換えないための制限）',
  group_taken: 'そのグループは既に他の人に紐付いています',
  unknown_group: 'そのグループが台帳にありません',
  no_name: '氏名が空です',
};
const nameOf = (v: unknown) => String(v ?? '').trim().slice(0, 60);

async function mustMikeiken(name: string): Promise<NextResponse | null> {
  if (!name) return NextResponse.json({ error: '氏名がありません' }, { status: 400 });
  try {
    if (!isMikeiken(await loadMikeikenSet(), name)) return NextResponse.json({ error: '未経験の人（今のプロパーリストに入っている人）ではありません' }, { status: 404 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
  return null;
}

export async function GET(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const name = nameOf(new URL(req.url).searchParams.get('name'));
  const ng = await mustMikeiken(name);
  if (ng) return ng;
  try {
    const r = await ikeFetch(`/api/roster?op=linegroup&action=candidates&name=${encodeURIComponent(name)}`, undefined, 30000);
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string; candidates?: Array<Record<string, unknown>> };
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (!r.ok || !j.success) return NextResponse.json({ error: j.error || `候補を読めませんでした（${r.status}）` }, { status: r.ok ? 502 : r.status });
    const candidates = (j.candidates || []).slice(0, 300).map((c) => ({
      groupId: String(c.groupId || ''), name: String(c.name || ''), lineName: String(c.lineName || ''),
      speakers: Array.isArray(c.speakers) ? (c.speakers as unknown[]).map(String).slice(0, 4) : [], lastMs: Number(c.lastMs) || 0,
    })).filter((c) => c.groupId);
    return NextResponse.json({ ok: true, candidates }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = nameOf(b.name);
  const groupId = String(b.groupId ?? '').trim();
  if (groupId && !/^[A-Za-z0-9_-]{1,80}$/.test(groupId)) return NextResponse.json({ error: 'グループの指定が正しくありません' }, { status: 400 });
  const ng = await mustMikeiken(name);
  if (ng) return ng;
  const res = await ikeWrite(req, '/api/roster?op=linegroup&action=save', { name, groupId });
  if (res.ok) return res;
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return NextResponse.json({ error: ERR[String(j.error)] || j.error || '保存できませんでした' }, { status: res.status });
}
