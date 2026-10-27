'use client';

import { useMemo, useState } from 'react';
import { Check, Megaphone, Plus, Trash2, Users } from 'lucide-react';
import { TARGETS, type Attendee, type CEvent } from '@/lib/types/jinji';
import { PageTitle } from '@/components/ui';
import { needText, usePerms } from '@/components/Perms';
import { RemainRing } from '@/components/Motivation';
import { LiveBanner, useIke } from '@/components/Live';
import { useLiveRoute } from '@/lib/live/use-live-route';
import { JINJI_URL, jinjiRead, type JCommunity } from '@/lib/live/jinji';
import { normName, type LiveStaffList } from '@/lib/live/staff';
import { useLiveWrite, WriteError } from '@/components/jinji/useLiveWrite';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { MikeikenNote, useMikeiken } from '@/components/Mikeiken';
import { communitiesFromIke, type IkeTeams } from '@/lib/live/community';
import { PersonName } from '@/components/Person';
import { TeamsEditor } from '@/components/jinji/TeamsEditor';

// コミュニティ（人事管理）＝勉強会・イベントの予定と参加者、参加の呼びかけ。
//   ・呼びかけは「誰に」を選ぶだけ → LINE 配信の下書きに入る（送るのは配信の画面で、送れる人だけ）
//   ・出欠は選ぶだけ（参加／未定／不参加）
//   ・コミュニティは1人1つ（リーダー＋任意のサブリーダー）
//   ★本物（10-26）：勉強会・イベントの予定と出欠は今のシステムの v2_community_event / v2_community_rsvp（/api/live/jinji）。
//     呼びかけは「呼びかけた」と残すだけ（LINE には送らない・送るのは配信の画面から）。今週のコミュニティ面談は担当のカレンダーから数える
const WD = '日月火水木金土';
const fmt = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
// 全体で開く会には「このコミュニティの全員」は出さない
const targetsOf = (e: CEvent) => TARGETS.filter((t) => e.host !== '全体' || t !== 'このコミュニティの全員');
const ST_TONE: Record<Attendee['state'], string> = { 参加: 'ok', 未定: 'caution', 不参加: 'mute' };

