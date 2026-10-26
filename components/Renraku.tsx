'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Maximize2, MessageSquare, Minimize2, X } from 'lucide-react';
import type { ModuleKey } from '@/lib/theme';
import { LiveBanner, pollAwake, useIke, type LiveState } from './Live';
import { usePerms } from './Perms';
import { DrawerPortal } from './DrawerPortal';
import { contactRows, type LiveContactsRes } from '@/lib/live/renraku';
import { SAMPLE_CHAT } from '@/lib/live/renraku-sample';
import { ChatTab } from './renraku/ChatTab';
import { CaseTab } from './renraku/CaseTab';
import { ManualTab } from './renraku/ManualTab';
import { AnnaiTab } from './renraku/AnnaiTab';
import { useMikeiken } from './Mikeiken';
import { InfoHaishin } from './renraku/InfoHaishin';

// 連絡パネル（チャット・案件配信・手動配信・案内配信をひとつに・2026-10-23 → 10-25 作り直し shoya）。
//   ・各画面の右上から開く。人事の画面は LINE公式「インフォメーション」、それ以外は「あおい」
//   ・あおい＝今の社内システムの公式LINE。ログインしていれば本物を読み、3つの送信（チャット・手動配信・案内配信）は本物を送る
//   ・インフォメーション＝それゆけ未経験（採用側）の公式LINE（10-26）。トークと配信の履歴は同じDBの saiyou スキーマにあるので、
//     今の社内システムの GET /api/chat?action=infoContacts / infoThread / infoBroadcasts で**読むだけ**（従業員に紐付いた人だけ・さらに未経験の人だけ）。
//     送るのは それゆけ未経験 の画面から（インフォメーションのチャネルの鍵は それゆけ未経験 にしか無く、今の社内システムからは送れない）
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

// ---- 右上の「要対応」の数（10-25 作り直し・10-26 インフォメーションも） ----
//   今の社内システムに軽い数えるだけの口は無い（今の左メニューの未読も chat?action=contacts の全員ぶんを読んでいる）。
//   なので、パネルを閉じているあいだは 5分に1回まで・見えているタブだけ読む。控えは公式アカウントごとにこのファイルに1つだけ置き、
//   ページを移って（Shell の key={module} で）ボタンが作り直されても取り直さない。サーバー側も60秒控える（/api/ike）
//   パネルを開いたら、中で20秒ごとに読み直す（見えていない・15分さわっていないあいだは止まる）。その答えで数も直す
const BADGE_MS = 5 * 60_000;
type Badge = { at: number; state: LiveState; data: LiveContactsRes | null };
const CONTACTS_PATH: Record<Account, string> = { あおい: 'chat?action=contacts', インフォメーション: 'chat?action=infoContacts' };
const badges: Record<Account, Badge> = { あおい: { at: 0, state: 'loading', data: null }, インフォメーション: { at: 0, state: 'loading', data: null } };
const badgeBusy: Record<Account, boolean> = { あおい: false, インフォメーション: false };
const badgeSubs = new Set<() => void>();
const setBadge = (a: Account, b: Badge) => { badges[a] = b; badgeSubs.forEach((f) => f()); };
const subBadge = (f: () => void) => { badgeSubs.add(f); return () => { badgeSubs.delete(f); }; };
async function loadBadge(a: Account) {
  const badge = badges[a];
  if (badgeBusy[a] || document.hidden || Date.now() - badge.at < BADGE_MS) return;
  badgeBusy[a] = true;
  try {
    const r = await fetch(`/api/ike/${CONTACTS_PATH[a]}`, { cache: 'no-store' });
    const j = (await r.json().catch(() => ({}))) as LiveContactsRes & { error?: string };
    if (r.status === 401 && j.error === 'not_logged_in') setBadge(a, { at: Date.now(), state: 'sample', data: null });
    else if (!r.ok) setBadge(a, { at: Date.now(), state: badge.data ? 'live' : 'error', data: badge.data });
    else setBadge(a, { at: Date.now(), state: 'live', data: j });
  } catch { setBadge(a, { ...badges[a], at: Date.now(), state: badges[a].data ? 'live' : 'error' }); }
  finally { badgeBusy[a] = false; }
}
function useBadge(a: Account): Badge {
  const b = useSyncExternalStore(subBadge, () => badges[a], () => badges[a]);
  useEffect(() => {
    loadBadge(a);
    // 1分ごとに「5分たったか」だけ見る（読むのは5分に1回まで・見えていて15分以内にさわっているときだけ）
    const t = setInterval(() => { if (pollAwake()) loadBadge(a); }, 60_000);
    const vis = () => { if (!document.hidden) loadBadge(a); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [a]);
  return b;
}

export function RenrakuButton({ module }: { module: ModuleKey | 'home' }) {
  // ?renraku=1 で開いた状態から始める（画面の見本を撮るとき用）
  const [open, setOpen] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).has('renraku')) setOpen(true); }, []);
  const account = accountFor(module);
  const info = account === 'インフォメーション';
  // 本物かどうかは、その公式アカウントの 1:1 一覧が読めるかで決める（あおいは今の社内システムの左のメニューの未読と同じ口）
  const bd = useBadge(account);
  const live = bd.state === 'live';
  // インフォメーションは未経験の人（プロパーリストにいる人）だけ数える
  const mk = useMikeiken();
  const ball = live ? (info ? mk.keep(contactRows(bd.data), 'name') : contactRows(bd.data)).filter((x) => x.ball).length : (info ? SAMPLE_CHAT.info : SAMPLE_CHAT.aoi).filter((x) => x.ball).length;
  return (
    <>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} title={ball ? `要対応 ${ball}件` : undefined} className="relative flex min-h-10 items-center gap-2 rounded-[10px] border border-line px-3 text-body font-semibold text-muted">
        <MessageSquare size={17} strokeWidth={1.8} />連絡<span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">{account}</span>
        {ball > 0 && <span className="num absolute -right-1.5 -top-1.5 rounded-full bg-bad px-1.5 text-xs font-bold" style={{ color: 'var(--color-surface)' }}>{ball > 99 ? '99+' : ball}</span>}
      </button>
      {open && <DrawerPortal><RenrakuPanel account={account} module={module} badge={bd} onClose={() => setOpen(false)} /></DrawerPortal>}
    </>
  );
}

