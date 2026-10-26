import { NoAccess } from '@/components/Perms';
import { canManageAccess } from '@/lib/access';
import { getViewer } from '@/lib/viewer';
import { AccessEditor } from './AccessEditor';

// 権限管理。全体管理者（権限管理を持つロール）だけ。
//   人ごとの権限は組織表（/settings/org）で付ける（10-26 組織表が正）。ここは名前の小窓の表だけ

export default async function AccessPage() {
  const me = await getViewer();
  if (!canManageAccess(me)) return <NoAccess label="権限管理" />;
  return <AccessEditor />;
}
