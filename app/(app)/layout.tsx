import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { PermsProvider } from '@/components/Perms';
import { canManageAccess, canUseApp, effectivePages, effectivePerms } from '@/lib/access';
import { loadMe } from '@/lib/members-store';
import Watermark from '@/components/Watermark';
import { LoginGate, gateError } from '@/components/LoginGate';

// 入口（10-26 見本データをなくした）。
//   ・ログインしていない（トークンが無い・切れた）ときは、メニューも画面も出さず「会社のアカウントでログイン」だけ
//   ・いまの人＝ログインした本人（lib/members-store.ts loadMe）。見本の人で画面を見せる道は無い
//   ・入れるのは組織表でロール（部署・チームの段階を含む）を割り振った内勤だけ（10-26・lib/org.ts orgGrants）。super_admin は常に入れる
//   ・未経験事業部の内勤だけが入れる。それ以外は営業共有リストへ（ver2 でも変えない決まり）
//   ・退職（今のシステムの retired・組織表の「退職」）と組織表に載っていない人は 営業共有リストも含め何も見せない（10-30・lib/ike.ts ikeToken が全部の口を止める）
//   区分ごとの「見ない」は Shell がメニューから消し、開いた画面は NoAccess にする（段階は組織表が正・lib/members-store.ts）。
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const got = await loadMe();
  if (!got.ok) return <LoginGate error={gateError(got.reason, got.error)} />;
  const me = got.me;
  if (!canUseApp(me)) redirect('/shared');
  return (
    <PermsProvider me={me} kperms={effectivePerms(me)} pages={effectivePages(me)} manageAccess={canManageAccess(me)}>
      <Shell>{children}</Shell>
      <Watermark email={me.email} />
    </PermsProvider>
  );
}
