'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, ExternalLink, Send } from 'lucide-react';
import { AttachButton, AttachPreview, useAttach } from '@/components/sy/Attach';
import { Bubble, type Msg } from '@/components/sy/ChatBubble';
import { fx } from '@/components/sy/compat';
import type { Member } from '@/components/sy/compat';
import { useLineUsers, type LineUser } from '@/components/sy/useLineUsers';

// 名簿の詳細（MemberDrawer）の「チャット」タブ。その人に紐付いている公式LINEの相手とのトークを見て、そのまま送れる
//   （2026-10-07 shoya「従業員名簿で名前クリックするとチャットそこから送れるように」）。紐付け・対応済みなどの細かい操作は チャット画面で
export default function MemberChat({ m }: { m: Member }) {
  const { users, configured } = useLineUsers();
  const [pick, setPick] = useState('');
  if (users === null) return <p className="p-6 text-center text-xs text-ig-muted">読み込み中…</p>;
  // 同じ人に2つ以上のLINEが紐付いていることがある（機種変など）。新しくやりとりした順
  const mine = users.filter((u) => u.subject_key === m.key).sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''));
  if (!mine.length) return (
    <div className="p-6 text-center text-sm text-ig-muted">
      <p>{m.name}さんは まだ公式LINEの友だちと紐付いていません</p>
      <p className="mt-1 text-xs">チャット画面で相手を選んで「紐付ける」と、ここから送れるようになります</p>
      <a href="/jinzai/chat" target="_blank" className="mt-3 inline-flex items-center gap-1 text-ig-primary underline">チャット画面を開く<ExternalLink size={13} /></a>
    </div>
  );
  const u = mine.find((x) => x.user_id === pick) || mine[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-ig-divider px-4 py-1.5 text-xs text-ig-muted">
        {mine.length > 1 ? (
          <select value={u.user_id} onChange={(e) => setPick(e.target.value)} className="rounded border border-ig-border bg-white px-1.5 py-1 text-ig-text">
            {mine.map((x) => <option key={x.user_id} value={x.user_id}>LINE: {x.display_name || '(名前なし)'}</option>)}
          </select>
        ) : <span className="truncate">LINE: {u.display_name}</span>}
        <a href={`/jinzai/chat?u=${encodeURIComponent(u.user_id)}`} target="_blank" className="ml-auto inline-flex shrink-0 items-center gap-1 text-ig-primary underline">チャット画面で開く<ExternalLink size={12} /></a>
      </div>
      {!configured && <p className="border-b border-ig-divider bg-ig-subtle px-4 py-1.5 text-xs text-ig-warn">公式LINEの鍵がまだ登録されていないため、送信はできません</p>}
      <Talk key={u.user_id} u={u} stop={!!m.bousan} />
    </div>
  );
}

function Talk({ u, stop }: { u: LineUser; stop?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const at = useAttach();

  const load = useCallback(() => fetch(`/api/sy/s/line/messages?user=${encodeURIComponent(u.user_id)}`).then((r) => r.json()).then((j) => j.messages && setMsgs(j.messages)).catch(() => {}), [u.user_id]);
  useEffect(() => { load(); const t = setInterval(() => document.visibilityState === 'visible' && load(), 5000); return () => clearInterval(t); }, [load]);
  useEffect(() => { bottom.current?.scrollIntoView(); }, [msgs?.length]);

  async function send() {
    const t = text.trim(); if ((!t && !at.has) || at.busy || busy) return;
    setBusy(true); setErr('');
    const r = await fetch('/api/sy/s/line/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: u.user_id, text: t, ...at.payload }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error || '送信に失敗しました'); fx.toast(j.error || '送信に失敗しました', 'err'); return; }
    setText(''); at.clear(); await load();
    fx.hit('line'); fx.toast('送信しました');
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {msgs === null && <div className="text-center text-xs text-ig-muted">読み込み中…</div>}
        {msgs?.length === 0 && <div className="text-center text-xs text-ig-muted">まだやりとりはありません</div>}
        {msgs?.map((m, i) => <Bubble key={m.id + ':' + i} m={m} />)}
        <div ref={bottom} />
      </div>
      {err && <p className="px-4 text-sm text-ig-danger">{err}</p>}
      <div className="border-t border-ig-divider bg-white p-3">
        {!u.followed ? <p className="text-center text-xs text-ig-muted">ブロックされているため送れません</p> : stop ? <p className="flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-ig-stop"><Ban size={14} strokeWidth={2.25} />ぼうさん（接触禁止）のため送れません。送るときは 情報欄のチェックを外してください</p> : (
          <><AttachPreview at={at} />
          <div className="flex items-end gap-2 rounded-[22px] border border-ig-border px-4 py-1.5">
            <AttachButton at={at} className="my-1.5" />
            <textarea id={`member-chat-draft-${u.user_id}`} value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="メッセージを入力…（⌘+Enterで送信）"
              onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); at.add(f); } }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) send(); }}
              className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none field-sizing-content" />
            {busy ? <span className="ig-typing flex gap-1 py-3"><span /><span /><span /></span>
              : text.trim() || at.has ? <button onClick={send} disabled={at.busy} className="ig-pop py-1.5 text-sm font-semibold text-ig-primary hover:text-ig-link">送信</button>
              : <Send size={22} strokeWidth={1.75} className="my-1.5 text-ig-muted" />}
          </div></>
        )}
      </div>
    </>
  );
}
