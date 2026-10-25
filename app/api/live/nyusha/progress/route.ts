import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { ikeWrite, sameSite } from '@/lib/ike-write';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { onlyMikeiken } from '@/lib/live/mikeiken';

// 入社手続きの印（今の入社手続きの画面 nyusha-admin.html と同じ・nyusha_progress）。
//   GET  … /api/nyusha-progress?days=60（GET は読むだけ）。未経験の人だけ返す
//   POST … /api/nyusha-progress へ {action:'set', roster_id, key, value} か {action:'memo', roster_id, memo}（行き先は決め打ち）
//   ★印は人が付ける（freee・クラウドサインからは取らない）。プロパーリストには書かない（今のシステムの口がそうなっている）
const KEYS = ['sign', 'freee', 'rirekisho', 'kenshin', 'gensen', 'koyou'];

export async function GET() {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  try {
    const [r, mk] = await Promise.all([ikeFetch('/api/nyusha-progress?days=60'), loadMikeikenSet()]);
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; rows?: { name: string }[]; items?: unknown[]; error?: string };
    if (!r.ok || !j.ok) return NextResponse.json({ error: j.error || `入社手続きの印が読めませんでした（${r.status}）` }, { status: r.status === 403 ? 403 : 502 });
    return NextResponse.json({ ok: true, items: j.items || [], rows: onlyMikeiken(mk, j.rows || [], 'name') });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  const b = ((await req.json().catch(() => null)) || {}) as Record<string, unknown>;
  const id = typeof b.roster_id === 'string' ? b.roster_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: '人の番号が違います' }, { status: 400 });
  if (b.action === 'set') {
    if (typeof b.key !== 'string' || !KEYS.includes(b.key)) return NextResponse.json({ error: '項目が違います' }, { status: 400 });
    if (!['done', 'na', ''].includes(String(b.value))) return NextResponse.json({ error: '値が違います' }, { status: 400 });
    return ikeWrite(req, '/api/nyusha-progress', { action: 'set', roster_id: id, key: b.key, value: String(b.value) });
  }
  if (b.action === 'memo') {
    return ikeWrite(req, '/api/nyusha-progress', { action: 'memo', roster_id: id, memo: String(b.memo ?? '').slice(0, 2000) });
  }
  return NextResponse.json({ error: '書く種類が違います' }, { status: 400 });
}
