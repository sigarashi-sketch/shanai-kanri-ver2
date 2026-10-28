'use client';

import { useMemo, useState } from 'react';
import { Link2, Search } from 'lucide-react';
import { useIke } from '../Live';
import { needText } from '../Perms';
import { ChatSummary } from '@/components/ChatSummary';
import { ChatLog, type ReplyTo } from '@/components/ChatLog';
import { ChatComposer } from '@/components/ChatComposer';
import { groupBubbles, threadBubbles, type GroupThreadRes, type ThreadRes } from '@/lib/live/person';
import { SEG_LABEL, contactRows, filterChat, groupRows, segCounts, type ChatRow, type ChatSeg, type LiveContactsRes, type LiveGroupsRes } from '@/lib/live/renraku';
import { Pills } from './parts';
import { useMikeiken } from '../Mikeiken';
import { ChatLink } from './ChatLink';

// チャット：営業中／稼働中／その他 × 1:1／グループ（今の chat.html と同じ2軸）。
//   ・振り分けは今の API の segment（api/_chat_segment.ts の答え）をそのまま使う。その他も消さずに残す（誰も消さない）
//   ・「要対応のみ」（相手ボール）と検索はタブをまたぐ（今と同じ）
//   ・紐付け（10-28）：1:1 の相手を営業リストの氏名に結びつける＝見出しの「紐付け」（components/renraku/ChatLink.tsx）・一覧の「未紐付けのみ」。今の chat.html と同じ口
//   ・送るのは長押し。送る口は /api/live/chat（今の POST /api/chat の send / groupSend だけ）。グループへ送れる人かは今の API が決める
//   ・画像・PDF の添付と 返信（引用）は今と同じ（components/ChatComposer.tsx・10-27）。届いた画像はその場に出す（ChatLog）
//   ・インフォメーション（10-26）：GET chat?action=infoContacts / infoThread を読むだけ。未経験の人だけ。振り分け（営業中/稼働中）は無い。
//     送る欄は出すが押せない（このアカウントの送る鍵は それゆけ未経験 にしか無い）
const QUICK = ['確認します', 'ありがとうございます！', '承知しました', '少々お待ちください'];

