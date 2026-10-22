import { NoAccess } from '@/components/Perms';
import { canManageAccess } from '@/lib/access';
import { loadMembers } from '@/lib/members-store';
import { getViewer } from '@/lib/viewer';
import { AccessEditor } from './AccessEditor';

// 権限管理。全体管理者（権限管理を持つロール）だけ。
export default async function AccessPage() {
  const me = await getViewer();
  if (!canManageAccess(me)) return <NoAccess label="権限管理" />;
  return <AccessEditor initial={await loadMembers()} meId={me.id} />;
}
