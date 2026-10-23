'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Search, Send, X } from 'lucide-react';
import type { ModuleKey } from '@/lib/theme';
import { useMotivation } from './Motivation';
import { needText, usePerms } from './Perms';
import { DrawerPortal } from './DrawerPortal';

// 連絡パネル（チャット・配信・手動配信をひとつに・2026-10-23 shoya）。
//   ・各画面の右上から開く。人事の画面は LINE公式「インフォメーション」、それ以外は「あおい」
//   ・機能は落とさない：チャット（要対応つき）／配信（宛先・予約・既読）／手動配信（人を選んで一斉）
//   ・送ると取り消せないので、送信は「長押しで送る」（モーション図鑑 Hold To Confirm 0.9秒）
//   ・一斉送信は件数が分かるので Progress Fill で進み具合を見せる
export type Account = 'インフォメーション' | 'あおい';
export const accountFor = (m: ModuleKey | 'home'): Account => (m === 'jinji' ? 'インフォメーション' : 'あおい');

type Msg = { from: 'me' | 'them'; text: string; at: string };
type Thread = { id: string; name: string; last: string; at: string; ball: boolean; msgs: Msg[] };
const THREADS: Record<Account, Thread[]> = {
  インフォメーション: [
    { id: 'i1', name: '応募者 佐々木', last: '面談の日程、来週水曜で大丈夫です', at: '9:41', ball: true, msgs: [{ from: 'me', text: '一次面談の候補日を送ります。10/28（水）19:00 はいかがですか？', at: '昨日' }, { from: 'them', text: '面談の日程、来週水曜で大丈夫です', at: '9:41' }] },
    { id: 'i2', name: '入社予定 加藤', last: '基本情報フォーム送りました', at: '8:12', ball: true, msgs: [{ from: 'them', text: '基本情報フォーム送りました', at: '8:12' }] },
    { id: 'i3', name: '応募者 松本', last: 'ありがとうございます！', at: '昨日', ball: false, msgs: [{ from: 'them', text: 'ありがとうございます！', at: '昨日' }] },
  ],
  あおい: [
    { id: 'a1', name: '伊藤 誠', last: '今日の退勤押し忘れました', at: '10:05', ball: true, msgs: [{ from: 'them', text: '今日の退勤押し忘れました', at: '10:05' }] },
    { id: 'a2', name: '山田 太郎', last: '交通費の申請しました', at: '9:30', ball: false, msgs: [{ from: 'them', text: '交通費の申請しました', at: '9:30' }, { from: 'me', text: '確認します。ありがとうございます！', at: '9:32' }] },
    { id: 'a3', name: 'C社 常駐グループ', last: '明日の入館は8:45集合です', at: '昨日', ball: false, msgs: [{ from: 'them', text: '明日の入館は8:45集合です', at: '昨日' }] },
  ],
};
type Broadcast = { id: string; title: string; to: string; when: string; state: '予約' | '送信済み'; read?: number };
const BROADCASTS: Record<Account, Broadcast[]> = {
  インフォメーション: [
    { id: 'b1', title: '会社説明会（11/2）のご案内', to: '応募者（面談前）212人', when: '10/25 12:00', state: '予約' },
    { id: 'b2', title: '入社前の準備リスト', to: '入社予定 14人', when: '10/20 10:00', state: '送信済み', read: 0.86 },
  ],
  あおい: [
    { id: 'b3', title: '11月のシフト提出のお願い', to: 'シフト勤務 38人', when: '10/25 9:00', state: '予約' },
    { id: 'b4', title: '勤怠の締め（10月度）のお知らせ', to: '稼働中 251人', when: '10/20 9:00', state: '送信済み', read: 0.72 },
  ],
};
const PEOPLE_FOR_MANUAL: Record<Account, string[]> = {
  インフォメーション: ['応募者 佐々木', '応募者 松本', '入社予定 加藤', '入社予定 渡辺', '応募者 高田'],
  あおい: ['伊藤 誠', '山田 太郎', '鈴木 一郎', '中村 優', '加藤 葵', '高橋 健'],
};

