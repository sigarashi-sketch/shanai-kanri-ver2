import { ViewerSwitch } from '@/components/Shell';
import { canUseApp } from '@/lib/access';
import { loadMembers } from '@/lib/members-store';
import { loadMe } from '@/lib/members-store';
import { LoginGate, gateError } from '@/components/LoginGate';
import { SharedLive } from './SharedLive';
import Watermark from '@/components/Watermark';
import { LogoutButton } from '@/components/Logout';

// 営業共有リスト。組織表で割り当てのある内勤のうち、未経験事業部でない人が見られるのはここだけ。
//   退職・組織表に載っていない・ログインしていない人には何も出さない（10-30 shoya「割り当てがある内勤以外はもうなんにも表示させない」・読む口も lib/ike.ts ikeToken で止まる）
export default async function SharedListPage() {
  const got = await loadMe();
  if (!got.ok) return <LoginGate error={gateError(got.reason, got.error)} />;
  const me = got.me;
  const members = (await loadMembers()).map((m) => ({ id: m.id, name: m.name }));
  return (
    <div data-module="eigyo" className="min-h-screen">
      <header className="flex min-h-[58px] flex-wrap items-center gap-3 border-b border-line bg-surface px-3 sm:px-6">
        <div aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-sumi text-md font-extrabold text-white">S</div>
        <b className="text-md">営業共有リスト</b>
        <span className="text-sm text-muted">{me.name}{canUseApp(me) ? '' : '・この画面だけ見られます'}</span>
        <div className="ml-auto flex items-center gap-2"><ViewerSwitch members={members} current={me.id} /><LogoutButton className="rounded-md px-2 py-1 text-sm text-muted hover:bg-soft hover:text-ink" /></div>
      </header>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 py-6 sm:px-6">
        {canUseApp(me) && <a href="/" className="text-body font-semibold" style={{ color: 'var(--ad)' }}>← 戻る</a>}
        <h1 className="mo-fade-up text-xl font-bold">いま提案できる要員</h1>
        <SharedLive />
      </main>
      <Watermark email={me.email} />
    </div>
  );
}
