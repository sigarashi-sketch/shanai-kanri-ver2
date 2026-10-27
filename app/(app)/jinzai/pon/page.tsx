'use client';
import { useEffect, useState } from 'react';
import { Tabs } from '@/components/ui';
import PonSettingsView from '@/components/sy/PonSettingsView';
// たまげたポン（それゆけ未経験 /pon・/pon/settings から移した・10-27）。
//   まわす＝今の社内システムのガラポン（bikkura.html）をそのまま（/ik）。マイル・確率・上限は今のシステムが決める
//   設定＝それゆけの「許可する人・操作ごとのマイル」（admin 以上・それゆけが決める）
type V = 'play' | 'settings';
export default function Page() {
  const [v, setV] = useState<V>('play');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'settings') setV('settings'); }, []);
  const pick = (x: V) => { setV(x); window.history.replaceState(null, '', x === 'settings' ? '?tab=settings' : window.location.pathname); };
  return (
    <div className="flex flex-col gap-2">
      <div className="px-6 pt-[14px]"><Tabs<V> tabs={[{ key: 'play', label: 'まわす' }, { key: 'settings', label: '設定' }]} value={v} onChange={pick} /></div>
      {v === 'play'
        ? <div className="px-6"><iframe src="/ik/bikkura.html" title="たまげたポン" className="block w-full rounded-xl border border-line" style={{ height: 'calc(100vh - 140px)' }} /></div>
        : <PonSettingsView />}
    </div>
  );
}
