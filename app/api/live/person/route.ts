import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { livePerson, type LivePersonView, type PersonCandidate, type PersonRes } from '@/lib/live/person';
import { cellsOf, normName as eNorm, type EngineerRow, type EngineerRows } from '@/lib/live/eigyo-common';
import { MIKEIKEN_PATH, isMikeiken, mikeikenSetOf } from '@/lib/live/mikeiken';
import { myCan } from '@/lib/live/role';
import { buildStaffList, isLiveStaffId, staffIdMatches, normName as sNorm, type IkePersonMap, type IkeNyushaOverlay, type IkeRosterData, type IkeRosterStatus, type IkeSalesOverlay, type LiveStaff } from '@/lib/live/staff';

// 人の名前を押したときの「この人の情報」（どの画面からでも同じ）。名前は URL に出さないので POST で受ける。読むだけ。
//   POST { name, id? } → PersonRes（小窓に要るものを1回でまとめて返す＝小窓の中で /api/live/staff や /api/live/person を読み直さない・10-25）
//   ・要員（営業）… /api/roster?action=getEngineerRows（全エリア）の行。未経験かどうかの判定にも同じ返りを使う（1回で済ませる）
//   ・未経験の人だけ（今のプロパーリストに入っている人・10-25 shoya）。違えば notMikeiken を返す
//   ・社員（人事）… 社員一覧と同じ4つの材料（proxy getRosterData / getRosterStatus・roster extra salesOverlay・roster nyusha list）
//   ・同姓同名は実在する（10-21）。名前で当たった人を全部 candidates で返し、小窓で選ぶ（採用担当・所属・最寄駅で見分ける）
//     id（社員＝r…／要員＝プロパーリストの行の id）が来たらその人だけ
//   ・単価・額面などは組織表で伏せる（lib/live/role.ts myCan）。can で「チャット・基本情報・単価」を見てよいかを返す
class AuthGone extends Error {}
async function getJson<T>(path: string): Promise<T | null> {
  const r = await ikeFetch(path);
  if (r.status === 401) throw new AuthGone();
  return r.ok ? ((await r.json()) as T) : null;
}
const soft = <T,>(p: Promise<T | null>) => p.catch((e) => { if (e instanceof AuthGone) throw e; return null; });
const v = (s?: string) => (s && s !== '—' ? s : '');

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { name?: string; id?: string };
  let name = String(b.name || '').trim();
  const id = String(b.id || '').trim().slice(0, 80);
  if ((!name && !id) || name.length > 60) return NextResponse.json({ error: '名前がありません' }, { status: 400 });
  try {
    const [er, roster, status, sales, nyusha, persons, can] = await Promise.all([
      soft(getJson<EngineerRows>(MIKEIKEN_PATH)),
      soft(getJson<IkeRosterData>('/api/proxy?action=getRosterData')),
      soft(getJson<IkeRosterStatus[]>('/api/proxy?action=getRosterStatus')),
      soft(getJson<{ overlay?: IkeSalesOverlay }>('/api/roster?op=extra&action=salesOverlay')),
      soft(getJson<{ overlay?: IkeNyushaOverlay }>('/api/roster?op=nyusha&action=list')),
      soft(getJson<IkePersonMap>('/api/roster?op=person&action=list')),
      myCan(),
    ]);
    if (!er?.rows) return NextResponse.json({ error: 'プロパーリストが読めないので、未経験の人か確かめられませんでした' }, { status: 502 });
    const list = roster?.success ? buildStaffList(roster, Array.isArray(status) ? status : null, sales?.overlay || null, nyusha?.overlay || null, Date.now(), persons) : null;

    // id から名前を決める（id が古い形なら名前のまま）
    // 社員の id は a＋応募ID（人の番号）か r＋氏名の番号（前の形）。古いリンクの r… でも当たる
    const byStaffId = id && isLiveStaffId(id) ? list?.rows.filter((s) => staffIdMatches(s, id)) ?? [] : [];
    const byRow = id && !isLiveStaffId(id) ? er.rows.find((r) => r.row === id) ?? null : null;
    name = byStaffId[0]?.name || byRow?.name || name;
    if (!name) return NextResponse.json({ error: 'この人が見つかりませんでした' }, { status: 404 });

    const mk = mikeikenSetOf(er);
    const empty = { ok: true as const, name, month: list?.month || '', candidates: [], everyone: [], can };
    if (!isMikeiken(mk, name)) return NextResponse.json({ ...empty, notMikeiken: true } satisfies PersonRes);

    const staffAll = list?.rows.filter((s) => sNorm(s.name) === sNorm(name)) ?? [];
    const properAll = er.rows.filter((r) => eNorm(r.name) === eNorm(name));
    let cands = pair(er, staffAll, properAll, can.price);
    if (byStaffId.length) cands = cands.filter((c) => !!c.staff && staffIdMatches(c.staff, id));
    else if (byRow) cands = cands.filter((c) => c.proper?.id === byRow.row);
    if (!cands.length && (byStaffId.length || byRow)) cands = pair(er, staffAll, properAll, can.price);

    const everyone = Array.from(new Set([...(list?.rows ?? []).map((s) => s.name), ...er.rows.map((r) => r.name)].filter(Boolean)));
    return NextResponse.json({ ...empty, candidates: cands, everyone } satisfies PersonRes);
  } catch (e) {
    if (e instanceof AuthGone) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}

