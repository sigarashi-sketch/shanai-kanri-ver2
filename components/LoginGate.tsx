import { APP_NAME } from '@/lib/app';
import { LogoutButton } from '@/components/Logout';

// ログインしていない・入れない人に出す画面（メニューも中身も出さない）。app/(app)/layout.tsx と /shared で使う
/** loadMe が通らなかった理由 → 画面に出す文（not_logged_in は空＝「ログインしてください」） */
export function gateError(reason: string, error?: string): string {
  if (reason === 'error') return error || '今の社内システムに入れるか聞けませんでした';
  if (reason === 'no_role') return '組織表でロールが割り振られていないので入れません。全体管理者に組織表への追加を頼んでください';
  if (reason === 'retired') return '退職の扱いになっているので見られる画面はありません';
  return '';
}

export function LoginGate({ error }: { error: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-soft px-4">
      <div className="mo-fade-up w-full max-w-[420px] rounded-xl border border-line bg-surface px-8 py-12 text-center">
        <div aria-hidden className="mx-auto flex size-10 items-center justify-center rounded-lg bg-sumi text-lg font-extrabold text-white">S</div>
        <h1 className="mt-4 text-xl font-bold">{APP_NAME}</h1>
        {error
          ? <p role="alert" className="mt-2 text-body text-bad">{error}</p>
          : <p className="mt-2 text-body text-muted">ログインしてください</p>}
        <a href="/api/ike-auth/start" className="btn mt-6 inline-flex bg-sumi text-white">会社のアカウントでログイン</a>
        {error && <div className="mt-3 flex items-center justify-center gap-4"><a href="" className="text-sm font-semibold underline">もう一度読む</a><LogoutButton className="text-sm font-semibold underline" label="ログアウト（別のアカウントで入る）" /></div>}
      </div>
    </main>
  );
}
