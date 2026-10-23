'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Megaphone, Users } from 'lucide-react';
import { COMMUNITIES, EVENTS, MENDAN_THIS_WEEK, TARGETS, type Attendee, type CEvent } from '@/lib/community-sample';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing, useMotivation } from '@/components/Motivation';
import { LiveBanner, NotInLegacy, useIke } from '@/components/Live';
import { communitiesFromIke, type IkeTeams } from '@/lib/live/community';

// コミュニティ（人事管理）＝勉強会・イベントの予定と参加者、参加の呼びかけ。
//   ・呼びかけは「誰に」を選ぶだけ → LINE 配信の下書きに入る（送るのは配信の画面で、送れる人だけ）
//   ・出欠は選ぶだけ（参加／未定／不参加）
//   ・コミュニティは1人1つ（リーダー＋任意のサブリーダー）
const WD = '日月火水木金土';
const fmt = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
// 全体で開く会には「このコミュニティの全員」は出さない
const targetsOf = (e: CEvent) => TARGETS.filter((t) => e.host !== '全体' || t !== 'このコミュニティの全員');
const ST_TONE: Record<Attendee['state'], string> = { 参加: 'ok', 未定: 'caution', 不参加: 'mute' };

export default function CommunityPage() {
  const canEdit = usePerms().can('jinji', 'edit');
  const { hit, toast } = useMotivation();
  const [events, setEvents] = useState<CEvent[]>(EVENTS);
  const [called, setCalled] = useState<Record<string, string>>({ e3: '社員みんな' });
  const [target, setTarget] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const remain = events.filter((e) => !called[e.id]).length;
  // 本物：今の社内システムのコミュニティ（名前・リーダー・サブ・人数）だけ。勉強会・イベントと出欠は今のシステムに無いので見本のまま
  const ike = useIke<IkeTeams>('teams?action=list');
  const live = ike.live;
  const liveComms = useMemo(() => communitiesFromIke(ike.data), [ike.data]);
  const comms = live ? liveComms : COMMUNITIES;

  const call = (e: CEvent) => {
    const t = target[e.id] ?? targetsOf(e)[0];
    setCalled((c) => ({ ...c, [e.id]: t }));
    setFlash(e.id); setTimeout(() => setFlash(null), 1300); hit();
    toast({ text: `「${e.title}」の参加の呼びかけを作りました（${t}）`, sub: '→ LINE 配信の下書きに入りました（送るのは配信の画面から）', undo: () => setCalled((c) => { const n = { ...c }; delete n[e.id]; return n; }) });
  };
  const setState = (e: CEvent, a: Attendee, state: Attendee['state']) => {
    setEvents((es) => es.map((x) => (x.id === e.id ? { ...x, attendees: x.attendees.map((y) => (y.id === a.id ? { ...y, state } : y)) } : x)));
    setFlash(e.id); setTimeout(() => setFlash(null), 1300); hit();
    toast({ text: `${a.name} を「${state}」にしました`, sub: `→ ${e.title} の参加者と、社員ページの参加歴に反映しました`, undo: () => setEvents((es) => es.map((x) => (x.id === e.id ? { ...x, attendees: x.attendees.map((y) => (y.id === a.id ? { ...y, state: a.state } : y)) } : x))) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="コミュニティ" sub={`勉強会・イベントの予定と参加者。呼びかけは「誰に」を選ぶだけ${live ? '' : '・見本データ'}`} />
      <LiveBanner state={ike.state} error={ike.error} onReload={ike.reload} note="コミュニティの名前・リーダー・人数は今の社内システムから（見るだけ）。勉強会・イベントの予定と出欠は見本のままです" />
      {live && <NotInLegacy what="勉強会・イベントの予定・出欠・コミュニティ面談の件数" />}

      <div className="mo-fade-up flex flex-wrap items-stretch gap-3" style={{ ['--i' as string]: 1 }}>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <RemainRing remain={remain} total={events.length} />
          <div className="text-[13px]"><b>まだ呼びかけていない {remain}件</b>{!canEdit && <div className="text-[12px] text-bad">{needText('edit')}</div>}</div>
        </div>
        {comms.map((c) => (
          <div key={c.id} className="rounded-xl border border-line bg-surface px-4 py-3 text-[12.5px]">
            <div className="flex items-center gap-1.5 text-[13.5px] font-bold"><Users size={14} style={{ color: 'var(--ad)' }} />{c.name}<span className="font-normal text-muted">{c.members}人</span></div>
            <div className="mt-0.5 text-muted">リーダー {c.leader}{c.sub && `・サブ ${c.sub}`}</div>
          </div>
        ))}
        {!live && <div className="rounded-xl border border-line bg-surface px-4 py-3 text-[12.5px]"><div className="text-muted">今週のコミュニティ面談</div><div className="num text-[20px] font-bold">{MENDAN_THIS_WEEK}<span className="text-[12px] text-muted">件</span></div></div>}
      </div>

      {remain === 0 && <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-6 text-center"><Check className="mx-auto text-ok" size={22} /><div className="mt-1.5 text-[14px] font-bold">予定の呼びかけはぜんぶ済みました</div></div>}

      <div className="grid gap-3 lg:grid-cols-3">
        {events.map((e, i) => {
          const going = e.attendees.filter((a) => a.state === '参加').length;
          return (
            <article key={e.id} className={`mo-fade-up flex flex-col rounded-xl border border-line bg-surface ${flash === e.id ? 'mo-flash' : ''}`} style={{ ['--i' as string]: i + 2 }}>
              <div className="border-b border-line-soft px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="chip" style={{ background: 'var(--al)', color: 'var(--ad)' }}>{e.kind}</span><span className="num text-[12.5px] text-muted">{fmt(e.date)} {e.time}・{e.place}</span></div>
                <div className="mt-1 text-[14.5px] font-bold">{e.title}</div>
                <div className="text-[12px] text-faint">主催 {e.host}</div>
                <div className="mt-2 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"><div className="mo-bar h-full rounded-full" style={{ width: `${(going / e.cap) * 100}%`, background: 'var(--a)' }} /></div><span className="num whitespace-nowrap text-[12px]">参加 {going} / {e.cap}人</span></div>
              </div>
              <ul className="flex-1 px-4 py-2">
                {e.attendees.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-1 text-[12.5px]">
                    <Link href={`/jinji/staff/${a.id}`} className="flex-1 hover:underline">{a.name}</Link>
                    <select aria-label={`${a.name} の出欠`} value={a.state} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(ev) => setState(e, a, ev.target.value as Attendee['state'])} className="min-h-7 rounded-md border border-field px-1 text-[12px] disabled:opacity-60" style={{ background: `var(--tone-${ST_TONE[a.state]}-bg)`, color: `var(--tone-${ST_TONE[a.state]}-fg)` }}>
                      {(['参加', '未定', '不参加'] as const).map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line-soft px-4 py-2.5">
                {called[e.id] ? (
                  <span className="flex items-center gap-1.5 text-[12.5px] text-ok"><Check size={14} />呼びかけ済み（{called[e.id]}）</span>
                ) : (<>
                  <select aria-label="呼びかける相手" value={target[e.id] ?? targetsOf(e)[0]} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(ev) => setTarget((t) => ({ ...t, [e.id]: ev.target.value }))} className="min-h-8 min-w-[140px] flex-1 rounded-lg border border-field bg-surface px-1.5 text-[12.5px] disabled:opacity-50">{targetsOf(e).map((t) => <option key={t}>{t}</option>)}</select>
                  <button onClick={() => call(e)} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} className="btn-primary inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40"><Megaphone size={14} />参加を呼びかける</button>
                </>)}
              </div>
            </article>
          );
        })}
      </div>
      <p className="text-[11.5px] text-faint">呼びかけは LINE 配信の下書きに入るだけです。実際に送るのは配信の画面から、送る権限のある人が行います。</p>
    </main>
  );
}
