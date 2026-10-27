import { ViewerSwitch } from '@/components/Shell';
import { canUseApp } from '@/lib/access';
import { loadMembers } from '@/lib/members-store';
import { getViewer } from '@/lib/viewer';
import { SharedLive } from './SharedLive';
import Watermark from '@/components/Watermark';

// 営業共有リスト。内勤以外の人が見られるのはここだけ。
export default async function SharedListPage() {
  const me = await getViewer();
  const members = (await loadMembers()).map((m) => ({ id: m.id, name: m.name }));
  return (
    <div data-module="eigyo" className="min-h-screen">
      <header className="flex min-h-[58px] items-center gap-3 border-b border-line bg-surface px-6">
        <div aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-sumi text-md font-extrabold text-white">S</div>
        <b className="text-md">営業共有リスト</b>
        <span className="text-sm text-muted">{me.name}{canUseApp(me) ? '' : '・この画面だけ見られます'}</span>
        <div className="ml-auto"><ViewerSwitch members={members} current={me.id} /></div>
      </header>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6">
        {canUseApp(me) && <a href="/" className="text-body font-semibold" style={{ color: 'var(--ad)' }}>← 戻る</a>}
        <h1 className="mo-fade-up text-xl font-bold">いま提案できる要員</h1>
        <SharedLive />
      </main>
      <Watermark email={me.email} />
    </div>
  );
}
