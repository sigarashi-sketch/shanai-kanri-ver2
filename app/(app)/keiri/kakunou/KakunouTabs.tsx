'use client';

import { useState } from 'react';
import { Tabs } from '@/components/ui';
import { MitsumoriStore } from './MitsumoriStore';

type Tab = 'seikyu' | 'mitsumori';

// 格納の画面の上のタブ。今の画面（iframe）は見積書タブの間も消さずに隠すだけ（戻ったときに読み直させない）
export function KakunouTabs({ initial, frame }: { initial: Tab; frame: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>(initial);
  const change = (k: Tab) => {
    setTab(k);
    try { const u = new URL(location.href); if (k === 'mitsumori') u.searchParams.set('tab', k); else u.searchParams.delete('tab'); history.replaceState(history.state, '', u); } catch { /* 何もしない */ }
  };
  return (
    <div className="flex flex-col">
      <div className="px-3 pt-2 md:px-6">
        <Tabs<Tab> value={tab} onChange={change} tabs={[{ key: 'seikyu', label: '請求書・勤務表' }, { key: 'mitsumori', label: '見積書' }]} />
      </div>
      <div hidden={tab !== 'seikyu'}>{frame}</div>
      {tab === 'mitsumori' && <MitsumoriStore />}
    </div>
  );
}
