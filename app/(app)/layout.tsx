import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { PermsProvider } from '@/components/Perms';
import { canManageAccess, canUseApp, effectivePerms } from '@/lib/access';
import { loadMembers } from '@/lib/members-store';
import { getViewer } from '@/lib/viewer';

// 未経験事業部の内勤だけが入れる。それ以外は営業共有リストへ（ver2 でも変えない決まり）。
//   分類ごとの「見ない」は Shell がメニューから消し、開いた画面は NoAccess にする。
//   ※本番前の手元版はページ単位の止め方が画面側。本物のデータをつなぐときは API 側でも必ず止める。
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getViewer();
  if (!canUseApp(me)) redirect('/shared');
  const members = await loadMembers();
  return (
    <PermsProvider me={me} perms={effectivePerms(me)} manageAccess={canManageAccess(me)}>
      <Shell members={members.map((m) => ({ id: m.id, name: m.name }))}>{children}</Shell>
    </PermsProvider>
  );
}
