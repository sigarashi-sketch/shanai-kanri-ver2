'use client';

import { useParams } from 'next/navigation';
import { StaffDetail } from '@/components/StaffDetail';

// 社員ページ。中身は components/StaffDetail.tsx（名前の小窓でも同じものを出す）
export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  return <StaffDetail id={id} />;
}
