import { NextResponse } from 'next/server';
import { ikeFetchCached, ikeToken } from '@/lib/ike';
import type { ScoreRes } from '@/lib/live/proper-cols';

// プロパーリストのスコア（スキル／参画見込／辞退リスク／営業止め）を読む口（10-25 shoya「スコアとかないよね」）。
//   ・今の GET /api/roster?op=score をそのまま（SELECT だけ・今のシステム側にも10分の控えがある）
//   ・ここでもその人ごとに10分控える（lib/cache.ts）。force=1（学習し直し）は絶対に付けない＝重い計算を画面から起こさない
//   ・見られるかは今のシステムが決める（403 なら画面は列ごと出さない）
const TTL = 10 * 60_000;

export async function GET() {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  try {
    const r = await ikeFetchCached<ScoreRes>('/api/roster?op=score', TTL, { timeoutMs: 55_000 });
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (!r.ok || r.data?.ok === false) return NextResponse.json({ ok: false, error: r.data?.error || `スコアを読めませんでした（${r.status}）` }, { status: r.status === 403 ? 403 : 502 });
    return NextResponse.json(r.data);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
