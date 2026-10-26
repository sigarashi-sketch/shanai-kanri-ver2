'use client';

import Link from 'next/link';
import { PageTitle } from '@/components/ui';
import { LiveBanner } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { KeihiCheckLive } from './live';

// 交通費チェック（経理管理）。月ごとに、交通費の申請（日ごと）× freee の打刻を人ごとに照らす。
//   ・1日ずつ色分け：打刻の無い日の申請／片側だけの打刻／在籍期間外の日／待機中の日／平日に打刻なし
//   ・土日祝に2日以上出勤している人はシフト勤務＝平日の打刻なしを漏れにしない
//   ・引っかかった人を選んで、理由を選んでまとめて差し戻す → 本人に知らせる（あおい）
//   申請の承認そのものは /keiri/keihi（ここは月末の見回り）
//   本物（ログイン中・10-25 shoya「いけドンにあったのは全部いれて」）：今の交通費チェックと同じく、MF経費のCSVを選んで
//     1人ずつ POST /api/live/keihi-check → 今の freee-kintai?action=keihi_check|keihi_month（読むだけ・何も保存しない）。中身は ./live.tsx
//   差し戻し・本人への知らせ（10-26 確認）：今の交通費チェック（/keihi-check.html）は何も送らない（MF経費で差し戻す文面を出すだけ）ので、ここも送らない。
//     LINE の経費申請（keihi_claims）の差し戻しと本人への LINE は /keiri/keihi の経理の確認（POST /api/keihi?action=decide）でつないである
//   見本データは出さない（10-26）：読み込み中は「読み込み中…」、読めなければ LiveBanner のエラー

export default function KeihiCheckPage() {
  const login = useLiveRoute<{ ok: boolean }>('/api/live/keihi-check');
  const mk = useMikeiken();

  if (login.live) return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="交通費チェック" sub="MF経費の明細と freee の出勤の打刻を、人ごと・1日ずつ照らします">
        <Link href="/keiri/keihi" className="btn-secondary">交通費・経費の承認へ</Link>
      </PageTitle>
      <LiveBanner state="live" note="照らすだけです（何も保存しません）。MF経費の分の差し戻しは MF経費で、ここに出る文面をコピーして使ってください（今の交通費チェックも送りません）。LINE の経費申請の分は「交通費・経費」の経理の確認で差し戻すと、本人の LINE に届きます" />
      <MikeikenNote mk={mk} live />
      <KeihiCheckLive mk={mk} />
      <p className="text-xs text-faint">出勤＝出勤か退勤の打刻がある日。在籍期間は名簿の入社日・退社日、待機中は退場日〜次の入場日の前。判定は今の社内システムの交通費チェックと同じです。</p>
    </main>
  );

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="交通費チェック" sub="MF経費の明細と freee の出勤の打刻を、人ごと・1日ずつ照らします">
        <Link href="/keiri/keihi" className="btn-secondary">交通費・経費の承認へ</Link>
      </PageTitle>
      <LiveBanner state={login.state} error={login.error} onReload={login.reload} />
      {login.state === 'loading' && <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-muted">読み込み中…</div>}
    </main>
  );
}
