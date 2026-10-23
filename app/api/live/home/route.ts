import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';

// ホームの「本物の件数」。今の社内システムの読むだけの GET を3つまとめて、件数だけ返す（氏名・金額の明細は返さない）。
//   ・稼働中／待機 … GET /api/proxy?action=getDashboardData の workforce（稼働中＝名簿−退社−待機−休職−退場−再アサイン−入場前・_active_count.ts）
//   ・交通費・経費の承認待ち … GET /api/keihi?action=adminList&status=申請中 の件数
//   ・請求で止まっている人 … GET /api/seikyu?action=list&cache=1 の counts（前回の計算結果。cache=1 なので今のシステムは計算し直さず DB にも書かない）
//   1つ読めなくても（権限が無い・遅い）ほかは出す。読めなかったものは null
type Block<T> = { ok: true; v: T } | { ok: false; error: string };

async function getJson<T>(path: string): Promise<Block<T>> {
  try {
    const r = await ikeFetch(path, undefined, 25000);
    const j = (await r.json().catch(() => ({}))) as T & { error?: unknown; hint?: string };
    if (r.status === 401) return { ok: false, error: 'login' };
    if (!r.ok) return { ok: false, error: String(j.hint || j.error || r.status) };
    return { ok: true, v: j };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

type Wf = { activeCount?: number; rosterTotal?: number; taishaCount?: number; taikiCount?: number; error?: string };
type Keihi = { claims?: Array<{ total_yen?: number }> };
type Seikyu = { ok?: boolean; ym?: string; counts?: Record<string, number>; totals?: { people?: number } };

export async function GET() {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const [dash, keihi, seikyu] = await Promise.all([
    getJson<{ workforce?: Wf }>('/api/proxy?action=getDashboardData'),
    getJson<Keihi>(`/api/keihi?action=adminList&status=${encodeURIComponent('申請中')}`),
    getJson<Seikyu>('/api/seikyu?action=list&cache=1'),
  ]);
  if ([dash, keihi, seikyu].every((b) => !b.ok && b.error === 'login')) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
  const wf = dash.ok && dash.v.workforce && !dash.v.workforce.error ? dash.v.workforce : null;
  const sc = seikyu.ok && seikyu.v.ok && seikyu.v.counts ? seikyu.v : null;
  return NextResponse.json({
    workforce: wf ? { active: wf.activeCount ?? null, roster: wf.rosterTotal ?? null, taisha: wf.taishaCount ?? null, taiki: wf.taikiCount ?? null } : null,
    keihi: keihi.ok ? { pending: (keihi.v.claims || []).length, yen: (keihi.v.claims || []).reduce((s, c) => s + (Number(c.total_yen) || 0), 0) } : null,
    seikyu: sc ? { ym: sc.ym || '', people: sc.totals?.people ?? 0, stop: (sc.counts?.waiting || 0) + (sc.counts?.needs || 0), review: sc.counts?.review || 0 } : null,
    errors: { workforce: dash.ok ? (wf ? '' : '読めませんでした') : dash.error, keihi: keihi.ok ? '' : keihi.error, seikyu: seikyu.ok ? (sc ? '' : 'まだ計算結果がありません') : seikyu.error },
  });
}
