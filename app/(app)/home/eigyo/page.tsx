'use client';
import { useEffect, useState } from 'react';
import { Tabs } from '@/components/ui';
import EigyoHome from '@/components/home/EigyoHome';
import JinjiFeed from '@/components/home/JinjiFeed';

// ホーム営業。営業の人は左の「ホーム」でここに来る（10-27 shoya「営業がホーム押せば営業ホームへ」・components/Shell.tsx homeHref）。
//   タブ：数字（担当営業ごとの成約・売上・粗利）／フィード（インスタのような要員の動き＝ホーム人事と同じ。営業は担当の人だけ・同日「インスタみたいなのもいれてね タブで分けられるように」）
type V = 'kpi' | 'feed';
export default function Page() {
  const [v, setV] = useState<V>('kpi');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'feed') setV('feed'); }, []);
  const pick = (x: V) => { setV(x); window.history.replaceState(null, '', x === 'feed' ? '?tab=feed' : window.location.pathname); };
  return (
    <div className="flex flex-col">
      <div className="px-6 pt-[14px]"><Tabs<V> tabs={[{ key: 'kpi', label: '成約・売上' }, { key: 'feed', label: 'フィード' }]} value={v} onChange={pick} /></div>
      <div key={v} className="mo-fade-in">{v === 'kpi' ? <EigyoHome /> : <JinjiFeed title="フィード" />}</div>
    </div>
  );
}
