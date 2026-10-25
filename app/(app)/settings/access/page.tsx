import { NoAccess } from '@/components/Perms';
import { canManageAccess } from '@/lib/access';
import { loadMembers } from '@/lib/members-store';
import { getViewer } from '@/lib/viewer';
import { AccessEditor } from './AccessEditor';

// 権限管理。全体管理者（権限管理を持つロール）だけ。
//   ログイン中は、全員で共有している設定を重ねた名簿（loadMembers が重ねる・10-25）

export default async function AccessPage() {
  const me = await getViewer();
  if (!canManageAccess(me)) return <NoAccess label="権限管理" />;
  return <AccessEditor initial={await loadMembers()} meId={me.id} />;
}