/** 同じ名前の社員と要員を1人ずつに組む。1対1ならそのまま、複数なら最寄駅か採用担当が合うものどうし。組めない人はそれぞれ1人として出す */
function pair(er: EngineerRows, staff: LiveStaff[], propers: EngineerRow[], price: boolean): PersonCandidate[] {
  const cell = new Map(propers.map((r) => [r.row, cellsOf(er, r)]));
  const used = new Set<string>();
  const out: PersonCandidate[] = [];
  const view = (r: EngineerRow): LivePersonView | null => {
    const p = livePerson(r.row, er, null, null, false);
    if (!p || price) return p;
    return { ...p, facts: p.facts.map(([k, x]) => [k, /額面|単価/.test(k) ? '—' : x] as [string, string]) };
  };
  staff.forEach((s0, i) => {
    const s = price ? s0 : { ...s0, price: '—' };
    // 人の番号（応募ID）がわかっていれば、営業リストの同じ応募の行と組む（同姓同名でも取り違えない・10-25）
    const byPid = s0.personId ? propers.find((r) => !used.has(r.row) && (cell.get(r.row) || {}).application_id === s0.personId) : undefined;
    const pr = byPid ?? (staff.length === 1 && propers.length === 1 ? propers[0]
      : propers.find((r) => {
        if (used.has(r.row)) return false;
        const c = cell.get(r.row) || {};
        return (!!v(s.station) && eNorm(c.eki) === eNorm(s.station)) || (!!v(s.recruiter) && eNorm(c.tantou) === eNorm(s.recruiter));
      }));
    if (pr) used.add(pr.row);
    const c = pr ? cell.get(pr.row) || {} : {};
    out.push({
      key: `s${i}:${s.id}`, name: s.name, staff: s, proper: pr ? view(pr) : null,
      personId: s0.personId || (pr ? (cell.get(pr.row) || {}).application_id || '' : ''),
      hint: { recruiter: v(s.recruiter) || v(c.tantou), company: v(s.company) || v(c.shozoku), station: v(s.station) || v(c.eki) },
    });
  });
  for (const r of propers) {
    if (used.has(r.row)) continue;
    const c = cell.get(r.row) || {};
    out.push({ key: `p:${r.row}`, name: r.name, staff: null, proper: view(r), personId: c.application_id || '', hint: { recruiter: v(c.tantou), company: v(c.shozoku), station: v(c.eki) } });
  }
  return out;
}
