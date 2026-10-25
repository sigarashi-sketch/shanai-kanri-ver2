'use client';

import { useState } from 'react';
import { useIke } from './Live';
import { ChatLog } from './ChatLog';
import { ChatSummary } from './ChatSummary';
import { contactsOf, groupBubbles, groupsOf, threadBubbles, type ContactsRes, type GroupThreadRes, type GroupsRes, type ThreadRes } from '@/lib/live/person';

// 名前の小窓の「チャット」タブ（10-25 shoya）。個人（あおい）とグループのトークを見るだけ＋要約。送るのは要員ページから
//   読むのは今の GET（chat?action=contacts / groups / thread / groupThread）。紐付けの決め方は要員ページのチャットと同じ
export function PersonChat({ name, live }: { name: string; live: boolean }) {
  const [sub, setSub] = useState<'個人' | 'グループ'>('個人');
  const contacts = useIke<ContactsRes>(live && sub === '個人' ? 'chat?action=contacts' : null);
  const groups = useIke<GroupsRes>(live && sub === 'グループ' ? 'chat?action=groups' : null);
  const mine = live ? contactsOf(contacts.data, name) : [];
  const myGroups = live ? groupsOf(groups.data, name, []) : [];
  const [uid, setUid] = useState('');
  const [gid, setGid] = useState('');
  const userId = uid || mine[0]?.line_user_id || '';
  const groupId = gid || myGroups[0]?.groupId || '';
  const th = useIke<ThreadRes>(live && sub === '個人' && userId ? `chat?action=thread&userId=${encodeURIComponent(userId)}` : null);
  const gt = useIke<GroupThreadRes>(live && sub === 'グループ' && groupId ? `chat?action=groupThread&groupId=${encodeURIComponent(groupId)}` : null);
  const list = sub === '個人' ? contacts : groups;
  const target = sub === '個人' ? userId : groupId;
  const bubbles = sub === '個人' ? threadBubbles(th.data) : groupBubbles(gt.data);
  const loading = live && (list.state === 'loading' || (!!target && (sub === '個人' ? th.state : gt.state) === 'loading'));
  const err = live ? list.error || (sub === '個人' ? th.error : gt.error) : '';

  if (!live) return <div className="py-10 text-center text-faint">ログインすると、この人の LINE のトークが出ます</div>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {(['個人', 'グループ'] as const).map((s) => (
          <button key={s} onClick={() => setSub(s)} aria-pressed={sub === s} className="min-h-8 rounded-full border px-3 text-[12.5px] font-semibold"
            style={sub === s ? { background: 'var(--as)', color: 'var(--ad)', borderColor: 'var(--al)' } : { borderColor: 'var(--color-field)', color: 'var(--color-muted)' }}>
            {s === '個人' ? '個人（あおい）' : 'グループ'}
          </button>
        ))}
        {target && <span className="ml-auto"><ChatSummary kind={sub === '個人' ? 'user' : 'group'} id={target} name={sub === '個人' ? name : myGroups.find((g) => g.groupId === groupId)?.name || name} live /></span>}
      </div>
      {sub === '個人' && mine.length > 1 && (
        <select value={userId} onChange={(e) => setUid(e.target.value)} aria-label="LINE の相手" className="min-h-8 rounded-lg border border-field bg-surface px-2 text-[12.5px]">
          {mine.map((c) => <option key={c.line_user_id} value={c.line_user_id}>{c.display_name || 'LINE の相手'}</option>)}
        </select>
      )}
      {sub === 'グループ' && myGroups.length > 1 && (
        <select value={groupId} onChange={(e) => setGid(e.target.value)} aria-label="LINE グループ" className="min-h-8 rounded-lg border border-field bg-surface px-2 text-[12.5px]">
          {myGroups.map((g) => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
        </select>
      )}
      <ChatLog bubbles={loading ? [] : bubbles.slice(-200)} className="-mx-5 max-h-[calc(100vh-430px)] min-h-[240px]" resetKey={`${name}:${sub}:${target}`}>
        {loading && <p className="text-[13px] text-muted">読み込み中…</p>}
        {err && <p className="text-[13px] text-bad">{err}</p>}
        {!loading && !err && !target && <p className="text-[13px] text-muted">{sub === '個人' ? 'この人に紐付いた LINE の相手がいません（今のチャット画面で紐付けると出ます）' : 'グループ名にこの人の名前が入った LINE グループがありません'}</p>}
      </ChatLog>
      <p className="text-[11.5px] text-faint">見るだけです。送るのは要員ページのチャットから</p>
    </div>
  );
}
