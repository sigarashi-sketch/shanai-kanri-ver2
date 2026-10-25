import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { onlyMikeiken } from '@/lib/live/mikeiken';
import { buildStaffList, parseDateIso, type IkePersonMap, type IkeNyushaOverlay, type IkeRosterData, type IkeRosterStatus, type IkeSalesOverlay } from '@/lib/live/staff';
import { ruleCounts, type IkeRuleAbsence, type StaffYoyaku } from '@/lib/live/staff-extra';
import { isMikeiken } from '@/lib/live/mikeiken';

// 社員一覧・社員ページの本物（今の「従業員名簿」と同じ4つの材料をまとめて読む）。
//   ★読むだけ。呼ぶのは次の4つの GET だけ（どれも今のシステム側で SELECT しかしない action であることを確かめた）：
//     proxy?action=getRosterData / proxy?action=getRosterStatus / roster?op=extra&action=salesOverlay / roster?op=nyusha&action=list
//     ＋ roster?op=person&action=list（人の番号＝応募ID。同姓同名を見分ける・SELECT だけ・10-25）
//     （op=nyusha は action=save だと GET でも書くので、action=list 以外は絶対に呼ばない）
//     10-25 足した：roster?op=extra&action=ruleAbsence（ルール欠勤の回数・SELECT だけ）。待機・退社の予約は getRosterStatus から作る
//   ★書くのは別の口（/api/live/staff/write・決め打ち）
//   ★未経験の人だけ返す（今のプロパーリストに入っている人・lib/live/mikeiken.ts・10-25 shoya）。プロパーリストが読めなければ人の行は返さない
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
    const [roster, status, sales, nyusha, persons, mk, rule] = await Promise.all([
      getJson<IkeRosterData>('/api/proxy?action=getRosterData'),
      soft(getJson<IkeRosterStatus[]>('/api/proxy?action=getRosterStatus')),
      soft(getJson<{ overlay?: IkeSalesOverlay }>('/api/roster?op=extra&action=salesOverlay')),
      soft(getJson<{ overlay?: IkeNyushaOverlay }>('/api/roster?op=nyusha&action=list')),
      soft(getJson<IkePersonMap>('/api/roster?op=person&action=list')),   // 人の番号（応募ID・0364）。読めなければ前の形の id のまま
      loadMikeikenSet(),
      // 10-25 足した：ルール欠勤（SELECT だけ）。読めなければ「不明」
      soft(getJson<IkeRuleAbsence>('/api/roster?op=extra&action=ruleAbsence')),
    ]);
    if (!roster.success) return NextResponse.json({ error: roster.error || '名簿を読めませんでした' }, { status: 502 });
    const list = buildStaffList(roster, Array.isArray(status) ? status : null, sales?.overlay || null, nyusha?.overlay || null, Date.now(), persons);
    // 待機・退社の予約（未経験の人だけ）
    const yoyaku: StaffYoyaku[] = [];
    for (const st of Array.isArray(status) ? status : []) {
      const nm = st.name || st.normalized_name;
      if (!isMikeiken(mk, nm)) continue;
      const ty = parseDateIso(st.taiki_yotei_bi), ts = parseDateIso(st.taisha_yotei_bi);
      if (ty) yoyaku.push({ name: nm, kind: 'taiki', date: ty });
      if (ts && !st.taisha) yoyaku.push({ name: nm, kind: 'taisha', date: ts });
    }
    yoyaku.sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ ...list, rows: onlyMikeiken(mk, list.rows, 'name'), rule: ruleCounts(rule), yoyaku });
  } catch (e) {
    if (e instanceof AuthGone || (e as Error).message.startsWith('ログインが切れ')) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