/** 押し続けて発火。途中で離すと戻る（Hold To Confirm 900ms）。 */
function HoldButton({ label, onDone, disabled, title }: { label: string; onDone: () => void; disabled?: boolean; title?: string }) {
  const [p, setP] = useState(0);
  const t = useRef<ReturnType<typeof setInterval> | null>(null);
  // 送信の発火は時間で決める（描画が間引かれる環境でも 0.9 秒で確実に発火・離せば必ず止まる）
  const start = () => {
    if (disabled || t.current) return;
    const t0 = Date.now();
    t.current = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / 900);
      setP(k);
      if (k >= 1) { clearInterval(t.current!); t.current = null; setP(0); onDone(); }
    }, 16);
  };
  const stop = () => { if (t.current) clearInterval(t.current); t.current = null; setP(0); };
  return (
    <button disabled={disabled} title={title ?? '押し続けると送ります（0.9秒）'} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop}
      className="relative min-h-10 overflow-hidden rounded-[10px] px-4 text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40" style={{ background: 'var(--a)', color: 'var(--ao)' }}>
      <span className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${p * 100}%` }} />
      <span className="relative">{label}</span>
    </button>
  );
}

export function RenrakuButton({ module }: { module: ModuleKey | 'home' }) {
  // ?renraku=1 で開いた状態から始める（画面の見本を撮るとき用）
  const [open, setOpen] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).has('renraku')) setOpen(true); }, []);
  const account = accountFor(module);
  const unread = THREADS[account].filter((x) => x.ball).length;
  return (
    <>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="relative flex min-h-10 items-center gap-2 rounded-[10px] border border-line px-3 text-[13px] font-semibold text-muted">
        <MessageSquare size={17} strokeWidth={1.8} />連絡<span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-muted">{account}</span>
        {unread > 0 && <span className="num absolute -right-1.5 -top-1.5 rounded-full bg-bad px-1.5 text-[11px] font-bold text-white">{unread}</span>}
      </button>
      {open && <DrawerPortal><RenrakuPanel account={account} module={module} onClose={() => setOpen(false)} /></DrawerPortal>}
    </>
  );
}

function RenrakuPanel({ account, module, onClose }: { account: Account; module: ModuleKey | 'home'; onClose: () => void }) {
  const { can } = usePerms();
  const canSend = module === 'home' ? (['roumu', 'eigyo', 'keiri'] as ModuleKey[]).some((m) => can(m, 'edit')) : can(module, 'edit');
  const [tab, setTab] = useState<'chat' | 'broadcast' | 'manual'>('chat');
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <aside aria-label={`連絡（${account}）`} className="mo-drawer fixed bottom-0 right-0 top-[var(--hdr,58px)] z-40 flex w-[min(460px,100vw)] flex-col border-l border-line bg-surface shadow-[-12px_0_28px_rgba(25,27,46,.14)]">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <div><div className="text-[12px] text-faint">この画面の LINE 公式アカウント</div><div className="text-[17px] font-bold">{account}</div></div>
        <button aria-label="閉じる" onClick={onClose} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
      </div>
      <div role="tablist" className="flex gap-1 border-b border-line px-4 text-[13.5px]">
        {([['chat', 'チャット'], ['broadcast', '配信'], ['manual', '手動配信']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="px-3 py-2.5"
            style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>{l}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis flex min-h-0 flex-1 flex-col">
        {tab === 'chat' && <ChatTab account={account} canSend={canSend} />}
        {tab === 'broadcast' && <BroadcastTab account={account} canSend={canSend} />}
        {tab === 'manual' && <ManualTab account={account} canSend={canSend} />}
      </div>
    </aside>
  );
}

function ChatTab({ account, canSend }: { account: Account; canSend: boolean }) {
  const { hit } = useMotivation();
  const [threads, setThreads] = useState(THREADS[account]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const th = threads.find((x) => x.id === openId);
  const send = () => {
    if (!text.trim() || !th) return;
    setThreads((ts) => ts.map((x) => (x.id === th.id ? { ...x, ball: false, last: text, at: '今', msgs: [...x.msgs, { from: 'me', text, at: '今' }] } : x)));
    setText(''); hit();
  };
  if (!th) {
    return (
      <div className="flex flex-col overflow-y-auto">
        <label className="mx-4 my-3 flex min-h-9 items-center gap-2 rounded-[10px] border border-field px-3 text-faint"><Search size={15} /><input aria-label="トークを検索" placeholder="名前・内容" className="flex-1 bg-transparent text-[13px] text-ink outline-none" /></label>
        {threads.map((x, i) => (
          <button key={x.id} onClick={() => setOpenId(x.id)} className="mo-fade-up flex items-center gap-3 border-t border-line-soft px-4 py-3 text-left hover:bg-soft" style={{ ['--i' as string]: i }}>
            <div aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold" style={{ background: 'var(--as)', color: 'var(--ad)' }}>{x.name.slice(-2, -1)}</div>
            <div className="min-w-0 flex-1"><div className="flex justify-between text-[13.5px] font-semibold">{x.name}<span className="text-[11.5px] font-normal text-faint">{x.at}</span></div><div className="truncate text-[12.5px] text-muted">{x.last}</div></div>
            {x.ball && <span className="rounded-full bg-[var(--tone-bad-bg)] px-2 py-0.5 text-[11px] font-bold text-bad">要対応</span>}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button onClick={() => setOpenId(null)} className="border-b border-line-soft px-4 py-2 text-left text-[12.5px] text-muted">← トーク一覧 ／ <b className="text-ink">{th.name}</b></button>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-soft px-4 py-3">
        {th.msgs.map((m, i) => (
          <div key={i} className={`mo-fade-up max-w-[80%] rounded-2xl px-3 py-2 text-[13.5px] ${m.from === 'me' ? 'self-end rounded-br-md' : 'self-start rounded-bl-md bg-white'}`}
            style={m.from === 'me' ? { background: 'var(--a)', color: 'var(--ao)' } : undefined}>{m.text}<div className="mt-0.5 text-right text-[10.5px] opacity-70">{m.at}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pt-2">{['確認します', 'ありがとうございます！', '日程を送ります'].map((q) => <button key={q} onClick={() => setText(q)} className="rounded-full border border-line px-2.5 py-1 text-[12px]">{q}</button>)}</div>
      <div className="flex items-end gap-2 px-4 py-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} rows={2} placeholder={canSend ? 'メッセージ（⌘+Enterで送信）' : needText('edit')} disabled={!canSend}
          className="flex-1 resize-none rounded-[10px] border border-field px-3 py-2 text-[13.5px] outline-none disabled:bg-soft" />
        <button onClick={send} disabled={!canSend || !text.trim()} aria-label="送信" className="flex size-10 items-center justify-center rounded-[10px] disabled:opacity-40" style={{ background: 'var(--a)', color: 'var(--ao)' }}><Send size={16} /></button>
      </div>
    </div>
  );
}

function BroadcastTab({ account, canSend }: { account: Account; canSend: boolean }) {
  const { hit, toast } = useMotivation();
  const [items, setItems] = useState(BROADCASTS[account]);
  const [title, setTitle] = useState('');
  const [to, setTo] = useState(account === 'あおい' ? '稼働中 251人' : '応募者（面談前）212人');
  const [when, setWhen] = useState('2026-10-26T09:00');
  return (
    <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3">
      {items.map((b, i) => (
        <div key={b.id} className="mo-fade-up rounded-xl border border-line px-3.5 py-3" style={{ ['--i' as string]: i }}>
          <div className="flex items-center justify-between"><b className="text-[13.5px]">{b.title}</b><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${b.state === '予約' ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok'}`}>{b.state}</span></div>
          <div className="mt-0.5 text-[12px] text-muted">{b.to}・{b.when}</div>
          {b.read !== undefined && <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted"><div className="h-1.5 flex-1 overflow-hidden rounded bg-sunken"><div className="mo-bar h-1.5" style={{ width: `${b.read * 100}%`, background: 'var(--a)' }} /></div>既読 {Math.round(b.read * 100)}%</div>}
        </div>
      ))}
      <div className="rounded-xl border border-dashed border-field px-3.5 py-3">
        <div className="mb-2 text-[13px] font-bold">新しい配信</div>
        <div className="flex flex-col gap-2 text-[12.5px]">
          <label className="flex flex-col gap-1 text-muted">宛先（タグ・グループ）<select value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-field px-2 py-1.5 text-[13px] text-ink">
            {(account === 'あおい' ? ['稼働中 251人', '待機中 26人', 'シフト勤務 38人', 'C社 常駐グループ'] : ['応募者（面談前）212人', '入社予定 14人', '承諾者 31人']).map((o) => <option key={o}>{o}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-muted">本文<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：11月の勤怠の締めのお知らせ" className="rounded-lg border border-field px-2 py-1.5 text-[13px] text-ink" /></label>
          <label className="flex flex-col gap-1 text-muted">送る日時<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="rounded-lg border border-field px-2 py-1.5 text-[13px] text-ink" /></label>
          <div className="flex justify-end"><HoldButton label="長押しで予約" disabled={!canSend || !title.trim()} title={!canSend ? needText('edit') : undefined}
            onDone={() => { setItems((xs) => [{ id: String(Date.now()), title, to, when: when.replace('T', ' ').slice(5), state: '予約' }, ...xs]); setTitle(''); hit(); toast({ text: '配信を予約しました', sub: `→ ${to} に ${when.replace('T', ' ').slice(5)} に届きます` }); }} /></div>
        </div>
      </div>
    </div>
  );
}

