import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { PermsProvider } from '@/components/Perms';
import { canManageAccess, canUseApp, effectivePerms } from '@/lib/access';
import { APP_NAME } from '@/lib/app';
import { loadMe } from '@/lib/members-store';

// 入口（10-26 見本データをなくした）。
//   ・ログインしていない（トークンが無い・切れた）ときは、メニューも画面も出さず「会社のアカウントでログイン」だけ
//   ・いまの人＝ログインした本人（lib/members-store.ts loadMe）。見本の人で画面を見せる道は無い
//   ・未経験事業部の内勤だけが入れる。それ以外は営業共有リストへ（ver2 でも変えない決まり）
//   分類ごとの「見ない」は Shell がメニューから消し、開いた画面は NoAccess にする。
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const got = await loadMe();
  if (!got.ok) return <LoginGate error={got.reason === 'error' ? got.error || '今の社内システムに入れるか聞けませんでした' : ''} />;
  const me = got.me;
  if (!canUseApp(me)) redirect('/shared');
  return (
    <PermsProvider me={me} perms={effectivePerms(me)} manageAccess={canManageAccess(me)}>
      <Shell>{children}</Shell>
    </PermsProvider>
  );
}

function LoginGate({ error }: { error: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-soft px-4">
      <div className="mo-fade-up w-full max-w-[420px] rounded-xl border border-line bg-surface px-8 py-12 text-center">
        <div aria-hidden className="mx-auto flex size-10 items-center justify-center rounded-lg bg-sumi text-lg font-extrabold text-white">S</div>
        <h1 className="mt-4 text-xl font-bold">{APP_NAME}</h1>
        {error
          ? <p role="alert" className="mt-2 text-body text-bad">{error}</p>
          : <p className="mt-2 text-body text-muted">ログインしてください</p>}
        <a href="/api/ike-auth/start" className="btn mt-6 inline-flex bg-sumi text-white">会社のアカウントでログイン</a>
        {error && <div className="mt-3"><a href="" className="text-sm font-semibold underline">もう一度読む</a></div>}
      </div>
    </main>
  );
}
