'use client';

import { useState } from 'react';
import { PageTitle } from '@/components/ui';
import { LiveBanner, useIke } from '@/components/Live';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { PlLive } from './live';
import type { IkePlReps } from '@/lib/live/home-eigyo';

// 売上・粗利（営業）。営業別の売上・粗利・成約数・行動指標を月ごとに。棒は div、推移は小さな SVG。
//   粗利＝単価−額面−額面×19%（社保）−交通費。請求の無い退場は売上・粗利から引く（成約数には残す）
//   数字を確かめたら「この月を締める」→ 損益シミュレーションの「営業別」に載る想定
//   本物（ログイン中・10-25）：今の GET /api/nippo?action=pl-reps&ym=（スプレッドシート「営業別」タブと同じ計算・駅すぱあとは呼ばない）。
//     明細が返る担当は未経験の人だけで足し直す。「この月を締める」は今のシステムに無いので出さない。中身は ./live.tsx
export default function PlPage() {
  const [lym, setLym] = useState('');
  const ike = useIke<IkePlReps>(`nippo?action=pl-reps${lym ? `&ym=${lym}` : ''}`);
  const mk = useMikeiken();
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="売上・粗利" sub="営業別（担当営業＝成約者）。未経験の要員の成約だけを数えています" />
      <LiveBanner state={ike.live && ike.data?.ok !== true ? 'error' : ike.state} error={ike.error || (ike.live && ike.data?.ok !== true ? '今の社内システムが失敗を返しました' : '')} onReload={ike.reload} note="見るだけです（スプレッドシートの「営業別」タブと同じ計算）" />
      <MikeikenNote mk={mk} live={ike.live} />
      {ike.state === 'loading' && <div className="rounded-xl border border-line bg-surface px-6 py-8 text-center text-body text-muted">読み込み中…</div>}
      {ike.live && ike.data?.ok && <PlLive data={ike.data} mk={mk} ym={lym || ike.data.ym} onYm={setLym} />}
    </main>
  );
}