function RenrakuPanel({ account, module, badge: bd, onClose }: { account: Account; module: ModuleKey | 'home'; badge: Badge; onClose: () => void }) {
  const { can } = usePerms();
  const canSend = module === 'home' ? (['roumu', 'eigyo', 'keiri'] as ModuleKey[]).some((m) => can(m, 'edit')) : can(module, 'edit');
  const info = account === 'インフォメーション';
  // 開いているあいだだけ 1:1 の一覧を読む（20秒ごと・見えていない／15分さわっていないあいだは止まる）。読めたら右上の数も直す
  const own = useIke<LiveContactsRes>(CONTACTS_PATH[account], { pollMs: 20000 });
  useEffect(() => { if (own.live && own.data) setBadge(account, { at: Date.now(), state: 'live', data: own.data }); }, [account, own.live, own.data]);
  // 読み終えるまでは右上の数を出したときの一覧をそのまま見せる（開いた瞬間に空にしない）
  const early = own.state === 'loading' && bd.state === 'live';
  const contacts = early ? { ...own, data: bd.data, state: 'live' as LiveState, live: true } : own;
  const live = contacts.live;
  const [tab, setTab] = useState<Tab>('chat');
  const [wide, setWide] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <aside aria-label={`連絡（${account}）`}
      className={`mo-drawer drawer ${wide ? 'w-[min(1180px,100vw)]' : ''}`}>
      <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
        <div><div className="text-sm text-faint">この画面の LINE 公式アカウント</div><div className="text-lg font-bold">{account}</div></div>
        <div className="flex items-center gap-1.5">
          <button aria-label={wide ? '元の幅に戻す' : '大きく開く'} title={wide ? '元の幅に戻す' : '大きく開く'} onClick={() => setWide((v) => !v)} className="flex h-[34px] items-center gap-1 rounded-[10px] border border-line px-2.5 text-sm text-muted">
            {wide ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{wide ? '戻す' : '大きく開く'}
          </button>
          <button aria-label="閉じる" onClick={onClose} className="flex size-[34px] items-center justify-center rounded-[10px] border border-line"><X size={16} /></button>
        </div>
      </div>
      <div className="px-5 pb-2">
        <LiveBanner state={contacts.state} error={contacts.error} onReload={contacts.reload}
          note={info ? 'それゆけ未経験の公式LINE「インフォメーション」を読むだけです（未経験の人だけ）。送るのは それゆけ未経験 の画面から（今の社内システムにはこのアカウントの送る鍵がありません）' : '本物の LINE です。送ると相手に届きます（長押しで送る）'} />
      </div>
      <div role="tablist" className="flex gap-1 border-b border-line px-4 text-body">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="tab">{l}</button>
        ))}
      </div>
      <div key={tab} className="mo-axis flex min-h-0 flex-1 flex-col">
        {tab === 'chat' && <ChatTab live={live} canSend={canSend} contacts={contacts} info={info} />}
        {tab === 'case' && <CaseTab live={live} info={info} onManual={() => setTab('manual')} />}
        {tab === 'manual' && (info ? <InfoHaishin live={live} what="手動配信" /> : <ManualTab live={live} canSend={canSend} info={info} wide={wide} />)}
        {tab === 'annai' && (info ? <InfoHaishin live={live} what="案内配信" /> : <AnnaiTab live={live} canSend={canSend} info={info} wide={wide} />)}
      </div>
    </aside>
  );
}
