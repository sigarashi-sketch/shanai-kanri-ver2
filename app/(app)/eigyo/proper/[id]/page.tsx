'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ProperDetail } from '@/components/ProperDetail';

// 要員ページ。中身は components/ProperDetail.tsx（名前の小窓でも同じものを出す）
export default function ProperPersonPage() {
  return <Suspense fallback={<div className="px-6 py-10 text-[13px] text-muted">読み込み中…</div>}><Inner /></Suspense>;
}
function Inner() {
  const { id } = useParams<{ id: string }>();
  return <ProperDetail id={decodeURIComponent(id)} liver={useSearchParams().get('list') === 'liver'} />;
}
