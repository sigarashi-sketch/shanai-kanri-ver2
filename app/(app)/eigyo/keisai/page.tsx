'use client';

import { useEffect, useState } from 'react';
import { PageTitle } from '@/components/ui';
import { PostTab } from './PostTab';
import { AppsTab } from './AppsTab';
import { StatsTab } from './StatsTab';

// 案件掲載・応募（営業）＝今の 案件を掲載する（/case-admin.html）・応募管理（/case-apps.html）・案件ページの反応（/case-stats.html）をタブで1つに。
//   ・掲載する：案件を書いて下書き保存／公開（公式LINEの「案件情報」に出る）／複製／締切。単価は載せない（単価に見える表記は公開前に確かめる）
//   ・応募管理：案件ページからの応募の一覧とステータス（未対応→確認中→面談調整中→成約／見送り）
//   ・案件ページの反応：見るだけ（期間ごとの流れ・ボタン別・案件別・週ごと）
//   本物（ログイン中）：読む＝今の /api/case-admin（list / applications / get）・/api/case-stats、書く＝/api/live/case-admin
const TABS = [
  { key: 'post', label: '掲載する' },
  { key: 'apps', label: '応募管理' },
  { key: 'stats', label: '案件ページの反応' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function KeisaiPage() {
  const [tab, setTab] = useState<TabKey>('post');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (TABS.some((x) => x.key === t)) setTab(t as TabKey);
  }, []);
  const go = (k: TabKey) => { setTab(k); window.history.replaceState(null, '', `?tab=${k}`); };
  return (
    <main className="flex flex-col gap-3.5 px-4 pb-12 pt-[22px] sm:px-6">
      <PageTitle title="案件掲載・応募" sub="公式LINEの「案件情報」に出す案件を書いて公開し、届いた応募と反応を見ます" />
      <div role="tablist" className="mo-fade-up flex gap-1 overflow-x-auto border-b border-line" style={{ ['--i' as string]: 1 }}>
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => go(t.key)} className="tab">{t.label}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis flex flex-col gap-3.5">
        {tab === 'post' && <PostTab />}
        {tab === 'apps' && <AppsTab />}
        {tab === 'stats' && <StatsTab />}
      </div>
    </main>
  );
}
