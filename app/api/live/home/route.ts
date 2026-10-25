import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken } from '@/lib/live/mikeiken';
import { buildStaffList, type IkeNyushaOverlay, type IkeRosterData, type IkeRosterStatus, type IkeSalesOverlay } from '@/lib/live/staff';

// ホームの「本物の件数」。今の社内システムの読むだけの GET を3つまとめて、件数だけ返す（氏名・金額の明細は返さない）。
//   ・稼働中／待機 … GET /api/proxy?action=getDashboardData の workforce（稼働中＝名簿−退社−待機−休職−退場−再アサイン−入場前・_active_count.ts）
//   ・交通費・経費の承認待ち … GET /api/keihi?action=adminList&status=申請中 の件数
//   ・請求で止まっている人 … GET /api/seikyu?action=list&cache=1 の counts（前回の計算結果。cache=1 なので今のシステムは計算し直さず DB にも書かない）
//   ★未経験の人だけで数える（今のプロパーリストに入っている人・10-25 shoya）：
//     稼働中 … 今の getDashboardData の workforce.members（＝今のシステムが「稼働中」と数えた人：名簿−退社−待機−休職−退場−再アサイン−入場前・
//              activeExclusion がどれにも当たらない人）を、未経験の人だけ数える（10-25 今と同じ定義に揃えた。ver2 で判定は作り直さない）
//              ※ members は正規化名で1人1行なので、名簿に同じ名前の行が2つあるときだけ今の activeCount より1少なくなりうる
//     名簿・退社・待機 … 社員一覧と同じ4つの材料（/api/live/staff と同じ）で状態を出し、未経験の人だけ数える（参考の件数）
//     交通費・経費 … 申請の氏名（linked_name）が未経験の人の分だけ（氏名が決まらない申請は数えない）
//     請求 … 仕様を変えないので絞らない（今の請求の答えのまま）
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
type Keihi = { claims?: Array<{ total_yen?: number; linked_name?: string | null }> };
type Seikyu = { ok?: boolean; ym?: string; counts?: Record<string, number>; totals?: { people?: number } };

export async function GET() {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const [dashboard, roster, status, sales, nyusha, keihi0, seikyu, mk] = await Promise.all([
    getJson<{ workforce?: Wf & { members?: Array<{ name?: string }> }; error?: string }>('/api/proxy?action=getDashboardData'),
    getJson<IkeRosterData>('/api/proxy?action=getRosterData'),
    getJson<IkeRosterStatus[]>('/api/proxy?action=getRosterStatus'),
    getJson<{ overlay?: IkeSalesOverlay }>('/api/roster?op=extra&action=salesOverlay'),
    getJson<{ overlay?: IkeNyushaOverlay }>('/api/roster?op=nyusha&action=list'),
    getJson<Keihi>(`/api/keihi?action=adminList&status=${encodeURIComponent('申請中')}`),
    getJson<Seikyu>('/api/seikyu?action=list&cache=1'),
    loadMikeikenSet().then((v) => ({ ok: true as const, v }), (e: Error) => ({ ok: false as const, error: e.message })),
  ]);
  if ([roster, keihi0, seikyu].every((b) => !b.ok && b.error === 'login')) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
  const mkErr = mk.ok ? '' : `未経験の人に絞れませんでした（${mk.error}）`;
  const dash: Block<{ workforce?: Wf }> = !mk.ok ? { ok: false, error: mkErr } : !roster.ok ? roster : !roster.v.success ? { ok: false, error: roster.v.error || '名簿を読めませんでした' } : (() => {
    const rows = buildStaffList(roster.v, status.ok && Array.isArray(status.v) ? status.v : null, sales.ok ? sales.v.overlay || null : null, nyusha.ok ? nyusha.v.overlay || null : null)
      .rows.filter((r) => isMikeiken(mk.v, r.name));
    const n = (k: string) => rows.filter((r) => r.statusKey === k).length;
    // 稼働中は今のシステムの判定（getDashboardData の members）をそのまま使う。読めなければ出さない（別の数え方で埋めない）
    const w = dashboard.ok ? dashboard.v.workforce : null;
    if (!w || w.error || !Array.isArray(w.members)) return { ok: false, error: dashboard.ok ? String(w?.error || dashboard.v.error || '稼働中の人数を読めませんでした') : dashboard.error };
    const active = w.members.filter((m) => isMikeiken(mk.v, m.name)).length;
    return { ok: true, v: { workforce: { activeCount: active, rosterTotal: rows.length, taishaCount: n('taisha'), taikiCount: n('taiki') } } };
  })();
  const keihi: Block<Keihi> = !keihi0.ok ? keihi0 : !mk.ok ? { ok: false, error: mkErr } : { ok: true, v: { claims: (keihi0.v.claims || []).filter((c) => isMikeiken(mk.v, c.linked_name)) } };
  const wf = dash.ok && dash.v.workforce && !dash.v.workforce.error ? dash.v.workforce : null;
  const sc = seikyu.ok && seikyu.v.ok && seikyu.v.counts ? seikyu.v : null;
  return NextResponse.json({
    workforce: wf ? { active: wf.activeCount ?? null, roster: wf.rosterTotal ?? null, taisha: wf.taishaCount ?? null, taiki: wf.taikiCount ?? null } : null,
    keihi: keihi.ok ? { pending: (keihi.v.claims || []).length, yen: (keihi.v.claims || []).reduce((s, c) => s + (Number(c.total_yen) || 0), 0) } : null,
    seikyu: sc ? { ym: sc.ym || '', people: sc.totals?.people ?? 0, stop: (sc.counts?.waiting || 0) + (sc.counts?.needs || 0), review: sc.counts?.review || 0 } : null,
    errors: { workforce: dash.ok ? (wf ? '' : '読めませんでした') : dash.error, keihi: keihi.ok ? '' : keihi.error, seikyu: seikyu.ok ? (sc ? '' : 'まだ計算結果がありません') : seikyu.error },
  });
}