export default function CommunityPage() {
  const canEdit = usePerms().can('jinji', 'edit');
  const [target, setTarget] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const cm = useLiveRoute<JCommunity>(jinjiRead('community'));
  const staff = useLiveRoute<LiveStaffList>(cm.live ? '/api/live/staff' : null);
  const { send, error: wErr, setError: setWErr } = useLiveWrite(cm.live, cm.reload);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [adding, setAdding] = useState(false);
  // 今の社内システムのコミュニティ（名前・リーダー・サブ・人数）。勉強会・イベントと出欠は v2_community_event / v2_community_rsvp（cm）
  const ike = useIke<IkeTeams>('teams?action=list');
  const live = ike.live;
  // 本物は未経験の人だけ（今のプロパーリストに入っている人）：人数はメンバーのうち未経験の人・リーダーも未経験でなければ出さない
  const mk = useMikeiken();
  const liveTeams = useMemo(() => (ike.data?.teams || []).map((t) => ({ ...t, members: mk.keep(t.members || [], (m) => m.name || m.norm_name) })).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [ike.data, mk]);
  const liveComms = useMemo(() => communitiesFromIke(ike.data ? {
    ...ike.data,
    teams: (ike.data.teams || []).map((t) => ({
      ...t, members: mk.keep(t.members || [], (m) => m.name || m.norm_name),
      leader_name: t.leader_name && mk.has(t.leader_name) ? t.leader_name : null,
      subleader_name: t.subleader_name && mk.has(t.subleader_name) ? t.subleader_name : null,
    })),
  } : null), [ike.data, mk]);
  const comms = live ? liveComms : [];
  // 本物の予定と出欠（未経験の人だけ）
  const liveEvents: CEvent[] = useMemo(() => (cm.data?.events || []).map((e) => ({
    id: e.id, date: e.date, time: e.time, title: e.title, kind: e.kind, host: e.host, place: e.place, cap: e.cap,
    attendees: mk.keep((cm.data?.rsvps || []).filter((r) => r.event_id === e.id), 'name').map((r) => ({ id: r.normalized_name, name: r.name, state: r.state })),
  })), [cm.data, mk]);
  const liveCalled = useMemo(() => Object.fromEntries((cm.data?.events || []).filter((e) => e.called_target).map((e) => [e.id, e.called_target])), [cm.data]);
  const L = live && cm.live;
  const shownEvents = L ? liveEvents : [];
  const calledNow: Record<string, string> = L ? liveCalled : {};
  const remain = shownEvents.filter((e) => !calledNow[e.id]).length;
  const people = useMemo(() => mk.keep((staff.data?.rows || []).filter((x) => x.statusKey !== 'taisha'), 'name').map((x) => x.name).sort((a, b) => a.localeCompare(b, 'ja')), [staff.data, mk]);
  const call = (e: CEvent) => {
    const t = target[e.id] ?? targetsOf(e)[0];
    send({ url: JINJI_URL, body: { action: 'community-call', id: e.id, target: t }, text: `「${e.title}」の参加の呼びかけを済みにしました（${t}）`, sub: '→ 呼びかけたと残しました（LINE は配信の画面から送ってください）', undo: () => ({ url: JINJI_URL, body: { action: 'community-call', id: e.id, target: '' } }) })
      .then((x) => { if (x) { setFlash(e.id); setTimeout(() => setFlash(null), 1300); } });
  };
  const setState = (e: CEvent, a: Attendee, state: Attendee['state']) => {
    send({ url: JINJI_URL, body: { action: 'community-rsvp', event_id: e.id, name: a.name, normalized_name: normName(a.name), state }, text: `${a.name} を「${state}」にしました`, sub: `→ ${e.title} の参加者に反映しました`, undo: () => ({ url: JINJI_URL, body: { action: 'community-rsvp', event_id: e.id, name: a.name, normalized_name: normName(a.name), state: a.state } }) });
  };

  return (
    <main className="flex flex-col gap-3.5 px-6 pb-12 pt-[22px]">
      <PageTitle title="コミュニティ" sub={`勉強会・イベントの予定と参加者。呼びかけは「誰に」を選ぶだけ`} />
      <LiveBanner state={ike.state} error={ike.error} onReload={ike.reload} note="コミュニティの名前・リーダー・人数は今の社内システムから。「班分けを直す」で班の人・リーダー・班名を直せます（すぐ保存）。勉強会・イベントの予定・出欠もすぐ保存されます" />
      <MikeikenNote mk={mk} live={ike.live} />
      {live && cm.state === 'error' && <LiveBanner state="error" error={`勉強会・イベントを読めませんでした（${cm.error}）`} onReload={cm.reload} />}
      <WriteError error={wErr} onClose={() => setWErr('')} />

      <div className="mo-fade-up flex flex-wrap items-stretch gap-3" style={{ ['--i' as string]: 1 }}>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <RemainRing remain={remain} total={shownEvents.length} />
          <div className="text-body"><b>まだ呼びかけていない {remain}件</b>{!canEdit && <div className="text-sm text-bad">{needText('edit')}</div>}</div>
        </div>
        {comms.map((c) => (
          <div key={c.id} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            <div className="flex items-center gap-1.5 text-body font-bold"><Users size={14} style={{ color: 'var(--ad)' }} />{c.name}<span className="font-normal text-muted">{c.members}人</span></div>
            <div className="mt-0.5 text-muted">リーダー {c.leader}{c.sub && `・サブ ${c.sub}`}</div>
          </div>
        ))}
        {L && cm.data?.mendanWeek != null && <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"><div className="text-muted">今週のコミュニティ面談</div><div className="num text-xl font-bold">{cm.data!.mendanWeek}<span className="text-sm text-muted">件</span></div></div>}
        {L && canEdit && <button onClick={() => setAdding((v) => !v)} className="btn-secondary inline-flex items-center gap-1.5 self-center"><Plus size={14} />予定を足す</button>}
      </div>

      {/* 班分けを直す（今のコミュニティの画面と同じ口・本物のときだけ・10-25） */}
      {live && mk.state === 'ready' && <TeamsEditor teams={liveTeams} onDone={ike.reload} />}

      {L && adding && <EventForm hosts={['全体', ...comms.map((c) => c.name)]} onCancel={() => setAdding(false)} onSave={(ev) => send({ url: JINJI_URL, body: { action: 'community-event-save', ...ev }, text: `「${ev.title}」を足しました`, sub: '→ 予定に載りました', undo: (r) => (r.id ? { url: JINJI_URL, body: { action: 'community-event-delete', id: r.id } } : null) }).then((x) => { if (x) setAdding(false); })} />}
      {!L && (ike.state === 'loading' || cm.state === 'loading') && <div className="rounded-xl border border-line bg-surface px-6 py-8 text-center text-body text-muted">読み込み中…</div>}
      {L && shownEvents.length === 0 && <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-8 text-center text-body text-muted">これからの勉強会・イベントはまだありません。「予定を足す」から入れてください。</div>}

      {shownEvents.length > 0 && remain === 0 && <div className="mo-scale-in rounded-xl border border-line bg-surface px-6 py-6 text-center"><Check className="mx-auto text-ok" size={22} /><div className="mt-1.5 text-body font-bold">予定の呼びかけはぜんぶ済みました</div></div>}

      <div className="grid gap-3 lg:grid-cols-3">
        {shownEvents.map((e, i) => {
          const going = e.attendees.filter((a) => a.state === '参加').length;
          return (
            <article key={e.id} className={`mo-fade-up flex flex-col rounded-xl border border-line bg-surface ${flash === e.id ? 'mo-flash' : ''}`} style={{ ['--i' as string]: i + 2 }}>
              <div className="border-b border-line-soft px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="chip" style={{ background: 'var(--al)', color: 'var(--ad)' }}>{e.kind}</span><span className="num text-sm text-muted">{fmt(e.date)} {e.time}・{e.place}</span></div>
                <div className="mt-1 text-md font-bold">{e.title}</div>
                <div className="flex items-center text-sm text-faint">主催 {e.host}{L && canEdit && <button aria-label={`${e.title} を消す`} title="この予定を消す" onClick={() => setConfirm({ title: 'この予定を消しますか', lines: [`${fmt(e.date)} ${e.time}「${e.title}」`, `出欠 ${e.attendees.length}人ぶんも見えなくなります（取り消しで戻せます）`], okLabel: '消す', danger: true, run: () => send({ url: JINJI_URL, body: { action: 'community-event-delete', id: e.id }, text: `「${e.title}」を消しました`, undo: () => ({ url: JINJI_URL, body: { action: 'community-event-delete', id: e.id, restore: true } }) }) })} className="ml-auto text-faint hover:text-bad"><Trash2 size={13} /></button>}</div>
                <div className="mt-2 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"><div className="mo-bar h-full rounded-full" style={{ width: `${(going / e.cap) * 100}%`, background: 'var(--a)' }} /></div><span className="num whitespace-nowrap text-sm">参加 {going} / {e.cap}人</span></div>
              </div>
              <ul className="flex-1 px-4 py-2">
                {e.attendees.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-1 text-sm">
                    <span className="flex-1"><PersonName name={a.name} className="underline-offset-2 hover:underline" /></span>
                    <select aria-label={`${a.name} の出欠`} value={a.state} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(ev) => setState(e, a, ev.target.value as Attendee['state'])} className="min-h-7 rounded-md border border-field px-1 text-sm disabled:opacity-60" style={{ background: `var(--tone-${ST_TONE[a.state]}-bg)`, color: `var(--tone-${ST_TONE[a.state]}-fg)` }}>
                      {(['参加', '未定', '不参加'] as const).map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </li>
                ))}
                {L && canEdit && (
                  <li className="pt-1">
                    <select aria-label={`${e.title} に人を足す`} value="" onChange={(ev) => { const nm = ev.target.value; if (nm) setState(e, { id: normName(nm), name: nm, state: '' as Attendee['state'] }, '参加'); }} className="min-h-7 w-full rounded-md border border-dashed border-field bg-surface px-1 text-sm text-muted">
                      <option value="">＋ 参加する人を足す</option>
                      {people.filter((nm) => !e.attendees.some((a) => normName(a.name) === normName(nm))).map((nm) => <option key={nm}>{nm}</option>)}
                    </select>
                  </li>
                )}
              </ul>
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line-soft px-4 py-2.5">
                {calledNow[e.id] ? (
                  <span className="flex items-center gap-1.5 text-sm text-ok"><Check size={14} />呼びかけ済み（{calledNow[e.id]}）</span>
                ) : (<>
                  <select aria-label="呼びかける相手" value={target[e.id] ?? targetsOf(e)[0]} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} onChange={(ev) => setTarget((t) => ({ ...t, [e.id]: ev.target.value }))} className="min-h-8 min-w-[140px] flex-1 rounded-lg border border-field bg-surface px-1.5 text-sm disabled:opacity-50">{targetsOf(e).map((t) => <option key={t}>{t}</option>)}</select>
                  <button onClick={() => call(e)} disabled={!canEdit} title={canEdit ? undefined : needText('edit')} className="btn-primary btn-sm"><Megaphone size={14} />参加を呼びかける</button>
                </>)}
              </div>
            </article>
          );
        })}
      </div>
      <p className="text-xs text-faint">「参加を呼びかける」は呼びかけたと残すだけです（LINE は送りません）。実際に送るのは配信の画面から、送る権限のある人が行います。</p>
      {confirm && <ConfirmWrite spec={confirm} onClose={() => setConfirm(null)} />}
    </main>
  );
}