function ManualTab({ account, canSend }: { account: Account; canSend: boolean }) {
  const { hit, toast } = useMotivation();
  const all = PEOPLE_FOR_MANUAL[account];
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  const go = () => {
    const n = sel.size; let k = 0; setSent(0);
    const iv = setInterval(() => { k += 1; setSent(k); if (k >= n) { clearInterval(iv); hit(n); toast({ text: `${n}人に送りました`, sub: '→ それぞれのトークに残りました' }); setTimeout(() => { setSent(null); setSel(new Set()); setText(''); }, 900); } }, 260);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-muted">送る人を選ぶ<button onClick={() => setSel(sel.size === all.length ? new Set() : new Set(all))} className="font-semibold" style={{ color: 'var(--ad)' }}>{sel.size === all.length ? 'すべて外す' : 'すべて選ぶ'}</button></div>
        {all.map((n, i) => (
          <label key={n} className="mo-fade-in flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13.5px] hover:bg-soft" style={{ ['--i' as string]: i }}>
            <input type="checkbox" checked={sel.has(n)} onChange={() => setSel((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; })} />{n}
          </label>
        ))}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="本文（{名前} で一人ずつ名前が入ります）" className="mt-3 w-full resize-none rounded-[10px] border border-field px-3 py-2 text-[13.5px] outline-none" />
      </div>
      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        {sent !== null ? (
          <div className="flex flex-1 items-center gap-2 text-[12.5px]"><div className="h-2 flex-1 overflow-hidden rounded bg-sunken"><div className="h-2 transition-[width] duration-200" style={{ width: `${(sent / Math.max(sel.size, 1)) * 100}%`, background: 'var(--a)' }} /></div><span className="num">{sent} / {sel.size}</span></div>
        ) : (
          <span className="flex-1 text-[12.5px] text-muted">{sel.size}人を選択中</span>
        )}
        <HoldButton label={`長押しで送る（${sel.size}人）`} disabled={!canSend || sel.size === 0 || !text.trim() || sent !== null} title={!canSend ? needText('edit') : undefined} onDone={go} />
      </div>
    </div>
  );
}
