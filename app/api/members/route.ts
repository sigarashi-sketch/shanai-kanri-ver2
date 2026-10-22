import { NextResponse } from 'next/server';
import { ROLES, canManageAccess, type Level, type Member, type RoleKey } from '@/lib/access';
import { loadMembers, saveMembers } from '@/lib/members-store';
import { getViewer } from '@/lib/viewer';

// 権限の付け替え。権限管理を持つ人（全体管理者）だけ。
const LEVEL_OK = new Set<Level>(['none', 'view', 'edit', 'approve']);

export async function PUT(req: Request) {
  const me = await getViewer();
  if (!canManageAccess(me)) return NextResponse.json({ error: '権限管理の権限がありません' }, { status: 403 });
  const body = (await req.json()) as { id: string; role?: RoleKey; own?: Member['own'] };
  const ms = await loadMembers();
  const m = ms.find((x) => x.id === body.id);
  if (!m) return NextResponse.json({ error: 'いない人です' }, { status: 404 });
  if (body.role) {
    if (!(body.role in ROLES)) return NextResponse.json({ error: 'ロールが違います' }, { status: 400 });
    // 自分から権限管理を外すと誰も戻せなくなるので止める
    if (m.id === me.id && !ROLES[body.role].manageAccess) return NextResponse.json({ error: '自分の権限管理は外せません' }, { status: 400 });
    m.role = body.role;
  }
  if (body.own) {
    for (const [k, v] of Object.entries(body.own)) if (!LEVEL_OK.has(v as Level)) return NextResponse.json({ error: '段階が違います' }, { status: 400 });
    m.own = { ...m.own, ...body.own };
  }
  await saveMembers(ms);
  return NextResponse.json({ ok: true, member: m });
}
