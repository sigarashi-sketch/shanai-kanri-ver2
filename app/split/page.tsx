import { redirect } from 'next/navigation';
import { PermsProvider } from '@/components/Perms';
import { SplitHost } from '@/components/CtxMenu';
import { canManageAccess, canUseApp, effectivePerms } from '@/lib/access';
import { loadMe } from '@/lib/members-store';

export const metadata = { title: 'スプリット' };

// スプリット：1つのタブに 2〜4 画面を並べる（今のいけどんの split.html と同じ public/split-core.js）。入口は右クリックメニューの「スプリット」。
//   (app) の外に置く（左メニューを出さず画面いっぱいに使う）。入れる人・並べられる画面は (app)/layout.tsx・Shell のメニューと同じ決め方。
//   枠の中の各画面は (app) の入口をそれぞれ通る＝権限もそのまま。
export default async function Page() {
  const got = await loadMe();
  if (!got.ok) redirect('/');
  const me = got.me;
  if (!canUseApp(me)) redirect('/shared');
  return (
    <PermsProvider me={me} kperms={effectivePerms(me)} manageAccess={canManageAccess(me)}>
      <SplitHost />
    </PermsProvider>
  );
}
