'use client';
import JinjiFeed from '@/components/home/JinjiFeed';

// ホーム人事（要員の動きのフィード）。人事の人は左の「ホーム」でここに来る（10-27 shoya「人事は営業の要素なくていいから人事ホームのみで」・components/Shell.tsx homeHref）
export default function Page() {
  return <JinjiFeed />;
}
