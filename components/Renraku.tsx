'use client';

import { useEffect, useState } from 'react';
import { Maximize2, MessageSquare, Minimize2, X } from 'lucide-react';
import type { ModuleKey } from '@/lib/theme';
import { LiveBanner, NotInLegacy, useIke } from './Live';
import { usePerms } from './Perms';
import { DrawerPortal } from './DrawerPortal';
import { contactRows, type LiveContactsRes } from '@/lib/live/renraku';
import { SAMPLE_CHAT } from '@/lib/live/renraku-sample';
import { ChatTab } from './renraku/ChatTab';
import { CaseTab } from './renraku/CaseTab';
import { ManualTab } from './renraku/ManualTab';
import { AnnaiTab } from './renraku/AnnaiTab';

// 連絡パネル（チャット・案件配信・手動配信・案内配信をひとつに・2026-10-23 → 10-25 作り直し shoya）。
//   ・各画面の右上から開く。人事の画面は LINE公式「インフォメーション」、それ以外は「あおい」
//   ・あおい＝今の社内システムの公式LINE。ログインしていれば本物を読み、3つの送信（チャット・手動配信・案内配信）は本物を送る
//     インフォメーションは今の社内システムでは読めない（採用側の別システムのアカウント）ので、見本のまま
//   ・チャット … 営業中／稼働中／その他 × 1:1／グループ（今の chat.html と同じ）・要対応・検索
//   ・案件配信 … 営業リスト（営業共有リスト・手動配信）から送った案件だけ（送った人数・日時・OK/NG）
//   ・手動配信 … 今の営業共有リストと同じ流れ（案件を貼る → 絞られる → 選ぶ → 本文 → 配信）。案件進捗に載る
//   ・案内配信 … 件名・本文・選択肢（任意）・回答ボタン（任意）で送る／進み具合を見る
//   ・送ると取り消せないので、送信は「長押しで送る」（Hold To Confirm 0.9秒）。人数が分かる送信は進み具合を出す
//   ・手動配信・案内配信は窮屈なので「大きく開く」で広い表示にできる
export type Account = 'インフォメーション' | 'あおい';
export const accountFor = (m: ModuleKey | 'home'): Account => (m === 'jinji' ? 'インフォメーション' : 'あおい');

type Tab = 'chat' | 'case' | 'manual' | 'annai';
const TABS: [Tab, string][] = [['chat', 'チャット'], ['case', '案件配信'], ['manual', '手動配信'], ['annai', '案内配信']];

export function RenrakuButton({ module }: { module: ModuleKey | 'home' }) {
  // ?renraku=1 で開いた状態から始める（画面の見本を撮るとき用）
  const [open, setOpen] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).has('renraku')) setOpen(true); }, []);
  const account = accountFor(module);
  const info = account === 'インフォメーション';
  // 本物かどうかは、あおいの 1:1 一覧が読めるかで決める（今の社内システムの左のメニューの未読と同じ口）
  const contacts = useIke<LiveContactsRes>(info ? null : 'chat?action=contacts', { pollMs: open ? 20000 : 0 });
  const live = !info && contacts.live;
  const ball = info ? SAMPLE_CHAT.info.filter((x) => x.ball).length : live ? contactRows(contacts.data).filter((x) => x.ball).length : SAMPLE_CHAT.aoi.filter((x) => x.ball).length;
  return (
    <>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} title={ball ? `要対応 ${ball}件` : undefined} className="relative flex min-h-10 items-center gap-2 rounded-[10px] border border-line px-3 text-[13px] font-semibold text-muted">
        <MessageSquare size={17} strokeWidth={1.8} />連絡<span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-muted">{account}</span>
        {ball > 0 && <span className="num absolute -right-1.5 -top-1.5 rounded-full bg-bad px-1.5 text-[11px] font-bold" style={{ color: 'var(--color-surface)' }}>{ball > 99 ? '99+' : ball}</span>}
      </button>
      {open && <DrawerPortal><RenrakuPanel account={account} module={module} contacts={contacts} live={live} onClose={() => setOpen(false)} /></DrawerPortal>}
    </>
  );
}

function RenrakuPanel({ account, module, contacts, live, onClose }: { account: Account; module: ModuleKey | 'home'; contacts: ReturnType<typeof useIke<LiveContactsRes>>; live: boolean; onClose: () => void }) {
  const { can } = usePerms();
  const canSend = module === 'home' ? (['roumu', 'eigyo', 'keiri'] as ModuleKey[]).some((m) => can(m, 'edit')) : can(module, 'edit');
  const info = account === 'インフォメーション';
  const [tab, setTab] = useState<Tab>('chat');
  const [wide, setWide] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <aside aria-label={`連絡（${account}）`}
      className={`mo-drawer fixed bottom-0 right-0 top-[var(--hdr,58px)] z-40 flex flex-col border-l border-line bg-surface shadow-[-12px_0_28px_rgba(25,27,46,.14)] ${wide ? 'w-[min(1180px,100vw)]' : 'w-[min(460px,100vw)]'}`}>
      <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
        <div><div className="text-[12px] text-faint">この画面の LINE 公式アカウント</div><div className="text-[17px] font-bold">{account}</div></div>
        <div className="flex items-center gap-1.5">
          <button aria-label={wide ? '元の幅に戻す' : '大きく開く'} title={wide ? '元の幅に戻す' : '大きく開く'} onClick={() => setWide((v) => !v)} className="flex h-[34px] items-center gap-1 rounded-[10px] border border-line px-2.5 text-[12px] text-muted">
            {wide ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{wide ? '戻す' : '大きく開く'}
          </button>
          <button aria-label="閉じる" onClick={onClose} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
        </div>
      </div>
      <div className="px-5 pb-2">
        {info ? <NotInLegacy what="公式LINE「インフォメーション」のトーク・配信" />
          : <LiveBanner state={contacts.state} error={contacts.error} onReload={contacts.reload} note="本物の LINE です。送ると相手に届きます（長押しで送る）" />}
      </div>
      <div role="tablist" className="flex gap-1 border-b border-line px-4 text-[13.5px]">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="px-3 py-2.5"
            style={tab === k ? { color: 'var(--ad)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 var(--a)' } : { color: 'var(--color-muted)' }}>{l}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis flex min-h-0 flex-1 flex-col">
        {tab === 'chat' && <ChatTab live={live} canSend={canSend} contacts={contacts} info={info} />}
        {tab === 'case' && <CaseTab live={live} info={info} onManual={() => setTab('manual')} />}
        {tab === 'manual' && <ManualTab live={live} canSend={canSend} info={info} wide={wide} />}
        {tab === 'annai' && <AnnaiTab live={live} canSend={canSend} info={info} wide={wide} />}
      </div>
    </aside>
  );
}
