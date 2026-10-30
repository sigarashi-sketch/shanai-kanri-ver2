'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { reportClientError } from '@/components/ErrorWatch';

// 画面の中身が落ちたとき（10-30 shoya「不具合多すぎ・モニタリングして直して」）。真っ白にせず「もう一度」を出し、落ちたことを残す（components/ErrorWatch.tsx）
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError('render', error.message || '画面が開けませんでした', `${error.digest || ''} ${error.stack?.split('\n').slice(0, 5).join(' / ') || ''}`); }, [error]);
  return (
    <main className="px-4 pb-12 pt-[22px] sm:px-6">
      <div className="mo-fade-up rounded-xl border px-6 py-10 text-center" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)', borderColor: 'var(--tone-bad-bar)' }}>
        <TriangleAlert className="mx-auto" size={26} />
        <h1 className="mt-3 text-lg font-bold">この画面を開けませんでした</h1>
        <p className="mt-2 text-body">不具合として記録しました。もう一度ためすか、ほかの画面から開き直してください。</p>
        <button onClick={reset} className="btn-primary mt-5">もう一度</button>
      </div>
    </main>
  );
}
