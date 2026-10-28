'use client';

import { useState } from 'react';
import { LiveBanner } from '@/components/Live';
import { PageTitle } from '@/components/ui';
import { PersonName } from '@/components/Person';
import { HoryuNote, Panel, Seg, fmtDate, useHoryu, HoryuLoading } from '@/components/Horyu';
import type { OrphansRes } from '@/lib/horyu';

// 営業リスト外グループ（今の orphans.html を写したもの・保留）。
//   ・リスト外グループ … LINE グループのうち、営業リストの誰の名前も入っていないもの（一斉送信の宛先に出ない）
//   ・未連携 … 営業リストにいるのに、名前の入った LINE グループが見つからない人（ぽあ・辞退・参画決定・稼働中・営業停止の人は下に）
//   見るだけ。グループ名を直すのは LINE 側、名前を直すのはプロパーリスト
const HIDE = ['ぽあ', '辞退', '参画決定', '稼働中', '営業停止']; // 今のシステムの値のまま（営業停止は画面では「提案禁止」と出す・10-28）

export default function OrphansPage() {
  const h = useHoryu<OrphansRes>('orphans');
  const d = h.d;
  const [tab, setTab] = useState<'groups' | 'unlinked'>('groups');
  const unl = [...(d?.unlinked || [])].sort((a, b) => Number(a.status.some((s) => HIDE.includes(s))) - Number(b.status.some((s) => HIDE.includes(s))));
  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="営業リスト外グループ" sub="送信リストに出ないグループと、グループが見つからない人">
        <Seg value={tab} onChange={setTab} options={[['groups', `リスト外グループ${d ? ` ${d.groups.length}` : ''}`], ['unlinked', `未連携の人${d ? ` ${d.unlinked.length}` : ''}`]] as const} />
      </PageTitle>
      <HoryuNote>見るだけです。人は未経験の人だけ（グループ名に未経験の人の名前が入っているものは「リスト外」に数えません）。</HoryuNote>
      <LiveBanner state={h.state} error={h.error} onReload={h.reload} note="見るだけです" />
      <HoryuLoading state={h.state} />
      {d?.error && <div className="text-sm text-bad">{d.error}</div>}
      {d && tab === 'groups' && <Panel title="リスト外グループ" sub={`全 ${d.groupTotal}グループのうち ${d.groups.length}`}>
        <ul className="flex flex-col text-sm">{[...d.groups].sort((a, b) => b.lastActivity - a.lastActivity).map((g, i) => <li key={g.name + i} className="flex flex-wrap items-center gap-2 border-t border-line-soft py-1.5 first:border-t-0"><b>{g.name || '（名前なし）'}</b>{g.eki && <span className="text-muted">{g.eki}</span>}{g.tags.map((t) => <span key={t} className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{t}</span>)}<span className="ml-auto text-faint">{g.lastActivity ? `最後の動き ${fmtDate(new Date(g.lastActivity).toISOString())}` : '動きなし'}</span></li>)}</ul>
        {!d.groups.length && <div className="py-3 text-center text-sm text-faint">ありません</div>}
      </Panel>}
      {d && tab === 'unlinked' && <Panel title="グループが見つからない人" sub={`${d.unlinked.length}名`}>
        <ul className="flex flex-col text-sm">{unl.map((r) => { const hide = r.status.some((s) => HIDE.includes(s)); return <li key={r.name} className={`flex flex-wrap items-center gap-2 border-t border-line-soft py-1.5 first:border-t-0 ${hide ? 'opacity-60' : ''}`}><PersonName name={r.name} />{r.status.map((s) => <span key={s} className="chip" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{s === '営業停止' ? '提案禁止' : s}</span>)}</li>; })}</ul>
        {!unl.length && <div className="py-3 text-center text-sm text-faint">いません</div>}
      </Panel>}
    </main>
  );
}
