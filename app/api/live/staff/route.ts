import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { buildStaffList, type IkeNyushaOverlay, type IkeRosterData, type IkeRosterStatus, type IkeSalesOverlay } from '@/lib/live/staff';

// 社員一覧・社員ページの本物（今の「従業員名簿」と同じ4つの材料をまとめて読む）。
//   ★読むだけ。呼ぶのは次の4つの GET だけ（どれも今のシステム側で SELECT しかしない action であることを確かめた）：
//     proxy?action=getRosterData / proxy?action=getRosterStatus / roster?op=extra&action=salesOverlay / roster?op=nyusha&action=list
//     （op=nyusha は action=save だと GET でも書くので、action=list 以外は絶対に呼ばない）
//   ★名簿の info（住所・生年月日など）は buildStaffList で捨てる＝画面に渡さない
class AuthGone extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const r = await ikeFetch(path);
  if (r.status === 401) throw new AuthGone();
  if (!r.ok) throw new Error(`${path.split('?')[0]}（${r.status}）`);
  return (await r.json()) as T;
}
const soft = <T,>(p: Promise<T>) => p.catch((e) => { if (e instanceof AuthGone) throw e; return null; });

export async function GET() {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  try {
    const [roster, status, sales, nyusha] = await Promise.all([
      getJson<IkeRosterData>('/api/proxy?action=getRosterData'),
      soft(getJson<IkeRosterStatus[]>('/api/proxy?action=getRosterStatus')),
      soft(getJson<{ overlay?: IkeSalesOverlay }>('/api/roster?op=extra&action=salesOverlay')),
      soft(getJson<{ overlay?: IkeNyushaOverlay }>('/api/roster?op=nyusha&action=list')),
    ]);
    if (!roster.success) return NextResponse.json({ error: roster.error || '名簿を読めませんでした' }, { status: 502 });
    return NextResponse.json(buildStaffList(roster, Array.isArray(status) ? status : null, sales?.overlay || null, nyusha?.overlay || null));
  } catch (e) {
    if (e instanceof AuthGone) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
