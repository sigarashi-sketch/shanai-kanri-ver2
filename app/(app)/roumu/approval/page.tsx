'use client';

import { PageTitle } from '@/components/ui';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { ApprovalLive } from './live';

// 申請の承認（労務/営業管理）＝今の社内システムにある承認待ちを1か所に集めて、片づける画面へ案内する（中身は ./live.tsx）。
//   ・ホームの「上から順に片づける」の行き先
//   ・打刻修正・残業・有給・欠勤・遅刻早退の申請は freee の中で承認する（freee の申請 API は今の連携の権限の外で 403）。
//     ここでは架空の申請は出さず、「freee の中で承認してください」の案内と freee を開くリンクだけ出す（10-26 見本をなくす）
export default function ApprovalPage() {
  // ログインしているかを交通費の承認待ち（ありえない月で軽く）で見る
  const probe = useIke<{ ok?: boolean }>(`keihi?action=adminList&status=${encodeURIComponent('申請中')}&ym=1900-01`);
  const mk = useMikeiken();
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="申請の承認" sub="今の社内システムにある承認待ちを集めています。片づけはそれぞれの画面で" />
      <LiveBanner state={probe.state === 'error' && /ログイン/.test(probe.error) ? 'error' : probe.state === 'loading' || probe.state === 'sample' ? probe.state : 'live'} error={probe.error} onReload={probe.reload} note="見るだけの一覧です。交通費・経費と稟議は「交通費・経費」の画面から本物に承認できます" />
      <MikeikenNote mk={mk} live />
      {probe.state === 'loading'
        ? <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-muted">読み込み中…</div>
        : probe.state !== 'sample' && <ApprovalLive mk={mk} />}
    </main>
  );
}
