import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { livePerson } from '@/lib/live/person';
import { normName as eNorm, type EngineerRows } from '@/lib/live/eigyo-common';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken } from '@/lib/live/mikeiken';
import { buildStaffList, normName as sNorm, type IkeNyushaOverlay, type IkeRosterData, type IkeRosterStatus, type IkeSalesOverlay } from '@/lib/live/staff';

// 人の名前を押したときの「この人の情報」（どの画面からでも同じ）。名前は URL に出さないので POST で受ける。読むだけ。
//   ・要員（営業）… /api/roster?action=getEngineerRows&area=main の行（要員ページと同じ）
//   ・未経験の人だけ（今のプロパーリストに入っている人・全エリア・10-25 shoya）。いなければ社員側も出さない
//   ・社員（人事）… 社員一覧と同じ4つの材料（proxy getRosterData / getRosterStatus・roster extra salesOverlay・roster nyusha list）
class AuthGone extends Error {}
async function getJson<T>(path: string): Promise<T | null> {
  const r = await ikeFetch(path);
  if (r.status === 401) throw new AuthGone();
  return r.ok ? ((await r.json()) as T) : null;
}
const soft = <T,>(p: Promise<T | null>) => p.catch((e) => { if (e instanceof AuthGone) throw e; return null; });

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  if (!name || !String(name).trim()) return NextResponse.json({ error: '名前がありません' }, { status: 400 });
  try {
    const [er, roster, status, sales, nyusha, mk] = await Promise.all([
      soft(getJson<EngineerRows>('/api/roster?action=getEngineerRows&area=main')),
      soft(getJson<IkeRosterData>('/api/proxy?action=getRosterData')),
      soft(getJson<IkeRosterStatus[]>('/api/proxy?action=getRosterStatus')),
      soft(getJson<{ overlay?: IkeSalesOverlay }>('/api/roster?op=extra&action=salesOverlay')),
      soft(getJson<{ overlay?: IkeNyushaOverlay }>('/api/roster?op=nyusha&action=list')),
      loadMikeikenSet().catch(() => null),
    ]);
    if (!mk) return NextResponse.json({ error: 'プロパーリストが読めないので、未経験の人か確かめられませんでした' }, { status: 502 });
    if (!isMikeiken(mk, name)) return NextResponse.json({ ok: true, proper: null, staff: null, notMikeiken: true });
    const row = er?.rows?.find((r) => eNorm(r.name) === eNorm(name));
    const proper = row ? livePerson(row.row, er, null, null, false) : null;
    const list = roster?.success ? buildStaffList(roster, Array.isArray(status) ? status : null, sales?.overlay || null, nyusha?.overlay || null) : null;
    const staff = list?.rows.find((s) => sNorm(s.name) === sNorm(name)) ?? null;
    return NextResponse.json({ ok: true, proper, staff });
  } catch (e) {
    if (e instanceof AuthGone) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
