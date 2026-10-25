import { NextResponse } from 'next/server';
import { ikeToken } from '@/lib/ike';
import { ikeWrite, sameSite } from '@/lib/ike-write';
import { loadMikeikenSet } from '@/lib/live/mikeiken-server';
import { isMikeiken } from '@/lib/live/mikeiken';

// コミュニティ（班分け）を直す口（今のコミュニティの画面 teams.html と同じ・POST /api/teams?action=…・10-25）。
//   assign {name, team_id|null}（班へ動かす／未割当へ）・setLeader / setSubLeader {id, name|''}・createTeam {name}・renameTeam {id, name}・deleteTeam {id, move_to?}
//   ★action は下の決まった中からだけ（行き先はここで決め打ち）。書けるのは今のシステムで 採用・役員・全体管理者（＋個別に許された人）だけ＝判定は今のシステム（403 はそのまま返す）
//   ★人を動かす・役に就けるのは未経験の人（今のプロパーリストに入っている人）だけ
const ACTIONS = ['assign', 'setLeader', 'setSubLeader', 'createTeam', 'renameTeam', 'deleteTeam'] as const;
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const idOk = (v: unknown) => typeof v === 'string' && /^[0-9a-zA-Z-]{1,64}$/.test(v);

export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは保存できません' }, { status: 403 });
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const b = ((await req.json().catch(() => null)) || {}) as Record<string, unknown>;
  const action = ACTIONS.find((a) => a === b.action);
  if (!action) return NextResponse.json({ error: '書く種類が違います' }, { status: 400 });
  const name = s(b.name, 60);
  const body: Record<string, unknown> = {};
  if (action === 'assign') {
    if (!name) return NextResponse.json({ error: '氏名がありません' }, { status: 400 });
    if (b.team_id != null && b.team_id !== '' && !idOk(b.team_id)) return NextResponse.json({ error: '班が違います' }, { status: 400 });
    Object.assign(body, { name, team_id: b.team_id || null });
  } else if (action === 'setLeader' || action === 'setSubLeader') {
    if (!idOk(b.id)) return NextResponse.json({ error: '班が違います' }, { status: 400 });
    Object.assign(body, { id: b.id, name });
  } else if (action === 'createTeam') {
    if (!name) return NextResponse.json({ error: '班名を入れてください' }, { status: 400 });
    Object.assign(body, { name });
  } else if (action === 'renameTeam') {
    if (!idOk(b.id) || !name) return NextResponse.json({ error: 'id と班名が要ります' }, { status: 400 });
    Object.assign(body, { id: b.id, name });
  } else {
    if (!idOk(b.id) || (b.move_to != null && b.move_to !== '' && !idOk(b.move_to))) return NextResponse.json({ error: '班が違います' }, { status: 400 });
    Object.assign(body, { id: b.id, move_to: b.move_to || null });
  }
  if (name && (action === 'assign' || action === 'setLeader' || action === 'setSubLeader')) {
    try {
      if (!isMikeiken(await loadMikeikenSet(), name)) return NextResponse.json({ error: '未経験の人（今のプロパーリストに入っている人）ではないので、ここからは動かせません' }, { status: 403 });
    } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
  }
  return ikeWrite(req, `/api/teams?action=${action}`, body);
}