export function ChatTab({ live, canSend, contacts, info }: { live: boolean; canSend: boolean; contacts: ReturnType<typeof useIke<LiveContactsRes>>; info: boolean }) {
  const [axis, setAxis] = useState<'one' | 'group'>('one');
  const [seg, setSeg] = useState<ChatSeg>('sales');
  const [ballOnly, setBallOnly] = useState(false);
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<ChatRow | null>(null);
  const groups = useIke<LiveGroupsRes>(live && !info && axis === 'group' ? 'chat?action=groups' : null, { pollMs: 30000 });
  const mk = useMikeiken();

  const segAvailable = info ? false : live ? (axis === 'one' ? contacts.data?.segmentAvailable !== false : groups.data?.segmentAvailable !== false) : false;
  const rows: ChatRow[] = useMemo(() => {
    if (!live) return [];
    if (info) return axis === 'one' ? mk.keep(contactRows(contacts.data), 'name') : [];
    return axis === 'one' ? contactRows(contacts.data) : groupRows(groups.data);
  }, [info, live, axis, contacts.data, groups.data, mk]);
  const unlinked = !info && axis === 'one' && unlinkedOnly;
  const shown = filterChat(rows, { seg, segAvailable, ballOnly, q, unlinkedOnly: unlinked });
  const unlinkedN = info || axis !== 'one' ? 0 : rows.filter((r) => !r.linked && !r.blocked).length;
  const counts = segCounts(rows);
  const loading = !live || (axis === 'one' ? contacts.state === 'loading' || (info && mk.state === 'loading') : !info && groups.state === 'loading');
  const err = live ? (axis === 'one' ? contacts.data?.error || contacts.error || (info && mk.state === 'error' ? mk.error : '') : info ? '' : groups.data?.error || groups.error) : '';

  // 開いている相手は一覧の今の行で描く（紐付けたあと名前・紐付けの状態がすぐ変わるように）
  const cur = open ? rows.find((r) => r.kind === open.kind && r.id === open.id) ?? open : null;
  if (cur) return <Thread row={cur} live={live} canSend={canSend} info={info} onBack={() => setOpen(null)} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-line-soft px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Pills items={[['one', '1:1'], ['group', 'グループ']] as const} value={axis} onChange={(k) => { setAxis(k); setOpen(null); }} small />
          <span className="flex items-center gap-3">
            {!info && axis === 'one' && <label className="flex items-center gap-1.5 text-sm text-muted" title="営業リストの氏名に紐付いていない 1:1（ブロック中は除く）。紐付けないと稼働中メニューや1:1の配信の対象になりません"><input type="checkbox" checked={unlinkedOnly} onChange={(e) => setUnlinkedOnly(e.target.checked)} />未紐付けのみ{unlinkedN > 0 && <span className="num rounded-full px-1.5 text-xs font-bold" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>{unlinkedN}</span>}</label>}
            <label className="flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" checked={ballOnly} onChange={(e) => setBallOnly(e.target.checked)} />要対応のみ</label>
          </span>
        </div>
        {segAvailable && !ballOnly && !q && !unlinked && (
          <Pills items={(['sales', 'joined', 'other'] as const).map((k) => [k, SEG_LABEL[k], counts[k]] as const)} value={seg} onChange={setSeg} />
        )}
        <label className="flex min-h-9 items-center gap-2 rounded-[10px] border border-field px-3 text-faint">
          <Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="トークを検索" placeholder="名前・内容（タブをまたいで探します）" className="flex-1 bg-transparent text-body text-ink outline-none" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !rows.length && <p className="px-4 py-3 text-body text-muted">読み込み中…</p>}
        {err && <p className="px-4 py-3 text-body text-bad">{err}</p>}
        {info && axis === 'group' && <p className="px-4 py-3 text-sm text-muted">この公式アカウントにグループのトークはありません。</p>}
        {!loading && !err && !shown.length && !(info && axis === 'group') && (
          <p className="px-4 py-6 text-center text-sm text-muted">{ballOnly ? '要対応のトークはありません。全部返せています' : unlinked ? '未紐付けの 1:1 はありません' : q ? '見つかりませんでした' : 'このタブのトークはありません'}</p>
        )}
        {shown.slice(0, 200).map((x, i) => (
          <button key={x.kind + x.id} onClick={() => setOpen(x)} className="mo-fade-up flex w-full items-center gap-3 border-b border-line-soft px-4 py-2.5 text-left hover:bg-soft" style={{ ['--i' as string]: Math.min(i, 12) }}>
            <div aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full text-body font-bold" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{(x.name.replace(/\s/g, '') || '？').slice(0, 1)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-body font-semibold">
                <span className="truncate">{x.name}</span><span className="shrink-0 text-xs font-normal text-faint">{x.at}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted">
                {(ballOnly || q || unlinked) && segAvailable && <span className="chip shrink-0" style={{ background: 'var(--tone-mute-bg)', color: 'var(--tone-mute-fg)' }}>{SEG_LABEL[x.seg]}</span>}
                {x.reason && <span className="chip shrink-0" style={{ background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>{x.reason}</span>}
                <span className="truncate">{x.last}</span>
              </div>
            </div>
            {x.ball ? <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'var(--tone-bad-bg)', color: 'var(--tone-bad-fg)' }}>要対応</span>
              : x.unread > 0 && <span className="num shrink-0 rounded-full bg-sunken px-1.5 text-xs font-bold text-muted">{x.unread}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Thread({ row, live, canSend, info, onBack }: { row: ChatRow; live: boolean; canSend: boolean; info: boolean; onBack: () => void }) {
  const one = row.kind === 'one';
  const th = useIke<ThreadRes>(live && one ? `chat?action=${info ? 'infoThread' : 'thread'}&userId=${encodeURIComponent(row.id)}` : null, { pollMs: 15000 });
  const gt = useIke<GroupThreadRes>(live && !one && !info ? `chat?action=groupThread&groupId=${encodeURIComponent(row.id)}` : null, { pollMs: 15000 });
  const bubbles = live ? (one ? threadBubbles(th.data) : groupBubbles(gt.data)) : [];
  const st = one ? th : gt;
  const [reply, setReply] = useState<ReplyTo | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  // インフォメーションは今の社内システムから送れない（読むだけ）
  const infoLive = info && live;
  const canTalk = live && canSend && !row.blocked && !info;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-1.5">
        <button onClick={onBack} className="min-w-0 flex-1 truncate py-0.5 text-left text-sm text-muted">← トーク一覧 ／ <b className="text-ink">{row.name}</b>{row.kind === 'group' && <span className="ml-1 text-faint">（グループ）</span>}</button>
        {one && !info && live && (
          <button type="button" onClick={() => setLinkOpen((v) => !v)} aria-expanded={linkOpen} title={row.linked ? `紐付け：${row.linkedName || ''}（押すと直す・外す）` : '営業リストの氏名に紐付ける'}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-[10px] border px-2.5 text-sm font-semibold"
            style={row.linked ? { borderColor: 'var(--color-field)', color: 'var(--ad)' } : { borderColor: 'var(--tone-caution-fg)', background: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' }}>
            <Link2 size={13} />{row.linked ? '紐付け' : '未紐付け'}
          </button>
        )}
        {!info && <ChatSummary kind={one ? 'user' : 'group'} id={row.id} name={row.name} live={live} />}
      </div>
      {linkOpen && one && !info && live && <ChatLink userId={row.id} linked={!!row.linked} linkedName={row.linkedName || ''} canEdit={canSend} onClose={() => setLinkOpen(false)} />}
      <ChatLog bubbles={bubbles.slice(-200)} className="min-h-0 flex-1" resetKey={row.id} onReply={canTalk ? setReply : undefined}>
        {live && st.state === 'loading' && !bubbles.length && <p className="text-body text-muted">読み込み中…</p>}
        {live && st.error && <p className="text-body text-bad">{st.error}</p>}
      </ChatLog>
      <ChatComposer kind={one ? 'person' : 'group'} target={row.id} live={live} canTalk={canTalk} quick={infoLive ? undefined : QUICK}
        reply={reply} onClearReply={() => setReply(null)} onSent={() => st.reload()}
        sentToast={{ text: `${row.name} に送りました`, sub: '→ 今の社内システムのチャットにも同じトークが残りました' }}
        placeholder={infoLive ? 'インフォメーションからの返信は それゆけ未経験 の画面から（ここは読むだけ）' : !canSend ? needText('edit') : row.blocked ? 'ブロックされているので送れません' : one ? 'あおいから本人へ送る文' : 'グループへ送る文（送ってよい人かは今のシステムが決めます）'}
        disabledTitle={infoLive ? 'このアカウントの送る鍵は それゆけ未経験 にしか無いので、ここからは送れません' : !canSend ? needText('edit') : undefined} />
    </div>
  );
}