// 予定を足す（本物・10-26）。名前・場所は内勤が書く。種類・主催は選ぶだけ
function EventForm({ hosts, onSave, onCancel }: { hosts: string[]; onSave: (e: { date: string; time: string; title: string; kind: '勉強会' | 'イベント'; host: string; place: string; cap: number }) => void; onCancel: () => void }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'勉強会' | 'イベント'>('勉強会');
  const [host, setHost] = useState(hosts[0]);
  const [place, setPlace] = useState('オンライン');
  const [cap, setCap] = useState(20);
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(date) && !!title.trim();
  const f = 'min-h-9 rounded-lg border border-field bg-surface px-2 text-sm';
  return (
    <div className="mo-fade-up flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface px-4 py-3">
      <label className="flex flex-col gap-1 text-xs text-muted">日付<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={f} /></label>
      <label className="flex flex-col gap-1 text-xs text-muted">時刻<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={f} /></label>
      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-muted">名前<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="例：Linux コマンド 30分ドリル" className={f} /></label>
      <label className="flex flex-col gap-1 text-xs text-muted">種類<select value={kind} onChange={(e) => setKind(e.target.value as '勉強会' | 'イベント')} className={f}><option>勉強会</option><option>イベント</option></select></label>
      <label className="flex flex-col gap-1 text-xs text-muted">主催<select value={host} onChange={(e) => setHost(e.target.value)} className={f}>{hosts.map((h) => <option key={h}>{h}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs text-muted">場所<input value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} className={f} /></label>
      <label className="flex flex-col gap-1 text-xs text-muted">定員<input type="number" min={1} max={500} value={cap} onChange={(e) => setCap(Number(e.target.value) || 1)} className={`${f} w-20`} /></label>
      <button onClick={() => ok && onSave({ date, time, title: title.trim(), kind, host, place: place.trim(), cap })} disabled={!ok} title={ok ? undefined : '日付と名前を入れてください'} className="btn-primary btn-sm">足す</button>
      <button onClick={onCancel} className="text-sm text-muted">やめる</button>
    </div>
  );
}
