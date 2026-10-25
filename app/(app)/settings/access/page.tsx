import { NoAccess } from '@/components/Perms';
import { canManageAccess, type Member } from '@/lib/access';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { loadMembers } from '@/lib/members-store';
import { getViewer } from '@/lib/viewer';
import { AccessEditor } from './AccessEditor';

// 権限管理。全体管理者（権限管理を持つロール）だけ。
//   ログイン中は、全員で共有している設定（今の社内システムの v2-settings の members）があればそれを先に出す（10-25）
async function sharedMembers(fallback: Member[]): Promise<Member[]> {
  if (!(await ikeToken())) return fallback;
  try {
    const r = await ikeFetch('/api/assistant?action=v2-settings', undefined, 8000);
    if (!r.ok) return fallback;
    const j = (await r.json()) as { value?: { members?: unknown } | null };
    const ms = j.value?.members;
    if (!Array.isArray(ms)) return fallback;
    const byId = new Map((ms as Member[]).filter((m) => m && typeof m.id === 'string').map((m) => [m.id, m]));
    // 人は今の名簿のまま。ロールと個別の段階だけ共有の分を重ねる
    return fallback.map((m) => { const s = byId.get(m.id); return s ? { ...m, role: s.role in { owner: 1, manager: 1, viewer_all: 1, none: 1 } ? s.role : m.role, own: s.own && typeof s.own === 'object' ? s.own : m.own } : m; });
  } catch { return fallback; }
}

export default async function AccessPage() {
  const me = await getViewer();
  if (!canManageAccess(me)) return <NoAccess label="権限管理" />;
  return <AccessEditor initial={await sharedMembers(await loadMembers())} meId={me.id} />;
}
