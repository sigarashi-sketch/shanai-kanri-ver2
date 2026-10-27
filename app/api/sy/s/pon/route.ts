import { NextResponse, type NextRequest } from 'next/server';
import { apiUser } from '@/lib/sy/api';
import { appRole, loadAccess } from '@/lib/sy/access';
import { ike } from '@/lib/sy/db';
import { listPonUsers, loadPonKinds, loadPonSettings } from '@/lib/sy/pon';
import { PON_ACT_PREFIX, PON_FIELDS, PON_ROLE, PON_SETTINGS_KEY } from '@/lib/sy/pon-types';
import { isAdminUp } from '@/lib/sy/access-types';

export const maxDuration = 30;

// たまげたポンの設定（/pon/settings）。見る・マイルを変えるのは admin 以上、許可の付け外しと 当たりの率は super admin だけ
async function gate() {
  const u = await apiUser(); if (u instanceof NextResponse) return u;
  const role = appRole(u, await loadAccess());
  if (!isAdminUp(role)) return NextResponse.json({ error: 'この画面は admin と super admin だけが使えます' }, { status: 403 });
  return { u, role };
}
export async function GET() {
  const g = await gate(); if (g instanceof NextResponse) return g;
  const [users, kinds, settings] = await Promise.all([listPonUsers(), loadPonKinds(), loadPonSettings()]);
  return NextResponse.json({ me: { email: g.u.email, role: g.role }, users: users.map(({ id: _id, ...x }) => x), kinds, settings });
}
export async function POST(req: NextRequest) {
  const g = await gate(); if (g instanceof NextResponse) return g;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const bad = (m: string, status = 400) => NextResponse.json({ error: m }, { status });
  const now = new Date().toISOString();

  if (b.op === 'kind') {   // 操作ごとのマイル・標準の分・使う/使わない（それゆけ の操作の種別だけ）
    const id = Number(b.id); const miles = Number(b.miles); const mins = Number(b.std_minutes);
    if (!Number.isInteger(miles) || miles < 0 || miles > 10) return bad('マイルは 0〜10 の整数で入れてください');
    if (!Number.isInteger(mins) || mins < 0 || mins > 600) return bad('標準の分は 0〜600 の整数で入れてください');
    const { data, error } = await ike().from('bikkura_task_kinds').update({ miles, std_minutes: mins, active: b.active !== false, uncapped: !!b.uncapped, updated_at: now })
      .eq('id', id).like('act_pattern', PON_ACT_PREFIX + '%').select('id');
    if (error) return bad(error.message, 500);
    if (!data?.length) return bad('その操作は見つかりません', 404);
    return NextResponse.json({ ok: true, kinds: await loadPonKinds() });
  }
  if (b.op === 'settings') {   // マネージャーの設定（丸ごと1式のうち、画面に出している項目だけ差し替える）
    const patch = (b.patch || {}) as Record<string, unknown>; const cur = await loadPonSettings(); const next: Record<string, unknown> = { ...cur };
    for (const f of PON_FIELDS) {
      if (!(f.k in patch)) continue;
      const n = Number(patch[f.k]); const [lo, hi, int] = f.lim;
      if (!Number.isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) return bad(`「${f.label}」は ${lo}〜${hi}${int ? ' の整数' : ''}で入れてください`);
      if (n === cur[f.k]) continue;
      if (f.superOnly && g.role !== 'super_admin') return bad(`「${f.label}」を変えられるのは super admin だけです`, 403);
      next[f.k] = n;
    }
    const { error } = await ike().from('app_settings').upsert({ key: PON_SETTINGS_KEY, value: next, updated_at: now }, { onConflict: 'key' });
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true, settings: next });
  }
  if (b.op === 'grant') {   // 許可の付け外し。開始日は最初に許可した時刻のまま（いけどんの決まりと同じ）。役割が空の人は マネージャー にする
    if (g.role !== 'super_admin') return bad('許可を変えられるのは super admin だけです', 403);
    const t = (await listPonUsers()).find((x) => x.email === String(b.email || '').toLowerCase());
    if (!t) return bad('その人は それゆけ未経験 にログインできる人の中に見つかりません', 404);
    const patch: Record<string, unknown> = { bikkura: !!b.on };
    if (b.on && !t.since) patch.bikkura_since = now;
    if (b.on && !t.jimuRole) patch.jimu_role = PON_ROLE;
    const { error } = await ike().from('profiles').update(patch).eq('user_id', t.id);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true, users: (await listPonUsers()).map(({ id: _id, ...x }) => x) });
  }
  return bad('op が不正です');
}
